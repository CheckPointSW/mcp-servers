/**
 * Path resolution and optional directory confinement for caller-supplied file paths.
 */

import path from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * An error whose message was authored by this module (never derived from a
 * caught fs error), and is therefore always safe to surface to an MCP
 * caller verbatim — it never contains a filesystem path.
 */
export class SafePathError extends Error {}

interface RootsConfig {
  restricted: boolean;
  roots: string[];
}

let rootsCacheRaw: string | undefined;
let rootsCache: RootsConfig = { restricted: false, roots: [] };

function loadRootsConfig(): RootsConfig {
  const raw = process.env.CPINFO_ALLOWED_ROOTS;
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
      roots.push(realpathSync(path.resolve(candidate)));
    } catch {
      console.error(
        `[cpinfo-analysis-mcp] CPINFO_ALLOWED_ROOTS: root '${candidate}' is not accessible and will be ignored`
      );
    }
  }
  rootsCache = { restricted: true, roots };
  return rootsCache;
}

/** True if CPINFO_ALLOWED_ROOTS is configured (used by index.ts to warn when running unrestricted over HTTP). */
export function allowedRootsConfigured(): boolean {
  return loadRootsConfig().restricted;
}

// Walk up from `p` to the deepest existing ancestor, realpath *that* (resolving any
// symlinks in the existing part of the tree), then rejoin the non-existent tail.
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

/**
 * Resolve a caller-supplied file path to an absolute path, and — if
 * CPINFO_ALLOWED_ROOTS is configured — reject it if it (or any symlink it
 * passes through) resolves outside the configured roots.
 */
export function normalizePath(p: string): string {
  if (!p) throw new SafePathError('empty path');
  const raw = p.trim().replace(/^["']|["']$/g, '');
  const resolved = path.resolve(raw);
  assertWithinAllowedRoots(resolved);
  return resolved;
}

// Map a caught error to a short, generic reason. Never surface e.message
// directly here — fs errors routinely embed the absolute filesystem path
// they operated on (the internally-resolved path), and that must never
// reach an MCP caller. Only a fixed set of known-safe reasons, or a
// SafePathError message we authored ourselves, are allowed through.
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
 * Any failure — whether from resolution (including CPINFO_ALLOWED_ROOTS
 * confinement) or from `fn` itself — is reported using the caller's
 * original input, never the internally-resolved path. This is the
 * sanctioned way to touch a caller-supplied path; callers must not call
 * normalizePath() directly and then run filesystem operations outside this
 * wrapper, since any such operation's own error message may embed the
 * resolved path.
 *
 * Async by design (unlike cpview's synchronous equivalent): all of
 * cpinfo-analysis's filesystem access (fs.promises.open, etc.) is async, so
 * `fn`'s returned promise must itself be awaited inside the try/catch —
 * otherwise a rejection would propagate past this wrapper unsanitized.
 */
export async function withUserPath<T>(
  callerInput: string,
  fn: (resolved: string) => Promise<T>
): Promise<T> {
  let resolved: string;
  try {
    resolved = normalizePath(callerInput);
  } catch (e: any) {
    throw new Error(`could not resolve '${callerInput}': ${safeReason(e)}`);
  }
  try {
    return await fn(resolved);
  } catch (e: any) {
    throw new Error(`could not access '${callerInput}': ${safeReason(e)}`);
  }
}
