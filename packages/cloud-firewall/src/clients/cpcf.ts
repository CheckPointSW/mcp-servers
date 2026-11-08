import type { z } from 'zod';
import type { ExternalTokenManager } from '@chkp/quantum-infra';
import { requestSecrets, secretRedactor } from '../secrets.js';
import {
    cpcfCreateResultSchema,
    cpcfDeploymentSchema,
    cpcfGatewaySchema,
    cpcfGcpDeploymentInfoSchema,
    cpcfMonitoringSchema,
    cpcfVnetPeeringSchema,
    cpcfVnetPeeringResultSchema,
    parseContract,
} from './cpcf-contract.js';

export { CpcfContractError } from './cpcf-contract.js';

/**
 * Clouds the deployments API can host. Also the create-endpoint path segment
 * (POST /deployments/<vendor>) — a compile-time literal supplied by each
 * cloud's tool file, never tool input.
 */
export type CpcfVendor = 'aws' | 'azure' | 'gcp';

/** Deliberate migration boundary: never select the latest version at runtime. */
export const CPCF_API_VERSION = 'v1';

/**
 * Shapes we rely on from the deployments API — derived from the runtime
 * contract in cpcf-contract.ts, which every response is validated against.
 * Partial by design: extra fields pass through.
 */
export type CpcfDeployment = z.output<typeof cpcfDeploymentSchema>;
export type CpcfGateway = z.output<typeof cpcfGatewaySchema>;
export type CpcfGcpDeploymentInfo = z.output<
    typeof cpcfGcpDeploymentInfoSchema
>;
export type CpcfVnetPeering = z.output<typeof cpcfVnetPeeringSchema>;

/**
 * HTTP client for the Cloud Firewall deployments API behind the cloudinfra gateway:
 *   https://<cloudinfra-gw>/app/cloud-firewall/<env>/api/v1/...
 *
 * One client per backend service is the seam other domains follow: add a new
 * client under src/clients/ and expose it from CloudFirewallAPIManager — the
 * token manager is shared, the base path is the client's own.
 */
/** Every CPCF call is bounded — a hung gateway must not pin a tool call open. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Transient statuses are retried on GETs so a rate-limited poll loop surfaces
 * as a short pause, not a raw tool error. Other 4xx/5xx are not retryable: the
 * request itself is wrong, or retrying won't change the answer. POSTs are
 * never retried — a 502 can arrive after the backend already processed the
 * create, and a blind retry would provision twice.
 */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_AFTER_CAP_MS = 5_000;

function retryDelayMs(response: Response, attempt: number): number {
    // Only honor a Retry-After that is actually present: header.get() returns
    // null when absent and Number(null)/Number('') are both 0, which would pass
    // the >= 0 guard and collapse the backoff to a 0ms hot retry against an
    // already-failing gateway. A missing/blank header must fall through to the
    // exponential backoff below.
    const header = response.headers.get('Retry-After');
    const retryAfter = header && header.trim() !== '' ? Number(header) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter >= 0) {
        return Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS);
    }
    return RETRY_BASE_DELAY_MS * (attempt + 1);
}

/**
 * Statuses whose failure the caller can fix by correcting the request:
 * validation (400/422), a wrong id (404/410), a state conflict (409/412).
 * Deliberately NOT the whole 4xx range — 401/403 bodies carry auth
 * diagnostics (token, account, scope details) and 408/429 need a retry, not
 * different arguments. This set is the single definition of the split: it
 * gates both the body-message extraction below and what tools/errors.ts relays.
 */
const CALLER_CORRECTABLE_STATUS = new Set([400, 404, 409, 410, 412, 422]);

/**
 * A non-2xx CPCF response. `message` is sanitized (method, path, status —
 * never the response body). For caller-correctable statuses only,
 * `upstreamMessage` additionally carries the body's client-facing `message`
 * field so tools/errors.ts can relay what to fix; every other body (auth
 * diagnostics, stack traces, internal hostnames) stays stderr-only.
 */
