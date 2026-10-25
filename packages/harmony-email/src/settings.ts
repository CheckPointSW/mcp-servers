import { getHeaderValue } from '@chkp/mcp-utils';

export type AuthMethod = 'cloudinfra' | 'avanan';

/**
 * Tunables and their bounds, mirroring the Python server's settings model.
 * Out-of-range values are rejected rather than clamped: a silently adjusted
 * retry budget or batch cap is worse than a loud startup failure.
 */
interface NumericSpec {
    label: string;
    fallback: number;
    min: number;
    max: number;
    integer: boolean;
}

const NUMERIC_SPECS = {
    requestTimeout: {
        label: 'request timeout',
        fallback: 30,
        min: 0.1,
        max: 600,
        integer: false,
    },
    maxRetries: {
        label: 'max retries',
        fallback: 3,
        min: 0,
        max: 10,
        integer: true,
    },
    retryBaseSeconds: {
        label: 'retry base seconds',
        fallback: 1,
        min: 0.01,
        max: 60,
        integer: false,
    },
    maxConcurrency: {
        label: 'max concurrency',
        fallback: 10,
        min: 1,
        max: 100,
        integer: true,
    },
    actionBatchLimit: {
        label: 'action batch limit',
        fallback: 50,
        min: 1,
        max: 1000,
        integer: true,
    },
} as const satisfies Record<string, NumericSpec>;

type NumericKey = keyof typeof NUMERIC_SPECS;

function parseNumber(
    value: string | number | undefined,
    key: NumericKey
): number {
    const spec: NumericSpec = NUMERIC_SPECS[key];
    if (value === undefined || value === '') return spec.fallback;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(
            `Invalid ${spec.label}: "${String(value)}" is not a number`
        );
    }
    if (spec.integer && !Number.isInteger(parsed)) {
        throw new Error(
            `Invalid ${spec.label}: ${parsed} must be a whole number`
        );
    }
    if (parsed < spec.min || parsed > spec.max) {
        throw new Error(
            `Invalid ${spec.label}: ${parsed} is outside the allowed range ${spec.min}..${spec.max}`
        );
    }
    return parsed;
}

function parseAuthMethod(value: string | undefined): AuthMethod | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'cloudinfra' || normalized === 'avanan')
        return normalized;
    throw new Error(
        `Invalid auth method: "${value}". Expected "cloudinfra" or "avanan".`
    );
}

/** First defined, non-empty value. Lets each field accept more than one env var name. */
function firstOf(...values: (string | undefined)[]): string | undefined {
    return values.find((v) => v !== undefined && v !== '');
}

export interface SettingsInit {
    domain?: string;
    clientId?: string;
    secret?: string;
    authMethod?: string;
    region?: string;
    scope?: string;
    requestTimeout?: string | number;
    maxRetries?: string | number;
    retryBaseSeconds?: string | number;
    maxConcurrency?: string | number;
    actionBatchLimit?: string | number;
}

/**
 * Per-session configuration for one HEC tenant.
 *
 * Env vars use the HEC_* prefix; the SMARTAPI_MCP_* names from the Python
 * server are still accepted so existing .env files keep working.
 */
export class Settings {
    /**
     * Keys whose values debug output may print (see debugView in mcp-utils).
     * Anything not listed, including every credential, is shown hidden.
     * Lists both the header/CLI names (hec-*) and the property names.
     */
    static readonly debugLoggableKeys: readonly string[] = [
        'hec-domain', 'domain', 'hec-region', 'region', 'hec-scope', 'scope',
        'hec-auth-method', 'auth-method', 'hec-request-timeout', 'request-timeout',
        'hec-max-retries', 'max-retries', 'hec-retry-base-seconds', 'retry-base-seconds',
        'hec-max-concurrency', 'max-concurrency', 'hec-action-batch-limit',
        'action-batch-limit',
    ];

    /**
     * Headers an HTTP session may mix with the operator's values (see
     * connection-source in mcp-utils): the numeric tunables, which are
     * deployment-wide rather than per tenant, under both spellings.
     */
    static readonly basicKeys: readonly string[] = [
        'HEC-REQUEST-TIMEOUT', 'HEC-MAX-RETRIES', 'HEC-RETRY-BASE-SECONDS',
        'HEC-MAX-CONCURRENCY', 'HEC-ACTION-BATCH-LIMIT',
    ];

    /**
     * The Python server's names for the tunables (alias -> canonical), so a
     * caller's SMARTAPI-MCP-* header overrides the operator's HEC_* value.
     */
    static readonly headerAliases: Readonly<Record<string, string>> = {
        'SMARTAPI-MCP-REQUEST-TIMEOUT': 'HEC-REQUEST-TIMEOUT',
        'SMARTAPI-MCP-MAX-RETRIES': 'HEC-MAX-RETRIES',
        'SMARTAPI-MCP-RETRY-BASE-SECONDS': 'HEC-RETRY-BASE-SECONDS',
        'SMARTAPI-MCP-MAX-CONCURRENCY': 'HEC-MAX-CONCURRENCY',
        'SMARTAPI-MCP-ACTION-BATCH-LIMIT': 'HEC-ACTION-BATCH-LIMIT',
    };

    /**
     * An HTTP session never uses the operator's tenant: a client must not be
     * able to act as whichever tenant the operator configured.
     */
    static readonly operatorSettingsOverHttp = false;

    public domain = '';
    public clientId = '';
    public secret = '';
    public authMethod: AuthMethod | undefined;
    public region = '';
    public scope = '';
    public requestTimeout: number;
    public maxRetries: number;
    public retryBaseSeconds: number;
    public maxConcurrency: number;
    public actionBatchLimit: number;
    public debug: string | string[] | boolean | undefined;

