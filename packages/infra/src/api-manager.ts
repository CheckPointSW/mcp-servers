// API manager implementation for Check Point MCP servers
import {APIClientBase, SmartOneCloudAPIClient, OnPremAPIClient, BearerTokenAPIClient, TokenType} from './api-client.js';

import {sanitizeData} from "./string-utils.js";

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
  private domains: Array<{ name: string; type: string }> | null = null;

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
   * Check if the current environment is MDS
   */
  async isMds(): Promise<boolean> {
    return await this.client.isMDSEnvironment();
  }

  /**
   * Get domains from show-domains API
   */
  async getDomains(): Promise<Array<{ name: string; type: string }>> {
    // Return cached domains if available
    if (this.domains !== null) {
      return this.domains;
    }

    const response = await this.callApi('post', 'show-domains', {});

    // Extract domain names and types from the response
    const domains: Array<{ name: string; type: string }> = [];
    if (response.objects) {
      for (const obj of response.objects) {
        if (obj.name && obj.type) {
          domains.push({
            name: obj.name,
            type: obj.type
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

    // 3. Need to login to the domain and create a new client
    const domainSid = await this.loginToDomain(domainName);
    
    // Create a new client with the domain SID
    const domainClient = this.createClientWithSid(domainSid);
    
    // 4. Store the domain client
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
    // For on-prem management - supports both API key and username/password
    if (args.managementHost) {
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

    if (!args.s1cUrl) {
      throw new Error('Either management host or S1C URL must be provided');
    }

    let keyType: TokenType;
    let key: string;

    if (args.cloudInfraToken) {
      keyType = TokenType.CI_TOKEN;
      key = args.cloudInfraToken;
    }
    else if (args.apiKey) {
      keyType = TokenType.API_KEY;
      key = args.apiKey;
    }
    else {
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