export class CpcfApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly upstreamMessage?: string
    ) {
        super(message);
        this.name = 'CpcfApiError';
    }

    /** Fixable by correcting the request, as opposed to auth/retry/outage. */
    get isCallerCorrectable(): boolean {
        return CALLER_CORRECTABLE_STATUS.has(this.status);
    }

    /**
     * The text safe to show the model: the sanitized line plus the backend's
     * client-facing message when one was extracted (caller-correctable only —
     * the constructor never populates upstreamMessage otherwise).
     */
    toModelText(): string {
        return this.upstreamMessage
            ? `${this.message} — ${this.upstreamMessage}`
            : this.message;
    }
}

/** Reconciliation guidance for a write whose outcome is unknown. */
const CREATE_RECONCILE_HINT =
    'The deployment may already be provisioning — check get_deployments before creating again, do not blindly retry.';
const PEERING_RECONCILE_HINT =
    'The request may already have been accepted — check get_azure_vnet_peerings before requesting again, do not blindly retry.';

/**
 * A POST whose outcome is unknown: it timed out, lost the connection or got a
 * server error, so the backend may already have accepted it. POSTs are never
 * retried, so the model is told to reconcile through a read before
 * resubmitting. Only the failure kind and status appear in the message —
 * never the underlying error text or response body.
 */
export class CpcfAmbiguousWriteError extends Error {
    readonly safeForModel = true;

    constructor(
        message: string,
        private readonly reconcileHint: string
    ) {
        super(message);
        this.name = 'CpcfAmbiguousWriteError';
    }

    toModelText(): string {
        return `${this.message}. ${this.reconcileHint}`;
    }
}

/**
 * The `message` field of a caller-correctable JSON body, if it is plain text.
 * This is the API's client-facing validation text (e.g. which availability
 * zones are valid) — not the raw body, whose other fields may carry
 * correlation ids or internals. Returns undefined for non-JSON bodies and
 * unexpected shapes.
 */
/** Backend error bodies are `{ code, message, traceId }`; only the short identifiers are safe to log. */
function upstreamErrorIds(
    bodyText: string,
    redact: (text: string) => string
): {
    code?: string;
    traceId?: string;
} {
    try {
        const parsed = JSON.parse(bodyText) as {
            code?: unknown;
            traceId?: unknown;
        };
        const short = (value: unknown) =>
            typeof value === 'string' ? redact(value).slice(0, 64) : undefined;
        return { code: short(parsed.code), traceId: short(parsed.traceId) };
    } catch {
        return {};
    }
}

/** Backend 400s join every field problem into one message, and valid-value lists (e.g. availability zones) make it long. */
const MAX_CLIENT_FACING_MESSAGE_CHARS = 8000;

function clientFacingMessage(
    bodyText: string,
    redact: (text: string) => string
): string | undefined {
    try {
        const parsed = JSON.parse(bodyText) as { message?: unknown };
        // NestJS-style validation errors send message as string[].
        const message = Array.isArray(parsed.message)
            ? parsed.message.filter((m) => typeof m === 'string').join('; ')
            : parsed.message;
        if (typeof message === 'string' && message.trim() !== '') {
            return redact(message).slice(0, MAX_CLIENT_FACING_MESSAGE_CHARS);
        }
    } catch {
        // Non-JSON body: operator-only, like every other unparsed body.
    }
    return undefined;
}

export class CpcfClient {
    constructor(
        private readonly host: string,
        private readonly basePath: string,
        private readonly tokenManager: ExternalTokenManager
    ) {}

