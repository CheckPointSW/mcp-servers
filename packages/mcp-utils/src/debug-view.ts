/**
 * Safe-to-print views of headers, arguments and settings for debug output.
 *
 * A value is printed only when its key is allowlisted; any other value is
 * shown as "(hidden, N chars)". The allowlist is the safe default: a key
 * nobody classified (a new argument, a new header) stays hidden.
 *
 * Has no package dependencies, so packages can use it without loading the
 * launcher.
 */

import { createHash } from 'node:crypto';

/**
 * Keys whose values are safe to print for every server: standard request
 * headers and the launcher's own options. mcp-session-id is deliberately
 * absent — whoever holds it can drive the session.
 */
const BUILTIN_LOGGABLE_KEYS = [
  'accept',
  'accept-encoding',
  'accept-language',
  'connection',
  'content-length',
  'content-type',
  'host',
  'mcp-protocol-version',
  'traceparent',
  'user-agent',
  'x-correlation-id',
  'x-gw-auth-method',
  'x-request-id',
  // Launcher options
  'debug',
  'telemetry',
  'telemetry-url',
  'transport',
  'transport-port',
];

/**
 * Normalize a header name, env var name or property name to one form, so
 * `MANAGEMENT-HOST`, `MANAGEMENT_HOST` and `managementHost` match the same
 * allowlist entry.
 */
export function normalizeDebugKey(key: string): string {
  // Split camelCase only in names without separators, so all-caps names such
  // as S1C-URL / S1C_URL are not split at the digit.
  const split = /[-_]/.test(key) ? key : key.replace(/([a-z][0-9]*)([A-Z])/g, '$1-$2');
  return split.replace(/_/g, '-').toLowerCase();
}

/** Build the allowlist from the built-in keys plus a server's own keys. */
export function debugLoggableKeys(extra: readonly string[] = []): Set<string> {
  return new Set([...BUILTIN_LOGGABLE_KEYS, ...extra].map(normalizeDebugKey));
}

function describe(key: string, value: unknown, loggable: Set<string>): string {
  if (value === undefined || value === null || value === '') return '(unset)';
  if (loggable.has(normalizeDebugKey(key))) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  const text = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : undefined;
  return text === undefined ? '(hidden)' : `(hidden, ${text.length} chars)`;
}

/**
 * Map each entry of `record` to a printable string: its value if the key is
 * allowlisted, otherwise "(hidden, N chars)" or "(unset)".
 */
export function debugView(
  record: Record<string, unknown> | null | undefined,
  loggable: Set<string> = debugLoggableKeys()
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [key, describe(key, value, loggable)])
  );
}

/**
 * A log label for an MCP session ID. The ID itself is never printed: whoever
 * holds it can drive the session, including its logged-in API manager. The
 * label is the first 8 hex characters of its SHA-256, stable for the session
 * so log lines can still be correlated. The stdio session's 'default' ID is
 * not secret and is kept as is.
 */
export function sessionLogLabel(sessionId: string | undefined): string {
  if (!sessionId || sessionId === 'default') return 'default';
  return `session#${createHash('sha256').update(sessionId).digest('hex').slice(0, 8)}`;
}
