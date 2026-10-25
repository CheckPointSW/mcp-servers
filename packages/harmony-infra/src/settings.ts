// Settings manager for MCP servers
import * as z from 'zod';
import { getHeaderValue } from '@chkp/mcp-utils';

// Singleton instance for settings
let globalSettings: Settings | null = null;

/**
 * Settings for the MCP servers
 */
export class Settings {
  /**
   * Keys whose values debug output may print (see debugView in mcp-utils).
   * Anything not listed, including every credential, is shown hidden.
   */
  static readonly debugLoggableKeys: readonly string[] = ['management-host', 'origin'];

  public managementHost?: string;
  public origin?: string;
  public apiKey?: string;

  /**
   * Set the global settings instance
   */
  static setSettings(settings: Settings): void {
    globalSettings = settings;
    // Also set the global reference for access from other modules
    (globalThis as any).cpMcpSettings = settings;
  }

  /**
   * Get the global settings instance
   */
  static getSettings(): Settings {
    if (!globalSettings) {
      globalSettings = Settings.fromArgs({});
      // Also set the global reference for access from other modules
      (globalThis as any).cpMcpSettings = globalSettings;
    }
    return globalSettings;
  }
  // Takes only what it is given; fromArgs reads the environment.
  constructor({
    managementHost,
    origin,
    apiKey
  }: {
    managementHost?: string;
    origin?: string;
    apiKey?: string;
  } = {}) {
    this.managementHost = managementHost;
    this.origin = origin;
    this.apiKey = apiKey;
    
  }
  /**
   * Validate the settings
   */
  private validate(): void {
    // Management host is required
    if (!this.managementHost) {
      throw new Error('Management host is required (via --management-host or MANAGEMENT_HOST env var)');
    }

    // Origin is required
    if (!this.origin) {
      throw new Error('Origin is required (via --origin or ORIGIN env var)');
    }

    // API key is required
    if (!this.apiKey) {
      throw new Error('API key is required (via --api-key or API_KEY env var)');
    }
  }
  /**
   * Create settings from command-line arguments
   */
  static fromArgs(args: Record<string, any>): Settings {
    return new Settings({
      managementHost: args.managementHost ?? process.env.MANAGEMENT_HOST,
      origin: args.origin ?? process.env.ORIGIN,
      apiKey: args.apiKey ?? process.env.API_KEY
    });
  }
  
  /**
   * Create settings from HTTP headers
   * Maps headers to environment variable format based on server config
   */
  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    return new Settings({
      managementHost: getHeaderValue(headers, 'MANAGEMENT-HOST'),
      origin: getHeaderValue(headers, 'ORIGIN'),
      apiKey: getHeaderValue(headers, 'API-KEY')
    });
  }
}
