// Settings manager for MCP servers

import { nullOrEmpty } from './string-utils.js';
import { getHeaderValue, SettingsManager } from '@chkp/mcp-utils';

/**
 * Region type definition
 */
export type Region = 'EU' | 'US' | 'AU' | 'IN' | 'AE' | 'CA' | 'JP' | 'DEV' |'STG' | 'LOCAL';

/**
 * Infinity Portal gateway for each region. STG is listed before DEV and LOCAL,
 * which share its gateway, so a gateway host maps back to STG.
 */
const REGION_GATEWAYS: Record<Region, string> = {
  EU: 'https://cloudinfra-gw.portal.checkpoint.com',
  US: 'https://cloudinfra-gw-us.portal.checkpoint.com',
  AU: 'https://cloudinfra-gw.ap.portal.checkpoint.com',
  IN: 'https://cloudinfra-gw.in.portal.checkpoint.com',
  AE: 'https://cloudinfra-gw.ae.portal.checkpoint.com',
  CA: 'https://cloudinfra-gw.ca.portal.checkpoint.com',
  JP: 'https://cloudinfra-gw.jp.portal.checkpoint.com',
  STG: 'https://dev-cloudinfra-gw.kube1.iaas.checkpoint.com',
  DEV: 'https://dev-cloudinfra-gw.kube1.iaas.checkpoint.com',
  LOCAL: 'https://dev-cloudinfra-gw.kube1.iaas.checkpoint.com',
};

/** Every supported region code (uppercase), for packages that validate a region themselves. */
export const REGIONS: readonly Region[] = Object.freeze(Object.keys(REGION_GATEWAYS) as Region[]);

const GATEWAY_HOST_REGIONS = new Map<string, Region>();
for (const [region, url] of Object.entries(REGION_GATEWAYS) as [Region, string][]) {
  const host = new URL(url).hostname;
  if (!GATEWAY_HOST_REGIONS.has(host)) GATEWAY_HOST_REGIONS.set(host, region);
}

/**
 * Settings for the MCP servers
 */
export class Settings {
  /**
   * Keys whose values debug output may print (see debugView in mcp-utils).
   * Anything not listed, including every credential, is shown hidden.
   */
  static readonly debugLoggableKeys: readonly string[] = [
    'management-host', 'management-port', 'management-domain', 's1c-url', 'gateway-url', 'region',
    'dev-port', 'cloud-connected', 'write-mode',
  ];

  /**
   * Headers an HTTP session may mix with the operator's values (see
   * connection-source in mcp-utils). Every other header fromHeaders reads is
   * part of the connection set, which comes from one source only.
   */
  static readonly basicKeys: readonly string[] = ['REGION'];

