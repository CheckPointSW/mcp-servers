import { getHeaderValue } from '@chkp/mcp-utils';

export class Settings {
  constructor() {}

  validate(): boolean {
    return true;
  }

  static fromArgs(_options: Record<string, unknown> = {}): Settings {
    return new Settings();
  }

  static fromHeaders(_headers: Record<string, string | string[]>): Settings {
    // No headers used by cpview-history-mcp; placeholder for parity.
    void getHeaderValue;
    return new Settings();
  }
}
