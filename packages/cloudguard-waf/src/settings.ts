import { getHeaderValue } from '@chkp/mcp-utils';
import { Settings as BaseSettings, Region } from '@chkp/quantum-infra';

export class Settings extends BaseSettings {
    readonly docSource?: string;
    readonly docToolClientId?: string;
    readonly docToolSecretKey?: string;
    readonly docToolRegion?: string;
    readonly allowWrites: boolean;

    constructor({
        clientId = process.env.WAF_CLIENT_ID,
        accessKey = process.env.WAF_ACCESS_KEY,
        region = process.env.WAF_REGION || 'EU',
        docSource = process.env.DOC_SOURCE,
        docToolClientId = process.env.DOC_TOOL_CLIENT_ID,
        docToolSecretKey = process.env.DOC_TOOL_SECRET_KEY,
        docToolRegion = process.env.DOC_TOOL_REGION,
        allowWrites = process.env.WAF_ALLOW_WRITES,
    }: {
        clientId?: string;
        accessKey?: string;
        region?: string;
        docSource?: string;
        docToolClientId?: string;
        docToolSecretKey?: string;
        docToolRegion?: string;
        allowWrites?: string | boolean;
    } = {}) {
        super({ clientId, secretKey: accessKey, region: region as Region });
        this.docSource = docSource;
        this.docToolClientId = docToolClientId;
        this.docToolSecretKey = docToolSecretKey;
        this.docToolRegion = docToolRegion;
        this.allowWrites = allowWrites === true || allowWrites === 'true' || allowWrites === '1' || allowWrites === 'yes';
    }

    /**
     * Get CloudGuard WAF API endpoint
     */
    getWafEndpoint(): string {
        return '/app/waf/graphql/V1';
    }

    validate(): boolean {
        if (!this.clientId) {
            throw new Error(
                'Client ID is required (via --client-id or WAF_CLIENT_ID env var)'
            );
        }
        if (!this.secretKey) {
            throw new Error(
                'Access key is required (via --access-key or WAF_ACCESS_KEY env var)'
            );
        }
        return true;
    }

    static override fromArgs(options: any): Settings {
        return new Settings({
            clientId: options.clientId,
            accessKey: options.accessKey,
            region:
                typeof options.region === 'string'
                    ? options.region.toUpperCase()
                    : undefined,
            allowWrites: options.allowWrites,
        });
    }

    static override fromHeaders(
        headers: Record<string, string | string[]>
    ): Settings {
        return new Settings({
            clientId: getHeaderValue(headers, 'WAF-CLIENT-ID'),
            accessKey: getHeaderValue(headers, 'WAF-ACCESS-KEY'),
            region: getHeaderValue(headers, 'WAF-REGION')?.toUpperCase(),
            allowWrites: getHeaderValue(headers, 'WAF-ALLOW-WRITES'),
        });
    }
}
