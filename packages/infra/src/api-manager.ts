// API manager implementation for Check Point MCP servers
import {APIClientBase, SmartOneCloudAPIClient, OnPremAPIClient, BearerTokenAPIClient, TokenType, describeResponseBody} from './api-client.js';

import {sanitizeData} from "./string-utils.js";
import { classifyHttpStatus, McpErrorCode, McpToolError, SettingsManager } from '@chkp/mcp-utils';

/** Split a comma-separated MANAGEMENT_DOMAIN value into domain names. */
function parseDomainList(value?: string): string[] {
  return (value ?? '').split(',').map(domain => domain.trim()).filter(domain => domain !== '');
}

function formatDomainList(domains: Array<{ name: string; type: string }>): string {
  return domains.map(domain => `${domain.name} (${domain.type})`).join(', ');
}

/** Explain a failed login to a domain other than the configured login domain. */
function domainLoginError(domainName: string, error: unknown): Error {
  const message = `Could not log in to domain '${domainName}' with the configured credentials. ` +
    'Make sure the domain exists and these credentials can access it.';
  if (error instanceof McpToolError) {
    return new McpToolError(error.code, `${message} ${error.message}`, {
      upstreamStatus: error.upstreamStatus,
      retryable: error.retryable,
      cause: error,
    });
  }
  // Not attached as cause: an HTTP client error carries the login request,
  // whose body is the credentials.
  return new McpToolError(McpErrorCode.AUTH_FAILED, message);
}

/**
 * Base class for API managers
 */
export abstract class APIManagerBase {
  protected requestInfo: any = null;
  protected detailsLevel: 'full' | 'standard' | 'uid' = 'full';
  private _debug: boolean = false;
  
  // Storage for domain-specific API clients in MDS environments
  private domainClients: Map<string, APIClientBase> = new Map(); // domain -> client
  private gatewayDomainMap: Map<string, string> = new Map(); // gateway -> domain
  private domains: Array<{
    name: string;
    type: string;
    servers?: Array<{
      name?: string;
      'ipv4-address'?: string;
      'ipv6-address'?: string;
      active?: boolean;
      'multi-domain-server'?: string;
    }>
  }> | null = null;
  private mdsServers: Array<{
    name: string;
    'ipv4-address'?: string;
    'ipv6-address'?: string;
  }> | null = null;

  /**
   * @param configuredDomains MDS domains set for credentials without System
   *   Domain access. The client logs in to the first, which is the default for
   *   calls that name no domain. The list tells the model which domains exist,
   *   since such credentials cannot list them; any other domain the
   *   credentials can access is still reached by logging in to it.
   */
  constructor(protected readonly client: APIClientBase, protected readonly configuredDomains: readonly string[] = []) {}

  /** The domain the client logs in to, when credentials have no System Domain access. */
  protected get loginDomain(): string | undefined {
    return this.configuredDomains[0];
  }

  /**
   * Set debug mode for the API client
   */
  set debug(value: boolean) {
    this._debug = value;
    // Forward debug setting to the client
    if (this.client) {
      // Use the client's debug property directly if it exists
      if ('debug' in this.client) {
        (this.client as any).debug = value;
      }
    }
  }

  /**
   * Get debug mode
   */
  get debug(): boolean {
    return this._debug;
  }

  /**
   * Call an API endpoint.
   *
   * Throws on any non-2xx response, as an `McpToolError` carrying the upstream
   * status. The API client already throws for one, since axios rejects any
   * non-2xx response; the status is also checked here so that an error body is
   * never handed back as though it were data, whatever client is in use.
   */
  async callApi(method: string, uri: string, data: Record<string, any>, domain?: string): Promise<Record<string, any>> {
    const { status, response } = await this.callApiWithStatus(method, uri, data, domain);

    if (status < 200 || status >= 300) {
      const { code, retryable } = classifyHttpStatus(status);
      throw new McpToolError(
        code,
        `${uri} failed: ${status} - ${describeResponseBody(response)}`,
        { upstreamStatus: status, retryable }
      );
    }

    return response;
  }

