/**
 * Cross-platform path normalization for Windows UNC, local, Linux.
 */

import path from 'node:path';
import os from 'node:os';
import { realpathSync } from 'node:fs';

function expandUser(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * An error whose message was authored by this module (never derived from a
 * caught fs/driver error), and is therefore always safe to surface to an
 * MCP caller verbatim — it never contains a filesystem path.
 */
export class SafePathError extends Error {}

interface RootsConfig {
  restricted: boolean;
  roots: string[];
}

let rootsCacheRaw: string | undefined;
let rootsCache: RootsConfig = { restricted: false, roots: [] };

function loadRootsConfig(): RootsConfig {
  const raw = process.env.CPVIEW_ALLOWED_ROOTS;
  if (raw === rootsCacheRaw) return rootsCache;
  rootsCacheRaw = raw;

  const candidates = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (candidates.length === 0) {
    rootsCache = { restricted: false, roots: [] };
    return rootsCache;
  }

  const roots: string[] = [];
  for (const candidate of candidates) {
    try {
      roots.push(realpathSync(path.resolve(expandUser(candidate))));
    } catch {
      console.error(
        `[cpview-history-mcp] CPVIEW_ALLOWED_ROOTS: root '${candidate}' is not accessible and will be ignored`
      );
    }
  }
  rootsCache = { restricted: true, roots };
  return rootsCache;
}

/** True if CPVIEW_ALLOWED_ROOTS is configured. */
export function allowedRootsConfigured(): boolean {
  return loadRootsConfig().restricted;
}

/**
 * Registered as the server's httpStartupCheck. HTTP transport serves every
 * connected caller from this one process, so it requires CPVIEW_ALLOWED_ROOTS to confine
 * their file access. Returns the reason to refuse, or null.
 */
export function httpStartupRefusal(): string | null {
  if (allowedRootsConfigured()) return null;
  return (
    'HTTP transport requires CPVIEW_ALLOWED_ROOTS: set it to a comma-separated list of ' +
    'absolute directories that tools may access.'
  );
}

// Walk up from `p` to the deepest existing ancestor, realpath *that* (resolving any
// symlinks in the existing part of the tree), then rejoin the non-existent tail.
// This lets confinement work for write targets (e.g. export_csv output) that don't
// exist yet, without ever falling back to trusting an un-canonicalized path.
function realpathDeepestExisting(p: string): string {
  let dir = p;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = realpathSync(dir);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (e: any) {
      if (e?.code !== 'ENOENT' && e?.code !== 'ENOTDIR') throw e;
      const parent = path.dirname(dir);
      if (parent === dir) return p;
      tail.push(path.basename(dir));
      dir = parent;
    }
  }
}

function isWithinRoot(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  // Check the leading path *component*, not a raw string prefix — a filename
  // like "..hidden-backup.txt" starts with the characters ".." but is not a
  // parent-directory escape, since path.relative's leading ".." components
  // are always their own full segment (either exactly '..' or '..' + sep).
  return rel.split(path.sep)[0] !== '..';
}

function assertWithinAllowedRoots(resolved: string): void {
  const cfg = loadRootsConfig();
  if (!cfg.restricted) return;
  const real = realpathDeepestExisting(resolved);
  const ok = cfg.roots.some((root) => isWithinRoot(real, root));
  if (!ok) throw new SafePathError('path is outside the allowed root directory');
}

export function normalizePath(p: string): string {
  if (!p) throw new SafePathError('empty path');
  let raw = p.trim().replace(/^["']|["']$/g, '');
  raw = expandUser(raw);

  let resolved: string;
  // Windows UNC normalization — preserve leading double-slash
  if (raw.startsWith('\\\\') || raw.startsWith('//')) {
    if (process.platform === 'win32') {
      raw = raw.replace(/\//g, '\\');
      raw = raw.replace(/^\\{2,}/, '\\\\');
    }
    resolved = raw;
  } else {
    // Otherwise resolve to absolute path
    resolved = path.resolve(raw);
  }

  assertWithinAllowedRoots(resolved);
  return resolved;
}

export function isUnc(p: string): boolean {
  return p.startsWith('\\\\') || p.startsWith('//');
}

// Map a caught error to a short, generic reason. Never surface e.message
// directly here — fs and driver errors routinely embed the absolute
// filesystem path they operated on (the internally-resolved path), and that
// must never reach an MCP caller. Only a fixed set of known-safe reasons,
// or a SafePathError message we authored ourselves, are allowed through.
function safeReason(e: any): string {
  if (e instanceof SafePathError) return e.message;
  switch (e?.code) {
    case 'ENOENT': return 'file not found';
    case 'EACCES':
    case 'EPERM': return 'permission denied';
    case 'ENOTDIR': return 'not a directory';
    case 'EISDIR': return 'is a directory';
    case 'ELOOP': return 'too many symbolic links';
    case 'ENAMETOOLONG': return 'path too long';
  }
  return 'operation failed';
}

/**
 * Resolve a caller-supplied path and run `fn` against the resolved value.
 * Any failure — whether from resolution (including CPVIEW_ALLOWED_ROOTS
 * confinement) or from `fn` itself — is reported using the caller's
 * original input, never the internally-resolved path. This is the
 * sanctioned way to touch a caller-supplied path; callers must not call
 * normalizePath() directly and then run filesystem/driver operations
 * outside this wrapper, since any such operation's own error message may
 * embed the resolved path. Throw a SafePathError from within `fn` for a
 * specific, caller-safe reason (e.g. "file not found") instead of a
 * generic Error.
 */
export function withUserPath<T>(callerInput: string, fn: (resolved: string) => T): T {
  let resolved: string;
  try {
    resolved = normalizePath(callerInput);
  } catch (e: any) {
    throw new Error(`could not resolve '${callerInput}': ${safeReason(e)}`);
  }
  try {
    return fn(resolved);
  } catch (e: any) {
    throw new Error(`could not access '${callerInput}': ${safeReason(e)}`);
  }
}

export interface ToSqliteUriOptions {
  immutable?: boolean;
}

export function toSqliteUri(p: string, opts: ToSqliteUriOptions = {}): string {
  const immutable = opts.immutable !== false;
  const norm = normalizePath(p);
  let uriPath = norm.replace(/\\/g, '/');
  // Windows drive letters become /C:/...
  if (/^[A-Za-z]:\//.test(uriPath)) {
    uriPath = '/' + uriPath;
  }
  uriPath = uriPath.replace(/\?/g, '%3F').replace(/#/g, '%23');
  let params = 'mode=ro';
  if (immutable) params += '&immutable=1';
  return `file:${uriPath}?${params}`;
}

export function looksLikeCpviewDb(p: string): boolean {
  const name = path.basename(p).toLowerCase();
  return name.endsWith('.dat') && (name.includes('cpview') || name.endsWith('cpviewdb.dat'));
}

/**
 * Heuristic: extract gateway hostname from a CPViewDB filename like
 * '<hostname>_<d>_<m>_<yyyy>_<hh>_<mm>.CPViewDB.dat'.
 */
export function gatewayNameFromFilename(p: string): string | null {
  const name = path.basename(p);
  let base = name.replace(/\.CPViewDB\.dat$/i, '');
  base = base.replace(/\.dat$/i, '');
  const m = base.match(/^(.+?)_\d+_\d+_\d{4}_\d+_\d+$/);
  if (m) return m[1];
  return base || null;
}
