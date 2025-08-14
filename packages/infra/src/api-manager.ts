// API manager implementation for Check Point MCP servers
import {APIClientBase, SmartOneCloudAPIClient, OnPremAPIClient, TokenType} from './api-client.js';

import {sanitizeData} from "./string-utils.js";

/**
 * Base class for API managers
 */
export abstract class APIManagerBase {
  protected requestInfo: any = null;
  protected detailsLevel: 'full' | 'standard' | 'uid' = 'full';
  private _debug: boolean = false;

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
  async callApi(method: string, uri: string, data: Record<string, any>): Promise<Record<string, any>> {
    const sanitizedData = sanitizeData(data);
    const clientResponse = await this.client.callApi(
      method,
      uri,
      sanitizedData,
      undefined
    );
    return clientResponse.response;
  }

  /**
   * Create an API manager instance
   */
  static create(args: any): APIManagerBase {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Run a script on a target gateway
   */
  async runScript(
    targetGateway: string, 
    scriptName: string, 
    script: string
  ): Promise<[boolean, Record<string, any>]> {
    const payload = {
      'script-name': scriptName,
      'script': script,
      'targets': [targetGateway]
    };
    
    const resp = await this.callApi('post', 'run-script', payload);
    
    if (!resp.tasks) {
      return [false, { message: "Failed to run the script" }];
    }
    
    return [true, { tasks: resp.tasks.map((task: any) => task['task-id']) }];
  }

  /**
   * Get the result of a task
   */
  async getTaskResult(
    taskId: string, 
    maxRetries: number = 5
  ): Promise<[boolean, string]> {
    let retries = 0;
    const timeouts = [1000, 1000, 2000, 5000, 5000]; // Retry intervals in milliseconds
    while (retries < maxRetries) {
      const payload = {
        'task-id': taskId,
        'details-level': 'full'
      };
      
      const response = await this.callApi('post', 'show-task', payload);
      const taskDetails = response.tasks?.[0];
      
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