    // Takes only what it is given; fromArgs reads the environment.
    constructor({
        domain,
        clientId,
        secret,
        authMethod,
        region,
        scope,
        requestTimeout,
        maxRetries,
        retryBaseSeconds,
        maxConcurrency,
        actionBatchLimit,
    }: SettingsInit = {}) {
        this.domain = domain || '';
        this.clientId = clientId || '';
        this.secret = secret || '';
        this.authMethod = parseAuthMethod(authMethod);
        this.region = region || '';
        this.scope = scope || '';
        this.requestTimeout = parseNumber(requestTimeout, 'requestTimeout');
        this.maxRetries = parseNumber(maxRetries, 'maxRetries');
        this.retryBaseSeconds = parseNumber(
            retryBaseSeconds,
            'retryBaseSeconds'
        );
        this.maxConcurrency = parseNumber(maxConcurrency, 'maxConcurrency');
        this.actionBatchLimit = parseNumber(
            actionBatchLimit,
            'actionBatchLimit'
        );
    }

    /**
     * Under HTTP transport credentials arrive per request as headers, so the
     * process starts with none and validating at boot would be wrong.
     */
    validate(): boolean {
        if (process.env.MCP_TRANSPORT_TYPE === 'http') return true;

        const missing: string[] = [];
        if (!this.domain) missing.push('--hec-domain / HEC_DOMAIN');
        if (!this.clientId) missing.push('--hec-client-id / HEC_CLIENT_ID');
        if (!this.secret) missing.push('--hec-secret / HEC_SECRET');
        if (missing.length > 0) {
            throw new Error(`Missing required settings: ${missing.join(', ')}`);
        }
        return true;
    }

    static fromArgs(options: Record<string, string | undefined>): Settings {
        const env = process.env;
        return new Settings({
            domain: options.hecDomain ?? firstOf(env.HEC_DOMAIN, env.SMARTAPI_MCP_DOMAIN),
            clientId: options.hecClientId ?? firstOf(env.HEC_CLIENT_ID, env.SMARTAPI_MCP_CLIENT_ID),
            secret: options.hecSecret ?? firstOf(env.HEC_SECRET, env.SMARTAPI_MCP_SECRET),
            authMethod: options.hecAuthMethod ?? firstOf(env.HEC_AUTH_METHOD, env.SMARTAPI_MCP_AUTH_METHOD),
            region: options.hecRegion ?? firstOf(env.HEC_REGION, env.SMARTAPI_MCP_REGION),
            scope: options.hecScope ?? firstOf(env.HEC_SCOPE, env.SMARTAPI_MCP_SCOPE),
            requestTimeout: options.hecRequestTimeout ??
                firstOf(env.HEC_REQUEST_TIMEOUT, env.SMARTAPI_MCP_REQUEST_TIMEOUT),
            maxRetries: options.hecMaxRetries ?? firstOf(env.HEC_MAX_RETRIES, env.SMARTAPI_MCP_MAX_RETRIES),
            retryBaseSeconds: options.hecRetryBaseSeconds ??
                firstOf(env.HEC_RETRY_BASE_SECONDS, env.SMARTAPI_MCP_RETRY_BASE_SECONDS),
            maxConcurrency: options.hecMaxConcurrency ??
                firstOf(env.HEC_MAX_CONCURRENCY, env.SMARTAPI_MCP_MAX_CONCURRENCY),
            actionBatchLimit: options.hecActionBatchLimit ??
                firstOf(env.HEC_ACTION_BATCH_LIMIT, env.SMARTAPI_MCP_ACTION_BATCH_LIMIT),
        });
    }

    /**
     * Per-request settings, built from headers alone. A missing tenant-scoped
     * header leaves its field empty, so a request without credentials fails
     * closed. The numeric tunables are deployment-wide, not per tenant: they
     * are basic keys, so the operator's values apply when the caller sends
     * none.
     */
    static fromHeaders(headers: Record<string, string | string[]>): Settings {
        return new Settings({
            domain: getHeaderValue(headers, 'HEC-DOMAIN') ?? '',
            clientId: getHeaderValue(headers, 'HEC-CLIENT-ID') ?? '',
            secret: getHeaderValue(headers, 'HEC-SECRET') ?? '',
            authMethod: getHeaderValue(headers, 'HEC-AUTH-METHOD') ?? '',
            region: getHeaderValue(headers, 'HEC-REGION') ?? '',
            scope: getHeaderValue(headers, 'HEC-SCOPE') ?? '',
            requestTimeout: firstOf(
                getHeaderValue(headers, 'HEC-REQUEST-TIMEOUT'),
                getHeaderValue(headers, 'SMARTAPI-MCP-REQUEST-TIMEOUT')
            ),
            maxRetries: firstOf(
                getHeaderValue(headers, 'HEC-MAX-RETRIES'),
                getHeaderValue(headers, 'SMARTAPI-MCP-MAX-RETRIES')
            ),
            retryBaseSeconds: firstOf(
                getHeaderValue(headers, 'HEC-RETRY-BASE-SECONDS'),
                getHeaderValue(headers, 'SMARTAPI-MCP-RETRY-BASE-SECONDS')
            ),
            maxConcurrency: firstOf(
                getHeaderValue(headers, 'HEC-MAX-CONCURRENCY'),
                getHeaderValue(headers, 'SMARTAPI-MCP-MAX-CONCURRENCY')
            ),
            actionBatchLimit: firstOf(
                getHeaderValue(headers, 'HEC-ACTION-BATCH-LIMIT'),
                getHeaderValue(headers, 'SMARTAPI-MCP-ACTION-BATCH-LIMIT')
            ),
        });
    }
}
