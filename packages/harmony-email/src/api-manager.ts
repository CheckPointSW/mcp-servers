import { randomUUID } from 'node:crypto';
import { unwrapV1Response, wrapRequestData } from './core/envelope.js';
import {
    AmbiguousActionError,
    AuthError,
    AuthorizationError,
    NotFoundError,
    RateLimitError,
    ScrollExpiredError,
    SmartApiError,
    TransportError,
    UpstreamError,
    UpstreamTimeoutError,
    ValidationError,
} from './core/errors.js';
import { RawResponse, Semaphore, sleep } from './core/http.js';
import {
    expectRecord,
    expectRecordList,
    unwrapSingleton,
} from './core/payload.js';
import { isTokenExpiring, type IssuedToken } from './core/providers/index.js';
import { log, responseDebugFields, shortDetail } from './core/redact.js';
import {
    resolveSettings,
    type ResolvedSettings,
} from './core/resolved-settings.js';
import type { AuthMethod, Settings } from './settings.js';

export type ExceptionType = 'whitelist' | 'blacklist' | 'spam_whitelist';

/**
 * 408 is the upstream query engine's read-timeout ("read timeout, please try
 * again"): transient per-page slowness that succeeds on a later attempt.
 */
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([
    408, 429, 500, 502, 503, 504,
]);

/**
 * Connection failures that happened before any request byte reached upstream.
 * Every other connection error can fire AFTER the request was written, so on a
 * state-changing call an unlisted code counts as possibly applied.
 */
