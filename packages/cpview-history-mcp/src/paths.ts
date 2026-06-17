/**
 * Cross-platform path normalization for Windows UNC, local, Linux.
 */

import path from 'node:path';
import os from 'node:os';

function expandUser(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function expandVars(p: string): string {
  return p.replace(/\$\{([^}]+)\}|\$(\w+)|%([^%]+)%/g, (m, a, b, c) => {
    const key = a || b || c;
    return process.env[key] ?? m;
  });
}

export function normalizePath(p: string): string {
  if (!p) throw new Error('empty path');
  let raw = p.trim().replace(/^["']|["']$/g, '');
  raw = expandUser(raw);
  raw = expandVars(raw);

  // Windows UNC normalization — preserve leading double-slash
  if (raw.startsWith('\\\\') || raw.startsWith('//')) {
    if (process.platform === 'win32') {
      raw = raw.replace(/\//g, '\\');
      raw = raw.replace(/^\\{2,}/, '\\\\');
    }
    return raw;
  }

  // Otherwise resolve to absolute path
  return path.resolve(raw);
}

export function isUnc(p: string): boolean {
  return p.startsWith('\\\\') || p.startsWith('//');
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
