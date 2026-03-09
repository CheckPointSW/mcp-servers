import { getHeaderValue } from '@chkp/mcp-utils';
import { Settings as BaseSettings } from '@chkp/quantum-infra';

export class Settings extends BaseSettings {

  constructor({
    clientId = process.env.CLIENT_ID,
    secretKey = process.env.SECRET_KEY,
    infinityPortalUrl = process.env.INFINITY_PORTAL_URL,
    region = process.env.REGION || 'EU',
    ...baseArgs
  }: {
    clientId?: string;
    secretKey?: string;
    /**
     * The Infinity Portal URL for Spark Management.
     * Accepts either the base URL (e.g. https://cloudinfra-gw.portal.checkpoint.com)
     * or the full auth URL copied from the API key creation dialog
     * (e.g. https://cloudinfra-gw.portal.checkpoint.com/auth/external).
     * The path suffix is stripped automatically so either form works.
     * When provided, the region is inferred from the URL and the --region flag
     * becomes redundant.
     */
    infinityPortalUrl?: string;
    region?: string;
    [key: string]: any;
  } = {}) {
    // Pass infinityPortalUrl as gatewayUrl to the base class, which will:
    //  1. Strip any /auth/external (or similar) path suffix
    //  2. Infer and update the region from the URL when possible
    // If infinityPortalUrl is not provided, the base class falls back to region.
    super({
      clientId,
      secretKey,
      region: region as any,
      gatewayUrl: infinityPortalUrl,
      ...baseArgs
    });

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
  }

  static override fromArgs(options: any): Settings {
    if (!options.infinityPortalUrl && !options.region) {
      throw new Error(
        'Provide either --infinity-portal-url (Authentication URL from the API key creation dialog) ' +
        'or --region (EU, US, STG, or LOCAL)'
      );
    }
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
