import { getHeaderValue } from '@chkp/mcp-utils';
import { Settings as BaseSettings } from '@chkp/quantum-infra';

export class Settings extends BaseSettings {
  public infinityPortalUrl: string = '';

  constructor({
    clientId = process.env.CLIENT_ID,
    secretKey = process.env.SECRET_KEY,
    infinityPortalUrl = process.env.INFINITY_PORTAL_URL,
    region = process.env.REGION || 'EU',
    ...baseArgs
  }: {
    clientId?: string;
    secretKey?: string;
    infinityPortalUrl?: string;
    region?: string;
    [key: string]: any;
  } = {}) {
    // Don't set s1cUrl to avoid base class validation requiring API key
    super({
      clientId,
      secretKey,
      region: region as any,
      ...baseArgs
    });
    
    this.infinityPortalUrl = infinityPortalUrl || '';
    
    // Additional validation for Spark Management specific fields
    this.validateSMPSettings();
  }

  /**
   * Spark Management-specific validation
   */
  private validateSMPSettings(): void {
    if (!this.clientId) {
      throw new Error('Client ID is required (via --client-id or CLIENT_ID env var)');
    }
    if (!this.secretKey) {
      throw new Error('Secret key is required (via --secret-key or SECRET_KEY env var)');
    }
    if (!this.infinityPortalUrl) {
      throw new Error('Infinity Portal URL is required (via --infinity-portal-url or INFINITY_PORTAL_URL env var)');
    }
  }

  static override fromArgs(options: any): Settings {
    return new Settings({
      clientId: options.clientId,
      secretKey: options.secretKey,
      infinityPortalUrl: options.infinityPortalUrl,
      region: options.region
    });
  }

  static override fromHeaders(headers: Record<string, string | string[]>): Settings {
    const clientId = getHeaderValue(headers, 'CLIENT-ID');
    const secretKey = getHeaderValue(headers, 'SECRET-KEY');
    const infinityPortalUrl = getHeaderValue(headers, 'INFINITY-PORTAL-URL');
    const region = getHeaderValue(headers, 'REGION');
    
    return new Settings({
      clientId,
      secretKey,
      infinityPortalUrl,
      region
    });
  }
};
