// External User Token Service for MCP servers
import axios from 'axios';
import { Settings } from './settings.js';

/**
 * Interface for token information with expiry
 */
export interface ExternalUserTokenInfo {
  token: string;
  expiresAt: number; // Unix timestamp
}

/**
 * Service for obtaining and caching external user tokens
 */
export class ExternalTokenManager {
  private tokenCache: Map<string, ExternalUserTokenInfo> = new Map();
  
  /**
   * Create a new ExternalTokenManager
   *
   * @param settings Settings containing clientId and secretKey
   */
  constructor(protected settings: Settings) {
  }

  authUrl(): string {
    const gatewayUrl = this.settings.getCloudInfraGateway();
    return `${gatewayUrl}/auth/external`;
  }

  /**
   * Get a valid auth token, fetching a new one if necessary
   * @returns Promise resolving to a valid token
   */
  async getToken(): Promise<string> {
    if (!this.settings.clientId || !this.settings.secretKey) {
      throw new Error('Client ID and Secret Key are required for external user authentication');
    }
    
    const cacheKey = `${this.settings.clientId}:${this.settings.region || 'EU'}`;
    const cached = this.tokenCache.get(cacheKey);

    // Check if we have a valid cached token
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    // Fetch a new token
    const response = await axios.post(this.authUrl(), {
      clientId: this.settings.clientId,
      accessKey: this.settings.secretKey
    }, {
      timeout: 30000,
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      const errorData = response.data ? JSON.stringify(response.data) : 'No response data';
      throw new Error(`Failed to get auth token: ${response.statusText} (${response.status}). Response data: ${errorData}`);
    }

    const responseData = response.data as any;
    const token = responseData.data.token;
    const expiresIn = responseData.data.expiresIn;

    if (!token || !expiresIn) {
      throw new Error('Invalid token response from auth server');
    }

    // Cache the token (subtract 5 seconds to avoid edge cases)
    const tokenInfo: ExternalUserTokenInfo = {
      token,
      expiresAt: Date.now() + (expiresIn * 1000) - 5000
    };

    this.tokenCache.set(cacheKey, tokenInfo);
    
    return token;
  }
  
  /**
   * Create a token service instance
   * @param settings Settings containing clientId and secretKey
   * @returns A new ExternalUserTokenManager
   * instance
   */
  static create(settings: Settings): ExternalTokenManager
 {
    return new ExternalTokenManager
(settings);
  }
}

export class ExternalUserTokenManager extends ExternalTokenManager {
    static create(settings: Settings): ExternalUserTokenManager
 {
    return new ExternalUserTokenManager
(settings);
  }

    authUrl(): string {
    const gatewayUrl = this.settings.getCloudInfraGateway();
    return `${gatewayUrl}/auth/external/user`;
  }
}