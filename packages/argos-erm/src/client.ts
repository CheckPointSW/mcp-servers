import { randomUUID } from 'node:crypto';
import { isJsonObject } from './helpers/json.js';

function isRetryableError(error: unknown): boolean {
    const err = error as Record<string, unknown>;
    if (
        err.response &&
        (err.response as Record<string, unknown>).status &&
        ((err.response as Record<string, unknown>).status as number) >= 500
    ) {
        return true;
    }
    if (
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND'
    ) {
        return true;
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A request-schema field name or list index: the parts of a validation error
 * location kept in a message. A location continues into the request's own
 * values for a keyed field, so it is cut at the first part that is not one.
 */
const LOCATION_PART = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A FastAPI validation error list as `field → path: message` pairs.
 *
 * Only each item's location and message are kept. Items also echo the
 * rejected request back (`input`, `ctx`), which can carry customer data, so
 * nothing else is ever included, and an item without a string message is
 * skipped rather than serialized.
 */
export function formatValidationErrors(detail: unknown[]): string {
    return detail
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (!isJsonObject(item) || typeof item.msg !== 'string') return '';
            const msg = item.msg.trim();
            if (!msg) return '';
            const parts: string[] = [];
            for (const part of Array.isArray(item.loc)
                ? item.loc.slice(1)
                : []) {
                if (typeof part === 'number') parts.push(String(part));
                else if (typeof part === 'string' && LOCATION_PART.test(part))
                    parts.push(part);
                else break;
            }
            return parts.length ? `${parts.join(' → ')}: ${msg}` : msg;
        })
        .filter((text) => text !== '')
        .join('; ');
}

/** A non-empty explanation in one error-body field, never serializing it. */
function fieldText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return formatValidationErrors(value);
    // One level down, for a body such as `{"detail": {"error": "..."}}`.
    if (isJsonObject(value)) {
        for (const key of ['message', 'error', 'msg'] as const) {
            const nested = value[key];
            if (typeof nested === 'string' && nested.trim())
                return nested.trim();
        }
    }
    return '';
}

/**
 * The upstream's explanation in an error body: the first of `detail`,
 * `message` and `error` that holds a non-empty message. Nothing else in the
 * body is used, since the rest can echo request or customer data. Empty when
 * there is no such field.
 */
export function extractDetailFromBody(data: Record<string, unknown>): string {
    for (const key of ['detail', 'message', 'error'] as const) {
        const text = fieldText(data[key]);
        if (text) return text;
    }
    return '';
}

/** Longest upstream error detail kept in an error message. */
const MAX_ERROR_DETAIL_LENGTH = 500;

/**
 * Most of an error body read in search of its detail. Room for a validation
 * error that echoes a large request back; a larger body is a page, not a
 * message, and is not read further.
 */
const MAX_ERROR_BODY_BYTES = 256 * 1024;

/** The body as text, or undefined when it is absent, unreadable or too large. */
async function readSmallBody(response: Response): Promise<string | undefined> {
    const reader = response.body?.getReader();
    if (!reader) return undefined;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return Buffer.concat(chunks).toString('utf8');
            size += value.byteLength;
            if (size > MAX_ERROR_BODY_BYTES) return undefined;
            chunks.push(value);
        }
    } catch {
        return undefined;
    } finally {
        // Releases the rest of the body; a failure here changes nothing.
        reader.cancel().catch(() => undefined);
    }
}

/**
 * The upstream's explanation of a failed request, from a JSON error body.
 * Read here, once, so it is kept when the request is retried and the final
 * error wraps this one. Empty when there is none.
 */
async function errorDetail(response: Response): Promise<string> {
    const body = await readSmallBody(response);
    if (body === undefined) return '';
    let data: unknown;
    try {
        data = JSON.parse(body);
    } catch {
        return '';
    }
    return isJsonObject(data) ? extractDetailFromBody(data) : '';
}

type QueryParamValue = string | number | boolean;

export class ArgosERMAPIManager {
    private readonly baseUrl: string;
    private readonly token: string;
    private readonly retries: number;
    private readonly backoffFactor: number;
    private readonly timeout: number;
    private readonly headers: Record<string, string>;
    public readonly customerId: string;

