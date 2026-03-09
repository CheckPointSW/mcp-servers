// API manager implementation for Check Point MCP servers
import {APIClientBase, SmartOneCloudAPIClient, OnPremAPIClient, BearerTokenAPIClient, TokenType} from './api-client.js';

import {sanitizeData} from "./string-utils.js";
import { SettingsManager } from '@chkp/mcp-utils';

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
      active?: boolean
    }>
  }> | null = null;

  constructor(protected readonly client: APIClientBase) {}

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
   * Call an API endpoint
   */
  async callApi(method: string, uri: string, data: Record<string, any>, domain?: string): Promise<Record<string, any>> {
    const sanitizedData = sanitizeData(data);

    // If domain is specified, use domain-specific routing logic similar to runScript
    const apiClient = domain ? await this.getDomainApiClientByDomain(domain) : this.client;

    // Use the default client for non-domain-specific calls
    const clientResponse = await apiClient.callApi(
      method,
      uri,
      sanitizedData,
      undefined
    );
    return clientResponse.response;
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

        if (taskStatus === 'succeeded' || taskStatus === 'failed') {
          return { response: taskResp };
        }
      }

      // Task still in progress, wait and retry
      const timeout = timeouts[Math.min(retries, timeouts.length - 1)];
      await new Promise(resolve => setTimeout(resolve, timeout));
      retries++;
    }

    // Task did not complete in time, return last response
    const taskParams = { 'task-id': taskId };
    const taskResp = await this.callApi('POST', 'show-task', taskParams, domain);
    return { response: taskResp };
  }

  /**
   * Check if the current environment is MDS
   */
  async isMds(): Promise<boolean> {
    return await this.client.isMDSEnvironment();
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
      active?: boolean
    }>
  }>> {
    // Return cached domains if available
    if (this.domains !== null) {
      return this.domains;
    }

    // Fetch domains with full details to get server information (active/standby MDS IPs)
    const response = await this.callApi('post', 'show-domains', {
      'details-level': 'full'
    });

    // Extract domain names, types, and server information from the response
    const domains: Array<{
      name: string;
      type: string;
      servers?: Array<{
        name?: string;
        'ipv4-address'?: string;
        'ipv6-address'?: string;
        active?: boolean
      }>
    }> = [];

    if (response.objects) {
      for (const obj of response.objects) {
        if (obj.name && obj.type) {
          domains.push({
            name: obj.name,
            type: obj.type,
            servers: obj.servers || []
          });
        }
      }
    }

    // Cache the domains
    this.domains = domains;
    return domains;
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
    const isMDS = await this.client.isMDSEnvironment();
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
   * Get the appropriate API client for a specific domain, handling MDS domain routing
   * This method handles multi-MDS environments where domains may be distributed across
   * different MDS servers with active/standby configurations.
   */
  async getDomainApiClientByDomain(domainName: string): Promise<APIClientBase> {
    // 1. Check if the main API client is MDS, if not return it directly
    const isMDS = await this.client.isMDSEnvironment();
    if (!isMDS) {
      return this.client;
    }

    // 2. Check if we already have a valid client for this domain
    const existingDomainClient = this.domainClients.get(domainName);
    if (existingDomainClient && existingDomainClient.hasValidSession()) {
      return existingDomainClient;
    }

    // 3. Check if the domain exists on the current MDS server (active or standby)
    const isOnCurrentMDS = await this.isDomainOnCurrentMDS(domainName);

    if (isOnCurrentMDS) {
      // Domain is present on current MDS (either active or standby)
      // We can use the current connection to login to the domain
      const domainSid = await this.loginToDomain(domainName);
      const domainClient = this.createClientWithSid(domainSid);
      this.domainClients.set(domainName, domainClient);
      return domainClient;
    }

    // 4. Domain is NOT on current MDS - need to connect to a different MDS server
    const targetMDSIP = await this.getMDSServerForDomain(domainName);

    if (!targetMDSIP) {
      throw new Error(
        `Domain '${domainName}' not found or has no available MDS servers. ` +
        `Make sure the domain exists and you have access to it.`
      );
    }

    // Extract port from current client if available
    const currentHost = this.client.getHost();
    const portMatch = currentHost.match(/:(\d+)/);
    const port = portMatch ? portMatch[1] : '443';

    // 5. Create a new API client for the target MDS server
    const newMDSClient = this.createClientForMDS(targetMDSIP, port);

    // Copy debug setting to the new client
    if ('debug' in newMDSClient) {
      (newMDSClient as any).debug = this._debug;
    }

    // 6. Login to the target MDS server
    await newMDSClient.login();

    // 7. Login to the specific domain on the target MDS
    const loginResponse = await newMDSClient.callApi('post', 'login-to-domain', {
      'domain': domainName
    }, undefined);

    if (!loginResponse.response.sid) {
      throw new Error(
        `Failed to login to domain '${domainName}' on MDS server ${targetMDSIP}`
      );
    }

    // 8. Create a client with the domain SID
    const domainSid = loginResponse.response.sid;
    const domainClient = this.createClientWithSid(domainSid);

    // Store the domain client for reuse
    this.domainClients.set(domainName, domainClient);

    return domainClient;
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
   * Check if a domain exists on the current MDS server (either active or standby)
   */
  private async isDomainOnCurrentMDS(domainName: string): Promise<boolean> {
    const domains = await this.getDomains();
    const domain = domains.find(d => d.name === domainName);

    if (!domain?.servers || domain.servers.length === 0) {
      return false;
    }

    // Extract the IP/host from the current client's host URL
    const currentHost = this.client.getHost();

    // Check if any of the domain's servers match the current MDS host (IPv4 or IPv6)
    return domain.servers.some(server => {
      const ipv4 = server['ipv4-address'];
      const ipv6 = server['ipv6-address'];
      return (ipv4 && currentHost.includes(ipv4)) || (ipv6 && currentHost.includes(ipv6));
    });
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
   * Create a new API client for a different MDS server
   * Handles both IPv4 and IPv6 addresses
   * Only supports OnPremAPIClient for multi-MDS scenarios
   */
  private createClientForMDS(mdsIP: string, port: string = '443'): APIClientBase {
    if (this.client instanceof OnPremAPIClient) {
      // Access the private properties through type casting
      const currentClient = this.client as any;

      // Format IPv6 addresses properly for URL usage (wrap in brackets if needed)
      const formattedHost = mdsIP.includes(':') && !mdsIP.startsWith('[')
        ? `[${mdsIP}]`
        : mdsIP;

      // Create a new OnPremAPIClient with the same credentials but different host
      return new OnPremAPIClient(
        currentClient.authToken || undefined,
        formattedHost,
        port,
        currentClient.username,
        currentClient.password
      );
    } else if (this.client instanceof SmartOneCloudAPIClient) {
      // SmartOneCloud doesn't support multi-MDS in the same way
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
    s1cUrl?: string;
    cloudInfraToken?: string;
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
        s1cUrl: args.s1cUrl,
        cloudInfraToken: args.cloudInfraToken ? '***' : undefined
      });
    }

    // Early validation - check if args is effectively empty
    const hasAnyValue = args.apiKey || args.username || args.password ||
                        args.s1cUrl || args.managementHost || args.cloudInfraToken;
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
      // Create an OnPremAPIClient with username/password support
      const onPremClient = new OnPremAPIClient(
        args.apiKey,
        args.managementHost,
        args.managementPort || '443',
        args.username,
        args.password
      );
      return new this(onPremClient);
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

    if (args.cloudInfraToken) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: Using cloud infra token');
      }
      keyType = TokenType.CI_TOKEN;
      key = args.cloudInfraToken;
    }
    else if (args.apiKey) {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: Using API key');
      }
      keyType = TokenType.API_KEY;
      key = args.apiKey;
    }
    else {
      if (verbose) {
        console.error('[APIManagerForAPIKey.create] Verbose: ERROR - No API key or cloud infra token provided');
      }
      throw new Error('API key or cloud infrastructure token is required');
    }

    return new this(SmartOneCloudAPIClient.create(
      key,
      keyType,
      args.s1cUrl!,
    ));
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
   * Override callApi to handle SMP-specific API format
   */
  async callApi(method: string, uri: string, data: Record<string, any>): Promise<Record<string, any>> {
    // Remove leading slash if present since SMP APIs don't use it
    const cleanUri = uri.replace(/^\//, '');
    
    return await super.callApi(method, cleanUri, data);
  }
}
