/**
 * Shared error taxonomy for Check Point MCP servers.
 *
 * The invariant every MCP package in this monorepo is expected to uphold:
 *
 *   A failure must either be THROWN, or already be a correctly-shaped
 *   `isError` result. Nothing may return a failure as a plain value.
 *
 * A failure returned as ordinary data is indistinguishable from a successful
 * result: the calling agent and any monitoring see a normal result whose text
 * merely happens to describe an error, and have to guess from prose whether the
 * call worked.
 *
 * `CPMcpServer` enforces the first half of the invariant centrally: anything a
 * tool/prompt/resource handler throws is converted here into a spec-compliant
 * error result. Individual packages therefore do not need to implement error
 * handling to be correct — they only opt in to a more specific `code` or a
 * better human-readable message than `classifyError` can infer on its own.
 */

/**
 * Stable, machine-readable error codes.
 *
 * Deliberately small and cause-agnostic: a code describes what went wrong from
 * the caller's point of view, not which subsystem produced it. HTTP status
 * codes, filesystem errnos and SQLite codes are all mapped onto this set, so
 * consumers (agents, telemetry, dashboards) never have to special-case a
 * transport. Add a member only when an existing one would mislead a caller.
 */
export const McpErrorCode = {
  /** Credentials were rejected, missing, or the session could not be established. */
  AUTH_FAILED: 'AUTH_FAILED',
  /** Authenticated, but not allowed to perform this operation. */
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  /** The requested object, file, or endpoint does not exist. */
  NOT_FOUND: 'NOT_FOUND',
  /** The request was malformed or failed schema validation. Caller should fix the input. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Throttled by the upstream service. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** The operation did not complete within its allotted time. */
  TIMEOUT: 'TIMEOUT',
  /** The upstream service could not be contacted at all (DNS, refused, gateway). */
  UPSTREAM_UNREACHABLE: 'UPSTREAM_UNREACHABLE',
  /** The upstream service was reached but returned an error. */
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  /** A local resource (file, database, subprocess) was unavailable or unreadable. */
  RESOURCE_UNAVAILABLE: 'RESOURCE_UNAVAILABLE',
  /** The upstream accepted the request but reported the operation itself as failed. */
  OPERATION_FAILED: 'OPERATION_FAILED',
  /** Unclassified defect. Treated as a bug in the MCP server, not the caller's input. */
  INTERNAL: 'INTERNAL',
} as const;

export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode];

/** Codes that are worth retrying without changing the request. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  McpErrorCode.RATE_LIMITED,
  McpErrorCode.TIMEOUT,
  McpErrorCode.UPSTREAM_UNREACHABLE,
  McpErrorCode.UPSTREAM_ERROR,
]);

export interface McpToolErrorOptions {
  /** HTTP status from the upstream service, when the failure came from one. */
  upstreamStatus?: number;
  /** Overrides the default retryability implied by `code`. */
  retryable?: boolean;
  /**
   * The original error, for programmatic inspection. Never logged by
   * `CPMcpServer` and never sent to telemetry or the client. Do not attach a
   * raw HTTP client error here: it carries the request config, including the
   * request body.
   */
  cause?: unknown;
}

/**
 * A failure with a stable code attached.
 *
 * Throw this from any layer — API client, tool handler, helper — to control the
 * `error_code` a caller sees. Throwing a plain `Error` is also fine; it just
 * gets classified heuristically by `classifyError`.
 */
export class McpToolError extends Error {
  readonly code: McpErrorCode;
  readonly upstreamStatus?: number;
  readonly retryable: boolean;

