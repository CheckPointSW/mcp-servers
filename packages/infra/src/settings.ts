// Settings manager for MCP servers

import { nullOrEmpty } from './string-utils.js';
import { getHeaderValue, SettingsManager } from '@chkp/mcp-utils';

/**
 * Region type definition
 */
export type Region = 'EU' | 'US' | 'STG' | 'LOCAL';

/**
 * Settings for the MCP servers
 */
export class Settings {
  public apiKey?: string;
  public username?: string;
  public password?: string;
  public s1cUrl?: string;
  public managementHost?: string;
  public managementPort?: string;
  public cloudInfraToken?: string;
  public clientId?: string;
  public secretKey?: string;
  public region: Region = 'EU';
  public devPort?: string = '8006'; // Default port for local development
  public gatewayUrl: string = ''; // Resolved base gateway URL

  private normalizeRegion(region?: string): Region | undefined {
    if (!region) {
      return undefined;
    }

    const normalized = region.trim().toUpperCase();
    return this.isValidRegion(normalized) ? normalized as Region : undefined;
  }

  /**
   * Extract the base gateway URL (scheme + host) from a full URL.
   * Allows users to copy-paste any URL from the API key creation dialog
   * without having to strip the path manually.
   * Falls back to the original string if URL parsing fails.
   */
  static stripGatewayPath(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return url;
    }
  }

  /**
   * Detect the region from a gateway base URL
   */
  static detectRegionFromUrl(url: string): Region | undefined {
    if (url.includes('cloudinfra-gw-us.portal.checkpoint.com')) return 'US';
    if (url.includes('cloudinfra-gw.portal.checkpoint.com')) return 'EU';
    if (url.includes('dev-cloudinfra-gw')) return 'STG';
    return undefined;
  }

  constructor({
    apiKey = process.env.API_KEY,
    username = process.env.USERNAME,
    password = process.env.PASSWORD,
    s1cUrl = process.env.S1C_URL,
    managementHost = process.env.MANAGEMENT_HOST,
    managementPort = process.env.MANAGEMENT_PORT || '443',
    cloudInfraToken = process.env.CLOUD_INFRA_TOKEN,
    clientId = process.env.CLIENT_ID,
    secretKey = process.env.SECRET_KEY,
    region = (process.env.REGION as Region) || 'EU',
    devPort = process.env.DEV_PORT || '8006',
    gatewayUrl,
  }: {
    apiKey?: string;
    username?: string;
    password?: string;
    s1cUrl?: string;
    managementHost?: string;
    managementPort?: string;
    cloudInfraToken?: string;
    clientId?: string;
    secretKey?: string;
    region?: Region;
    devPort?: string;
    gatewayUrl?: string;
  } = {}) {
    const verbose = SettingsManager.globalDebugState;

    if (verbose) {
      console.error('[Settings] Verbose: Constructor called with params:', {
        apiKey: apiKey ? '***' : undefined,
        username: username ? '***' : undefined,
        password: password ? '***' : undefined,
        s1cUrl,
        managementHost,
        managementPort,
        cloudInfraToken: cloudInfraToken ? '***' : undefined,
        clientId,
        secretKey: secretKey ? '***' : undefined,
        region,
        devPort
      });
    }

    this.apiKey = apiKey;
    this.username = username;
    this.password = password;
    this.s1cUrl = s1cUrl;
    this.managementHost = managementHost;
    this.managementPort = managementPort;
    this.cloudInfraToken = cloudInfraToken;
    this.clientId = clientId;
    this.secretKey = secretKey;
    this.region = this.normalizeRegion(region) || 'EU';
    this.devPort = devPort;
    this.gatewayUrl = this.resolveGatewayUrl(this.region, gatewayUrl);

    if (verbose) {
      console.error('[Settings] Verbose: After assignment:', {
        apiKey: this.apiKey ? '***' : undefined,
        username: this.username ? '***' : undefined,
        password: this.password ? '***' : undefined,
        s1cUrl: this.s1cUrl,
        managementHost: this.managementHost,
        managementPort: this.managementPort,
        cloudInfraToken: this.cloudInfraToken ? '***' : undefined,
        region: this.region
      });
    }

    this.validate();
  }
  
  /**
   * Check if the provided string is a valid region
   */
  private isValidRegion(region: string): region is Region {
    return ['EU', 'US', 'STG', 'LOCAL'].includes(region.toUpperCase() as Region);
  }

  /**
   * Get the base gateway URL for a given region
   */
  private getRegionGatewayUrl(region: Region): string {
    switch (region) {
      case 'EU':
        return 'https://cloudinfra-gw.portal.checkpoint.com';
      case 'US':
        return 'https://cloudinfra-gw-us.portal.checkpoint.com';
      case 'STG':
      case 'LOCAL':
        return 'https://dev-cloudinfra-gw.kube1.iaas.checkpoint.com';
      default:
        return '';
    }
  }

  /**
   * Resolve the base gateway URL from either a provided URL or the configured region.
   * If a URL is provided, its path suffix is stripped so users can paste the full
   * auth URL from the API key creation dialog (e.g. ending in /auth/external).
   * When the URL implies a different region, this.region is updated to match.
   */
  private resolveGatewayUrl(region: Region, providedUrl?: string): string {
    if (!providedUrl) {
      return this.getRegionGatewayUrl(region);
    }

    const base = Settings.stripGatewayPath(providedUrl);
    const detectedRegion = Settings.detectRegionFromUrl(base);

    // Update region to match the URL when it implies a known region
    if (detectedRegion && detectedRegion !== this.region) {
      this.region = detectedRegion;
    }

    return base;
  }

  /**
   * Get the base Cloud Infra Gateway URL.
   * Returns the precomputed gatewayUrl (derived from region or a provided URL).
   */
  getCloudInfraGateway(): string {
    return this.gatewayUrl;
  }
  /**
   * Validate the settings
   */


  private validate(): void {
    const verbose = SettingsManager.globalDebugState;

    if (verbose) {
      console.error('[Settings] Verbose: Validating settings...');
      console.error('[Settings] Verbose: s1cUrl:', this.s1cUrl || '(empty)');
      console.error('[Settings] Verbose: managementHost:', this.managementHost || '(empty)');
      console.error('[Settings] Verbose: apiKey:', this.apiKey ? '***' : '(empty)');
      console.error('[Settings] Verbose: cloudInfraToken:', this.cloudInfraToken ? '***' : '(empty)');
      console.error('[Settings] Verbose: username:', this.username ? '***' : '(empty)');
      console.error('[Settings] Verbose: password:', this.password ? '***' : '(empty)');
    }

    // For S1C, API key is required
    if (!nullOrEmpty(this.s1cUrl) && nullOrEmpty(this.apiKey) && nullOrEmpty(this.cloudInfraToken)) {
      if (verbose) {
        console.error('[Settings] Verbose: Validation FAILED - S1C URL provided but no API key or CI token');
      }
      throw new Error('API key or CI Token is required for S1C (via --api-key or API_KEY env var)');
    }

    // For on-prem, either API key or username/password is required
    if (
      !nullOrEmpty(this.managementHost) &&
      nullOrEmpty(this.apiKey) &&
      (nullOrEmpty(this.username) || nullOrEmpty(this.password))
    ) {
      if (verbose) {
        console.error('[Settings] Verbose: Validation FAILED - Management host provided but no API key or credentials');
      }
      throw new Error('Either API key or username/password are required for on-prem management (via CLI args or env vars)');
    }

    // Need either management URL or management host
    if (nullOrEmpty(this.s1cUrl) && nullOrEmpty(this.managementHost)) {
      if (verbose) {
        console.error('[Settings] Verbose: WARNING - Neither s1cUrl nor managementHost provided');
      }
      // This validation is commented out in the Python code, so we'll do the same
      // throw new Error(
      //   'You must provide either management URL (cloud) or management host (on-prem) via CLI or env vars'
      // );
    }

    if (verbose) {
      console.error('[Settings] Verbose: Validation PASSED');
    }
  }
  /**
   * Create settings from command-line arguments
   */
  static fromArgs(args: Record<string, any>): Settings {
    const verbose = SettingsManager.globalDebugState;

    if (verbose) {
      console.error('[Settings.fromArgs] Verbose: Creating settings from args');
      console.error('[Settings.fromArgs] Verbose: Raw args:', {
        apiKey: args.apiKey ? '***' : undefined,
        username: args.username ? '***' : undefined,
        password: args.password ? '***' : undefined,
        s1cUrl: args.s1cUrl,
        managementHost: args.managementHost,
        managementPort: args.managementPort,
        cloudInfraToken: args.cloudInfraToken ? '***' : undefined,
        region: args.region,
        hasOtherKeys: Object.keys(args).length > 10
      });

      // Check if args is effectively empty
      const hasAnyValue = args.apiKey || args.username || args.password ||
                          args.s1cUrl || args.managementHost || args.cloudInfraToken;
      if (!hasAnyValue) {
        console.error('[Settings.fromArgs] Verbose: WARNING - Args object appears empty, no authentication values found');
      }
    }

    return new Settings({
      apiKey: args.apiKey,
      username: args.username,
      password: args.password,
      s1cUrl: args.s1cUrl,
      managementHost: args.managementHost,
      managementPort: args.managementPort,
      cloudInfraToken: args.cloudInfraToken,
      clientId: args.clientId,
      secretKey: args.secretKey,
      region: typeof args.region === 'string' ? args.region.trim().toUpperCase() as Region : undefined,
      devPort: args.devPort,
      gatewayUrl: args.gatewayUrl,
    });
  }
  
  /**
   * Create settings from HTTP headers
   * Maps headers to environment variable format based on server config
   */
  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    const verbose = SettingsManager.globalDebugState;

    if (verbose) {
      console.error('[Settings.fromHeaders] Verbose: Creating settings from headers');
      console.error('[Settings.fromHeaders] Verbose: Available header keys:', Object.keys(headers));
    }

    const extractedValues = {
      apiKey: getHeaderValue(headers, 'API-KEY'),
      username: getHeaderValue(headers, 'USERNAME'),
      password: getHeaderValue(headers, 'PASSWORD'),
      s1cUrl: getHeaderValue(headers, 'S1C-URL'),
      managementHost: getHeaderValue(headers, 'MANAGEMENT-HOST'),
      managementPort: getHeaderValue(headers, 'MANAGEMENT-PORT'),
      cloudInfraToken: getHeaderValue(headers, 'CLOUD-INFRA-TOKEN'),
      clientId: getHeaderValue(headers, 'CLIENT-ID'),
      secretKey: getHeaderValue(headers, 'SECRET-KEY'),
      region: getHeaderValue(headers, 'REGION'),
      devPort: getHeaderValue(headers, 'DEV-PORT'),
      gatewayUrl: getHeaderValue(headers, 'GATEWAY-URL'),
    };

    if (verbose) {
      console.error('[Settings.fromHeaders] Verbose: Extracted values:', {
        apiKey: extractedValues.apiKey ? '***' : undefined,
        username: extractedValues.username ? '***' : undefined,
        password: extractedValues.password ? '***' : undefined,
        s1cUrl: extractedValues.s1cUrl,
        managementHost: extractedValues.managementHost,
        managementPort: extractedValues.managementPort,
        cloudInfraToken: extractedValues.cloudInfraToken ? '***' : undefined,
        region: extractedValues.region,
        devPort: extractedValues.devPort
      });

      // Check if headers are effectively empty
      const hasAnyValue = extractedValues.apiKey || extractedValues.username || extractedValues.password ||
                          extractedValues.s1cUrl || extractedValues.managementHost || extractedValues.cloudInfraToken;
      if (!hasAnyValue) {
        console.error('[Settings.fromHeaders] Verbose: WARNING - No authentication values found in headers');
        console.error('[Settings.fromHeaders] Verbose: Full headers object (sanitized):',
          Object.fromEntries(
            Object.entries(headers).map(([k, v]) =>
              [k, (k.toLowerCase().includes('key') || k.toLowerCase().includes('token') || k.toLowerCase().includes('password')) ? '***' : v]
            )
          )
        );
      }
    }

    return new Settings({
      apiKey: extractedValues.apiKey,
      username: extractedValues.username,
      password: extractedValues.password,
      s1cUrl: extractedValues.s1cUrl,
      managementHost: extractedValues.managementHost,
      managementPort: extractedValues.managementPort,
      cloudInfraToken: extractedValues.cloudInfraToken,
      clientId: extractedValues.clientId,
      secretKey: extractedValues.secretKey,
      region: extractedValues.region?.toUpperCase() as Region,
      devPort: extractedValues.devPort,
      gatewayUrl: extractedValues.gatewayUrl,
    });
  }
}
