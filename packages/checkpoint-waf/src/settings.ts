import { booleanOptionDefault, getHeaderValue } from '@chkp/mcp-utils';
import { Settings as BaseSettings, Region } from '@chkp/quantum-infra';
import { resolveWriteAccess } from './graphql-guard.js';

/**
 * The one accepted spelling of the write-access switch.
 *
 * `true` is the only spelling the launcher understands: for a `type: "boolean"`
 * option it computes `envValue === 'true' || option.default === 'true'`
 * (launcher.ts), so commander receives `false` for any other value. Accepting
 * more spellings here than the launcher does desynchronises the two layers —
 * the process-level gate would open and register the write tools while every
 * session resolved to read-only. Keep this in step with server-config.json,
 * which documents `WAF_ALLOW_WRITES=true`.
 */
export function isWriteAccessRequested(value: string | boolean | undefined): boolean {
    return value === true || value === 'true';
}

/**
 * The `--allow-writes` default declared in server-config.json. Passed to
 * booleanOptionDefault below so the gate reads the environment variable
 * through the launcher's own rule, while still refusing to let a change to
 * that declared default open the gate on its own: only the environment
 * variable or the CLI flag can enable writes.
 */
const ALLOW_WRITES_OPTION_DEFAULT = false;

/**
 * Whether this process was launched with write access enabled. This is the
 * ceiling for every session: per-session settings can drop write access but
 * cannot grant it. See resolveWriteAccess.
 *
 * The environment half goes through booleanOptionDefault — the same helper
 * launcher.ts uses to derive the Commander default for this option — so the
 * process-level gate and the per-session value cannot drift apart. If they
 * did, the server would register the write tools and then refuse every call
 * to them. The flag half reads process.argv directly because this constant is
 * evaluated at module load, before the launcher has parsed any arguments.
 */
export const processAllowsWrites =
    process.argv.includes('--allow-writes') ||
    booleanOptionDefault(process.env.WAF_ALLOW_WRITES, ALLOW_WRITES_OPTION_DEFAULT);

const RECOGNISED_DISABLED_VALUES = new Set(['false', '0', 'no']);

/** Whether an environment value warrants a startup warning. */
export function shouldWarnAboutAllowWritesValue(
    rawValue: string | undefined,
    processAllows: boolean
): boolean {
    return (
        !processAllows &&
        rawValue !== undefined &&
        rawValue !== '' &&
        !isWriteAccessRequested(rawValue) &&
        !RECOGNISED_DISABLED_VALUES.has(rawValue)
    );
}

// Warn only when an unrecognised value actually leaves the process read-only.
// Explicit off-values are intentional, and --allow-writes may override an
// otherwise unrecognised environment value.
const rawAllowWrites = process.env.WAF_ALLOW_WRITES;
if (shouldWarnAboutAllowWritesValue(rawAllowWrites, processAllowsWrites)) {
    console.error(
        `[checkpoint-waf] WAF_ALLOW_WRITES is set to "${rawAllowWrites}", which is not recognised; ` +
            'the server is running read-only. Use WAF_ALLOW_WRITES=true or pass --allow-writes to enable writes.'
    );
}

/**
 * Decide the write access for one session.
 *
 * An absent `requested` inherits the process setting — that is what a session
 * which sends no WAF-ALLOW-WRITES header on a server started with
 * `--allow-writes` should get. An explicit value is clamped by
 * resolveWriteAccess, so it can only drop write access, never grant it.
 */
export function resolveSessionWriteAccess(
    requested: string | boolean | undefined,
    processAllows: boolean
): boolean {
    const requestsWrites =
        requested === undefined ? processAllows : isWriteAccessRequested(requested);
    return resolveWriteAccess(requestsWrites, processAllows);
}

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
        // No default: leaving this unset means "inherit the process setting".
        // See the allowWrites assignment below.
        allowWrites,
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
        this.allowWrites = resolveSessionWriteAccess(allowWrites, processAllowsWrites);
    }

    /**
     * Get Check Point WAF API endpoint
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