const PRE_FLIGHT_ERROR_CODES: ReadonlySet<string> = new Set([
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * Singular GETs get a short deadline. The upstream entity lookup hangs on
 * nonexistent ids, and a single-record fetch slower than this is dead anyway.
 */
const SINGULAR_GET_TIMEOUT_MS = 8000;

/** Per-request overrides. `idempotent: false` disables ambiguous-error retries. */
interface SendOptions {
    timeoutMs?: number;
    idempotent?: boolean;
}

const PATH_ID_MAX_LENGTH = 256;
const PATH_ID_FORBIDDEN = new Set([' ', '#', '?', '/', '\\', '%']);

/**
 * Describe why `value` cannot be a URL-path resource id, or null if it can.
 *
 * Deliberately loose: every SaaS has its own id format, so only characters
 * that would change the request itself are rejected.
 */
export function pathIdProblem(value: string): string | null {
    if (!value) return 'must be non-empty';
    if (value.length > PATH_ID_MAX_LENGTH) {
        return `must be at most ${PATH_ID_MAX_LENGTH} characters`;
    }
    // eslint-disable-next-line no-control-regex
    const printableAscii = /^[\x20-\x7e]*$/;
    if (
        !printableAscii.test(value) ||
        [...value].some((c) => PATH_ID_FORBIDDEN.has(c))
    ) {
        return (
            'contains characters that cannot appear in a URL path ' +
            "(whitespace, non-ASCII, or one of '# ? / \\ %')"
        );
    }
    return null;
}

function validatePathId(value: string, name: string): void {
    const problem = pathIdProblem(value);
    if (problem !== null) throw new ValidationError(`${name} ${problem}`);
}

/**
 * Everything RFC 3986 allows unescaped in a query, minus the separators this
 * function owns (`&`, `=`) and `+`, which too many parsers read as a space.
 */
const QUERY_UNSAFE = /[^A-Za-z0-9\-._~!$'()*,;:@/?]/gu;

/**
 * Percent-encode only what would change how the query parses.
 *
 * `encodeURIComponent` would also escape query-legal characters such as the
 * `:` in every `farm:customer` scope, changing the bytes of a request that
 * works today - and with it the string the avanan signature covers. A scope
 * holding `&`, `=`, `#` or whitespace is the actual hazard, so that is what
 * gets escaped.
 */
function encodeQueryPart(value: string): string {
    return value.replace(QUERY_UNSAFE, (char) =>
        [...Buffer.from(char, 'utf8')]
            .map(
                (byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
            )
            .join('')
    );
}

/** Append `?k=v&k=v` for params with truthy values; path unchanged when none. */
function appendQuery(
    path: string,
    params: Record<string, string | null | undefined>
): string {
    const parts = Object.entries(params)
        .filter(([, value]) => Boolean(value))
        .map(
            ([key, value]) =>
                `${encodeQueryPart(key)}=${encodeQueryPart(value as string)}`
        );
    return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
}

/** The upstream body of an error response, trimmed for an error message. */
function responseDetail(response: RawResponse): string {
    return shortDetail(response.text());
}

function parseRetryAfter(value: string | null): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Map an HTTP error response onto the typed error tree. */
export function mapStatus(response: RawResponse): SmartApiError {
    const { status } = response;
    const detail = responseDetail(response);

    if (status === 401) return new AuthError(`401 unauthorized: ${detail}`);
    if (status === 403)
        return new AuthorizationError(`403 forbidden: ${detail}`);
    if (status === 404) return new NotFoundError(`404 not found: ${detail}`);
    if (status === 400 || status === 422) {
        return new ValidationError(`${status} invalid request: ${detail}`);
    }
    if (status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        const suffix =
            retryAfter !== null ? ` (retry after ${retryAfter}s)` : '';
        return new RateLimitError(
            `429 rate limited${suffix}: ${detail}`,
            retryAfter
        );
    }
    if (status >= 500 && status < 600) {
        return new UpstreamError(`${status} upstream error: ${detail}`, status);
    }
    return new UpstreamError(`HTTP ${status}: ${detail}`, status);
}

/**
 * The upstream client for the HEC SmartAPI.
 *
 * Handles the concerns that are identical across both auth flows: token
 * caching with single-flight refresh, exponential-backoff retry, bounded
 * concurrency, the per-request `x-av-req-id` and `scopes` headers, envelope
 * unwrapping and HTTP-status to typed-error mapping.
 *
 * Flow-specific behaviour lives behind the Provider seam. The provider closes
 * over its credentials at build time, so this class never handles them.
 *
 * `@chkp/mcp-utils` constructs one of these per session, synchronously, so
 * anything requiring the network - including resolving the tenant's region and
 * gateway from its domain - happens lazily on the first upstream call. That
 * keeps `initialize` and `tools/list` working with no upstream connectivity.
 */
export class HarmonyEmailAPIManager {
    public debug: string | string[] | boolean | undefined;

    private readonly semaphore: Semaphore;
    private resolvedPromise: Promise<ResolvedSettings> | null = null;
    private resolvedSettings: ResolvedSettings | null = null;
    private token: IssuedToken | null = null;
    private tokenPromise: Promise<IssuedToken> | null = null;

    constructor(private readonly settings: Settings) {
        this.semaphore = new Semaphore(settings.maxConcurrency);
    }

    static create(settings: Settings): HarmonyEmailAPIManager {
        return new HarmonyEmailAPIManager(settings);
    }

    /** Max entities a single batch action may target. */
    get actionBatchLimit(): number {
        return this.settings.actionBatchLimit;
    }

    /** Region, scope, gateway and provider for this tenant. Resolves DNS once. */
    async resolved(): Promise<ResolvedSettings> {
        if (this.resolvedSettings) return this.resolvedSettings;
        this.resolvedPromise ??= resolveSettings(this.settings)
            .then((resolved) => {
                this.resolvedSettings = resolved;
                return resolved;
            })
            .finally(() => {
                this.resolvedPromise = null;
            });
        return this.resolvedPromise;
    }

    async authMethod(): Promise<AuthMethod> {
        return (await this.resolved()).authMethod;
    }

    // ---- Public API ---------------------------------------------------------

    /** List the scopes the configured credentials can access. */
    async getScopes(): Promise<string[]> {
        const data = await this.sendV1('GET', '/scopes');
        if (!Array.isArray(data)) {
            throw new UpstreamError(
                'unexpected /scopes payload shape (not an array)'
            );
        }
        return data.map((scope) => String(scope));
    }

    /** Fetch a single entity's structured payload. */
    async getEntity(entityId: string): Promise<Record<string, unknown>> {
        validatePathId(entityId, 'entity_id');
        const data = await this.sendV1(
            'GET',
            `/search/entity/${entityId}`,
            undefined,
            {
                timeoutMs: this.singularTimeoutMs(),
            }
        );
        return unwrapSingleton(data, '/search/entity');
    }

    /** Fetch a single security event by id. */
    async getEvent(eventId: string): Promise<Record<string, unknown>> {
        validatePathId(eventId, 'event_id');
        const data = await this.sendV1('GET', `/event/${eventId}`, undefined, {
            timeoutMs: this.singularTimeoutMs(),
        });
        return unwrapSingleton(data, '/event');
    }

    /** Query security events. `total` is the cross-page match count when upstream reports it. */
    async queryEvents(
        requestData: Record<string, unknown>
    ): Promise<PagedRecords> {
        const { data, scrollId, total } = await this.queryWithScrollGuard(
            '/event/query',
            requestData
        );
        return {
            records: expectRecordList(data, '/event/query'),
            scrollId,
            total,
        };
    }

    /** Query entities. `total` is the cross-page match count when upstream reports it. */
    async queryEntities(
        requestData: Record<string, unknown>
    ): Promise<PagedRecords> {
        const { data, scrollId, total } = await this.queryWithScrollGuard(
            '/search/query',
            requestData
        );
        return {
            records: expectRecordList(data, '/search/query'),
            scrollId,
            total,
        };
    }

    /** Fetch the status of an async action task. */
    async getTask(
        taskId: string,
        scope?: string
    ): Promise<Record<string, unknown>> {
        validatePathId(taskId, 'task_id');
        const data = await this.sendV1(
            'GET',
            appendQuery(`/task/${taskId}`, { scope })
        );
        return expectRecord(data, '/task');
    }

    /** List Anti-Phishing whitelist, blacklist or spam-whitelist exceptions. */
    async listApExceptions(
        excType: ExceptionType,
        scope?: string
    ): Promise<Record<string, unknown>[]> {
        const data = await this.sendV1(
            'GET',
            appendQuery(`/exceptions/${excType}`, { scope })
        );
        if (!Array.isArray(data)) {
            throw new UpstreamError(
                'unexpected /exceptions payload shape (not an array)'
            );
        }
        return expectRecordList(data, '/exceptions');
    }

    /** Fetch a single Anti-Phishing exception by id. */
    async getApException(
        excType: ExceptionType,
        excId: string,
        scope?: string
    ): Promise<Record<string, unknown>> {
        validatePathId(excId, 'exc_id');
        const data = await this.sendV1(
            'GET',
            appendQuery(`/exceptions/${excType}/${excId}`, { scope })
        );
        return unwrapSingleton(data, '/exceptions');
    }

    /**
     * Download the raw `.eml` for an entity. Binary, with no v1 envelope.
     * `original` keeps the pipeline-added `X-CLOUD-SEC-AV-*` headers.
     */
    async downloadEntity(
        entityId: string,
        { original = false, scope }: { original?: boolean; scope?: string } = {}
    ): Promise<{ bytes: Uint8Array; contentType: string }> {
        validatePathId(entityId, 'entity_id');
        const path = appendQuery(`/download/entity/${entityId}`, {
            original: original ? 'true' : null,
            scope,
        });
        const resolved = await this.resolved();
        const v1Path = `${resolved.provider.v1Prefix}${path}`;
        const response = await this.sendWithRetry(
            'GET',
            `${resolved.provider.baseUrl}${v1Path}`,
            v1Path
        );
        return {
            bytes: response.bytes,
            contentType: response.headers.get('content-type') ?? '',
        };
    }

    /**
     * Fetch a short-lived presigned URL for an entity's `.eml`, for messages
     * that exceed the gateway's response-size budget. Always the original copy.
     */
    async downloadLargeEmail(
        entityId: string,
        scope?: string
    ): Promise<string> {
        validatePathId(entityId, 'entity_id');
        const data = await this.sendV1(
            'GET',
            appendQuery(`/download_large_email/entity/${entityId}`, { scope })
        );
        const url = expectRecord(data, '/download_large_email').url;
        if (typeof url !== 'string' || !url) {
            throw new UpstreamError(
                '/download_large_email: response missing presigned `url` field'
            );
        }
        return url;
    }

    /** Submit a verdict correction for one or more entities. Envelope-only response. */
    async reportMisclassification(
        entityIds: string[],
        classification: string,
        confident: string,
        scope?: string
    ): Promise<void> {
        await this.sendV1(
            'POST',
            appendQuery('/report/mis-classification', { scope }),
            wrapRequestData({ entityIds, classification, confident }),
            { idempotent: false }
        );
    }

    /**
     * Execute a non-idempotent action on one or more entities.
     *
     * Returns the per-entity rows (`{entityId, taskId}`). Upstream applies one
     * batch taskId to every entity and may return null when the action
     * completes synchronously. The task id is poll-able via `getTask`.
     */
    async actOnEntity({
        entityIds,
        entityType,
        actionName,
        declineReason,
        scope,
    }: {
        entityIds: string[];
        entityType: string;
        actionName: string;
        declineReason?: string;
        scope?: string;
    }): Promise<Record<string, unknown>[]> {
        const requestData: Record<string, unknown> = {
            entityIds,
            entityType,
            entityActionName: actionName,
        };
        if (declineReason !== undefined)
            requestData.restoreDeclineReason = declineReason;

        const data = await this.sendV1(
            'POST',
            appendQuery('/action/entity', { scope }),
            wrapRequestData(requestData),
            { idempotent: false }
        );
        return expectRecordList(data, '/action/entity');
    }

    /** Generic escape hatch, required by the mcp-utils APIManager contract. */
    async callApi(
        method: string,
        uri: string,
        data: Record<string, unknown> = {}
    ): Promise<Record<string, unknown>> {
        const verb = method.toUpperCase() === 'POST' ? 'POST' : 'GET';
        const payload = await this.sendV1(
            verb,
            uri,
            verb === 'POST' ? data : undefined
        );
        return expectRecord(payload, uri);
    }

    // ---- Internals ----------------------------------------------------------

    private singularTimeoutMs(): number {
        return Math.min(
            SINGULAR_GET_TIMEOUT_MS,
            this.settings.requestTimeout * 1000
        );
    }

    /**
     * Send a scroll-capable query, attributing a 5xx to an expired cursor.
     *
     * ASSUMPTION: upstream answers an expired or unknown scrollId with a bare
     * HTTP 500, because scroll state lives in Redis and the key TTLs out. A
     * genuine 5xx mid-pagination is therefore misattributed once, but the
     * remediation message is correct either way: re-issue without the cursor.
     */
    private async queryWithScrollGuard(
        path: string,
        requestData: Record<string, unknown>
    ): Promise<PagedPayload> {
        try {
            return await this.sendV1Paginated(
                'POST',
                path,
                wrapRequestData(requestData)
            );
        } catch (error) {
            if (
                error instanceof UpstreamError &&
                requestData.scrollId &&
                error.status !== null &&
                error.status >= 500
            ) {
                throw new ScrollExpiredError(
                    'scroll_id expired or invalid - re-issue the query without ' +
                        'scroll_id to restart from the first page'
                );
            }
            throw error;
        }
    }

    private async sendV1(
        method: 'GET' | 'POST',
        path: string,
        jsonBody?: Record<string, unknown>,
        options: SendOptions = {}
    ): Promise<unknown> {
        return (await this.sendV1Paginated(method, path, jsonBody, options))
            .data;
    }

    private async sendV1Paginated(
        method: 'GET' | 'POST',
        path: string,
        jsonBody?: Record<string, unknown>,
        options: SendOptions = {}
    ): Promise<PagedPayload> {
        const resolved = await this.resolved();
        const v1Path = `${resolved.provider.v1Prefix}${path}`;
        const response = await this.sendWithRetry(
            method,
            `${resolved.provider.baseUrl}${v1Path}`,
            v1Path,
            jsonBody,
            options.timeoutMs,
            options.idempotent
        );

        let parsed: unknown;
        try {
            parsed = response.json();
        } catch {
            throw new UpstreamError(
                `${path}: upstream response is not valid JSON`
            );
        }
        return unwrapV1Response(parsed);
    }

    /**
     * Send one request, retrying per this call's policy.
     *
     * `idempotent: false` marks a call that changes upstream state. 429 stays
     * retryable there - rate limiting rejects a request rather than running it
     * - but 408 and 5xx do not: upstream may have enqueued the action before
     * the error came back, so retrying risks a second quarantine, restore or
     * misclassification report. Those surface as `AmbiguousActionError`.
     *
     * The same rule covers the failures with no response at all: a read timeout
     * means the request was sent, and a mid-flight connection break may mean
     * the same, so both are ambiguous on a state-changing call. Only a
     * pre-flight connect failure is retried there.
     */
    private async sendWithRetry(
        method: 'GET' | 'POST',
        url: string,
        v1Path: string,
        jsonBody?: Record<string, unknown>,
        timeoutMs?: number,
        idempotent = true
    ): Promise<RawResponse> {
        const attempts = this.settings.maxRetries + 1;
        const effectiveTimeoutMs =
            timeoutMs ?? this.settings.requestTimeout * 1000;
        let refreshedFor401 = false;

        for (let attempt = 1; ; attempt++) {
            let response: RawResponse;
            const release = await this.semaphore.acquire();
            try {
                response = await this.sendOnce(
                    method,
                    url,
                    v1Path,
                    jsonBody,
                    effectiveTimeoutMs
                );
            } catch (error) {
                // Token acquisition and settings resolution run inside
                // sendOnce and raise typed errors. Those are decisions, not
                // transport failures: surface them instead of retrying.
                if (error instanceof SmartApiError) throw error;

                if (isTimeoutError(error)) {
                    // The upstream is processing or hanging. Never retried:
                    // retrying multiplies the hang by the retry budget.
                    if (!idempotent) {
                        throw new AmbiguousActionError(
                            `no response within ${effectiveTimeoutMs / 1000}s on a state-changing ` +
                                'request. It was sent, so it may still be applied upstream, and it ' +
                                'was not retried - check the task or entity state before resubmitting'
                        );
                    }
                    throw new UpstreamTimeoutError(
                        `no response within ${effectiveTimeoutMs / 1000}s; upstream may be slow ` +
                            'or the requested resource may not exist - not retrying'
                    );
                }
                // Connection-class failure: retried only when there is no side
                // effect to duplicate, or the request never left this process.
                if (!idempotent && !neverReachedUpstream(error)) {
                    throw new AmbiguousActionError(
                        'the connection to upstream broke on a state-changing request ' +
                            `(${errorCode(error) ?? 'unknown'}). The request may already have been ` +
                            'written, so it was not retried - check the task or entity state ' +
                            'before resubmitting'
                    );
                }
                const transportError = new TransportError(
                    `transport error: ${error instanceof Error ? error.name : 'unknown'}`
                );
                if (attempt >= attempts) throw transportError;
                await this.backoff(attempt, null);
                continue;
            } finally {
                release();
            }

            if (response.status < 400) return response;

            if (response.status === 401 && !refreshedFor401) {
                log('smart_api.token_refresh_on_401');
                this.invalidateToken();
                refreshedFor401 = true;
                // Re-authenticating is not a retry. Refund the attempt so the
                // refreshed request is actually sent, including when the retry
                // budget is zero (HEC_MAX_RETRIES=0 is a supported setting).
                attempt -= 1;
                continue;
            }

            const retryable = RETRYABLE_STATUS.has(response.status);
            if (retryable && !idempotent && response.status !== 429) {
                throw new AmbiguousActionError(
                    `upstream returned HTTP ${response.status} on a state-changing request: ` +
                        `${responseDetail(response)}. It may or may not have been applied, so it ` +
                        'was not retried - check the task or entity state before resubmitting'
                );
            }
            if (retryable && attempt < attempts) {
                await this.backoff(
                    attempt,
                    response.headers.get('retry-after')
                );
                continue;
            }

            if (response.status === 429) {
                log('smart_api.rate_limited_exhausted', { attempts: attempt });
            }
            throw mapStatus(response);
        }
    }

    private async sendOnce(
        method: 'GET' | 'POST',
        url: string,
        v1Path: string,
        jsonBody: Record<string, unknown> | undefined,
        timeoutMs: number
    ): Promise<RawResponse> {
        const resolved = await this.resolved();
        const token = await this.ensureToken(timeoutMs);
        const reqId = randomUUID();

        const headers = new Headers({
            'x-av-req-id': reqId,
            scopes: resolved.scope,
        });
        if (jsonBody !== undefined)
            headers.set('Content-Type', 'application/json');

        resolved.provider.attachToken(headers, token);
        // Signed last, so the signature covers the final header set.
        resolved.provider.sign(headers, new Date(), v1Path);

        log('smart_api.request', {
            auth_method: resolved.authMethod,
            method,
            path: v1Path,
            req_id: reqId,
        });

        const response = await fetch(url, {
            method,
            headers,
            body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
            signal: AbortSignal.timeout(timeoutMs),
        });
        const raw = await RawResponse.from(response);

        log('smart_api.response', {
            auth_method: resolved.authMethod,
            method,
            path: v1Path,
            status: raw.status,
            req_id: reqId,
        });
        if (raw.status >= 400) {
            log(
                'smart_api.response_detail',
                responseDebugFields(response, reqId)
            );
        }
        return raw;
    }

    /** Single-flight token refresh: concurrent callers share one auth call. */
    private async ensureToken(timeoutMs: number): Promise<IssuedToken> {
        if (this.token && !isTokenExpiring(this.token, new Date()))
            return this.token;
        if (this.tokenPromise) return this.tokenPromise;

        const pending = this.authenticate(timeoutMs).finally(() => {
            this.tokenPromise = null;
        });
        this.tokenPromise = pending;
        return pending;
    }

    private async authenticate(timeoutMs: number): Promise<IssuedToken> {
        const resolved = await this.resolved();
        const token = await resolved.provider.authenticate(
            randomUUID(),
            timeoutMs
        );
        this.token = token;
        return token;
    }

    private invalidateToken(): void {
        this.token = null;
    }

    private async backoff(
        attempt: number,
        retryAfter: string | null
    ): Promise<void> {
        const hinted = parseRetryAfter(retryAfter);
        const seconds = hinted ?? this.jitteredBackoff(attempt);
        log('smart_api.backoff', { attempt, sleep_seconds: seconds });
        await sleep(seconds * 1000);
    }

    /** Full jitter over an exponentially growing window. Not cryptographic. */
    private jitteredBackoff(attempt: number): number {
        return (
            Math.random() * this.settings.retryBaseSeconds * 2 ** (attempt - 1)
        );
    }
}

export interface PagedPayload {
    data: unknown;
    scrollId: string | null;
    total: number | null;
}

export interface PagedRecords {
    records: Record<string, unknown>[];
    scrollId: string | null;
    total: number | null;
}

/**
 * An AbortSignal.timeout firing is the read-class deadline; anything else that
 * fetch throws is a connection-class failure that is worth retrying.
 */
function isTimeoutError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
    );
}

/**
 * The first `code` on the error or down its `cause` chain, where `fetch` hangs
 * the real reason behind a bare `TypeError: fetch failed`.
 */
function errorCode(error: unknown): string | null {
    let current: unknown = error;
    for (
        let depth = 0;
        current !== null && current !== undefined && depth < 5;
        depth++
    ) {
        const code = (current as { code?: unknown }).code;
        if (typeof code === 'string') return code;
        current = (current as { cause?: unknown }).cause;
    }
    return null;
}

/** Whether a connection failure is pre-flight. An unknown code answers false. */
function neverReachedUpstream(error: unknown): boolean {
    const code = errorCode(error);
    return code !== null && PRE_FLIGHT_ERROR_CODES.has(code);
}
