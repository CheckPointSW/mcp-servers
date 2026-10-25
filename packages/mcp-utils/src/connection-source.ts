/**
 * Where an HTTP session's connection settings come from.
 *
 * A server's settings split into two kinds:
 * - basic keys, listed by the settings class in a static `basicKeys`
 *   (tuning, logging, region selectors): these mix freely, a caller's header
 *   overriding the operator's value;
 * - everything else, the connection set (credentials, identity, tenant, auth
 *   flow, free-form destinations): this comes from one source only.
 *
 * The source is chosen once per session, from the request that creates it:
 * - 'caller' if the caller sent any connection-set header: the whole set
 *   comes from the caller's headers, and the operator's values are not used;
 * - 'operator' otherwise: the whole set comes from the operator's CLI/env
 *   values (unless the settings class opts out with
 *   `operatorSettingsOverHttp = false`).
 *
 * A setting known under two header names lists the alias in the class's
 * static `headerAliases` (alias -> canonical); aliases are renamed before
 * sources are compared, so precedence never depends on which spelling a
 * source used.
 *
 * Which headers belong to the connection set is not declared anywhere: it is
 * every header the class's fromHeaders reads that is not a basic key. A new
 * argument is therefore part of the connection set until someone lists it as
 * basic.
 */

import { normalizeDebugKey } from './debug-view.js';

export type ConnectionSource = 'caller' | 'operator';

export type HeaderRecord = Record<string, string | string[]>;

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' &&
    !(Array.isArray(value) && value.length === 0);
}

/**
 * The header names `fromHeaders` reads that carry a value. Runs `fromHeaders`
 * against a recording view of the headers; a failure (for example a settings
 * class that rejects missing credentials) is ignored, since only the reads
 * matter here.
 */
export function headersRead(
  fromHeaders: (headers: HeaderRecord) => unknown,
  headers: HeaderRecord
): Set<string> {
  const read = new Set<string>();
  const recording = new Proxy(headers, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === 'string' && hasValue(value)) read.add(prop);
      return value;
    },
  });
  try {
    fromHeaders(recording);
  } catch {
    // Only the reads matter.
  }
  return read;
}

/** Normalize a list of header names for membership checks. */
export function keySet(keys: readonly string[] = []): Set<string> {
  return new Set(keys.map(normalizeDebugKey));
}

/** 'caller' if any header read is outside the basic keys, else 'operator'. */
export function chooseConnectionSource(read: Iterable<string>, basicKeys: Set<string>): ConnectionSource {
  for (const key of read) {
    if (!basicKeys.has(normalizeDebugKey(key))) return 'caller';
  }
  return 'operator';
}

/** The entries of `headers` whose key is a basic key. */
export function basicOnly(headers: HeaderRecord, basicKeys: Set<string>): HeaderRecord {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => basicKeys.has(normalizeDebugKey(key)))
  );
}

/**
 * Overlay `overrides` on `base`. Keys match case-insensitively and in any of
 * their -/_ spellings, so an override replaces the base entry instead of
 * sitting next to it.
 */
export function mergeHeaders(base: HeaderRecord, overrides: HeaderRecord): HeaderRecord {
  const merged: HeaderRecord = {};
  const index = new Map<string, string>();
  for (const [key, value] of [...Object.entries(base), ...Object.entries(overrides)]) {
    const id = normalizeDebugKey(key);
    const previous = index.get(id);
    if (previous !== undefined) delete merged[previous];
    index.set(id, key);
    merged[key] = value;
  }
  return merged;
}

/**
 * The operator's values (environment variables and parsed CLI options, keyed
 * by environment-variable name) in header form: MANAGEMENT_HOST becomes
 * MANAGEMENT-HOST, the name fromHeaders reads.
 */
export function operatorHeaders(values: Record<string, unknown>): HeaderRecord {
  const headers: HeaderRecord = {};
  for (const [name, value] of Object.entries(values)) {
    if (!hasValue(value)) continue;
    headers[name.replace(/_/g, '-')] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return headers;
}

/**
 * Rename alias header names to their canonical name, so one setting has one
 * name before sources are compared or merged. `aliases` maps a normalized
 * alias to its canonical header name. When a record holds both the alias and
 * the canonical name, the canonical value wins.
 */
export function canonicalizeAliases(headers: HeaderRecord, aliases: Map<string, string>): HeaderRecord {
  if (aliases.size === 0) return headers;
  const canonical = new Set([...aliases.values()].map(normalizeDebugKey));
  const present = new Set(
    Object.keys(headers).map(normalizeDebugKey).filter((key) => canonical.has(key))
  );
  const result: HeaderRecord = {};
  for (const [key, value] of Object.entries(headers)) {
    const target = aliases.get(normalizeDebugKey(key));
    if (target === undefined) {
      result[key] = value;
    } else if (!present.has(normalizeDebugKey(target))) {
      result[target] = value;
      present.add(normalizeDebugKey(target));
    }
  }
  return result;
}

/** Build the alias map from a settings class's `headerAliases`. */
export function aliasMap(aliases: Readonly<Record<string, string>> = {}): Map<string, string> {
  return new Map(Object.entries(aliases).map(([alias, target]) => [normalizeDebugKey(alias), target]));
}

/**
 * The headers to build a session's settings from, given its source.
 */
export function sessionHeaders(
  source: ConnectionSource,
  callerHeaders: HeaderRecord,
  operator: HeaderRecord,
  basicKeys: Set<string>,
  operatorSettingsOverHttp: boolean
): HeaderRecord {
  if (source === 'caller') {
    return mergeHeaders(basicOnly(operator, basicKeys), callerHeaders);
  }
  const base = operatorSettingsOverHttp ? operator : basicOnly(operator, basicKeys);
  return mergeHeaders(base, basicOnly(callerHeaders, basicKeys));
}
