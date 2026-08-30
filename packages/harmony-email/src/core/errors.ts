/**
 * Typed error tree for HEC SmartAPI interactions.
 *
 * The tool layer catches `SmartApiError` and surfaces a redacted message plus
 * the class name as a stable error code. Stack traces stay server-side.
 */

export class SmartApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
        // Restores the prototype chain when the package is compiled down to ES5-style
        // constructors, so `instanceof` keeps working for every subclass.
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /** Stable, client-facing error code. */
    get code(): string {
        return this.name;
    }
}

/** Missing or invalid configuration. */
export class ConfigError extends SmartApiError {}

/** Authentication failure: bad credentials or an unrecoverable 401. */
export class AuthError extends SmartApiError {}

/** Authenticated but forbidden (403): scope mismatch or insufficient privileges. */
export class AuthorizationError extends SmartApiError {}

/** Resource not found (404, or an envelope reporting a not-found code). */
export class NotFoundError extends SmartApiError {}

/** Caller input rejected by HEC (400 / 422). */
export class ValidationError extends SmartApiError {}

/**
 * The supplied scrollId has expired or is invalid upstream.
 *
 * A subclass of ValidationError because the remediation is an input change:
 * re-issue the query WITHOUT scrollId to start a new scan.
 */
export class ScrollExpiredError extends ValidationError {}

/**
 * 429 received and retries exhausted.
 *
 * `retryAfterSeconds` is the upstream Retry-After hint when present; null when
 * the response omitted the header or its value was not numeric.
 */
export class RateLimitError extends SmartApiError {
    readonly retryAfterSeconds: number | null;

    constructor(message: string, retryAfterSeconds: number | null = null) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/**
 * 5xx received and retries exhausted, or another unclassified HTTP error.
 *
 * `status` carries the HTTP status code when the error came from a response;
 * null for envelope-level failures (HTTP 200 with success=false).
 */
export class UpstreamError extends SmartApiError {
    readonly status: number | null;

    constructor(message: string, status: number | null = null) {
        super(message);
        this.status = status;
    }
}

/** Network, TLS or timeout error. */
export class TransportError extends SmartApiError {}

/**
 * Upstream did not respond within the deadline.
 *
 * Never retried: a hanging upstream call should fail once rather than multiply
 * the timeout by the retry budget.
 */
export class UpstreamTimeoutError extends TransportError {}

/**
 * A side-effecting call failed with the outcome unknown.
 *
 * 408 and 5xx on a non-idempotent request are ambiguous: upstream may have
 * enqueued the action before the error came back. Never retried automatically,
 * because that risks a duplicate quarantine, restore or report. The caller is
 * told to check `get_task` / the entity state before resubmitting.
 */
export class AmbiguousActionError extends SmartApiError {}