  public apiKey?: string;
  public username?: string;
  public password?: string;
  public s1cUrl?: string;
  public managementHost?: string;
  public managementPort?: string;
  public managementDomain?: string; // MDS domain to log in to, for credentials without System Domain access
  public cloudInfraToken?: string;
  public cloudConnected?: boolean;
  public sid?: string;              // Pre-authenticated session ID (X-chkp-sid)
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
   * The region whose gateway is exactly this https URL's host, or undefined
   * for any other host. Only hosts in REGION_GATEWAYS are recognised.
   */
  static regionForGatewayHost(url?: string): Region | undefined {
    if (!url) return undefined;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:') return undefined;
      return GATEWAY_HOST_REGIONS.get(parsed.hostname.toLowerCase());
    } catch {
      return undefined;
    }
  }

  /**
   * The region of the Check Point MCP hosting environment this process runs
   * in, from the CLOUDINFRA_HOST gateway the platform sets on every pod.
   * Undefined outside the platform, or when the host is not a known gateway.
   *
   * It takes precedence over REGION: the platform sets REGION to its own
   * location code (`eu`, `apse2`, ...), and staging pods set REGION=eu while
   * using the staging gateway. A `requested` region that already uses the
   * hosted gateway is returned as is, since STG, DEV and LOCAL share a gateway
   * but servers treat them differently. Read from the process environment
   * only, never from request headers.
   */
  static hostedRegion(env: Record<string, unknown> = process.env, requested?: unknown): Region | undefined {
    const host = env.CLOUDINFRA_HOST;
    const hosted = typeof host === 'string' ? Settings.regionForGatewayHost(host) : undefined;
    if (!hosted) return undefined;
    const asked = typeof requested === 'string' ? requested.trim().toUpperCase() : '';
    const askedGateway = Object.prototype.hasOwnProperty.call(REGION_GATEWAYS, asked)
      ? REGION_GATEWAYS[asked as Region]
      : undefined;
    return askedGateway === REGION_GATEWAYS[hosted] ? asked as Region : hosted;
  }

  /**
   * Operator values for HTTP sessions (see SettingsManager.setOperatorValues):
   * REGION becomes the hosting environment's region when there is one, so a
   * session's default region matches its pod.
   */
  static adjustOperatorValues(values: Record<string, unknown>): Record<string, unknown> {
    const region = Settings.hostedRegion(values, values.REGION);
    return region ? { ...values, REGION: region } : values;
  }

  /**
   * Detect the region from a gateway base URL
   */
  static detectRegionFromUrl(url: string): Region | undefined {
    const exact = Settings.regionForGatewayHost(url);
    if (exact) return exact;
    if (url.includes('cloudinfra-gw-us.portal.checkpoint.com')) return 'US';
    if (url.includes('cloudinfra-gw.portal.checkpoint.com')) return 'EU';
    if (url.includes('dev-cloudinfra-gw')) return 'STG';
    return undefined;
  }

  // Takes only what it is given: the environment is read by fromArgs, so
  // settings built from request headers never pick up the process's values.
  constructor({
    apiKey,
    username,
    password,
    s1cUrl,
    managementHost,
    managementPort = '443',
    managementDomain,
    cloudInfraToken,
    cloudConnected = false,
    sid,
    clientId,
    secretKey,
    region = 'EU',
    devPort = '8006',
    gatewayUrl,
  }: {
    apiKey?: string;
    username?: string;
    password?: string;
    s1cUrl?: string;
    managementHost?: string;
    managementPort?: string;
    managementDomain?: string;
    cloudInfraToken?: string;
    cloudConnected?: boolean;
    sid?: string;
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
        managementDomain,
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
    this.managementDomain = managementDomain?.trim() || undefined;
    this.cloudInfraToken = cloudInfraToken;
    this.cloudConnected = cloudConnected;
    this.sid = sid;
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
    return REGIONS.includes(region.toUpperCase() as Region);
  }

  /**
   * Get the base gateway URL for a given region
   */
  private getRegionGatewayUrl(region: Region): string {
    return REGION_GATEWAYS[region] ?? '';
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
      console.error('[Settings] Verbose: sid:', this.sid ? '***' : '(empty)');
      console.error('[Settings] Verbose: s1cUrl:', this.s1cUrl || '(empty)');
      console.error('[Settings] Verbose: managementHost:', this.managementHost || '(empty)');
      console.error('[Settings] Verbose: apiKey:', this.apiKey ? '***' : '(empty)');
      console.error('[Settings] Verbose: cloudInfraToken:', this.cloudInfraToken ? '***' : '(empty)');
      console.error('[Settings] Verbose: username:', this.username ? '***' : '(empty)');
      console.error('[Settings] Verbose: password:', this.password ? '***' : '(empty)');
    }

    // When a pre-authenticated session ID (X-chkp-sid) is provided,
    // skip credential validation - the caller already has a valid session.
    if (!nullOrEmpty(this.sid)) {
      if (verbose) {
        console.error('[Settings] Verbose: Pre-authenticated SID provided, skipping credential validation');
      }
      return;
    }

    // For S1C, API key is required (unless running in stateless HTTP mode
    // where credentials arrive per-request via headers)
    if (!nullOrEmpty(this.s1cUrl) && nullOrEmpty(this.apiKey) && nullOrEmpty(this.cloudInfraToken)) {
      // In HTTP transport mode, credentials may come per-request via headers — allow startup without them
      if (process.env.MCP_TRANSPORT_TYPE?.toLowerCase() === 'http') {
        if (verbose) {
          console.error('[Settings] Verbose: S1C URL provided without credentials, but HTTP transport mode allows per-request auth via headers');
        }
      } else {
        if (verbose) {
          console.error('[Settings] Verbose: Validation FAILED - S1C URL provided but no API key or CI token');
        }
        throw new Error('API key or CI Token is required for S1C (via --api-key or API_KEY env var)');
      }
    }

    // For on-prem, either API key or username/password is required
    if (
      !nullOrEmpty(this.managementHost) &&
      nullOrEmpty(this.apiKey) &&
      (nullOrEmpty(this.username) || nullOrEmpty(this.password))
    ) {
      // In HTTP transport mode, credentials may come per-request via headers — allow startup without them
      if (process.env.MCP_TRANSPORT_TYPE?.toLowerCase() === 'http') {
        if (verbose) {
          console.error('[Settings] Verbose: Management host provided without credentials, but HTTP transport mode allows per-request auth via headers');
        }
      } else {
        if (verbose) {
          console.error('[Settings] Verbose: Validation FAILED - Management host provided but no API key or credentials');
        }
        throw new Error('Either API key or username/password are required for on-prem management (via CLI args or env vars)');
      }
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

    const env = process.env;
    return new Settings({
      apiKey: args.apiKey ?? env.API_KEY,
      username: args.username ?? env.USERNAME,
      password: args.password ?? env.PASSWORD,
      s1cUrl: args.s1cUrl ?? env.S1C_URL,
      managementHost: args.managementHost ?? env.MANAGEMENT_HOST,
      managementPort: args.managementPort ?? (env.MANAGEMENT_PORT || undefined),
      managementDomain: args.managementDomain ?? env.MANAGEMENT_DOMAIN,
      cloudInfraToken: args.cloudInfraToken ?? env.CLOUD_INFRA_TOKEN,
      cloudConnected: args.cloudConnected ?? env.CLOUD_CONNECTED === 'true',
      clientId: args.clientId ?? env.CLIENT_ID,
      secretKey: args.secretKey ?? env.SECRET_KEY,
      region: Settings.hostedRegion(env, args.region ?? env.REGION) ?? (typeof args.region === 'string'
        ? args.region.trim().toUpperCase() as Region
        : (env.REGION as Region) || undefined),
      devPort: args.devPort ?? (env.DEV_PORT || undefined),
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
      managementDomain: getHeaderValue(headers, 'MANAGEMENT-DOMAIN'),
      cloudInfraToken: getHeaderValue(headers, 'CLOUD-INFRA-TOKEN'),
      cloudConnected: getHeaderValue(headers, 'CLOUD-CONNECTED'),
      sid: getHeaderValue(headers, 'X-chkp-sid'),
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
      }
    }

    return new Settings({
      apiKey: extractedValues.apiKey,
      username: extractedValues.username,
      password: extractedValues.password,
      s1cUrl: extractedValues.s1cUrl,
      managementHost: extractedValues.managementHost,
      managementPort: extractedValues.managementPort,
      managementDomain: extractedValues.managementDomain,
      cloudInfraToken: extractedValues.cloudInfraToken,
      cloudConnected: extractedValues.cloudConnected === 'true',
      sid: extractedValues.sid,
      clientId: extractedValues.clientId,
      secretKey: extractedValues.secretKey,
      region: extractedValues.region?.toUpperCase() as Region,
      devPort: extractedValues.devPort,
      gatewayUrl: extractedValues.gatewayUrl,
    });
  }
}