    /**
     * Returns the parsed JSON body (undefined for an empty one), deliberately
     * `unknown`: every public method validates it against its contract
     * rather than casting.
     */
    private async request(
        method: 'GET' | 'POST',
        path: string,
        body?: unknown,
        query?: Record<string, string | number | undefined>,
        /** On a POST that creates or changes something: how to reconcile if its outcome is unknown. */
        reconcileHint?: string
    ): Promise<unknown> {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(query ?? {})) {
            if (value !== undefined) search.set(key, String(value));
        }
        const qs = search.toString();
        const url = `${this.host}${this.basePath}${path}${qs ? `?${qs}` : ''}`;

        const secrets = requestSecrets(body);
        let response: Response;
        for (let attempt = 0; ; attempt++) {
            // Token per attempt: the manager caches, and a token that expired
            // during a backoff pause is refreshed rather than resent.
            const token = await this.tokenManager.getToken();
            secrets.add(token);
            try {
                response = await fetch(url, {
                    method,
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });
            } catch (error) {
                if (reconcileHint) {
                    // No response: the request may or may not have reached
                    // the backend. The error type is safe to relay, its
                    // message (hostnames, addresses) is not.
                    throw new CpcfAmbiguousWriteError(
                        `Cloud Firewall API ${method} ${path} did not complete (${(error as Error).name})`,
                        reconcileHint
                    );
                }
                throw error;
            }

            if (
                response.ok ||
                method !== 'GET' ||
                !RETRYABLE_STATUS.has(response.status) ||
                attempt >= MAX_RETRIES
            ) {
                break;
            }
            await response.text().catch(() => ''); // drain before retrying
            await new Promise((resolve) =>
                setTimeout(resolve, retryDelayMs(response, attempt))
            );
        }

        if (!response.ok) {
            // Backend validation text is useful, but can echo write-only SIC
            // values or authentication tokens. Redact decoded text before any
            // truncation, error construction or diagnostic logging.
            const redact = secretRedactor(secrets);
            // Only status, error code, traceId and body length go to stderr
            // for the operator: the body itself can echo customer request
            // values, so it is never logged, and never reaches the tool
            // result either (internal hostnames, stack traces and
            // correlation ids must not reach the model context). The ONE
            // exception, carried on the typed error below,
            // is the body's client-facing `message` field of a
            // caller-correctable status — see CALLER_CORRECTABLE_STATUS.
            const text = await response.text().catch(() => '');
            if (text) {
                console.error(
                    JSON.stringify({
                        audit: 'cloud-firewall',
                        upstreamError: redact(`${method} ${path}`),
                        status: response.status,
                        bodyLength: text.length,
                        ...upstreamErrorIds(text, redact),
                    })
                );
            }
            if (
                reconcileHint &&
                (response.status >= 500 || response.status === 408)
            ) {
                throw new CpcfAmbiguousWriteError(
                    redact(
                        `Cloud Firewall API ${method} ${path} failed: ${response.status} ${response.statusText}`
                    ),
                    reconcileHint
                );
            }
            throw new CpcfApiError(
                redact(
                    `Cloud Firewall API ${method} ${path} failed: ${response.status} ${response.statusText}`
                ),
                response.status,
                CALLER_CORRECTABLE_STATUS.has(response.status)
                    ? clientFacingMessage(text, redact)
                    : undefined
            );
        }

