// API manager implementation for Check Point MCP servers
import { APIClientBase, HarmonySaseAPIClient } from './api-client.js';

/**
 * Base class for API managers
 */
export abstract class APIManagerBase {
  protected requestInfo: any = null;
  protected detailsLevel: 'full' | 'standard' | 'uid' = 'full';

  constructor(protected readonly client: APIClientBase) {}

  /**
   * Call an API endpoint
   */
  async callApi(method: string, uri: string, data: Record<string, any>): Promise<Record<string, any>> {
    const clientResponse = await this.client.callApi(
      method,
      uri,
      data,
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
        retries++;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between checks
      }
    }
    
    return [false, "Task did not complete in time"];
  }
}

/**
 * API manager for Harmony SASE
 */
export class APIManagerForHarmonySASE extends APIManagerBase {
  static override create(args: {
    api_key: string;
    management_host: string;
    origin: string;
  }): APIManagerForHarmonySASE {
    return new this(HarmonySaseAPIClient.create(
      args.api_key,
      args.management_host,
      args.origin
    ));
  }
}
