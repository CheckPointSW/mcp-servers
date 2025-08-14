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
      // Convert snake_case to kebab-case for API parameters
    const safeData: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === "") {
        continue;
      }
      const safeKey = key.replace(/_/g, "-");
      safeData[safeKey] = value;
    }

    const clientResponse = await this.client.callApi(
      method,
      uri,
      safeData,
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
}

/**
 * API manager for Harmony SASE
 */
export class APIManagerForHarmonySASE extends APIManagerBase {
  static override create(args: {
    apiKey: string;
    managementHost: string;
    origin: string;
  }): APIManagerForHarmonySASE {
    return new this(HarmonySaseAPIClient.create(
      args.apiKey,
      args.managementHost,
      args.origin
    ));
  }
}
