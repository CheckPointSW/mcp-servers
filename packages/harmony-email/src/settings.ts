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

    constructor({
        domain = firstOf(
            process.env.HEC_DOMAIN,
            process.env.SMARTAPI_MCP_DOMAIN
        ),
        clientId = firstOf(
            process.env.HEC_CLIENT_ID,
            process.env.SMARTAPI_MCP_CLIENT_ID
        ),
        secret = firstOf(
            process.env.HEC_SECRET,
            process.env.SMARTAPI_MCP_SECRET
        ),
        authMethod = firstOf(
            process.env.HEC_AUTH_METHOD,
            process.env.SMARTAPI_MCP_AUTH_METHOD
        ),
        region = firstOf(
            process.env.HEC_REGION,
            process.env.SMARTAPI_MCP_REGION
        ),
        scope = firstOf(process.env.HEC_SCOPE, process.env.SMARTAPI_MCP_SCOPE),
        requestTimeout = firstOf(
            process.env.HEC_REQUEST_TIMEOUT,
            process.env.SMARTAPI_MCP_REQUEST_TIMEOUT
        ),
        maxRetries = firstOf(
            process.env.HEC_MAX_RETRIES,
            process.env.SMARTAPI_MCP_MAX_RETRIES
        ),
        retryBaseSeconds = firstOf(
            process.env.HEC_RETRY_BASE_SECONDS,
            process.env.SMARTAPI_MCP_RETRY_BASE_SECONDS
        ),
        maxConcurrency = firstOf(
            process.env.HEC_MAX_CONCURRENCY,
            process.env.SMARTAPI_MCP_MAX_CONCURRENCY
        ),
        actionBatchLimit = firstOf(
            process.env.HEC_ACTION_BATCH_LIMIT,
            process.env.SMARTAPI_MCP_ACTION_BATCH_LIMIT
        ),
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
        return new Settings({
            domain: options.hecDomain,
            clientId: options.hecClientId,
            secret: options.hecSecret,
            authMethod: options.hecAuthMethod,
            region: options.hecRegion,
            scope: options.hecScope,
            requestTimeout: options.hecRequestTimeout,
            maxRetries: options.hecMaxRetries,
            retryBaseSeconds: options.hecRetryBaseSeconds,
            maxConcurrency: options.hecMaxConcurrency,
            actionBatchLimit: options.hecActionBatchLimit,
        });
    }

    /**
     * Per-request settings, built from headers alone.
     *
     * Every tenant-scoped field is passed as an explicit empty string when its
     * header is absent, because `undefined` would hand the field back to the
     * constructor's env default. Under HTTP transport that would let a request
     * with no credentials inherit the server process's own tenant and act as
     * it, so the empty string is what makes a header-less request fail closed.
     * The numeric tunables are deployment-wide, not per tenant, so they keep
     * their defaults.
     */
    static fromHeaders(headers: Record<string, string | string[]>): Settings {
        return new Settings({
            domain: getHeaderValue(headers, 'HEC-DOMAIN') ?? '',
            clientId: getHeaderValue(headers, 'HEC-CLIENT-ID') ?? '',
            secret: getHeaderValue(headers, 'HEC-SECRET') ?? '',
            authMethod: getHeaderValue(headers, 'HEC-AUTH-METHOD') ?? '',
            region: getHeaderValue(headers, 'HEC-REGION') ?? '',
            scope: getHeaderValue(headers, 'HEC-SCOPE') ?? '',
            requestTimeout: getHeaderValue(headers, 'HEC-REQUEST-TIMEOUT'),
            maxRetries: getHeaderValue(headers, 'HEC-MAX-RETRIES'),
            retryBaseSeconds: getHeaderValue(headers, 'HEC-RETRY-BASE-SECONDS'),
            maxConcurrency: getHeaderValue(headers, 'HEC-MAX-CONCURRENCY'),
            actionBatchLimit: getHeaderValue(headers, 'HEC-ACTION-BATCH-LIMIT'),
        });
    }
}
