import { APIManagerForBearerToken, ExternalTokenManager } from '@chkp/quantum-infra';
import { Settings } from './settings.js';

/**
 * SMP API manager for Spark Management
 * Uses Bearer token authentication via ExternalTokenManager
 */
export class SMPAPIManager {
  private tokenManager: ExternalTokenManager;
  private apiManager: APIManagerForBearerToken | null = null;

  constructor(private readonly settings: Settings) {
    this.tokenManager = ExternalTokenManager.create(settings);
  }

  /**
   * Create a new SMPAPIManager instance from settings
   * @param settings The complete settings object for this session
   * @returns A new SMPAPIManager instance
   */
  static create(settings: Settings): SMPAPIManager {
    return new SMPAPIManager(settings);
  }

  /**
   * Get or create the API manager with a valid Bearer token
   */
  private async getApiManager(): Promise<APIManagerForBearerToken> {
    if (!this.apiManager) {
      const token = await this.tokenManager.getToken();
      
      this.apiManager = APIManagerForBearerToken.create({
        bearerToken: token,
        infinityPortalUrl: this.settings.infinityPortalUrl
      });
    }
    
    return this.apiManager;
  }

  /**
   * Call an SMP API endpoint
   * @param method HTTP method
   * @param uri API URI (relative to /app/smp/SMC/api/v1/)
   * @param data Request data
   * @returns API response
   */
  async callApi(method: string, uri: string, data: Record<string, any> = {}): Promise<Record<string, any>> {
    try {
      const apiManager = await this.getApiManager();
      const result = await apiManager.callApi(method, uri, data);
      return result;
    } catch (error: any) {
      // If token is expired or invalid, clear the API manager and retry once
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        this.apiManager = null;
        const apiManager = await this.getApiManager();
        const result = await apiManager.callApi(method, uri, data);
        return result;
      }
      
      throw error;
    }
  }

  /**
   * Get gateway information
   * @param gatewayName Name of the gateway (optional)
   * @returns API response
   */
  async getGateways(gatewayName?: string): Promise<Record<string, any>> {
    const data = gatewayName ? { name: gatewayName } : {};
    return await this.callApi('GET', 'gateways', data);
  }

  /**
   * Show an existing gateway object
   * @param gatewayName Name of the gateway to show
   * @returns API response
   */
  async showGateway(gatewayName: string): Promise<Record<string, any>> {
    const data = {
      gateway: {
        name: gatewayName
      }
    };
    return await this.callApi('POST', 'show-gateway', data);
  }
}
