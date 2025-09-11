// settings.ts - Minimal settings since we use dialog authentication
import { getHeaderValue } from '@chkp/mcp-utils';

export class Settings {
  // Keep minimal settings - dialog authentication handles the rest
  public verbose: boolean = false;

  constructor({
    verbose = process.env.VERBOSE === 'true'
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
      verbose: options.verbose
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