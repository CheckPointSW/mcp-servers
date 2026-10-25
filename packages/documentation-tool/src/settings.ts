import { getHeaderValue } from '@chkp/mcp-utils';
import { Settings } from '@chkp/quantum-infra';

export class DocumentationToolSettings extends Settings {
    /**
     * Keys whose values debug output may print (see debugView in mcp-utils).
     * Anything not listed, including every credential, is shown hidden.
     */
    static override readonly debugLoggableKeys: readonly string[] = [
        ...Settings.debugLoggableKeys, 'auth-url',
    ];

    constructor(args: Record<string, unknown> = {}) {
        // Map authUrl → gatewayUrl so users can paste the full auth URL
        // from the API key creation dialog (path suffix is stripped by the base class).
        super({
            ...args,
            gatewayUrl: (args.authUrl || args.gatewayUrl) as string | undefined,
        });
    }

    /**
     * Create DocumentationToolSettings from command-line arguments for Documentation Tool
     */
    static fromArgs(args: Record<string, unknown>): DocumentationToolSettings {
        if (!args.authUrl && !args.region) {
            throw new Error(
                'Provide either --auth-url (Authentication URL from the API key creation dialog) ' +
                'or --region (EU, US, STG, or LOCAL)'
            );
        }
        const env = process.env;
        return new DocumentationToolSettings({
            ...args,
            clientId: args.clientId ?? env.CLIENT_ID,
            secretKey: args.secretKey ?? env.SECRET_KEY,
            region: args.region ?? (env.REGION || undefined),
        });
    }

    static fromHeaders(headers: Record<string, string | string[]>): DocumentationToolSettings {
        return new DocumentationToolSettings({
            clientId: getHeaderValue(headers, 'CLIENT-ID'),
            secretKey: getHeaderValue(headers, 'SECRET-KEY'),
            region: getHeaderValue(headers, 'REGION'),
            authUrl: getHeaderValue(headers, 'AUTH-URL'),
        });
    }
}
