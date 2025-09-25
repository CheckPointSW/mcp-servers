// Settings manager for MCP servers

import { nullOrEmpty } from './string-utils.js';
import { getHeaderValue } from '@chkp/mcp-utils';

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
  } = {}) {
    this.apiKey = apiKey;
    this.username = username;
    this.password = password;
    this.s1cUrl = s1cUrl;
    this.managementHost = managementHost;
    this.managementPort = managementPort;
    this.cloudInfraToken = cloudInfraToken;
    this.clientId = clientId;
    this.secretKey = secretKey;
    this.region = this.isValidRegion(region) ? region : 'EU';  
    this.devPort = devPort;

    this.validate();
  }
  
  /**
   * Check if the provided string is a valid region
   */
  private isValidRegion(region: string): region is Region {
    return ['EU', 'US', 'STG', 'LOCAL'].includes(region.toUpperCase() as Region);
  }
  
  /**
   * Get Cloud Infra Gateway based on region
   */
  getCloudInfraGateway(): string {
    switch (this.region) {
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
   * Validate the settings
   */

  
  private validate(): void {
    // For S1C, API key is required
    if (!nullOrEmpty(this.s1cUrl) && nullOrEmpty(this.apiKey) && nullOrEmpty(this.cloudInfraToken)) {
      throw new Error('API key or CI Token is required for S1C (via --api-key or API_KEY env var)');
    }

    // For on-prem, either API key or username/password is required
    if (
      !nullOrEmpty(this.managementHost) &&
      nullOrEmpty(this.apiKey) &&
      (nullOrEmpty(this.username) || nullOrEmpty(this.password))
    ) {
      throw new Error('Either API key or username/password are required for on-prem management (via CLI args or env vars)');
    }

    // Need either management URL or management host
    if (nullOrEmpty(this.s1cUrl) && nullOrEmpty(this.managementHost)) {
      // This validation is commented out in the Python code, so we'll do the same
      // throw new Error(
      //   'You must provide either management URL (cloud) or management host (on-prem) via CLI or env vars'
      // );
    }
  }
  /**
   * Create settings from command-line arguments
   */
  static fromArgs(args: Record<string, any>): Settings {
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
      region: typeof args.region === 'string' ? args.region.toUpperCase() as Region : undefined,
      devPort: args.devPort,
    });
  }
  
  /**
   * Create settings from HTTP headers
   * Maps headers to environment variable format based on server config
   */
  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    return new Settings({
      apiKey: getHeaderValue(headers, 'API-KEY'),
      username: getHeaderValue(headers, 'USERNAME'),
      password: getHeaderValue(headers, 'PASSWORD'),
      s1cUrl: getHeaderValue(headers, 'S1C-URL'),
      managementHost: getHeaderValue(headers, 'MANAGEMENT-HOST'),
      managementPort: getHeaderValue(headers, 'MANAGEMENT-PORT'),
      cloudInfraToken: getHeaderValue(headers, 'CLOUD-INFRA-TOKEN'),
      clientId: getHeaderValue(headers, 'CLIENT-ID'),
      secretKey: getHeaderValue(headers, 'SECRET-KEY'),
      region: getHeaderValue(headers, 'REGION')?.toUpperCase() as Region,
      devPort: getHeaderValue(headers, 'DEV-PORT'),
    });
  }
}