  constructor(code: McpErrorCode, message: string, options: McpToolErrorOptions = {}) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
    this.upstreamStatus = options.upstreamStatus;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
    if (options.cause !== undefined) {
      // Assigned rather than passed to super() so this compiles under es2020.
      (this as { cause?: unknown }).cause = options.cause;
    }
    // Restore the prototype chain so `instanceof` survives transpilation.
    // `new.target` rather than McpToolError, so a subclass keeps its own
    // prototype: its methods and `instanceof` checks against it.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Render an error for a log line: its name, code and message, and optionally its
 * stack — never its properties or its `cause`.
 *
 * Passing the error object itself to `console.error` lets `util.inspect` walk
 * its own properties and cause chain. For an HTTP client error that reaches the
 * request config, whose body is the login payload — so the API key ends up in
 * the log. A stack trace carries only the message and code locations, so it is
 * safe to include when the failure is an unclassified defect worth debugging.
 */
export function errorForLog(error: unknown, options: { stack?: boolean } = {}): string {
  if (error instanceof Error) {
    if (options.stack && error.stack) return error.stack;
    const code = (error as { code?: unknown }).code;
    return `${error.name}${typeof code === 'string' ? ` [${code}]` : ''}: ${error.message}`;
  }
  if (typeof error === 'string') return error;
  // Anything else is described by its type alone: its contents are exactly
  // what must not be printed.
  return `non-Error value (${error === null ? 'null' : typeof error})`;
}

/**
 * The parseable half of an error result.
 *
 * Open-ended by design: `structuredContent` is an open record in the MCP spec,
 * so a package may attach extra context alongside the standard fields.
 */
export interface McpErrorPayload {
  error_code: McpErrorCode;
  error_message: string;
  upstream_status?: number;
  retryable: boolean;
  [key: string]: unknown;
}

/**
 * A spec-compliant tool result flagged as a failure.
 *
 * The index signature makes it assignable to the SDK's `CallToolResult`, which
 * is an open record, so a handler typed against the SDK can return it.
 */
export interface McpErrorResult {
  content: { type: 'text'; text: string }[];
  isError: true;
  structuredContent: McpErrorPayload;
  [key: string]: unknown;
}

/** Map an HTTP status onto a code. Used for every HTTP-shaped failure. */
export function classifyHttpStatus(status: number): {
  code: McpErrorCode;
  retryable: boolean;
} {
  if (status === 401) return { code: McpErrorCode.AUTH_FAILED, retryable: false };
  if (status === 403) return { code: McpErrorCode.PERMISSION_DENIED, retryable: false };
  if (status === 404) return { code: McpErrorCode.NOT_FOUND, retryable: false };
  if (status === 408) return { code: McpErrorCode.TIMEOUT, retryable: true };
  if (status === 429) return { code: McpErrorCode.RATE_LIMITED, retryable: true };
  if (status === 400 || status === 422)
    return { code: McpErrorCode.VALIDATION_ERROR, retryable: false };
  // 502/503/504 mean we never got a useful answer from the service itself.
  if (status === 502 || status === 503 || status === 504)
    return { code: McpErrorCode.UPSTREAM_UNREACHABLE, retryable: true };
  if (status >= 500) return { code: McpErrorCode.UPSTREAM_ERROR, retryable: true };
  if (status >= 400) return { code: McpErrorCode.UPSTREAM_ERROR, retryable: false };
  return { code: McpErrorCode.UPSTREAM_ERROR, retryable: false };
}

/** Errno-style codes, grouped by what they mean to a caller. */
const ERRNO_CODES: Record<string, McpErrorCode> = {
  // Network reachability
  ECONNREFUSED: McpErrorCode.UPSTREAM_UNREACHABLE,
  ENOTFOUND: McpErrorCode.UPSTREAM_UNREACHABLE,
  EHOSTUNREACH: McpErrorCode.UPSTREAM_UNREACHABLE,
  ENETUNREACH: McpErrorCode.UPSTREAM_UNREACHABLE,
  ECONNRESET: McpErrorCode.UPSTREAM_UNREACHABLE,
  EPIPE: McpErrorCode.UPSTREAM_UNREACHABLE,
  EAI_AGAIN: McpErrorCode.UPSTREAM_UNREACHABLE,
  ERR_NETWORK: McpErrorCode.UPSTREAM_UNREACHABLE, // axios
  UND_ERR_SOCKET: McpErrorCode.UPSTREAM_UNREACHABLE, // undici (fetch)
  // Timeouts
  ETIMEDOUT: McpErrorCode.TIMEOUT,
  ESOCKETTIMEDOUT: McpErrorCode.TIMEOUT,
  ECONNABORTED: McpErrorCode.TIMEOUT, // axios request timeout
  UND_ERR_CONNECT_TIMEOUT: McpErrorCode.TIMEOUT,
  UND_ERR_HEADERS_TIMEOUT: McpErrorCode.TIMEOUT,
  UND_ERR_BODY_TIMEOUT: McpErrorCode.TIMEOUT,
  // A cancelled request is treated like an aborted one.
  ERR_CANCELED: McpErrorCode.TIMEOUT, // axios
  // TLS — a rejected certificate is an auth problem, not a reachability one.
  CERT_HAS_EXPIRED: McpErrorCode.AUTH_FAILED,
  DEPTH_ZERO_SELF_SIGNED_CERT: McpErrorCode.AUTH_FAILED,
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: McpErrorCode.AUTH_FAILED,
  // Filesystem
  ENOENT: McpErrorCode.NOT_FOUND,
  EACCES: McpErrorCode.PERMISSION_DENIED,
  EPERM: McpErrorCode.PERMISSION_DENIED,
  EISDIR: McpErrorCode.VALIDATION_ERROR,
  ENOTDIR: McpErrorCode.VALIDATION_ERROR,
  ENOSPC: McpErrorCode.RESOURCE_UNAVAILABLE,
  EMFILE: McpErrorCode.RESOURCE_UNAVAILABLE,
  EBUSY: McpErrorCode.RESOURCE_UNAVAILABLE,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Pull an HTTP status out of the various shapes our clients throw. */
function extractHttpStatus(error: Record<string, unknown>): number | undefined {
  // Only an integer in the HTTP range counts: other errors carry a numeric
  // `status` too, such as a subprocess exit code.
  const asStatus = (value: unknown): number | undefined =>
    Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599
      ? (value as number)
      : undefined;
  // ClientResponse (@chkp/quantum-infra), fetch Response, and anything else with
  // a bare status.
  const own = asStatus(error.status) ?? asStatus(error.statusCode);
  if (own !== undefined) return own;
  // axios
  const response = error.response;
  return isRecord(response) ? asStatus(response.status) : undefined;
}

/**
 * The exit code of a failed child process, or undefined when the error is not
 * one. Recognized by shape, since child_process errors are plain Errors:
 * execSync sets `status` and `output`, exec sets a numeric `code` and `cmd`,
 * execa sets `exitCode`, and a spawn failure carries `spawnargs`.
 */
function subprocessExitCode(error: Record<string, unknown>): number | null | undefined {
  const isSubprocess =
    'cmd' in error || 'spawnargs' in error || 'output' in error || 'exitCode' in error;
  if (!isSubprocess) return undefined;
  for (const value of [error.exitCode, error.status, error.code]) {
    if (typeof value === 'number') return value;
  }
  return null; // a subprocess failure without an exit code, e.g. killed by a signal
}

/**
 * Recover a status from a stringified error message.
 *
 * A last resort for errors that arrive with their status embedded in prose,
 * such as `API request failed: 404 - {...}`. Parsing it back is unpleasant, but
 * it is the difference between reporting NOT_FOUND and reporting INTERNAL when
 * the thrown value carries no structured status of its own.
 */
function statusFromMessage(message: string): number | undefined {
  // Deliberately strict. The number must sit immediately after the keyword and
  // be in the 4xx/5xx error range, so ordinary prose that happens to contain a
  // three-digit number — "Error processing 404 records", "failed to parse 250
  // rules" — is not mistaken for a status and given a fabricated
  // `upstream_status`. Missing a status is harmless; inventing one is not.
  const match = /\b(?:status|code|failed|error)\s*[:=]?\s*([45]\d{2})\b/i.exec(message);
  if (match) return Number(match[1]);
  return undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  if (isRecord(error)) {
    if (typeof error.message === 'string' && error.message) return error.message;
    // ClientResponse-style: the useful text lives in the response body.
    const response = error.response;
    if (isRecord(response)) {
      for (const key of ['message', 'error', 'errors', 'warnings'] as const) {
        const value = response[key];
        if (typeof value === 'string' && value) return value;
      }
      try {
        return JSON.stringify(response);
      } catch {
        /* fall through */
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      /* fall through */
    }
  }
  return String(error ?? 'Unknown error');
}

/**
 * Classify any thrown value into a stable code.
 *
 * Cause-agnostic by design: HTTP responses, filesystem errnos, SQLite errors,
 * subprocess exits, Zod issues, aborted requests and plain `Error`s all resolve
 * to the same small enum, so a caller never has to know which one it hit.
 */
export function classifyError(error: unknown): McpErrorPayload {
  return classify(error, 0);
}

/** How many `cause` links classification follows before giving up. */
const MAX_CAUSE_DEPTH = 3;

function classify(error: unknown, depth: number): McpErrorPayload {
  // Already classified — trust it.
  if (error instanceof McpToolError) {
    return {
      error_code: error.code,
      error_message: error.message,
      ...(error.upstreamStatus !== undefined ? { upstream_status: error.upstreamStatus } : {}),
      retryable: error.retryable,
    };
  }

  const message = messageOf(error);

  if (isRecord(error)) {
    // Zod (and anything else exposing an `issues` array).
    const name = typeof error.name === 'string' ? error.name : '';
    if (name === 'ZodError' || Array.isArray(error.issues)) {
      return {
        error_code: McpErrorCode.VALIDATION_ERROR,
        error_message: message,
        retryable: false,
      };
    }

    // Aborted / timed-out / cancelled operations.
    if (name === 'AbortError' || name === 'TimeoutError' || name === 'CanceledError') {
      return { error_code: McpErrorCode.TIMEOUT, error_message: message, retryable: true };
    }

    // Subprocess failure: checked before HTTP, since execSync reports its exit
    // code as a numeric `status`.
    const exitCode = subprocessExitCode(error);
    if (exitCode !== undefined && (exitCode !== 0 || error.signal)) {
      return {
        error_code: McpErrorCode.OPERATION_FAILED,
        error_message: message,
        retryable: false,
      };
    }

    const status = extractHttpStatus(error);
    if (status !== undefined) {
      const { code, retryable } = classifyHttpStatus(status);
      return {
        error_code: code,
        error_message: message,
        upstream_status: status,
        retryable,
      };
    }

    const errno = typeof error.code === 'string' ? error.code : undefined;
    if (errno) {
      const mapped = ERRNO_CODES[errno];
      if (mapped) {
        return {
          error_code: mapped,
          error_message: message,
          retryable: RETRYABLE_CODES.has(mapped),
        };
      }
      // SQLite (node:sqlite / better-sqlite3) surfaces SQLITE_* codes.
      if (errno.startsWith('SQLITE_')) {
        const code =
          errno === 'SQLITE_CANTOPEN' || errno === 'SQLITE_NOTFOUND'
            ? McpErrorCode.NOT_FOUND
            : McpErrorCode.RESOURCE_UNAVAILABLE;
        return { error_code: code, error_message: message, retryable: false };
      }
    }

    // Nothing on the error itself: classify its cause. fetch, for one, throws a
    // bare "fetch failed" TypeError and puts the network errno on `cause`.
    if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
      const fromCause = classify(error.cause, depth + 1);
      if (fromCause.error_code !== McpErrorCode.INTERNAL) {
        return { ...fromCause, error_message: `${message}: ${fromCause.error_message}` };
      }
    }
  }

  // Last resort: recover a status that was flattened into the message.
  const status = statusFromMessage(message);
  if (status !== undefined) {
    const { code, retryable } = classifyHttpStatus(status);
    return {
      error_code: code,
      error_message: message,
      upstream_status: status,
      retryable,
    };
  }

  return { error_code: McpErrorCode.INTERNAL, error_message: message, retryable: false };
}

/**
 * Build a spec-compliant error result.
 *
 * `content[0].text` carries the natural-language message that every MCP client
 * already knows how to render, prefixed with the code so it stays legible even
 * on clients that drop unknown fields. `structuredContent` carries the same
 * information in parseable form, so consumers never have to regex prose.
 */
export function toolError(
  code: McpErrorCode,
  message: string,
  options: {
    upstreamStatus?: number;
    retryable?: boolean;
    /** Extra context merged into `structuredContent` alongside the standard fields. */
    details?: Record<string, unknown>;
  } = {}
): McpErrorResult {
  const payload: McpErrorPayload = {
    ...options.details,
    error_code: code,
    error_message: message,
    ...(options.upstreamStatus !== undefined ? { upstream_status: options.upstreamStatus } : {}),
    retryable: options.retryable ?? RETRYABLE_CODES.has(code),
  };
  return {
    content: [{ type: 'text', text: `${code}: ${message}` }],
    isError: true,
    structuredContent: payload,
  };
}

/**
 * Convert any thrown value into an error result.
 *
 * `context` prefixes the message with what the tool was trying to do — the
 * detail a handler knows and the classifier cannot infer (e.g. "Failed to parse
 * rulebase"). Use it when catching in a handler; omit it when converting
 * centrally, where no such context exists.
 */
export function toolErrorFrom(error: unknown, context?: string): McpErrorResult {
  const payload = classifyError(error);
  const message = context ? `${context}: ${payload.error_message}` : payload.error_message;
  return {
    content: [{ type: 'text', text: `${payload.error_code}: ${message}` }],
    isError: true,
    structuredContent: { ...payload, error_message: message },
  };
}

/**
 * Recover a code from text that was already formatted as `CODE: message`.
 * Lets results built by a package's own helper keep their code when normalized.
 */
function codeFromText(text: string): McpErrorCode | undefined {
  const match = /^([A-Z][A-Z_]{2,40}):\s/.exec(text);
  if (!match) return undefined;
  const candidate = match[1];
  return Object.prototype.hasOwnProperty.call(McpErrorCode, candidate)
    ? (candidate as McpErrorCode)
    : undefined;
}

function firstText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return '';
  for (const item of content) {
    if (isRecord(item) && item.type === 'text' && typeof item.text === 'string') {
      return item.text;
    }
  }
  return '';
}

/**
 * Normalize whatever a handler RETURNED into the standard error shape.
 *
 * The counterpart to catching what a handler throws. A package may build its
 * error results with its own helper, and normalizing on the way out means those
 * reach callers on the shared shape without the package having to adopt this
 * module directly:
 *
 *  - `isError: true` but no `structuredContent` gains a code, recovered from a
 *    `CODE: message` prefix when present.
 *  - A top-level `status_code >= 400` is promoted to a real `isError` result.
 *  - Anything else is passed through untouched.
 *
 * Deliberately conservative: it never guesses that a result is a failure from
 * the shape of its text. Detecting *that* is the job of `looksLikeUnflaggedError`,
 * which is advisory only.
 */
export function normalizeToolResult<T>(result: T): T | McpErrorResult {
  if (!isRecord(result)) return result;

  // Already flagged: make sure it carries a parseable code.
  if (result.isError === true) {
    if (isRecord(result.structuredContent) && result.structuredContent.error_code) {
      return result;
    }
    const text = firstText(result);
    const code = codeFromText(text) ?? McpErrorCode.INTERNAL;
    const status = typeof result.status_code === 'number' ? result.status_code : undefined;
    return {
      ...result,
      isError: true,
      structuredContent: {
        ...(isRecord(result.structuredContent) ? result.structuredContent : {}),
        error_code: code,
        error_message: text || 'Tool reported an error',
        ...(status !== undefined ? { upstream_status: status } : {}),
        retryable: RETRYABLE_CODES.has(code),
      },
    } as T & McpErrorResult;
  }

  // A status_code on the envelope is an explicit outcome signal; honour it.
  const statusCode = result.status_code;
  if (typeof statusCode === 'number' && statusCode >= 400) {
    const { code, retryable } = classifyHttpStatus(statusCode);
    const text = firstText(result);
    return {
      ...result,
      isError: true,
      structuredContent: {
        ...(isRecord(result.structuredContent) ? result.structuredContent : {}),
        error_code: code,
        error_message: text || `Request failed with status ${statusCode}`,
        upstream_status: statusCode,
        retryable,
      },
    } as T & McpErrorResult;
  }

  return result;
}

/**
 * Advisory check for a result that is not flagged as an error but whose text is
 * shaped like one.
 *
 * A heuristic, so it never changes behaviour — `CPMcpServer` only logs it, and
 * only when `CP_MCP_STRICT_ERRORS` is set. It is a development aid for spotting
 * handlers that describe a failure in text without flagging it, not a fix.
 */
export function looksLikeUnflaggedError(result: unknown): boolean {
  if (!isRecord(result) || result.isError === true) return false;
  const text = firstText(result).trim();
  if (!text || text.length > 4000) return false;

  if (codeFromText(text)) return true;

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (isRecord(parsed)) {
        if ('error' in parsed || 'errors' in parsed) return true;
        if (parsed.success === false) return true;
        if (typeof parsed.status_code === 'number' && parsed.status_code >= 400) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  return /^(error|failed|failure|exception|unable to|could not)\b/i.test(text);
}
