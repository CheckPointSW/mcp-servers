import { getHeaderValue } from '@chkp/mcp-utils';

export class Settings {
  public argosHost: string = '';
  public argosApiKey: string = '';
  public argosCustomerId: string = '';

  constructor({
    argosHost = process.env.ARGOS_HOST || process.env.ARGOS_SERVER_URL,
    argosApiKey = process.env.ARGOS_API_KEY || process.env.ARGOS_INTEGRATION_TOKEN,
    argosCustomerId = process.env.ARGOS_CUSTOMER_ID
  }: {
    argosHost?: string;
    argosApiKey?: string;
    argosCustomerId?: string;
  } = {}) {
    this.argosHost = argosHost || '';
    this.argosApiKey = argosApiKey || '';
    this.argosCustomerId = argosCustomerId || '';
  }

  validate(): boolean {
    if (!this.argosHost) {
      throw new Error('Argos host is required (via --argos-host or ARGOS_HOST/ARGOS_SERVER_URL env var)');
    }
    if (!this.argosApiKey) {
      throw new Error('Argos API key is required (via --argos-api-key or ARGOS_API_KEY/ARGOS_INTEGRATION_TOKEN env var)');
    }
    if (!this.argosCustomerId) {
      throw new Error('Argos customer ID is required (via --argos-customer-id or ARGOS_CUSTOMER_ID env var)');
    }
    return true;
  }

  static fromArgs(options: any): Settings {
    return new Settings({
      argosHost: options.argosHost,
      argosApiKey: options.argosApiKey,
      argosCustomerId: options.argosCustomerId
    });
  }

  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    const argosHost = getHeaderValue(headers, 'ARGOS-HOST');
    const argosApiKey = getHeaderValue(headers, 'ARGOS-API-KEY');
    const argosCustomerId = getHeaderValue(headers, 'ARGOS-CUSTOMER-ID');
    return new Settings({
      argosHost,
      argosApiKey,
      argosCustomerId
    });
  }
}