  /**
   * Call an API endpoint and return both the HTTP status code and the response body.
   * Used by callers that need to track the underlying HTTP status (e.g. management-write).
   * A non-2xx response is thrown by the API client, so the status returned is a 2xx one.
   */
  async callApiWithStatus(
    method: string,
    uri: string,
    data: Record<string, any>,
    domain?: string,
  ): Promise<{ status: number; response: Record<string, any> }> {
    const sanitizedData = sanitizeData(data);

    // domains-to-process must run from the System Domain (root MDS session) — ignore domain routing when set
    const apiClient = (domain && !data['domains-to-process'])
      ? await this.getDomainApiClientByDomain(domain)
      : this.client;

    const clientResponse = await apiClient.callApi(
      method,
      uri,
      sanitizedData,
      undefined
    );
    return { status: clientResponse.status, response: clientResponse.response };
  }

  /**
   * Get the result of a management API task (similar to getTaskResult but for management tasks)
   */
  async getManagementTaskResult(
    taskId: string,
    domain?: string,
    maxRetries: number = 5
  ): Promise<any> {
    let retries = 0;
    const timeouts = [500, 500, 1000, 2000, 5000]; // Retry intervals in milliseconds

    while (retries < maxRetries) {
      const taskParams = { 'task-id': taskId };
      const taskResp = await this.callApi('POST', 'show-task', taskParams, domain);

      const tasks = taskResp?.tasks || [];
      if (tasks.length > 0) {
        const taskStatus = tasks[0].status;

        // Only "in progress" means the task is still running. Every other status
        // is final - "succeeded" and "failed", but also "partially succeeded" and
        // "succeeded with warnings" - so the task is returned as soon as it has
        // one, rather than being polled until it looks timed out.
        if (taskStatus && String(taskStatus).toLowerCase() !== 'in progress') {
          return { response: taskResp };
        }
      }

      // Task still in progress (or not yet listed), wait and retry
      const timeout = timeouts[Math.min(retries, timeouts.length - 1)];
      await new Promise(resolve => setTimeout(resolve, timeout));
      retries++;
    }

    // Retries exhausted without the task reaching a terminal state. Reported as
    // a timeout rather than returning the last in-progress response, which would
    // be indistinguishable from a completed task.
    //
    // Note a task that reaches 'failed' is NOT an error at this layer: it is a
    // terminal, informative result, and callers surface the task detail
    // themselves. Only the absence of any terminal status is a failure here.
    throw new McpToolError(
      McpErrorCode.TIMEOUT,
      `Task ${taskId} did not complete after ${maxRetries} polling attempts.`,
      { retryable: true }
    );
  }

  /**
   * Check if the current environment is MDS
   */
  async isMds(): Promise<boolean> {
    const isMDS = await this.client.isMDSEnvironment();
    // A session in one domain does not report itself as MDS, but a login
    // domain only exists on an MDS.
    return isMDS || !!this.loginDomain;
  }

  /**
   * Describe the domain setup for an init tool, so the model knows whether and
   * how to use the domain parameter.
   */
  async describeDomainEnvironment(): Promise<string> {
    if (!(await this.isMds())) {
      return 'The environment is NOT part of Multi Domain system, there is no need to use domain parameters in tool calls.';
    }

    if (!this.loginDomain) {
      const domains = await this.getDomains();
      return 'The environment is part of Multi Domain system. You need to use the domain parameter for calling APIs, ' +
        `if you are not sure which to use, ask the user. The domains in the system are: ${formatDomainList(domains)}`;
    }

    // Listing domains needs System Domain access, which a login domain usually
    // means the credentials lack; the configured domains stand in for the list.
    let domainList = '';
    try {
      const domains = await this.getDomains();
      if (domains.length > 0) domainList = ` The domains in the system are: ${formatDomainList(domains)}`;
    } catch {
      // Fall back to the configured domains below.
    }
    if (!domainList && this.configuredDomains.length > 1) {
      domainList = ` The domains configured for these credentials are: ${this.configuredDomains.join(', ')}`;
    }
    return `The environment is part of Multi Domain system. The session is logged in to domain '${this.loginDomain}', ` +
      'which is used when the domain parameter is omitted. To work in another domain these credentials can access, ' +
      `pass its name in the domain parameter; if you are not sure which to use, ask the user.${domainList}`;
  }

