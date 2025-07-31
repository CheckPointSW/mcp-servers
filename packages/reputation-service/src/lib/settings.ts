// Settings manager for MCP servers

import { nullOrEmpty } from './common-utils.js';

// Singleton instance for settings
let globalSettings: Settings | null = null;

/**
 * Settings for the MCP servers
 */
export class Settings {
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
      globalSettings = new Settings();
      // Also set the global reference for access from other modules
      (globalThis as any).cpMcpSettings = globalSettings;
    }
    return globalSettings;
  }
  constructor({
    apiKey = process.env.API_KEY,
  }: {
    apiKey?: string;
    verbose?: boolean;
  } = {}) {
    this.apiKey = apiKey;

    this.validate();
  }
  /**
   * Validate the settings
   */


  private validate(): void {
    // API key is required
    if (nullOrEmpty(this.apiKey)) {
      throw new Error('API key is required (via --api-key or API_KEY env var)');
    }
  }
  /**
   * Create settings from command-line arguments
   */
  static fromArgs(args: Record<string, any>): Settings {
    return new Settings({
      apiKey: args.apiKey,
    });
  }

    
  /**
   * Create settings from HTTP headers
   * Maps headers to environment variable format based on server config
   */
  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    // Using upper-cased header keys to match our environment var naming convention
    return new Settings({
      apiKey: headers.API_KEY as string | undefined,
    });
  }
  
}
