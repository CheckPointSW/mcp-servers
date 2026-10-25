// settings.ts - Minimal settings since we use dialog authentication
import { getHeaderValue } from '@chkp/mcp-utils';

export class Settings {
  /**
   * Keys whose values debug output may print (see debugView in mcp-utils).
   * Anything not listed, including every credential, is shown hidden.
   */
  static readonly debugLoggableKeys: readonly string[] = ['verbose'];

  /**
   * Headers an HTTP session may mix with the operator's values (see
   * connection-source in mcp-utils).
   */
  static readonly basicKeys: readonly string[] = ['VERBOSE'];

  // Keep minimal settings - dialog authentication handles the rest
  public verbose: boolean = false;

  // Takes only what it is given; fromArgs reads the environment.
  constructor({
    verbose = false
  }: {
    verbose?: boolean;
  } = {}) {
    this.verbose = verbose || false;
  }

  validate(): boolean {
    // No validation needed since we prompt for everything via dialogs
    return true;
  }

  static fromArgs(options: any): Settings {
    console.error('Settings fromArgs called with:', options);
    return new Settings({
      verbose: options.verbose ?? process.env.VERBOSE === 'true'
    });
  }

  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    const verbose = getHeaderValue(headers, 'VERBOSE') === 'true';
    console.error('Settings fromHeaders called');
    
    return new Settings({
      verbose
    });
  }
}