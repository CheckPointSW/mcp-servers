import { randomUUID } from 'node:crypto';

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

export function formatValidationErrors(detail: unknown[]): string {
    return detail
        .map((item) => {
            if (typeof item === 'object' && item !== null) {
                const obj = item as Record<string, unknown>;
                const locArr = Array.isArray(obj.loc) ? obj.loc : [];
                const loc = locArr.slice(1).join(' → ');
                const msg =
                    typeof obj.msg === 'string'
                        ? obj.msg
                        : JSON.stringify(item);
                return loc ? `${loc}: ${msg}` : msg;
            }
            return typeof item === 'string' ? item : JSON.stringify(item);
        })
        .join('; ');
}

export function extractDetailFromBody(data: Record<string, unknown>): string {
    const detail = data.detail ?? data.message ?? data.error;
    if (detail === undefined) return JSON.stringify(data);
    if (Array.isArray(detail)) return formatValidationErrors(detail);
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
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
        let lastError: Error | undefined;
        const maxAttempts = 1 + this.retries;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
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

                const response = await fetch(url.toString(), fetchOptions);
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const error = new Error(
                        `HTTP ${response.status}: ${response.statusText}`
                    ) as Error & { response: Response };
                    error.response = response;
                    throw error;
                }

                return response;
            } catch (error: unknown) {
                lastError = error as Error;

                if (!isRetryableError(error)) {
                    throw error;
                }

                if (attempt === maxAttempts - 1) {
                    throw new Error('Request failed after all retries.');
                }

                const delayMs =
                    this.backoffFactor * Math.pow(2, attempt) * 1000;
                await sleep(delayMs);
            }
        }

        throw lastError || new Error('Request failed after all retries.');
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
