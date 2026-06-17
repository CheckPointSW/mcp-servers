/**
 * SQLite connection cache (LRU, read-only) using the built-in node:sqlite module.
 * Requires Node >= 22.5.0.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { normalizePath, toSqliteUri } from './paths.js';

export const TIME_COL = 'Timestamp';

interface CacheEntry {
  con: DatabaseSync;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 8;

export function getConn(p: string): DatabaseSync {
  const norm = normalizePath(p);
  const existing = cache.get(norm);
  if (existing) {
    cache.delete(norm);
    cache.set(norm, existing);
    return existing.con;
  }
  if (!existsSync(norm)) {
    throw new Error(`could not open '${norm}': file not found`);
  }
  let con: DatabaseSync;
  try {
    con = new DatabaseSync(toSqliteUri(norm));
  } catch (e: any) {
    throw new Error(`could not open '${norm}': ${e?.message ?? e}`);
  }
  try {
    con.exec('PRAGMA temp_store = MEMORY');
    con.exec('PRAGMA mmap_size = 268435456');
  } catch {
    // tolerate pragma failures
  }
  cache.set(norm, { con });
  while (cache.size > MAX_CACHE) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (!firstKey) break;
    const entry = cache.get(firstKey);
    cache.delete(firstKey);
    try { entry?.con.close(); } catch { /* ignore */ }
  }
  return con;
}

export function listTables(con: DatabaseSync): string[] {
  const rows = con
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export function tableColumns(con: DatabaseSync, table: string): ColumnInfo[] {
  const safe = table.replace(/"/g, '');
  const rows = con.prepare(`PRAGMA table_info("${safe}")`).all() as Array<{
    name: string;
    type: string;
  }>;
  return rows.map((r) => ({ name: r.name, type: r.type }));
}

export function hasTable(con: DatabaseSync, table: string): boolean {
  const row = con
    .prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { x: number } | undefined;
  return !!row;
}

export function hasColumn(con: DatabaseSync, table: string, column: string): boolean {
  return tableColumns(con, table).some((c) => c.name === column);
}

const TIME_COL_CANDIDATES = ['Timestamp', 'timestamp', 'ts', 'time'];

export function timeColumn(con: DatabaseSync, table: string): string | null {
  const cols = tableColumns(con, table).map((c) => c.name);
  for (const cand of TIME_COL_CANDIDATES) {
    if (cols.includes(cand)) return cand;
  }
  return null;
}

export function detectTzOffsetSeconds(con: DatabaseSync): number | null {
  try {
    const row = con.prepare('SELECT * FROM TIMEZONE LIMIT 1').get() as Record<string, unknown> | undefined;
    if (!row) return null;
    const keys = Object.keys(row);
    for (let i = keys.length - 1; i >= 0; i--) {
      const v = row[keys[i]];
      if (typeof v === 'number' && Number.isInteger(v) && v >= -86400 && v <= 86400) {
        return v;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveRef(con: DatabaseSync, seq: number | null | undefined): string | null {
  if (typeof seq !== 'number' || !Number.isInteger(seq)) return null;
  try {
    const r = con.prepare('SELECT val FROM cpview_ref_table WHERE seq = ?').get(seq) as
      | { val: string }
      | undefined;
    return r ? r.val : null;
  } catch {
    return null;
  }
}

export function timeRange(con: DatabaseSync, table: string): [number | null, number | null] {
  const tc = timeColumn(con, table);
  if (!tc) return [null, null];
  try {
    const safe = table.replace(/"/g, '');
    const r = con
      .prepare(`SELECT MIN("${tc}") AS lo, MAX("${tc}") AS hi FROM "${safe}"`)
      .get() as { lo: number | null; hi: number | null } | undefined;
    if (!r) return [null, null];
    return [r.lo, r.hi];
  } catch {
    return [null, null];
  }
}

export function safeIdent(s: string): string {
  if (!s) throw new Error(`unsafe identifier: ${s}`);
  for (const ch of s) {
    const ok = (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '_' || ch === '.';
    if (!ok) throw new Error(`unsafe identifier: ${s}`);
  }
  return s;
}
