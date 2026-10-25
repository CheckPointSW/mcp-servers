import { getHeaderValue } from '@chkp/mcp-utils';

export class Settings {
    /**
     * Keys whose values debug output may print (see debugView in mcp-utils).
     * Anything not listed, including every credential, is shown hidden.
     */
    static readonly debugLoggableKeys: readonly string[] = [
        'argos-host', 'argos-server-url', 'argos-customer-id',
    ];

    /**
     * Alternative header names (alias -> canonical). The canonical names match
     * the declared CLI/env options, so an operator's --argos-server-url wins
     * over an ARGOS_HOST left in the environment.
     */
    static readonly headerAliases: Readonly<Record<string, string>> = {
        'ARGOS-HOST': 'ARGOS-SERVER-URL',
        'ARGOS-API-KEY': 'ARGOS-INTEGRATION-TOKEN',
    };

    public argosHost = '';
    public argosApiKey = '';
    public argosCustomerId = '';

    // Takes only what it is given; fromArgs reads the environment.
    constructor({
        argosHost,
        argosApiKey,
        argosCustomerId,
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
            throw new Error(
                'Argos host is required (via --argos-host or ARGOS_HOST/ARGOS_SERVER_URL env var)'
            );
        }
        if (!this.argosApiKey) {
            throw new Error(
                'Argos API key is required (via --argos-api-key or ARGOS_API_KEY/ARGOS_INTEGRATION_TOKEN env var)'
            );
        }
        // CUSTOMER_ID is now optional — multi-tenant mode when absent
        return true;
    }

    /**
     * The CLI flags are --argos-server-url and --argos-integration-token
     * (parsed as argosServerUrl / argosIntegrationToken, which default to
     * ARGOS_SERVER_URL / ARGOS_INTEGRATION_TOKEN). ARGOS_HOST and
     * ARGOS_API_KEY are accepted as alternative environment variables, below
     * the flags.
     */
    static fromArgs(options: Record<string, string | undefined>): Settings {
        const env = process.env;
        return new Settings({
            argosHost: options.argosHost || options.argosServerUrl || env.ARGOS_SERVER_URL || env.ARGOS_HOST,
            argosApiKey:
                options.argosApiKey || options.argosIntegrationToken ||
                env.ARGOS_INTEGRATION_TOKEN || env.ARGOS_API_KEY,
            argosCustomerId: options.argosCustomerId ?? env.ARGOS_CUSTOMER_ID,
        });
    }

    static fromHeaders(headers: Record<string, string | string[]>): Settings {
        const argosHost =
            getHeaderValue(headers, 'ARGOS-SERVER-URL') || getHeaderValue(headers, 'ARGOS-HOST');
        const argosApiKey =
            getHeaderValue(headers, 'ARGOS-INTEGRATION-TOKEN') || getHeaderValue(headers, 'ARGOS-API-KEY');
        const argosCustomerId = getHeaderValue(headers, 'ARGOS-CUSTOMER-ID');
        return new Settings({
            argosHost,
            argosApiKey,
            argosCustomerId,
        });
    }
}