  /**
   * Get domains from show-domains API with full details including server information
   */
  async getDomains(): Promise<Array<{
    name: string;
    type: string;
    servers?: Array<{
      name?: string;
      'ipv4-address'?: string;
      'ipv6-address'?: string;
      active?: boolean;
      'multi-domain-server'?: string;
    }>
  }>> {
    // Return cached domains if available
    if (this.domains !== null) {
      return this.domains;
    }

    const allDomains: Array<{
      name: string;
      type: string;
      servers?: Array<{
        name?: string;
        'ipv4-address'?: string;
        'ipv6-address'?: string;
        active?: boolean;
        'multi-domain-server'?: string;
      }>
    }> = [];

    const limit = 50;
    let offset = 0;
    let total = Infinity;

    // Paginate through all domains — show-domains defaults to 50 results per page
    while (offset < total) {
      const response = await this.callApi('post', 'show-domains', {
        'details-level': 'full',
        'limit': limit,
        'offset': offset
      });

      if (response.objects) {
        for (const obj of response.objects) {
          if (obj.name && obj.type) {
            allDomains.push({
              name: obj.name,
              type: obj.type,
              servers: obj.servers || []
            });
          }
        }
      }

      total = typeof response.total === 'number' ? response.total : allDomains.length;
      offset += limit;

      if (!response.objects || response.objects.length === 0) {
        break;
      }
    }

    this.domains = allDomains;
    return this.domains;
  }