    constructor(
        argosHost: string,
        argosApiKey: string,
        argosCustomerId = '',
        retries = 3,
        backoffFactor = 0.5,
        timeout = 120
    ) {
        this.baseUrl = argosHost;
        this.token = argosApiKey;
        this.customerId = argosCustomerId;
        this.retries = retries;
        this.backoffFactor = backoffFactor;
        this.timeout = timeout;

        if (!this.baseUrl) {
            throw new Error('ARGOS_SERVER_URL environment variable not set');
        }
        if (!this.token) {
            throw new Error(
                'ARGOS_INTEGRATION_TOKEN environment variable not set'
            );
        }

        this.headers = {
            'X-Integration-Type': 'MCP',
            'X-Integration-Instance-Id': randomUUID(),
            'X-Integration-Instance-Name': 'argos-mcp',
            'X-Integration-Customer-Name': this.customerId || 'argos-mcp',
            'X-Integration-Version': '1.0.0',
            'Content-Type': 'application/json',
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static create(settings: any): ArgosERMAPIManager {
        return new ArgosERMAPIManager(
            settings.argosHost,
            settings.argosApiKey,
            settings.argosCustomerId || ''
        );
    }

    private async makeRequest(
        method: string,
        endpoint: string,
        options: {
            params?: Record<string, QueryParamValue>;
            json?: Record<string, unknown>;
        } = {}
    ): Promise<Response> {
        // Every attempt returns or throws; the last one always throws, so the
        // loop has no exit of its own.
        const lastAttempt = Math.max(0, this.retries);

        for (let attempt = 0; ; attempt++) {
            try {
                const url = new URL(endpoint, this.baseUrl);
                if (options.params) {
                    Object.entries(options.params).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) {
                            url.searchParams.append(key, String(value));
                        }
                    });
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    this.timeout * 1000
                );

                const fetchOptions: RequestInit = {
                    method,
                    headers: {
                        ...this.headers,
                        Cookie: `access_token=${this.token}`,
                    },
                    signal: controller.signal,
                };

                if (options.json) {
                    fetchOptions.body = JSON.stringify(options.json);
                }

                let response: Response;
                let detail = '';
                try {
                    response = await fetch(url.toString(), fetchOptions);
                    if (!response.ok) {
                        // Read while the request timeout still applies. The
                        // body is consumed here; the error keeps the response
                        // for its status.
                        detail = await errorDetail(response);
                    }
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) {
                    const shown =
                        detail.length > MAX_ERROR_DETAIL_LENGTH
                            ? `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH)}...`
                            : detail;
                    const error = new Error(
                        `HTTP ${response.status}: ${response.statusText}${shown ? ` - ${shown}` : ''}`
                    ) as Error & { response: Response; detail: string };
                    error.response = response;
                    // In full, for callers that act on what upstream said.
                    error.detail = detail;
                    throw error;
                }

                return response;
            } catch (error: unknown) {
                if (!isRetryableError(error)) {
                    throw error;
                }

                if (attempt >= lastAttempt) {
                    // The last attempt's error is kept as the cause, so the
                    // failure is classified by what actually went wrong.
                    throw Object.assign(
                        new Error('Request failed after all retries'),
                        {
                            cause: error,
                        }
                    );
                }

                const delayMs =
                    this.backoffFactor * Math.pow(2, attempt) * 1000;
                await sleep(delayMs);
            }
        }
    }

    async get(
        endpoint: string,
        params?: Record<string, QueryParamValue>
    ): Promise<Response> {
        return this.makeRequest('GET', endpoint, { params });
    }

    async post(
        endpoint: string,
        json?: Record<string, unknown>
    ): Promise<Response> {
        return this.makeRequest('POST', endpoint, { json });
    }

    async callApi(
        method: string,
        uri: string,
        data: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        const response =
            method === 'GET'
                ? await this.get(uri, data as Record<string, QueryParamValue>)
                : await this.post(uri, data);

        return response.json();
    }
}