        // Guard on the body, not the status: a 200 with an empty body would
        // otherwise surface as a bare `Unexpected end of JSON input`.
        try {
            const text = await response.text();
            if (!text) return undefined;
            return JSON.parse(text) as unknown;
        } catch (error) {
            if (reconcileHint) {
                throw new CpcfAmbiguousWriteError(
                    `Cloud Firewall API ${method} ${path} returned an unreadable response (${response.status})`,
                    reconcileHint
                );
            }
            if (error instanceof SyntaxError) {
                throw new Error(
                    `Cloud Firewall API ${method} ${path} returned a non-JSON body (${response.status})`
                );
            }
            throw error;
        }
    }

    /** GET /deployments — all deployments for the tenant resolved from the token. */
    async getDeployments(): Promise<CpcfDeployment[]> {
        return parseContract(
            cpcfDeploymentSchema.array(),
            await this.request('GET', '/deployments'),
            'GET /deployments'
        );
    }

    /** GET /deployments/:id */
    async getDeployment(id: string): Promise<CpcfDeployment> {
        return parseContract(
            cpcfDeploymentSchema,
            await this.request('GET', `/deployments/${encodeURIComponent(id)}`),
            'GET /deployments/:id'
        );
    }

    /** GET /deployments/:id/gateways */
    async getDeploymentGateways(id: string): Promise<CpcfGateway[]> {
        return parseContract(
            cpcfGatewaySchema.array(),
            await this.request(
                'GET',
                `/deployments/${encodeURIComponent(id)}/gateways`
            ),
            'GET /deployments/:id/gateways'
        );
    }

    /** GET /deployments/gcp/:id/information — GCP only; the backend rejects other vendors. */
    async getGcpDeploymentInfo(id: string): Promise<CpcfGcpDeploymentInfo> {
        return parseContract(
            cpcfGcpDeploymentInfoSchema,
            await this.request(
                'GET',
                `/deployments/gcp/${encodeURIComponent(id)}/information`
            ),
            'GET /deployments/gcp/:id/information'
        );
    }

    /**
     * GET /deployments/:id/monitoring?from&to — epoch SECONDS window.
     *
     * Seconds, unlike `createdAt` on the deployment object, which is epoch
     * milliseconds. The API documents the split; sending milliseconds here
     * fails both the future-`to` check and the 1h-30d span cap.
     */
    async getDeploymentMonitoring(
        id: string,
        from?: number,
        to?: number
    ): Promise<unknown> {
        return parseContract(
            cpcfMonitoringSchema,
            await this.request(
                'GET',
                `/deployments/${encodeURIComponent(id)}/monitoring`,
                undefined,
                { from, to }
            ),
            'GET /deployments/:id/monitoring'
        );
    }

    /** GET /deployments/:id/vnet-peerings — no derived health or protection verdict. */
    async getVnetPeerings(id: string): Promise<CpcfVnetPeering[]> {
        return parseContract(
            cpcfVnetPeeringSchema.array(),
            await this.request(
                'GET',
                `/deployments/${encodeURIComponent(id)}/vnet-peerings`
            ),
            'GET /deployments/:id/vnet-peerings'
        );
    }

    /** POST is never retried; backend acceptance does not establish connectivity. */
    async addVnetPeerings(
        id: string,
        vnetResourceIds: string[]
    ): Promise<z.output<typeof cpcfVnetPeeringResultSchema>> {
        return parseContract(
            cpcfVnetPeeringResultSchema,
            await this.request(
                'POST',
                `/deployments/${encodeURIComponent(id)}/vnet-peerings`,
                { vnetResourceIds },
                undefined,
                PEERING_RECONCILE_HINT
            ),
            'POST /deployments/:id/vnet-peerings',
            PEERING_RECONCILE_HINT
        );
    }

    /** POST /deployments/:vendor — 201 { id }. Provisioning continues async; poll getDeployment. */
    async createDeployment(
        vendor: CpcfVendor,
        payload: object
    ): Promise<{ id: string }> {
        // A create that answers 2xx with no usable id must not be reported as a
        // clean success: the caller would hand the model `id: undefined` while
        // real, billable infrastructure may already be provisioning. Fail
        // closed and tell the model to reconcile via get_deployments rather
        // than retry (POST is deliberately never retried — see
        // RETRYABLE_STATUS above).
        const result = parseContract(
            cpcfCreateResultSchema,
            await this.request(
                'POST',
                `/deployments/${vendor}`,
                payload,
                undefined,
                CREATE_RECONCILE_HINT
            ),
            `POST /deployments/${vendor}`,
            CREATE_RECONCILE_HINT
        );
        return { id: result.id };
    }
}