  /**
   * Create an API manager instance
   */
  static create(args: any): APIManagerBase {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Get the appropriate API client for a specific gateway, handling MDS domain routing
   */
  async getDomainApiClient(gatewayName: string): Promise<APIClientBase> {
    // 1. Check if the main API client is MDS, if not return it directly
    const isMDS = await this.isMds();
    if (!isMDS) {
      return this.client;
    }

    // 2. Check if we already have a mapped client for this gateway with valid SID
    const existingDomain = this.gatewayDomainMap.get(gatewayName);
    if (existingDomain) {
      const existingClient = this.domainClients.get(existingDomain);
      if (existingClient && existingClient.hasValidSession()) {
        return existingClient;
      }
    }

    // 3. Get gateway information to determine its domain
    const gatewayInfo = await this.getGatewayInfo(gatewayName);
    if (!gatewayInfo) {
      throw new Error(`Gateway '${gatewayName}' not found`);
    }

    const gatewayDomain = gatewayInfo.domain;
    if (!gatewayDomain) {
      // Gateway doesn't have a specific domain, use main client
      return this.client;
    }

    const gatewayDomainName = gatewayDomain.name;
    if (gatewayDomainName === this.loginDomain) {
      return this.client;
    }

    // 4. Check if we already have a valid client for this domain
    const existingDomainClient = this.domainClients.get(gatewayDomainName);
    if (existingDomainClient && existingDomainClient.hasValidSession()) {
      // Map this gateway to the existing domain client
      this.gatewayDomainMap.set(gatewayName, gatewayDomainName);
      return existingDomainClient;
    }

    // 5. Need to login to the domain and create a new client
    const domainSid = await this.loginToDomain(gatewayDomainName);
    
    // Create a new client with the domain SID
    const domainClient = this.createClientWithSid(domainSid);
    
    // 6. Store the domain client and gateway mapping
    this.domainClients.set(gatewayDomainName, domainClient);
    this.gatewayDomainMap.set(gatewayName, gatewayDomainName);
    
    return domainClient;
  }

  /**
   * Get the appropriate API client for a specific domain, handling MDS domain routing.
   * Uses login -d (credential-based domain login) as the primary path.
   *
   * Flow:
   *  1. login -d on current MDS root (works for both local and standby domains)
   *  2. Cross-MDS: find target MDS root IP via show-mdss, then login -d there
   *  3. Last resort: login directly to the active DMS virtual IP
   *
   * NOTE: This server currently exposes read-only APIs only. For reads, landing on a
   * standby DMS is acceptable — the data is replicated. If write operations are added
   * in the future, step 1 must be changed to enforce routing to the ACTIVE DMS server
   * (use getMDSServerForDomain which selects the active server from show-domains).
   */
  async getDomainApiClientByDomain(domainName: string): Promise<APIClientBase> {
    const isMDS = await this.isMds();
    if (!isMDS || domainName === this.loginDomain) {
      return this.client;
    }

    const existingDomainClient = this.domainClients.get(domainName);
    if (existingDomainClient && existingDomainClient.hasValidSession()) {
      return existingDomainClient;
    }

    const currentHost = this.client.getHost();
    const portMatch = currentHost.match(/:(\d+)/);
    const port = portMatch ? portMatch[1] : '443';

    // Step 1: login -d on current MDS root
    try {
      const domainClient = this.createClientForMDS(
        (this.client as any).managementHost,
        port,
        domainName
      );
      if ('debug' in domainClient) (domainClient as any).debug = this._debug;
      await domainClient.login();
      this.domainClients.set(domainName, domainClient);
      return domainClient;
    } catch (error) {
      // Domain may be on a different MDS or credentials don't cover this domain.
      // With a login domain there is nothing to fall back to: the steps below
      // look the domain up with show-domains and show-mdss, which need System
      // Domain access.
      if (this.loginDomain) {
        throw domainLoginError(domainName, error);
      }
    }

    // Step 2: Cross-MDS — find the target MDS root IP via show-mdss and login -d there
    const targetMDSIP = await this.getMDSRootForDomain(domainName);
    if (targetMDSIP) {
      try {
        const crossMDSClient = this.createClientForMDS(targetMDSIP, port, domainName);
        if ('debug' in crossMDSClient) (crossMDSClient as any).debug = this._debug;
        await crossMDSClient.login();
        this.domainClients.set(domainName, crossMDSClient);
        return crossMDSClient;
      } catch {
        // Cross-MDS login -d failed. Fall through to direct DMS login.
      }
    }

    // Step 3: Last resort — login directly to the active DMS virtual IP
    const dmsIP = await this.getMDSServerForDomain(domainName);
    if (!dmsIP) {
      throw new Error(
        `Domain '${domainName}' not found or has no available servers. ` +
        `Make sure the domain exists and you have access to it.`
      );
    }

    const targetClient = this.createClientForMDS(dmsIP, port);
    if ('debug' in targetClient) (targetClient as any).debug = this._debug;
    await targetClient.login();
    this.domainClients.set(domainName, targetClient);
    return targetClient;
  }

  /**
   * Get gateway information from show-gateways-and-servers
   */
  private async getGatewayInfo(gatewayName: string): Promise<any> {
    const response = await this.callApi('post', 'show-gateways-and-servers', {
      'details-level': 'full'
    });
    
    if (response.objects) {
      return response.objects.find((obj: any) => obj.name === gatewayName);
    }
    
    return null;
  }

  /**
   * Login to a specific domain using the main API client
   */
  private async loginToDomain(domainName: string): Promise<string> {
    const response = await this.callApi('post', 'login-to-domain', {
      'domain': domainName
    });
    
    if (!response.sid) {
      throw new Error(`Failed to login to domain '${domainName}'`);
    }
    
    return response.sid;
  }

  /**
   * Create a new API client instance with the given session ID
   */
  private createClientWithSid(sid: string): APIClientBase {
    // Determine the type of client and create a new instance with the same configuration
    if (this.client instanceof OnPremAPIClient) {
      return APIClientBase.createWithSid.call(OnPremAPIClient, this.client, sid);
    } else if (this.client instanceof SmartOneCloudAPIClient) {
      return APIClientBase.createWithSid.call(SmartOneCloudAPIClient, this.client, sid);
    } else {
      throw new Error('Unknown client type');
    }
  }

  /**
   * Get MDS server list from show-mdss with caching
   */
  private async getMDSServers(): Promise<Array<{
    name: string;
    'ipv4-address'?: string;
    'ipv6-address'?: string;
  }>> {
    if (this.mdsServers !== null) {
      return this.mdsServers;
    }

    try {
      const response = await this.callApi('post', 'show-mdss', {
        'details-level': 'full',
        'limit': 500
      });
      const servers: Array<{ name: string; 'ipv4-address'?: string; 'ipv6-address'?: string }> = [];
      if (response.objects) {
        for (const obj of response.objects) {
          if (obj.name) {
            servers.push({
              name: obj.name,
              'ipv4-address': obj['ipv4-address'],
              'ipv6-address': obj['ipv6-address']
            });
          }
        }
      }
      this.mdsServers = servers;
    } catch {
      this.mdsServers = [];
    }
    return this.mdsServers;
  }

  /**
   * Return the MDS root IP for the domain's active server.
   * Maps the domain's `multi-domain-server` name (from show-domains) to an MDS
   * root IP (from show-mdss). Returns null if the domain is not found or the MDS
   * root IP cannot be determined.
   */
  private async getMDSRootForDomain(domainName: string): Promise<string | null> {
    const domains = await this.getDomains();
    const domain = domains.find(d => d.name === domainName);
    if (!domain?.servers?.length) return null;

    const activeServer = domain.servers.find(s => s.active === true) ?? domain.servers[0];
    const targetMDSName = activeServer?.['multi-domain-server'];
    if (!targetMDSName) return null;

    const mdsServers = await this.getMDSServers();
    const mdsServer = mdsServers.find(m => m.name === targetMDSName);
    return mdsServer?.['ipv4-address'] ?? mdsServer?.['ipv6-address'] ?? null;
  }

  /**
   * Get the appropriate MDS server IP for a domain
   * Prefers the active server, but returns any available server
   * Returns IPv4 if available, otherwise IPv6
   */
  private async getMDSServerForDomain(domainName: string): Promise<string | null> {
    const domains = await this.getDomains();
    const domain = domains.find(d => d.name === domainName);

    if (!domain?.servers || domain.servers.length === 0) {
      return null;
    }

    // Prefer the active server with IPv4, then active with IPv6
    const activeServer = domain.servers.find(s => s.active === true);
    if (activeServer) {
      // Prefer IPv4 over IPv6 for backward compatibility
      if (activeServer['ipv4-address']) {
        return activeServer['ipv4-address'];
      }
      if (activeServer['ipv6-address']) {
        return activeServer['ipv6-address'];
      }
    }

    // Fallback to any available server (prefer IPv4 over IPv6)
    const ipv4Server = domain.servers.find(s => s['ipv4-address']);
    if (ipv4Server?.['ipv4-address']) {
      return ipv4Server['ipv4-address'];
    }

    const ipv6Server = domain.servers.find(s => s['ipv6-address']);
    return ipv6Server?.['ipv6-address'] || null;
  }

  /**
   * Create a new API client targeting a specific host (MDS root or DMS IP).
   * When `domain` is provided it is included in the login payload, causing the
   * server to return a domain-scoped session (equivalent to login -d).
   * Handles both IPv4 and IPv6 addresses.
   */
  private createClientForMDS(mdsIP: string, port: string = '443', domain?: string): APIClientBase {
    if (this.client instanceof OnPremAPIClient) {
      const currentClient = this.client as any;

      // Wrap bare IPv6 addresses in brackets for URL usage
      const formattedHost = mdsIP.includes(':') && !mdsIP.startsWith('[')
        ? `[${mdsIP}]`
        : mdsIP;

      return new OnPremAPIClient(
        currentClient.authToken || undefined,
        formattedHost,
        port,
        currentClient.username,
        currentClient.password,
        domain
      );
    } else if (this.client instanceof SmartOneCloudAPIClient) {
      throw new Error('Multi-MDS routing is not supported for SmartOneCloud environments');
    } else {
      throw new Error('Unknown client type for MDS routing');
    }
  }

  /**
   * Run a script on a target gateway
   */
  async runScript(
    targetGateway: string, 
    scriptName: string, 
    script: string
  ): Promise<[boolean, Record<string, any>]> {
    // Get the appropriate API client for this gateway (handles MDS domain routing)
    const apiClient = await this.getDomainApiClient(targetGateway);
    
    const payload = {
      'script-name': scriptName,
      'script': script,
      'targets': [targetGateway]
    };
    
    // Use the domain-specific client for the API call
    const clientResponse = await apiClient.callApi(
      'post',
      'run-script',
      payload,
      undefined
    );
    const resp = clientResponse.response;
    
    if (!resp.tasks) {
      return [false, { message: "Failed to run the script" }];
    }
    
    return [true, { tasks: resp.tasks.map((task: any) => task['task-id']) }];
  }

  /**
   * Get the result of a task
   */
  async getTaskResult(
    gatewayName: string,
    taskId: string, 
    maxRetries: number = 5
  ): Promise<[boolean, string]> {
    
    const client = await this.getDomainApiClient(gatewayName);
    let retries = 0;
    const timeouts = [1000, 1000, 2000, 5000, 5000]; // Retry intervals in milliseconds
    while (retries < maxRetries) {
      const payload = {
        'task-id': taskId,
        'details-level': 'full'
      };
      
      const response = await client.callApi('post', 'show-task', payload);
      const taskDetails = response.response.tasks?.[0];
      
      if (taskDetails?.status === 'succeeded' || taskDetails?.status === 'failed') {
        if (
          taskDetails['task-details']?.[0]?.responseMessage
        ) {
          const responseMessageBase64 = taskDetails['task-details'][0].responseMessage;
          const decoded = Buffer.from(responseMessageBase64, 'base64').toString('utf-8');
          return [taskDetails.status === 'succeeded', decoded];
        }
        return [false, "failed to get task result"];
      } else {
        const timeout = timeouts[Math.min(retries, timeouts.length - 1)];
        console.error(`Try #${retries}: Task ${taskId} is still running, waiting for ${timeout}ms...`);
        retries++;
        await new Promise(resolve => setTimeout(resolve, timeout)); // Wait for the calculated timeout
      }
    }
    
    return [false, "Task did not complete in time"];
  }
}

/**
 * API manager for authentication (API key or username/password)
 */
export class APIManagerForAPIKey extends APIManagerBase {
  static override create(args: {
    apiKey?: string;
    username?: string;
    password?: string;
    managementHost?: string;
    managementPort?: string;
    managementDomain?: string;
    s1cUrl?: string;
    cloudInfraToken?: string;
    cloudConnected?: boolean;
    sid?: string;
  }): APIManagerForAPIKey {
    const verbose = SettingsManager.globalDebugState;

    if (verbose) {
      console.error('[APIManagerForAPIKey.create] Verbose: Creating API manager');
      console.error('[APIManagerForAPIKey.create] Verbose: Args received:', {
        apiKey: args.apiKey ? '***' : undefined,
        username: args.username ? '***' : undefined,
        password: args.password ? '***' : undefined,
        managementHost: args.managementHost,
        managementPort: args.managementPort,
        managementDomain: args.managementDomain,
        s1cUrl: args.s1cUrl,
        cloudInfraToken: args.cloudInfraToken ? '***' : undefined,
        sid: args.sid ? '***' : undefined
      });
    }

    // Early validation - check if args is effectively empty
    const hasAnyValue = args.apiKey || args.username || args.password ||
                        args.s1cUrl || args.managementHost || args.cloudInfraToken || args.sid;
    if (!hasAnyValue) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: ERROR - Args object is effectively empty, no values provided');
        console.error('[APIManagerForAPIKey.create] Verbose: All args keys:', Object.keys(args));
      }
      throw new Error('No authentication or connection parameters provided. Args object is empty or contains only undefined values.');
    }

