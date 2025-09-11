import { GaiaApiClient } from './gaia-api-client.js';
import type { GaiaConnection } from './gaia-auth.js';

export class GaiaAPIManager {
  private gaiaClient: GaiaApiClient | null = null;
  private connection: GaiaConnection;

  constructor(connection: GaiaConnection) {
    this.connection = connection;
  }

  /**
   * Create API manager from connection details
   */
  static create(connection: GaiaConnection): GaiaAPIManager {
    return new GaiaAPIManager(connection);
  }

  async initializeClient(): Promise<void> {
    if (!this.gaiaClient) {
      this.gaiaClient = new GaiaApiClient(this.connection);
      
      // Login to establish session
      await this.gaiaClient.login();
      console.error(`GAIA client initialized for ${this.gaiaClient.getConnectionInfo()}`);
    }
  }

  async callApi(method: string, uri: string, data: Record<string, any> = {}): Promise<any> {
    if (!this.gaiaClient) {
      await this.initializeClient();
    }

    return await this.gaiaClient!.callApi(method, uri, data);
  }

  /**
   * Get connection info for logging
   */
  getConnectionInfo(): string {
    return `${this.connection.gatewayIp}:${this.connection.port}`;
  }
}