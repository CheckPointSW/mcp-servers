/**
 * Redaction for anything that reaches a log line.
 *
 * Customer data (message subjects, addresses, headers, bodies, attachment
 * names) and credentials must never appear in logs, even when a future edit
 * carelessly passes a whole response object to the logger. `redact` walks
 * dicts and arrays so a nested payload cannot smuggle a secret out.
 *
 * Ported from the Python server's structlog redaction processor. There is no
 * logging library in this monorepo, so this sits in front of console.error.
 */

export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
    'token',
    'access_key',
    'accesskey',
    'authorization',
    'x-av-token',
    'x-av-sig',
    'secret',
    'secretkey',
    'password',
    'apikey',
    'subject',
    'body',
    'recipients',
    'recipientaddress',
    'senderaddress',
    'from',
    'to',
    'cc',
    'bcc',
    'payload',
    'attachmentname',
    'headers',
    'messageid',
    // Key identifiers, not the secret half, but the stated contract is that no
    // credential material reaches a log line and support does not need them.
    'client_id',
    'clientid',
    'app_id',
    'appid',
    'cookie',
    'set-cookie',
]);

const REDACTED = '<redacted>';
const MAX_REDACT_DEPTH = 8;
const JWT_RE = /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function redact(value: unknown, depth = 0): unknown {
    if (depth >= MAX_REDACT_DEPTH) return REDACTED;

    if (Array.isArray(value)) {
        return value.map((item) => redact(item, depth + 1));
    }

    if (value !== null && typeof value === 'object') {
        const scrubbed: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(
            value as Record<string, unknown>
        )) {
            scrubbed[key] = SENSITIVE_KEYS.has(key.toLowerCase())
                ? REDACTED
                : redact(nested, depth + 1);
        }
        return scrubbed;
    }

    if (typeof value === 'string' && JWT_RE.test(value)) return REDACTED;

    return value;
}

const LOG_PREFIX = '[harmony-email]';

/**
 * stdout is the MCP stdio channel, so every log line goes to stderr.
 * Structured fields are redacted before they are serialized.
 */
export function log(event: string, fields: Record<string, unknown> = {}): void {
    const payload = redact(fields) as Record<string, unknown>;
    console.error(`${LOG_PREFIX} ${event}`, JSON.stringify(payload));
}

/** Debug-level counterpart, emitted only when the session has debug enabled. */
export function logDebug(
    enabled: boolean | string | string[] | undefined,
    event: string,
    fields: Record<string, unknown> = {}
): void {
    if (!enabled || enabled === 'false') return;
    log(event, fields);
}

const SAFE_RESPONSE_HEADERS = [
    'apigw-requestid',
    'content-type',
    'retry-after',
    'x-av-req-id',
] as const;

const DETAIL_CHARS = 200;

/**
 * Response fields safe to log: an allowlist, not a redaction pass.
 *
 * `redact` keys off field names, and neither an error body nor an unknown
 * header is a field name: a 400 echoing a filter can carry a recipient
 * address, and a header added upstream later would pass straight through. The
 * same short detail is attached to the error thrown to the caller, so an
 * analyst still sees why a call failed; it just never reaches a log line.
 */
export function responseDebugFields(
    response: Response,
    reqId?: string
): Record<string, unknown> {
    const fields: Record<string, unknown> = { status: response.status };
    for (const name of SAFE_RESPONSE_HEADERS) {
        const value = response.headers.get(name);
        if (value !== null) fields[name.replace(/-/g, '_')] = value;
    }
    if (reqId !== undefined) fields.req_id = reqId;
    return fields;
}

/** An upstream body trimmed to one loggable-length line, for error messages. */
export function shortDetail(body: string): string {
    return body.slice(0, DETAIL_CHARS).replace(/\s+/g, ' ').trim();
}