    // For on-prem management - supports both API key and username/password
    if (args.managementHost) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: Using on-prem management with host:', args.managementHost);
      }
      // MANAGEMENT_DOMAIN may list several domains; the first is the login domain
      const domains = parseDomainList(args.managementDomain);
      // Create an OnPremAPIClient with username/password support
      const onPremClient = new OnPremAPIClient(
        args.apiKey,
        args.managementHost,
        args.managementPort || '443',
        args.username,
        args.password,
        domains[0]
      );
      // If a pre-authenticated SID was provided, set it on the client to skip login
      if (args.sid) {
        if (verbose) {
          console.error('[APIManagerForAPIKey.create] Verbose: Setting external SID on on-prem client (skipping login)');
        }
        onPremClient.setExternalSid(args.sid);
      }
      return new this(onPremClient, domains);
    }

    if (verbose) {
      console.error('[APIManagerForAPIKey.create] Verbose: managementHost not provided, checking s1cUrl');
    }
    if (!args.s1cUrl) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: ERROR - Neither managementHost nor s1cUrl provided');
      }
      throw new Error('Either management host or S1C URL must be provided');
    }

    if (verbose) {
      console.error('[APIManagerForAPIKey.create] Verbose: Using S1C with URL:', args.s1cUrl);
    }

    let keyType: TokenType;
    let key: string;

    // An API key takes precedence over a CloudInfra token
    if (args.apiKey) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: Using API key');
      }
      keyType = TokenType.API_KEY;
      key = args.apiKey;
    }
    else if (args.cloudInfraToken) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: Using cloud infra token');
      }
      keyType = TokenType.CI_TOKEN;
      key = args.cloudInfraToken;
    }
    else if (args.sid) {
      // SID provided without auth credentials for S1C - use a placeholder token
      // since the client won't need to login
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: Using external SID with S1C (no auth token needed)');
      }
      keyType = TokenType.API_KEY;
      key = '';
    }
    else {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: ERROR - No API key or cloud infra token provided');
      }
      throw new Error('API key or cloud infrastructure token is required');
    }

    const s1cClient = SmartOneCloudAPIClient.create(
      key,
      keyType,
      args.s1cUrl!,
      !!args.cloudConnected,
      keyType === TokenType.API_KEY ? args.cloudInfraToken : undefined,
    );

    // If a pre-authenticated SID was provided, set it on the client to skip login
    if (args.sid) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: Setting external SID on S1C client (skipping login)');
      }
      s1cClient.setExternalSid(args.sid);
    }

    return new this(s1cClient);
  }
}

/**
 * API manager for Bearer token authentication
 */
export class APIManagerForBearerToken extends APIManagerBase {
  static override create(args: {
    bearerToken: string;
    infinityPortalUrl: string;
  }): APIManagerForBearerToken {
    if (!args.bearerToken) {
      throw new Error('Bearer token is required');
    }
    if (!args.infinityPortalUrl) {
      throw new Error('Infinity Portal URL is required');
    }

    // Format the URL for SMP API calls
    const smpApiUrl = `${args.infinityPortalUrl}/app/smp/SMC/api/v1`;
    
    const bearerClient = new BearerTokenAPIClient(
      args.bearerToken,
      smpApiUrl
    );
    
    return new this(bearerClient);
  }

  /**
   * Strip the leading slash that SMP API endpoints don't use, then delegate.
   * Overriding only callApiWithStatus is sufficient: the base callApi
   * dispatches through this method, so the URL cleaning applies to both paths.
   */
  async callApiWithStatus(
    method: string,
    uri: string,
    data: Record<string, any>,
  ): Promise<{ status: number; response: Record<string, any> }> {
    const cleanUri = uri.replace(/^\//, '');
    return await super.callApiWithStatus(method, cleanUri, data);
  }
}
