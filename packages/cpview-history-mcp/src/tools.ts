/**
 * Tool registration for cpview-history-mcp.
 *
 * All 24 tools port the Python implementation in src/cpview_mcp/server.py.
 * Returns are JSON-encoded plain objects wrapped in MCP text content.
 */

import { z } from 'zod';
import type { DatabaseSync as Database } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { CPMcpServer } from '@chkp/mcp-utils';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import * as A from './aliases.js';
import * as ANL from './analysis.js';
import * as D from './db.js';
import * as E from './envelope.js';
import * as P from './paths.js';
import * as T from './timeutil.js';

interface McpContent {
  type: 'text';
  text: string;
}

interface ToolResult {
  content: McpContent[];
}

// Shape of an AVG/MAX aggregate row; SQLite returns null for both on empty tables.
interface AvgMaxRow {
  avg: number | null;
  max: number | null;
}

function asResult(data: any): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, jsonReplacer, 2) }],
  };
}

// Replace BigInt with Number for JSON serialization (node:sqlite yields BigInt for large integers)
function jsonReplacer(_key: string, value: any): any {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

function errPayload(message: string, extra: Record<string, any> = {}): Record<string, any> {
  return { error: message, ...extra };
}

/** Structured per-tool debug log → stderr → VSCode Output panel */
// Respects LOG_LEVEL env var: "debug" = all logs, "info" = tool-level only (withLog),
// "warn"/"error" = suppress inner logs entirely. Default is "info".
const _logLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const _innerLogsEnabled = _logLevel === 'debug';

/** Per-tool internal log — only emitted when LOG_LEVEL=debug */
function log(tool: string, msg: string): void {
  if (_innerLogsEnabled) console.error(`[cpview:${tool}] ${msg}`);
}

function maybeSuggestTable(con: Database, name: string): Record<string, any> {
  const s = A.suggest(name, A.knownTables(con));
  return s.length > 0 ? { did_you_mean: s } : {};
}

function maybeSuggestColumn(con: Database, table: string, col: string): Record<string, any> {
  const s = A.suggest(col, A.knownColumns(con, table));
  return s.length > 0 ? { did_you_mean: s } : {};
}

function resolveTimePair(
  start: T.TimeLike,
  end: T.TimeLike,
  con: Database | null,
  table: string | null,
): [number, number] {
  if (start == null || end == null) {
    if (!con || !table) throw new Error('start and end required');
    const [tmin, tmax] = D.timeRange(con, table);
    if (start == null) start = tmin;
    if (end == null) end = tmax;
  }
  return [T.parseTime(start), T.parseTime(end)];
}

function open(p: string): Database {
  return D.getConn(p);
}

function columnsForTable(con: Database, table: string): string[] {
  return D.tableColumns(con, table).map((c) => c.name);
}

function rowsToDicts(rows: any[]): Record<string, any>[] {
  // node:sqlite .all() returns plain objects; copy to detach from the statement
  return rows.map((r) => ({ ...r }));
}

const AGG_SQL: Record<string, (c: string) => string> = {
  avg: (c) => `AVG("${c}")`,
  min: (c) => `MIN("${c}")`,
  max: (c) => `MAX("${c}")`,
  sum: (c) => `SUM("${c}")`,
  count: (c) => `COUNT("${c}")`,
};

function aggSql(agg: string, col: string): string {
  const fn = AGG_SQL[agg];
  if (!fn) throw new Error(`unsupported agg: '${agg}'`);
  return fn(col);
}

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|BEGIN|COMMIT|ROLLBACK)\b/i;

// `where` fragments are spliced into SQL text (column expressions can't be bound as
// parameters), so they get a stricter denylist than full SELECT statements: no
// subqueries (SELECT), no compound operators (UNION/INTERSECT/EXCEPT), and no
// sqlite_* internal schema tables.
const FORBIDDEN_WHERE_KEYWORDS = /\b(SELECT|UNION|INTERSECT|EXCEPT)\b|\bsqlite_/i;

// Returns an error message, or null if the fragment is acceptable.
export function validateWhereFragment(where: string): string | null {
  if (where.includes(';') || where.includes('--') || where.includes('/*')) {
    return 'disallowed token in `where`';
  }
  if (FORBIDDEN_KEYWORDS.test(where) || FORBIDDEN_WHERE_KEYWORDS.test(where)) {
    return 'forbidden keyword in `where`';
  }
  return null;
}

// Intentionally allows sqlite_master introspection and UNION/cross-table reads:
// sql_read is a read-only escape hatch over a caller-supplied file opened with
// immutable=1, so there is no privilege boundary between tables in the same file.
function validateSelect(sqlIn: string | null | undefined): string | { error: string } {
  if (!sqlIn || !sqlIn.trim()) return { error: 'empty sql' };
  let s = sqlIn.trim();
  if (s.endsWith(';')) s = s.slice(0, -1).trim();
  if (s.includes(';')) return { error: 'only a single statement is allowed' };
  if (!/^\s*(SELECT|WITH)\b/i.test(s)) return { error: 'only SELECT/WITH allowed' };
  if (FORBIDDEN_KEYWORDS.test(s)) return { error: 'forbidden keyword in sql' };
  return s;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const dx = Math.sqrt(dx2);
  const dy = Math.sqrt(dy2);
  if (dx === 0 || dy === 0) return null;
  return num / (dx * dy);
}

// Hotspot-style metric set — defined below alongside KNOWN_FK_COLUMNS so they're co-located.
// See HOTSPOT_METRICS_EXPORT for the testable exported reference.

// Columns known to store cpview_ref_table seq IDs (integer foreign keys).
// Exported so tests can verify membership without duplicating the list.
export const KNOWN_FK_COLUMNS = new Set([
  'if_name', 'device', 'device_name', 'disk_path', 'top_proc_name',
  'os_info', 'cluster_status', 'cp_ver_info', 'configuration_info',
  'um_fw_branch_name', 'um_accel_branch_name', 'um_adpdrv_branch_name',
  'um_sim_branch_name', 'usfw_status',
]);

// Exported for testing: derive prefix-group breakdown from a list of table names.
// Used by toolInspectDatabase to make uncategorized tables navigable.
export function buildPrefixGroups(tableNames: string[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const t of tableNames) {
    const prefix = t.split('_')[0].toLowerCase();
    groups[prefix] = (groups[prefix] ?? 0) + 1;
  }
  return groups;
}

// Hotspot metric definitions with sustained-high thresholds.
// Exported so tests can verify thresholds without duplicating values.
// Tables that don't exist in a given DB are silently skipped at runtime.
export const HOTSPOT_METRICS_EXPORT: Array<{ table: string; column: string; sustained_high_threshold?: number }> = [
  // ── Core system ─────────────────────────────────────────────────────────────
  { table: 'UM_STAT_UM_CPU_UM_CPU_TABLE',        column: 'cpu_usage',                  sustained_high_threshold: 60  }, // 60% sustained = concerning on a firewall
  { table: 'UM_STAT_UM_SYSTEM',                  column: 'load_average',                sustained_high_threshold: 3   }, // load > 3 = noticeable pressure
  { table: 'UM_STAT_UM_MEMORY',                  column: 'real_used'                                                  }, // Z-score only — no universal threshold
  { table: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE',  column: 'util',                        sustained_high_threshold: 50  }, // 50% sustained disk util = contention
  { table: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE',  column: 'await',                       sustained_high_threshold: 50  }, // 50ms average await = slow disk
  // ── Firewall kernel memory ───────────────────────────────────────────────────
  { table: 'fw_memory',                          column: 'used_virt_mem_percentage',     sustained_high_threshold: 80  }, // VM % > 80 = memory pressure
  { table: 'fw_memory',                          column: 'used_kernel_mem_percentage',   sustained_high_threshold: 80  }, // kernel mem > 80 = risk of kmem exhaustion
  // ── Connections / packet path ────────────────────────────────────────────────
  { table: 'fw_network_stats',                   column: 'total_concurrent_conns'                                      }, // connection table size — Z-score for spike
  { table: 'fw_network_stats',                   column: 'total_conn_rate'                                             }, // new conns/sec — Z-score for storm
  { table: 'fw_network_stats',                   column: 'slow_path_pkts_percent',       sustained_high_threshold: 20  }, // >20% slow path = SecureXL not accelerating
  // ── Network interface errors ─────────────────────────────────────────────────
  { table: 'UM_STAT_UM_HW_UM_IF_ERR_STATISTICS_TABLE', column: 'if_rx_drops'                                          }, // RX drops — any spike is anomalous
  { table: 'UM_STAT_UM_HW_UM_IF_ERR_STATISTICS_TABLE', column: 'if_rx_errors'                                         }, // RX errors — any spike is anomalous
];
// Internal alias used by toolFindHotspots
const HOTSPOT_METRICS = HOTSPOT_METRICS_EXPORT;

function resolveRowFKs(con: Database, rows: Record<string, any>[]): Record<string, any>[] {
  if (rows.length === 0) return rows;
  const fkCols = Object.keys(rows[0]).filter(
    (k) => KNOWN_FK_COLUMNS.has(k) && typeof rows[0][k] === 'number' && Number.isInteger(rows[0][k]),
  );
  if (fkCols.length === 0) return rows;
  const allSeqs = new Set<number>();
  for (const row of rows) {
    for (const col of fkCols) {
      const v = row[col];
      if (typeof v === 'number' && Number.isInteger(v)) allSeqs.add(v);
    }
  }
  const refMap = ANL.resolveSeqMap(con, Array.from(allSeqs));
  if (refMap.size === 0) return rows;
  return rows.map((row) => {
    const out = { ...row };
    for (const col of fkCols) {
      const v = row[col];
      if (typeof v === 'number' && refMap.has(v)) out[col] = refMap.get(v);
    }
    return out;
  });
}

function parseUptimeSecs(s: string): number | null {
  if (!s || typeof s !== 'string') return null;
  const dayMatch = s.match(/^(\d+)\s+days?,\s*(\d+):(\d+):(\d+)/);
  if (dayMatch) {
    return (
      parseInt(dayMatch[1]) * 86400 +
      parseInt(dayMatch[2]) * 3600 +
      parseInt(dayMatch[3]) * 60 +
      parseInt(dayMatch[4])
    );
  }
  const timeMatch = s.match(/^(\d+):(\d+):(\d+)/);
  if (timeMatch) {
    return parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
  }
  return null;
}

function mdTable(headers: string[], rows: any[][]): string {
  if (rows.length === 0) return '_(no rows)_';
  const out: string[] = [];
  out.push('| ' + headers.join(' | ') + ' |');
  out.push('| ' + headers.map(() => '---').join(' | ') + ' |');
  for (const r of rows) {
    out.push('| ' + r.map((c) => (c === null || c === undefined ? '' : String(c))).join(' | ') + ' |');
  }
  return out.join('\n');
}

// Recursive scan of a directory for files matching a predicate
function rgScan(root: string, maxDepth: number, depth = 0): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (depth < maxDepth) {
        results.push(...rgScan(full, maxDepth, depth + 1));
      }
    } else if (ent.isFile()) {
      const lower = ent.name.toLowerCase();
      if (lower.endsWith('.dat') && lower.includes('cpview')) {
        results.push(full);
      }
    }
  }
  return results;
}

// ===================================================================
// Tool implementations as plain functions (so they can be called
// from each other for composition, e.g. investigate_window).
// ===================================================================

function toolListCpviewFiles(folder: string, maxDepth = 6): Record<string, any> {
  let root: string;
  try {
    root = P.normalizePath(folder);
  } catch (e: any) {
    return errPayload(`bad folder: ${e?.message ?? e}`);
  }
  if (!fs.existsSync(root)) return errPayload(`folder not found: ${root}`);
  const files = rgScan(root, maxDepth);
  const results: Array<Record<string, any>> = [];
  for (const p of files) {
    const info: Record<string, any> = {
      path: p,
      size: null,
      gateway: P.gatewayNameFromFilename(p),
    };
    try {
      info.size = fs.statSync(p).size;
    } catch {
      // ignore
    }
    try {
      const con = open(p);
      let tmin: number | null = null;
      let tmax: number | null = null;
      try {
        const r = con.prepare('SELECT MIN(Timestamp) AS lo, MAX(Timestamp) AS hi FROM UM_STAT_UM_CPU').get() as
          | { lo: number | null; hi: number | null }
          | undefined;
        if (r) {
          tmin = r.lo;
          tmax = r.hi;
        }
      } catch {
        // ignore
      }
      info.time_range = {
        start_epoch: tmin,
        end_epoch: tmax,
        start_iso: tmin ? T.toIso(tmin) : null,
        end_iso: tmax ? T.toIso(tmax) : null,
      };
    } catch (e: any) {
      info.error = String(e?.message ?? e);
    }
    results.push(info);
  }
  return { folder: root, count: results.length, files: results };
}

export function toolInspectDatabase(p: string): Record<string, any> {
  let norm: string;
  let con: Database;
  try {
    norm = P.normalizePath(p);
    con = open(norm);
  } catch (e: any) {
    return errPayload(String(e?.message ?? e), { path: p });
  }
  const out: Record<string, any> = { path: norm, gateway: P.gatewayNameFromFilename(norm) };
  try {
    out.size_bytes = fs.statSync(norm).size;
  } catch {
    // ignore
  }
  const tables = D.listTables(con);
  out.table_count = tables.length;
  let tminAll: number | null = null;
  let tmaxAll: number | null = null;
  for (const cand of ['UM_STAT_UM_CPU', 'UM_STAT_UM_SYSTEM', 'TIMEZONE']) {
    if (tables.includes(cand)) {
      const [lo, hi] = D.timeRange(con, cand);
      tminAll = lo;
      tmaxAll = hi;
      if (tminAll && tmaxAll) break;
    }
  }
  out.time_coverage = {
    start_epoch: tminAll,
    end_epoch: tmaxAll,
    start_iso: tminAll ? T.toIso(tminAll) : null,
    end_iso: tmaxAll ? T.toIso(tmaxAll) : null,
    duration_seconds: tminAll && tmaxAll ? tmaxAll - tminAll : null,
  };
  out.timezone_offset_seconds = D.detectTzOffsetSeconds(con);
  const headline: Record<string, any> = {};
  try {
    const r = con.prepare('SELECT AVG(cpu_usage) AS avg, MAX(cpu_usage) AS max FROM UM_STAT_UM_CPU_UM_CPU_TABLE').get() as AvgMaxRow | undefined;
    if (r) headline.cpu_per_core = { avg: r.avg, max: r.max };
  } catch {
    // ignore
  }
  try {
    const r = con.prepare('SELECT AVG(load_average) AS avg, MAX(load_average) AS max FROM UM_STAT_UM_SYSTEM').get() as AvgMaxRow | undefined;
    if (r) headline.load_average = { avg: r.avg, max: r.max };
  } catch {
    // ignore
  }
  try {
    const r = con
      .prepare(
        'SELECT AVG(real_used*1.0/real_total) AS avg, MAX(real_used*1.0/real_total) AS max FROM UM_STAT_UM_MEMORY WHERE real_total > 0',
      )
      .get() as AvgMaxRow | undefined;
    if (r) headline.memory_used_ratio = { avg: r.avg, max: r.max };
  } catch {
    // ignore
  }
  out.headline = headline;
  const byCat: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const [cat, tlist] of Object.entries(A.CATEGORIES)) {
    const present = tlist.filter((t) => tables.includes(t));
    byCat[cat] = present;
    for (const t of present) seen.add(t);
  }
  const otherAll = tables.filter((t) => !seen.has(t)).sort();
  const prefixGroups = buildPrefixGroups(otherAll);
  // Only show 3 sample names — enough to illustrate naming convention.
  // Prefix groups + search_schema/find_tables are the real discovery path.
  byCat.other = otherAll.slice(0, 3);
  out.tables_by_category = byCat;
  out.other_total_count = otherAll.length;
  out.other_prefix_groups = prefixGroups; // e.g. { ppak: 60, ida: 39, dlp: 11 }
  out.search_hint = `${otherAll.length} uncategorized tables across ${Object.keys(prefixGroups).length} domain prefixes. ` +
    `Use search_schema(path, prefix) to list tables in a domain (e.g. 'ppak', 'ida', 'dlp'), ` +
    `or find_tables(path, description) to discover tables by concept (e.g. 'dropped packets', 'BGP peers').`;
  out.next_steps = [
    'find_tables(path, query) — semantic table discovery: describe the concept, get ranked relevant tables (e.g. "HA failover", "BGP routing", "per-process CPU")',
    'search_schema(path, keyword) — find a specific column name within a known table or domain',
    "aggregate(path, 'UM_STAT_UM_CPU_UM_CPU_TABLE', ['cpu_usage'], start, end) — CPU time series",
    'find_hotspots(path, start, end) — auto-detect the most anomalous moments across all metrics',
    'find_system_events(path, start, end) — detect OS reboots and HA state changes / failovers',
    'investigate_window(path, center_time) — one-call deep investigation around an incident timestamp',
  ];
  // Add HA cluster semantic context when relevant tables are present
  if (tables.includes('cxl_cxl_stats') || tables.includes('cxl_cxl_stats_status')) {
    const haCtx: Record<string, any> = {
      is_cluster_member: true,
      authoritative_local_state: {
        table: 'cxl_cxl_stats',
        column: 'fwha_cpv_last_state_change',
        note: 'Reflects the local fwha state machine — what cphaprob state would print, including ACTIVE(!) degraded flag. Use this for all state analysis.',
      },
      ccp_membership_view: {
        table: 'cxl_cxl_stats_status',
        column: 'member_state',
        warning: 'Reflects CCP membership cache. May show ACTIVE for a member that is locally DOWN. Do NOT use for authoritative local state analysis.',
      },
    };
    // Sample latest authoritative state
    if (tables.includes('cxl_cxl_stats') && D.hasColumn(con, 'cxl_cxl_stats', 'fwha_cpv_last_state_change')) {
      try {
        const latest = con.prepare(
          'SELECT fwha_cpv_last_state_change FROM cxl_cxl_stats ORDER BY Timestamp DESC LIMIT 1'
        ).get() as { fwha_cpv_last_state_change: string } | undefined;
        if (latest) haCtx.latest_local_state = latest.fwha_cpv_last_state_change;
      } catch { /* ignore */ }
    }
    // Check for state mismatch (sample last 100 rows to detect discrepancy quickly)
    if (
      tables.includes('cxl_cxl_stats') &&
      tables.includes('cxl_cxl_stats_status') &&
      D.hasColumn(con, 'cxl_cxl_stats', 'fwha_cpv_last_state_change')
    ) {
      try {
        // Get a sample of rows from cxl_cxl_stats where state is not ACTIVE
        const nonActive = con.prepare(
          `SELECT COUNT(*) AS c FROM cxl_cxl_stats WHERE fwha_cpv_last_state_change != 'ACTIVE'`
        ).get() as { c: number } | undefined;
        const statusActive = con.prepare(
          `SELECT COUNT(*) AS c FROM cxl_cxl_stats_status WHERE member_state = 'ACTIVE' AND member_id LIKE '%(local)%'`
        ).get() as { c: number } | undefined;
        if (nonActive && statusActive && nonActive.c > 0 && statusActive.c > 0) {
          haCtx.state_mismatch_warning =
            `cxl_cxl_stats shows ${nonActive.c} rows where the local member is NOT 'ACTIVE', ` +
            `but cxl_cxl_stats_status shows ${statusActive.c} rows where member_state='ACTIVE'. ` +
            `The cxl_cxl_stats.fwha_cpv_last_state_change column is authoritative — ` +
            `run find_system_events() to see the full state timeline.`;
        }
      } catch { /* ignore */ }
    }
    out.ha_context = haCtx;
  }
  log('inspect_database', `gateway=${out.gateway}  tables=${tables.length}  other=${otherAll.length}  prefixes=[${Object.entries(prefixGroups).map(([k,v])=>`${k}:${v}`).join(',')}]  window=${out.time_coverage.start_iso}→${out.time_coverage.end_iso}`);
  return out;
}

function toolSearchSchema(p: string, keyword: string, limit = 30): Record<string, any> {
  let con: Database;
  try {
    con = open(p);
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
  const kw = keyword.toLowerCase();
  const tables = D.listTables(con);
  const hits: Array<Record<string, any>> = [];
  for (const t of tables) {
    let score = 0;
    if (t.toLowerCase().includes(kw)) score += 2;
    const cols = D.tableColumns(con, t);
    const colHits = cols.filter((c) => c.name.toLowerCase().includes(kw)).map((c) => c.name);
    if (colHits.length > 0) score += 1 + Math.min(colHits.length, 3);
    if (score === 0) continue;
    let sample: Record<string, any> | null = null;
    try {
      const row = con.prepare(`SELECT * FROM "${t}" LIMIT 1`).get() as any;
      if (row) sample = row;
    } catch {
      // ignore
    }
    hits.push({ table: t, score, matching_columns: colHits, sample });
  }
  hits.sort((a, b) => b.score - a.score);
  log('search_schema', `kw=${keyword}  matches=${hits.length}`);
  return { keyword, total: hits.length, results: hits.slice(0, limit) };
}

function toolTimeConvert(value: string, tz?: string | null): Record<string, any> {
  try {
    const epoch = T.parseTime(value);
    return {
      input: value,
      epoch,
      iso_utc: T.toIso(epoch),
      iso_tz: tz ? T.toIso(epoch, tz) : null,
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e), { input: value });
  }
}

function toolQueryRange(
  p: string,
  table: string,
  start: T.TimeLike,
  end: T.TimeLike,
  columns: string[] | null,
  where: string | null,
  limit: number,
  cursor: T.TimeLike,
  order: string,
  resolveNames: boolean,
): Record<string, any> {
  try {
    const con = open(p);
    if (!D.hasTable(con, table)) {
      return errPayload(`unknown table '${table}'`, maybeSuggestTable(con, table));
    }
    const tcol = D.timeColumn(con, table);
    if (!tcol) return errPayload(`table '${table}' has no Timestamp column`);
    const [startE, endE] = resolveTimePair(start, end, con, table);
    const allCols = columnsForTable(con, table);
    let selectCols: string[];
    if (columns && columns.length > 0) {
      const bad = columns.filter((c) => !allCols.includes(c));
      if (bad.length > 0) {
        return errPayload(`unknown columns: ${JSON.stringify(bad)}`, maybeSuggestColumn(con, table, bad[0]));
      }
      selectCols = columns.map((c) => D.safeIdent(c));
    } else {
      selectCols = allCols;
    }

    // Parse cursor — supports plain epoch (legacy) or compound "epoch:rowid" (stable paging)
    let curTs: number | null = null;
    let curRowid: number | null = null;
    if (cursor != null) {
      const s = String(cursor);
      const compound = s.match(/^(\d+):(\d+)$/);
      if (compound) {
        curTs = Number(compound[1]);
        curRowid = Number(compound[2]);
      } else {
        curTs = T.parseTime(cursor);
      }
    }

    const sel = `rowid AS _rowid_, ${selectCols.map((c) => `"${c}"`).join(', ')}`;
    let sql = `SELECT ${sel} FROM "${D.safeIdent(table)}" WHERE "${tcol}" BETWEEN ? AND ?`;
    const params: number[] = [startE, endE];
    if (curTs !== null && curRowid !== null) {
      // Compound cursor: stable even when multiple rows share the same timestamp
      if (order === 'asc') {
        sql += ` AND ("${tcol}" > ? OR ("${tcol}" = ? AND rowid > ?))`;
      } else {
        sql += ` AND ("${tcol}" < ? OR ("${tcol}" = ? AND rowid < ?))`;
      }
      params.push(curTs, curTs, curRowid);
    } else if (curTs !== null) {
      // Legacy plain-timestamp cursor (backward compat — still skips ties but won't break old callers)
      const op = order === 'asc' ? '>' : '<';
      sql += ` AND "${tcol}" ${op} ?`;
      params.push(curTs);
    }
    if (where) {
      const whereErr = validateWhereFragment(where);
      if (whereErr) return errPayload(whereErr);
      sql += ` AND (${where})`;
    }
    sql += ` ORDER BY "${tcol}" ${order === 'asc' ? 'ASC' : 'DESC'}, rowid ${order === 'asc' ? 'ASC' : 'DESC'} LIMIT ?`;
    params.push(limit + 1);
    const rows = con.prepare(sql).all(...params) as any[];
    const truncated = rows.length > limit;
    const trimmed = rows.slice(0, limit);
    // Build compound next_cursor and strip internal _rowid_ from output
    let nextCursor: string | null = null;
    if (truncated && trimmed.length > 0) {
      const last = trimmed[trimmed.length - 1] as any;
      nextCursor = `${last[tcol]}:${last._rowid_}`;
    }
    const dicts = rowsToDicts(trimmed.map((r: any) => { const { _rowid_: _, ...rest } = r; return rest; }));
    const resolvedRows = resolveNames ? resolveRowFKs(con, dicts) : dicts;
    log('query_range', `table=${table}  rows=${resolvedRows.length}  truncated=${truncated}  resolve_names=${resolveNames}`);
    return {
      table,
      columns: selectCols,
      rows: resolvedRows,
      count: resolvedRows.length,
      truncated,
      next_cursor: nextCursor,
      hint: truncated ? 'Pass next_cursor as `cursor` to fetch the next page.' : null,
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolAggregate(
  p: string,
  table: string,
  columns: string[],
  start: T.TimeLike,
  end: T.TimeLike,
  bucket: string | number | null,
  agg: string,
  groupBy: string | null,
  limit: number,
): Record<string, any> {
  try {
    const con = open(p);
    if (!D.hasTable(con, table)) {
      return errPayload(`unknown table '${table}'`, maybeSuggestTable(con, table));
    }
    const tcol = D.timeColumn(con, table);
    if (!tcol) return errPayload(`table '${table}' has no Timestamp column`);
    const [startE, endE] = resolveTimePair(start, end, con, table);
    const bucketS = T.parseBucket(bucket, { start: startE, end: endE });
    const allCols = columnsForTable(con, table);
    const bad = columns.filter((c) => !allCols.includes(c));
    if (bad.length > 0) {
      return errPayload(`unknown columns: ${JSON.stringify(bad)}`, maybeSuggestColumn(con, table, bad[0]));
    }
    if (groupBy && !allCols.includes(groupBy)) {
      return errPayload(`unknown group_by '${groupBy}'`, maybeSuggestColumn(con, table, groupBy));
    }
    D.safeIdent(table);
    columns.forEach((c) => D.safeIdent(c));
    if (groupBy) D.safeIdent(groupBy);

    const bucketExpr = `(("${tcol}" - ?)/${bucketS})*${bucketS} + ?`;
    const selectParts: string[] = [`${bucketExpr} AS bucket_start`];
    if (groupBy) selectParts.push(`"${groupBy}" AS grp`);
    for (const c of columns) {
      selectParts.push(`${aggSql(agg, c)} AS "${c}"`);
    }
    selectParts.push('COUNT(*) AS n');
    const sel = selectParts.join(', ');
    const groupCols = ['bucket_start'].concat(groupBy ? ['grp'] : []);
    const sql =
      `SELECT ${sel} FROM "${table}" WHERE "${tcol}" BETWEEN ? AND ? ` +
      `GROUP BY ${groupCols.join(', ')} ORDER BY bucket_start ASC, ${groupBy ? 'grp' : 'bucket_start'} LIMIT ?`;
    const params = [startE, startE, startE, endE, limit + 1];
    const rows = con.prepare(sql).all(...params) as any[];
    const truncated = rows.length > limit;
    const trimmed = rows.slice(0, limit);
    let points = rowsToDicts(trimmed);
    // Resolve integer FK seqs to human-readable names when group_by is an FK column
    let groupByResolved = false;
    if (groupBy && KNOWN_FK_COLUMNS.has(groupBy)) {
      const seqs = points.map((r: any) => r.grp).filter((v: any) => typeof v === 'number' && Number.isInteger(v)) as number[];
      if (seqs.length > 0) {
        const refMap = ANL.resolveSeqMap(con, seqs);
        if (refMap.size > 0) {
          points = points.map((r: any) => ({
            ...r,
            grp: refMap.has(r.grp) ? refMap.get(r.grp) : r.grp,
          }));
          groupByResolved = true;
        }
      }
    }
    log('aggregate', `table=${table}  group_by=${groupBy ?? 'none'}  rows=${points.length}  fk_resolved=${groupByResolved}`);
    return {
      table,
      columns,
      agg,
      bucket_seconds: bucketS,
      group_by: groupBy,
      group_by_resolved: groupByResolved,
      start_epoch: startE,
      end_epoch: endE,
      points,
      count: points.length,
      truncated,
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolSnapshotAt(
  p: string,
  timestamp: T.TimeLike,
  tables: string[] | null,
  toleranceSeconds: number,
): Record<string, any> {
  try {
    const con = open(p);
    const ts = T.parseTime(timestamp);
    const all = new Set(D.listTables(con));
    let tableList = tables;
    if (!tableList || tableList.length === 0) {
      tableList = ['UM_STAT_UM_CPU', 'UM_STAT_UM_SYSTEM', 'UM_STAT_UM_MEMORY', 'UM_STAT_UM_DISK_UM_DISK_TABLE'].filter((t) =>
        all.has(t),
      );
    }
    const result: Record<string, any> = { timestamp: ts, tolerance_seconds: toleranceSeconds, tables: {} };
    for (const t of tableList) {
      if (!all.has(t)) {
        result.tables[t] = { error: 'missing' };
        continue;
      }
      const tcol = D.timeColumn(con, t);
      if (!tcol) {
        result.tables[t] = { error: 'no Timestamp' };
        continue;
      }
      D.safeIdent(t);
      const sql =
        `SELECT *, ABS("${tcol}" - ?) AS _d FROM "${t}" ` +
        `WHERE "${tcol}" BETWEEN ? AND ? ORDER BY _d ASC LIMIT 5`;
      const rows = con.prepare(sql).all(ts, ts - toleranceSeconds, ts + toleranceSeconds) as any[];
      result.tables[t] = { rows: rowsToDicts(rows), count: rows.length };
    }
    log('snapshot_at', `ts=${T.toIso(ts)}  tables_requested=${tableList.length}  tables_found=${Object.keys(result.tables).filter(k => !result.tables[k].error).length}`);
    return result;
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolFindEvents(
  p: string,
  table: string,
  column: string,
  start: T.TimeLike,
  end: T.TimeLike,
  mode: string,
  topN: number,
  minGap: number,
  threshold: number | null,
  op: string,
  zscore: number,
): Record<string, any> {
  try {
    const con = open(p);
    if (!D.hasTable(con, table)) return errPayload(`unknown table '${table}'`, maybeSuggestTable(con, table));
    if (!D.hasColumn(con, table, column)) {
      return errPayload(`unknown column '${column}'`, maybeSuggestColumn(con, table, column));
    }
    const tcol = D.timeColumn(con, table);
    if (!tcol) return errPayload(`no Timestamp on ${table}`);
    const [startE, endE] = resolveTimePair(start, end, con, table);
    D.safeIdent(table);
    D.safeIdent(column);

    if (mode === 'peaks') {
      const rows = con
        .prepare(
          `SELECT "${tcol}" AS t, "${column}" AS v FROM "${table}" WHERE "${tcol}" BETWEEN ? AND ? ORDER BY "${column}" DESC LIMIT ?`,
        )
        .all(startE, endE, topN * 5) as Array<{ t: number; v: number }>;
      const kept: Array<{ t: number; iso: string; value: number }> = [];
      for (const r of rows) {
        if (!kept.some((k) => Math.abs(r.t - k.t) < minGap)) {
          kept.push({ t: r.t, iso: T.toIso(r.t), value: r.v });
        }
        if (kept.length >= topN) break;
      }
      log('find_events', `table=${table}  col=${column}  mode=${mode}  events_found=${kept.length}`);
      return { mode: 'peaks', events: kept, count: kept.length };
    }

    if (mode === 'threshold') {
      if (threshold === null) return errPayload("threshold required for mode='threshold'");
      const ops: Record<string, string> = { '>': '>', '<': '<', '>=': '>=', '<=': '<=', '==': '=', '=': '=' };
      if (!(op in ops)) return errPayload(`bad op '${op}'`);
      const rows = con
        .prepare(
          `SELECT "${tcol}" AS t, "${column}" AS v FROM "${table}" WHERE "${tcol}" BETWEEN ? AND ? AND "${column}" ${ops[op]} ? ORDER BY "${tcol}" ASC LIMIT 5000`,
        )
        .all(startE, endE, threshold) as Array<{ t: number; v: number }>;
      const runs: Array<any> = [];
      let curRun: any = null;
      for (const r of rows) {
        if (curRun && r.t - curRun.last_t <= minGap) {
          curRun.last_t = r.t;
          curRun.max_value = Math.max(curRun.max_value, r.v);
          curRun.samples += 1;
        } else {
          if (curRun) runs.push(curRun);
          curRun = { start_t: r.t, last_t: r.t, max_value: r.v, samples: 1 };
        }
      }
      if (curRun) runs.push(curRun);
      for (const run of runs) {
        run.start_iso = T.toIso(run.start_t);
        run.end_iso = T.toIso(run.last_t);
        run.duration_seconds = run.last_t - run.start_t;
      }
      log('find_events', `table=${table}  col=${column}  mode=${mode}  events_found=${runs.length}`);
      return { mode: 'threshold', threshold, op, crossings: runs, count: runs.length };
    }

    if (mode === 'zscore') {
      const r = con
        .prepare(
          `SELECT AVG("${column}") AS mu, AVG("${column}"*"${column}") - AVG("${column}")*AVG("${column}") AS var FROM "${table}" WHERE "${tcol}" BETWEEN ? AND ?`,
        )
        .get(startE, endE) as { mu: number | null; var: number | null } | undefined;
      const mu = r?.mu ?? 0;
      const variance = Math.max(r?.var ?? 0, 0);
      const sd = Math.sqrt(variance);
      if (sd === 0) {
        return { mode: 'zscore', events: [], mean: mu, stddev: sd };
      }
      const rows = con
        .prepare(
          `SELECT "${tcol}" AS t, "${column}" AS v, ABS("${column}" - ?)/? AS z FROM "${table}" WHERE "${tcol}" BETWEEN ? AND ? AND ABS("${column}" - ?)/? > ? ORDER BY z DESC LIMIT ?`,
        )
        .all(mu, sd, startE, endE, mu, sd, zscore, topN * 5) as Array<{ t: number; v: number; z: number }>;
      const kept: Array<any> = [];
      for (const rr of rows) {
        if (!kept.some((k) => Math.abs(rr.t - k.t) < minGap)) {
          kept.push({ t: rr.t, iso: T.toIso(rr.t), value: rr.v, z: rr.z });
        }
        if (kept.length >= topN) break;
      }
      log('find_events', `table=${table}  col=${column}  mode=${mode}  events_found=${kept.length}`);
      return { mode: 'zscore', mean: mu, stddev: sd, events: kept, count: kept.length };
    }

    if (mode === 'delta') {
      const rows = con
        .prepare(
          `SELECT "${tcol}" AS t, "${column}" AS v FROM "${table}" WHERE "${tcol}" BETWEEN ? AND ? ORDER BY "${tcol}" ASC`,
        )
        .all(startE, endE) as Array<{ t: number; v: number | null }>;
      const deltas: Array<any> = [];
      let prev: { t: number; v: number | null } | null = null;
      for (const r of rows) {
        if (prev && r.v !== null && prev.v !== null) {
          const d = Math.abs(r.v - prev.v);
          deltas.push({ t: r.t, iso: T.toIso(r.t), value: r.v, delta: d, from: prev.v });
        }
        prev = r;
      }
      deltas.sort((a, b) => b.delta - a.delta);
      const kept: Array<any> = [];
      for (const d of deltas) {
        if (!kept.some((k) => Math.abs(d.t - k.t) < minGap)) kept.push(d);
        if (kept.length >= topN) break;
      }
      log('find_events', `table=${table}  col=${column}  mode=${mode}  events_found=${kept.length}`);
      return { mode: 'delta', events: kept, count: kept.length };
    }

    return errPayload(`unknown mode '${mode}'`, { supported: ['peaks', 'threshold', 'zscore', 'delta'] });
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolFindHotspots(
  p: string,
  start: T.TimeLike,
  end: T.TimeLike,
  topN: number,
): Record<string, any> {
  try {
    const con = open(p);
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (start == null) start = tmin;
      if (end == null) end = tmax;
    }
    const startE = T.parseTime(start as T.TimeLike);
    const endE = T.parseTime(end as T.TimeLike);

    type MetricEntry = { table: string; column: string; sustained_high_threshold?: number };
    const allMetrics: MetricEntry[] = HOTSPOT_METRICS;

    const hotspots: Array<Record<string, any>> = [];
    const seenHotspotKeys = new Set<string>();
    for (const m of allMetrics) {
      if (!D.hasTable(con, m.table) || !D.hasColumn(con, m.table, m.column)) continue;
      const stats = con
        .prepare(
          `SELECT AVG("${m.column}") AS mu, AVG("${m.column}"*"${m.column}") - AVG("${m.column}")*AVG("${m.column}") AS var FROM "${m.table}" WHERE "Timestamp" BETWEEN ? AND ?`,
        )
        .get(startE, endE) as { mu: number | null; var: number | null } | undefined;
      const mu = stats?.mu ?? 0;
      const variance = Math.max(stats?.var ?? 0, 0);
      const sd = Math.sqrt(variance);
      const rows = con
        .prepare(
          `SELECT "Timestamp" AS t, "${m.column}" AS v FROM "${m.table}" WHERE "Timestamp" BETWEEN ? AND ? ORDER BY "${m.column}" DESC LIMIT ?`,
        )
        .all(startE, endE, topN) as Array<{ t: number; v: number }>;
      for (const r of rows) {
        const hKey = `${m.table}.${m.column}.${r.t}`;
        if (seenHotspotKeys.has(hKey)) continue;
        seenHotspotKeys.add(hKey);
        const z = sd ? (r.v - mu) / sd : 0;
        hotspots.push({
          table: m.table,
          column: m.column,
          t: r.t,
          iso: T.toIso(r.t),
          value: r.v,
          mean: mu,
          zscore: z,
        });
      }
    }
    hotspots.sort((a, b) => (b.zscore ?? 0) - (a.zscore ?? 0));

    // Sustained-high check: metrics with consistently elevated mean won't show up as Z-score outliers.
    const sustainedHighs: Array<Record<string, any>> = [];
    for (const m of allMetrics) {
      if (m.sustained_high_threshold === undefined) continue;
      if (!D.hasTable(con, m.table) || !D.hasColumn(con, m.table, m.column)) continue;
      const stats2 = con
        .prepare(
          `SELECT AVG("${m.column}") AS mu FROM "${m.table}" WHERE "Timestamp" BETWEEN ? AND ?`,
        )
        .get(startE, endE) as { mu: number | null } | undefined;
      const mu2 = stats2?.mu ?? null;
      if (mu2 !== null && mu2 > m.sustained_high_threshold) {
        sustainedHighs.push({
          table: m.table,
          column: m.column,
          mean: mu2,
          threshold: m.sustained_high_threshold,
          note: `mean ${mu2.toFixed(1)} > ${m.sustained_high_threshold} — sustained high; not flagged by Z-score`,
        });
      }
    }

    log(
      'find_hotspots',
      `metrics_checked=${allMetrics.length}  hotspots=${hotspots.length}  sustained_highs=${sustainedHighs.length}`,
    );
    return {
      window: { start: startE, end: endE },
      metrics_checked: allMetrics.length,
      hotspots: hotspots.slice(0, topN * 5),
      sustained_highs: sustainedHighs,
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolFindChanges(
  p: string,
  baselineStart: T.TimeLike,
  baselineEnd: T.TimeLike,
  targetStart: T.TimeLike,
  targetEnd: T.TimeLike,
  topN: number,
): Record<string, any> {
  try {
    const con = open(p);
    const bs = T.parseTime(baselineStart);
    const be = T.parseTime(baselineEnd);
    const ts = T.parseTime(targetStart);
    const te = T.parseTime(targetEnd);
    const metrics: Array<[string, string]> = HOTSPOT_METRICS.map((m) => [m.table, m.column]);
    metrics.push(['UM_STAT_UM_MEMORY', 'real_free']);
    metrics.push(['UM_STAT_UM_MEMORY', 'swap_used']);
    metrics.push(['UM_STAT_UM_DISK_UM_DISK_TABLE', 'disk_used']);

    const results: Array<Record<string, any>> = [];
    for (const [table, column] of metrics) {
      if (!D.hasTable(con, table) || !D.hasColumn(con, table, column)) continue;
      const baselineAvgRow = con
        .prepare(`SELECT AVG("${column}") AS v FROM "${table}" WHERE "Timestamp" BETWEEN ? AND ?`)
        .get(bs, be) as { v: number | null } | undefined;
      const targetAvgRow = con
        .prepare(`SELECT AVG("${column}") AS v FROM "${table}" WHERE "Timestamp" BETWEEN ? AND ?`)
        .get(ts, te) as { v: number | null } | undefined;
      const b = baselineAvgRow?.v ?? null;
      const t = targetAvgRow?.v ?? null;
      if (b === null || t === null) continue;
      let pct: number;
      if (b !== 0) pct = ((t - b) / b) * 100;
      else if (t !== 0) pct = Infinity;
      else pct = 0;
      results.push({ table, column, baseline_avg: b, target_avg: t, delta: t - b, pct_change: pct });
    }
    results.sort((a, b) => {
      const av = a.pct_change === Infinity ? Infinity : Math.abs(a.pct_change);
      const bv = b.pct_change === Infinity ? Infinity : Math.abs(b.pct_change);
      return bv - av;
    });
    log('find_changes', `baseline=${T.toIso(bs)}→${T.toIso(be)}  target=${T.toIso(ts)}→${T.toIso(te)}  changes=${results.length}`);
    return {
      baseline: { start: bs, end: be },
      target: { start: ts, end: te },
      changes: results.slice(0, topN),
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolCorrelate(
  p: string,
  metrics: string[],
  start: T.TimeLike,
  end: T.TimeLike,
  bucket: string | number | null,
): Record<string, any> {
  try {
    const con = open(p);
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (start == null) start = tmin;
      if (end == null) end = tmax;
    }
    const startE = T.parseTime(start as T.TimeLike);
    const endE = T.parseTime(end as T.TimeLike);
    const bucketS = T.parseBucket(bucket, { start: startE, end: endE });
    const series: Record<string, Map<number, number>> = {};
    const resolved: Record<string, [string, string]> = {};
    for (const m of metrics) {
      let t: string, c: string;
      try {
        [t, c] = A.resolveMetric(m);
      } catch (e: any) {
        return errPayload(String(e?.message ?? e), { metric: m });
      }
      if (!D.hasTable(con, t) || !D.hasColumn(con, t, c)) {
        return errPayload(`missing ${t}.${c}`, { metric: m });
      }
      resolved[m] = [t, c];
      const rows = con
        .prepare(
          `SELECT (("Timestamp"-?)/${bucketS})*${bucketS}+? AS b, AVG("${c}") AS v FROM "${t}" WHERE "Timestamp" BETWEEN ? AND ? GROUP BY b ORDER BY b`,
        )
        .all(startE, startE, startE, endE) as Array<{ b: number; v: number | null }>;
      const map = new Map<number, number>();
      for (const r of rows) {
        if (r.v !== null) map.set(r.b, r.v);
      }
      series[m] = map;
    }
    let common: Set<number> | null = null;
    for (const s of Object.values(series) as Array<Map<number, number>>) {
      const ks: Set<number> = new Set(s.keys());
      if (common === null) {
        common = ks;
      } else {
        const keep: number[] = [];
        for (const k of common) if (ks.has(k)) keep.push(k);
        common = new Set(keep);
      }
    }
    const commonSorted = Array.from(common ?? []).sort((a, b) => a - b);
    if (commonSorted.length < 3) {
      return errPayload('not enough overlapping samples', { common_buckets: commonSorted.length });
    }
    const matrix: Array<Array<number | null>> = [];
    for (const a of metrics) {
      const xs = commonSorted.map((b) => series[a].get(b)!);
      const row: Array<number | null> = [];
      for (const cName of metrics) {
        const ys = commonSorted.map((b) => series[cName].get(b)!);
        row.push(pearson(xs, ys));
      }
      matrix.push(row);
    }
    // labeled_matrix makes axis mapping self-describing (matrix[i][j] can be read without cross-referencing metrics[i])
    const labeledMatrix = matrix.map((row, i) => ({
      metric: metrics[i],
      correlations: Object.fromEntries(metrics.map((m, j) => [m, row[j]])),
    }));
    log('correlate', `metrics=${metrics.length}  common_samples=${commonSorted.length}  bucket_s=${bucketS}`);
    return { metrics, resolved, bucket_seconds: bucketS, samples: commonSorted.length, matrix, labeled_matrix: labeledMatrix };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolComparePeriods(
  p: string,
  table: string,
  columns: string[],
  pAStart: T.TimeLike,
  pAEnd: T.TimeLike,
  pBStart: T.TimeLike,
  pBEnd: T.TimeLike,
  agg: string,
): Record<string, any> {
  try {
    const con = open(p);
    if (!D.hasTable(con, table)) return errPayload(`unknown table '${table}'`, maybeSuggestTable(con, table));
    const bad = columns.filter((c) => !D.hasColumn(con, table, c));
    if (bad.length > 0) return errPayload(`unknown columns ${JSON.stringify(bad)}`, maybeSuggestColumn(con, table, bad[0]));
    const aS = T.parseTime(pAStart);
    const aE = T.parseTime(pAEnd);
    const bS = T.parseTime(pBStart);
    const bE = T.parseTime(pBEnd);
    const out: Record<string, any> = { table, agg, columns: {} };
    for (const c of columns) {
      const aRow = con
        .prepare(`SELECT ${aggSql(agg, c)} AS v FROM "${table}" WHERE "Timestamp" BETWEEN ? AND ?`)
        .get(aS, aE) as { v: number | null } | undefined;
      const bRow = con
        .prepare(`SELECT ${aggSql(agg, c)} AS v FROM "${table}" WHERE "Timestamp" BETWEEN ? AND ?`)
        .get(bS, bE) as { v: number | null } | undefined;
      const a = aRow?.v ?? null;
      const b = bRow?.v ?? null;
      const delta = a !== null && b !== null ? b - a : null;
      const pct = a !== null && a !== 0 && delta !== null ? (delta / a) * 100 : null;
      out.columns[c] = { a, b, delta, pct_change: pct };
    }
    const firstCol = columns[0];
    log('compare_periods', `table=${table}  col=${firstCol}  a_avg=${out.columns[firstCol]?.a}  b_avg=${out.columns[firstCol]?.b}`);
    return out;
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolCompareMembers(
  paths: string[],
  metric: string,
  start: T.TimeLike,
  end: T.TimeLike,
  bucket: string | number | null,
  agg: string,
): Record<string, any> {
  try {
    let tbl: string, col: string;
    try {
      [tbl, col] = A.resolveMetric(metric);
    } catch (e: any) {
      return errPayload(String(e?.message ?? e));
    }
    const members: Array<any> = [];
    let sE: number | null = null;
    let eE: number | null = null;
    for (const p of paths) {
      const con = open(p);
      if (!D.hasTable(con, tbl) || !D.hasColumn(con, tbl, col)) {
        members.push({ path: p, error: `missing ${tbl}.${col}` });
        continue;
      }
      const [tmin, tmax] = D.timeRange(con, tbl);
      const s = start != null ? T.parseTime(start) : (tmin as number);
      const e = end != null ? T.parseTime(end) : (tmax as number);
      sE = sE !== null ? Math.max(sE, s) : s;
      eE = eE !== null ? Math.min(eE, e) : e;
      members.push({ path: p, gateway: P.gatewayNameFromFilename(p), con, tmin, tmax });
    }
    const usable = members.filter((m) => !('error' in m));
    if (usable.length < 2 || sE === null || eE === null || sE >= eE) {
      return errPayload('not enough overlapping data across members', {
        members: members.map((m) => {
          const c: any = {};
          for (const [k, v] of Object.entries(m)) if (k !== 'con') c[k] = v;
          return c;
        }),
      });
    }
    const bucketS = T.parseBucket(bucket, { start: sE, end: eE });
    const series: Array<any> = [];
    for (const m of usable) {
      const con: Database = m.con;
      const rows = con
        .prepare(
          `SELECT (("Timestamp"-?)/${bucketS})*${bucketS}+? AS b, ${aggSql(agg, col)} AS v FROM "${tbl}" WHERE "Timestamp" BETWEEN ? AND ? GROUP BY b ORDER BY b`,
        )
        .all(sE, sE, sE, eE) as Array<{ b: number; v: number | null }>;
      series.push({
        path: m.path,
        gateway: m.gateway,
        points: rows.map((r) => ({ t: r.b, v: r.v })),
      });
    }
    log('compare_members', `paths=${paths.length}  metric=${metric}  series=${series.length}`);
    return {
      metric,
      resolved: { table: tbl, column: col },
      window: { start: sE, end: eE },
      bucket_seconds: bucketS,
      agg,
      series,
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

export function toolHealthSummary(p: string, start: T.TimeLike, end: T.TimeLike): Record<string, any> {
  try {
    const con = open(p);
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (start == null) start = tmin;
      if (end == null) end = tmax;
    }
    const s = T.parseTime(start as T.TimeLike);
    const e = T.parseTime(end as T.TimeLike);
    const out: Record<string, any> = {
      window: {
        start_epoch: s,
        end_epoch: e,
        start_iso: T.toIso(s),
        end_iso: T.toIso(e),
        duration_seconds: e - s,
      },
    };

    function aggHelper(table: string, exprAvg: string, exprMax: string): Record<string, any> | null {
      if (!D.hasTable(con, table)) return null;
      try {
        const r = con
          .prepare(`SELECT ${exprAvg} AS avg_v, ${exprMax} AS max_v FROM "${table}" WHERE "Timestamp" BETWEEN ? AND ?`)
          .get(s, e) as { avg_v: number | null; max_v: number | null } | undefined;
        if (!r) return null;
        return { avg: r.avg_v, max: r.max_v };
      } catch {
        return null;
      }
    }

    out.cpu_per_core = aggHelper('UM_STAT_UM_CPU_UM_CPU_TABLE', 'AVG(cpu_usage)', 'MAX(cpu_usage)');
    out.load_average = aggHelper('UM_STAT_UM_SYSTEM', 'AVG(load_average)', 'MAX(load_average)');
    out.memory_used_bytes = aggHelper('UM_STAT_UM_MEMORY', 'AVG(real_used)', 'MAX(real_used)');
    out.memory_used_ratio = aggHelper(
      'UM_STAT_UM_MEMORY',
      'AVG(real_used*1.0/real_total)',
      'MAX(real_used*1.0/real_total)',
    );
    out.swap_used = aggHelper('UM_STAT_UM_MEMORY', 'AVG(swap_used)', 'MAX(swap_used)');
    out.iostat_util = aggHelper('UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE', 'AVG(util)', 'MAX(util)');
    out.iostat_await = aggHelper('UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE', 'AVG(await)', 'MAX(await)');

    try {
      const rows = con
        .prepare(
          'SELECT top_proc_name, top_proc_pid, MAX(top_proc_usage) AS peak, AVG(top_proc_usage) AS avg_cpu ' +
            'FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU WHERE Timestamp BETWEEN ? AND ? ' +
            'GROUP BY top_proc_name, top_proc_pid ORDER BY peak DESC LIMIT 10',
        )
        .all(s, e) as Array<{ top_proc_name: number; top_proc_pid: number; peak: number; avg_cpu: number }>;
      out.top_processes_by_cpu = rows.map((r) => ({
        name: D.resolveRef(con, r.top_proc_name) ?? r.top_proc_name,
        pid: r.top_proc_pid,
        peak_cpu: r.peak,
        avg_cpu: r.avg_cpu,
      }));
    } catch (e2: any) {
      out.top_processes_by_cpu_error = String(e2?.message ?? e2);
    }

    try {
      const mid = Math.floor((s + e) / 2);
      const rows = con
        .prepare(
          'SELECT disk_path, disk_total, disk_used, disk_free FROM UM_STAT_UM_DISK_UM_DISK_TABLE ' +
            'WHERE Timestamp BETWEEN ? AND ? ORDER BY ABS(Timestamp - ?) ASC LIMIT 20',
        )
        .all(s, e, mid) as Array<{
        disk_path: number;
        disk_total: number | null;
        disk_used: number | null;
        disk_free: number | null;
      }>;
      const disks: Array<any> = [];
      const seen = new Set<number>();
      for (const r of rows) {
        if (seen.has(r.disk_path)) continue;
        seen.add(r.disk_path);
        const ps = D.resolveRef(con, r.disk_path) ?? r.disk_path;
        const pct = r.disk_total ? ((r.disk_used ?? 0) / r.disk_total) * 100 : null;
        disks.push({ path: ps, total: r.disk_total, used: r.disk_used, free: r.disk_free, used_pct: pct });
      }
      out.disks = disks;
    } catch (e2: any) {
      out.disks_error = String(e2?.message ?? e2);
    }
    // HA state dwell: time spent in each local state across the window
    if (D.hasTable(con, 'cxl_cxl_stats') && D.hasColumn(con, 'cxl_cxl_stats', 'fwha_cpv_last_state_change')) {
      try {
        const haRows = con.prepare(
          'SELECT Timestamp AS t, fwha_cpv_last_state_change AS state ' +
          'FROM cxl_cxl_stats WHERE Timestamp BETWEEN ? AND ? ORDER BY Timestamp ASC'
        ).all(s, e) as Array<{ t: number; state: string }>;

        if (haRows.length > 0) {
          // Build dwell segments: [state, start_t, end_t]
          const dwells: Array<{ state: string; start: number; end: number }> = [];
          let segState = haRows[0].state;
          let segStart = haRows[0].t;
          for (let i = 1; i < haRows.length; i++) {
            if (haRows[i].state !== segState) {
              dwells.push({ state: segState, start: segStart, end: haRows[i - 1].t });
              segState = haRows[i].state;
              segStart = haRows[i].t;
            }
          }
          dwells.push({ state: segState, start: segStart, end: haRows[haRows.length - 1].t });

          // Aggregate by state
          const totalS = e - s;
          const aggDwells: Record<string, { duration_s: number; fraction: number; start_iso: string; end_iso: string }> = {};
          for (const d of dwells) {
            const dur = d.end - d.start;
            if (!aggDwells[d.state]) {
              aggDwells[d.state] = { duration_s: 0, fraction: 0, start_iso: T.toIso(d.start), end_iso: T.toIso(d.end) };
            }
            aggDwells[d.state].duration_s += dur;
            aggDwells[d.state].end_iso = T.toIso(d.end);
          }
          for (const st of Object.values(aggDwells)) {
            st.fraction = totalS > 0 ? Math.round((st.duration_s / totalS) * 1000) / 1000 : 0;
          }

          out.ha_state_dwell = {
            source_table: 'cxl_cxl_stats',
            source_column: 'fwha_cpv_last_state_change',
            authoritative: true,
            note: 'Local member state from fwha state machine. ACTIVE(!) = degraded-active.',
            states: Object.entries(aggDwells).map(([state, v]) => ({ state, ...v })),
          };

          // Check against cxl_cxl_stats_status for mismatch
          if (D.hasTable(con, 'cxl_cxl_stats_status')) {
            try {
              const nonActiveCount = aggDwells['DOWN']?.duration_s
                ? Math.round((aggDwells['DOWN'].duration_s ?? 0) / 60)
                : (aggDwells['ACTIVE(!)']
                  ? con.prepare(`SELECT COUNT(*) AS c FROM cxl_cxl_stats WHERE Timestamp BETWEEN ? AND ? AND fwha_cpv_last_state_change != 'ACTIVE'`).get(s, e) as { c: number }
                  : null);

              const mismatchCount = con.prepare(
                `SELECT COUNT(*) AS c FROM cxl_cxl_stats_status ` +
                `WHERE Timestamp BETWEEN ? AND ? AND member_id LIKE '%(local)%' AND member_state = 'ACTIVE'`
              ).get(s, e) as { c: number } | undefined;

              const authNonActive = con.prepare(
                `SELECT COUNT(*) AS c FROM cxl_cxl_stats WHERE Timestamp BETWEEN ? AND ? AND fwha_cpv_last_state_change != 'ACTIVE'`
              ).get(s, e) as { c: number } | undefined;

              if (authNonActive && authNonActive.c > 0 && mismatchCount && mismatchCount.c > 0) {
                out.ha_state_dwell.status_table_warning =
                  `cxl_cxl_stats_status.member_state shows 'ACTIVE' for ${mismatchCount.c} rows in this window, ` +
                  `but cxl_cxl_stats.fwha_cpv_last_state_change disagrees for ${authNonActive.c} rows. ` +
                  `The cxl_cxl_stats column is authoritative — cxl_cxl_stats_status reflects stale CCP cache.`;
              }
            } catch { /* ignore */ }
          }
        }
      } catch (e2: any) {
        out.ha_state_dwell_error = String(e2?.message ?? e2);
      }
    }
    log('health_summary', `window=${Math.floor((e-s)/60)}min  cpu_avg=${(out.cpu_per_core as any)?.avg?.toFixed(1) ?? 'n/a'}  load_avg=${(out.load_average as any)?.avg?.toFixed(2) ?? 'n/a'}  mem_ratio=${(out.memory_used_ratio as any)?.avg?.toFixed(3) ?? 'n/a'}`);
    return out;
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function toolExportCsv(
  p: string,
  outputPath: string,
  table: string | null,
  sqlIn: string | null,
  start: T.TimeLike,
  end: T.TimeLike,
  columns: string[] | null,
  limit: number,
): Record<string, any> {
  try {
    const con = open(p);
    const xor = !!table !== !!sqlIn;
    if (!xor) return errPayload('provide exactly one of `table` or `sql`');
    let sqlStmt: string;
    const params: number[] = [];
    if (table) {
      if (!D.hasTable(con, table)) return errPayload(`unknown table '${table}'`, maybeSuggestTable(con, table));
      const tcol = D.timeColumn(con, table) ?? 'Timestamp';
      const allCols = columnsForTable(con, table);
      const cols = columns ?? allCols;
      const bad = cols.filter((c) => !allCols.includes(c));
      if (bad.length > 0) return errPayload(`unknown columns: ${JSON.stringify(bad)}`);
      const sel = cols.map((c) => `"${c}"`).join(', ');
      sqlStmt = `SELECT ${sel} FROM "${table}"`;
      const where: string[] = [];
      if (start != null) {
        where.push(`"${tcol}" >= ?`);
        params.push(T.parseTime(start));
      }
      if (end != null) {
        where.push(`"${tcol}" <= ?`);
        params.push(T.parseTime(end));
      }
      if (where.length > 0) sqlStmt += ' WHERE ' + where.join(' AND ');
      sqlStmt += ` ORDER BY "${tcol}" ASC LIMIT ?`;
      params.push(limit);
    } else {
      const valid = validateSelect(sqlIn);
      if (typeof valid !== 'string') return valid;
      sqlStmt = `SELECT * FROM (${valid}) LIMIT ${limit}`;
    }
    const outNorm = P.normalizePath(outputPath);
    fs.mkdirSync(path.dirname(outNorm), { recursive: true });
    const stmt = con.prepare(sqlStmt);
    const allRows = stmt.all(...params);
    const ws = fs.createWriteStream(outNorm, { encoding: 'utf-8' });
    let count = 0;
    let headerWritten = false;
    let headers: string[] = [];
    try {
      for (const row of allRows) {
        if (!headerWritten) {
          headers = Object.keys(row as Record<string, any>);
          ws.write(csvLine(headers));
          headerWritten = true;
        }
        const vals = headers.map((h) => (row as any)[h]);
        ws.write(csvLine(vals));
        count++;
      }
    } finally {
      ws.end();
    }
    log('export_csv', `table=${table ?? '(sql)'}  rows=${count}  file=${outNorm}`);
    return { output_path: outNorm, rows: count };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

function csvLine(values: any[]): string {
  return (
    values
      .map((v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      })
      .join(',') + '\n'
  );
}

const LARGE_TABLE_THRESHOLD = 100000;

function toolSqlRead(
  p: string,
  query: string,
  params: any[] | null,
  limit: number,
  timeoutSeconds: number,
  allowFullScan: boolean,
  maxBytes: number,
): Record<string, any> {
  try {
    const con = open(p);
    const valid = validateSelect(query);
    if (typeof valid !== 'string') return valid;

    const warnings: string[] = [];
    const largeScans: string[] = [];
    try {
      const planRows = con.prepare(`EXPLAIN QUERY PLAN ${valid}`).all(...(params ?? [])) as any[];
      for (const row of planRows) {
        const arr = Object.values(row);
        const detail = arr.length >= 4 ? String(arr[arr.length - 1]) : JSON.stringify(row);
        if (typeof detail !== 'string') continue;
        const up = detail.toUpperCase();
        if (up.includes('SCAN') && !up.includes('USING INDEX')) {
          const m = detail.match(/SCAN\s+(?:TABLE\s+)?(\S+)/i);
          const tbl = m ? m[1].replace(/"/g, '') : null;
          if (tbl) {
            let n: number | null = null;
            try {
              const r = con.prepare(`SELECT COUNT(*) AS n FROM "${tbl}"`).get() as { n: number } | undefined;
              n = r?.n ?? null;
            } catch {
              n = null;
            }
            if (n !== null && n > LARGE_TABLE_THRESHOLD) {
              largeScans.push(`${tbl} (${n.toLocaleString()} rows)`);
            }
          }
          warnings.push(`full scan: ${detail}`);
        }
      }
    } catch {
      // ignore explain errors
    }

    if (largeScans.length > 0 && !allowFullScan) {
      const hasTsFilter = /\bTimestamp\b/i.test(valid);
      if (!hasTsFilter) {
        return errPayload(
          'query would full-scan large table(s) without a Timestamp filter. Add a Timestamp BETWEEN ? AND ? clause or pass allow_full_scan=True.',
          { large_scans: largeScans, warnings: warnings.length > 0 ? warnings : null },
        );
      }
    }

    // Set per-statement timeout via SQLite's busy_timeout
    // Note: node:sqlite exposes no progress handler; the timeout is best-effort.
    con.exec(`PRAGMA busy_timeout = ${Math.floor(Math.max(500, timeoutSeconds * 1000))}`);

    const sqlLim = `SELECT * FROM (${valid}) LIMIT ${limit + 1}`;
    const stmt = con.prepare(sqlLim);
    const start = Date.now();
    const allRows = stmt.all(...(params ?? []));
    const rows: any[] = [];
    let bytesCount = 0;
    let truncatedBytes = false;
    for (const r of allRows) {
      // best-effort timeout check
      if ((Date.now() - start) / 1000 > Math.max(0.5, timeoutSeconds)) {
        return errPayload(`query exceeded timeout of ${timeoutSeconds}s`, { timeout_seconds: timeoutSeconds });
      }
      rows.push(r);
      for (const v of Object.values(r as Record<string, any>)) {
        if (v !== null && v !== undefined) bytesCount += String(v).length;
      }
      if (bytesCount > maxBytes) {
        truncatedBytes = true;
        break;
      }
      if (rows.length > limit) break;
    }
    const truncatedRows = rows.length > limit;
    const truncated = truncatedRows || truncatedBytes;
    const trimmed = rows.slice(0, limit);
    const cols = trimmed.length > 0 ? Object.keys(trimmed[0]) : [];
    log('sql_read', `sql="${query.slice(0,80).replace(/\n/g,' ')}"  rows=${trimmed.length}  bytes=${bytesCount}`);
    return {
      columns: cols,
      rows: rowsToDicts(trimmed),
      count: trimmed.length,
      truncated,
      truncated_reason: truncatedBytes ? 'byte_budget' : truncatedRows ? 'row_limit' : null,
      warnings: warnings.length > 0 ? warnings : null,
      large_scans: largeScans.length > 0 ? largeScans : null,
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

// ---- Investigation tools (envelope responses) ----

function toolValidateCpviewDb(p: string): E.EnvelopeOut {
  let norm: string;
  let con: Database;
  try {
    norm = P.normalizePath(p);
    con = open(norm);
  } catch (e: any) {
    return E.errEnvelope(String(e?.message ?? e), { extra: { path: p } });
  }
  const verdict = ANL.validateDb(con);
  const gateway = P.gatewayNameFromFilename(norm);
  const summary = `${verdict.valid ? 'OK' : 'INVALID'} — ${verdict.table_count} tables, schema ${verdict.schema_signature}, gateway '${gateway}'`;
  const suggestions: any[] = [];
  if (verdict.valid) {
    suggestions.push(E.nextTool('inspect_database', 'Get headline metrics and time coverage', { path: norm }));
    suggestions.push(E.nextTool('find_hotspots', 'Scan the whole window for anomalous moments', { path: norm }));
  }
  log('validate_cpview_db', `valid=${verdict.valid}  warnings=${verdict.warnings?.length ?? 0}  schema=${verdict.schema_signature}`);
  return E.envelope({
    summary,
    data: { ...verdict, path: norm, gateway },
    time_range: [verdict.time_range.start_epoch, verdict.time_range.end_epoch],
    warnings: verdict.warnings.length > 0 ? verdict.warnings : null,
    suggested_next_tools: suggestions.length > 0 ? suggestions : null,
  });
}

function toolExplainMetric(metric: string): E.EnvelopeOut {
  const info = A.metricInfo(metric);
  if (info === null) {
    const suggestions = A.suggest(metric, Object.keys(A.ALIASES).concat(Object.keys(A.METRIC_INFO)));
    return E.errEnvelope(`unknown metric '${metric}'`, {
      extra: { did_you_mean: suggestions.length > 0 ? suggestions : null },
    });
  }
  const summary = `${metric} -> ${info.canonical} (${info.unit ?? 'n/a'}); ${info.higher_is_bad ? 'higher is bad' : 'higher is not bad'}`;
  const [t, c] = info.canonical.split('.', 2);
  log('explain_metric', `metric=${metric}  resolved=${t}.${c}`);
  return E.envelope({
    summary,
    data: { metric, ...info },
    suggested_next_tools: [
      E.nextTool('aggregate', 'Plot this metric over time', { table: t, columns: [c] }),
      E.nextTool('find_events', 'Find peaks/threshold crossings', { table: t, column: c }),
    ],
  });
}

function toolFindBaselinePeriods(
  p: string,
  duration: string,
  start: T.TimeLike,
  end: T.TimeLike,
  topN: number,
): E.EnvelopeOut {
  try {
    const con = open(p);
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (start == null) start = tmin;
      if (end == null) end = tmax;
    }
    const s = T.parseTime(start as T.TimeLike);
    const e = T.parseTime(end as T.TimeLike);
    const dur = T.parseBucket(duration);
    const candidates = ANL.findBaselinePeriods(con, { duration_seconds: dur, start: s, end: e, top_n: topN });
    const summary = `${candidates.length} calm window(s) of ${dur}s found within [${T.toIso(s)} .. ${T.toIso(e)}]`;
    const next: any[] = [];
    if (candidates.length > 0) {
      const best = candidates[0];
      next.push(
        E.nextTool('compare_periods', 'Compare an incident window against this baseline', {
          period_a_start: best.start_epoch,
          period_a_end: best.end_epoch,
        }),
      );
    }
    log('find_baseline_periods', `duration=${dur}s  candidates=${candidates.length}  best_score=${candidates[0]?.score?.toFixed(3) ?? 'n/a'}`);
    return E.envelope({
      summary,
      data: { duration_seconds: dur, candidates },
      time_range: [s, e],
      suggested_next_tools: next.length > 0 ? next : null,
      warnings: candidates.length === 0 ? ['no calm window found — DB may be too short or constantly busy'] : null,
    });
  } catch (ex: any) {
    return E.errEnvelope(String(ex?.message ?? ex));
  }
}

function toolAnalyzeProcess(
  p: string,
  processName: string,
  start: T.TimeLike,
  end: T.TimeLike,
  bucket: string,
): E.EnvelopeOut {
  try {
    const con = open(p);
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (start == null) start = tmin;
      if (end == null) end = tmax;
    }
    const s = T.parseTime(start as T.TimeLike);
    const e = T.parseTime(end as T.TimeLike);
    const bkt = T.parseBucket(bucket);
    const result = ANL.analyzeProcess(con, { process_name: processName, start: s, end: e, bucket_seconds: bkt });
    if (!result.found) {
      return E.errEnvelope(`process '${processName}' not found in cpview_ref_table`, { extra: result });
    }
    const cpu = result.cpu;
    const peakCpu = cpu?.peak_cpu ?? null;
    const summary = `${processName}: peak CPU ${peakCpu}%, avg ${String(cpu?.avg_cpu ?? null)}, ${cpu?.distinct_pids ?? 0} PID(s), ${cpu?.samples ?? 0} samples`;
    const evidence: any[] = [];
    if (peakCpu != null) {
      for (const pt of result.cpu_series ?? []) {
        if (pt.peak_cpu === peakCpu) {
          evidence.push(
            E.evidenceRow({
              table: 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU',
              column: 'top_proc_usage',
              timestamp: pt.t,
              value: peakCpu,
              extra: { process: processName },
            }),
          );
          break;
        }
      }
    }
    log('analyze_process', `process=${processName}  pids=${result.pids_seen?.length ?? 0}  samples=${result.cpu?.samples ?? 0}`);
    return E.envelope({
      summary,
      data: result,
      time_range: [s, e],
      evidence: evidence.length > 0 ? evidence : null,
      suggested_next_tools: [
        E.nextTool('snapshot_at', 'Inspect full system state at the peak', evidence.length > 0 ? { timestamp: evidence[0].timestamp } : {}),
        E.nextTool('correlate', 'Check if process CPU tracks aggregate metrics', { metrics: ['cpu', 'load'] }),
      ],
    });
  } catch (ex: any) {
    return E.errEnvelope(String(ex?.message ?? ex));
  }
}

function toolTopContributors(
  p: string,
  metric: string,
  start: T.TimeLike,
  end: T.TimeLike,
  topN: number,
): E.EnvelopeOut {
  try {
    const con = open(p);
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (start == null) start = tmin;
      if (end == null) end = tmax;
    }
    const s = T.parseTime(start as T.TimeLike);
    const e = T.parseTime(end as T.TimeLike);
    const result = ANL.topContributorsFor(con, metric, s, e, topN);
    const contribs = result.contributors ?? [];
    const summary = `${contribs.length} top ${result.kind ?? metric} contributors for ${metric}`;
    const evidence: any[] = [];
    const kind = result.kind;
    for (const c of contribs.slice(0, 3)) {
      // `kind` is the runtime discriminant on ContributorsResult; narrow the union accordingly.
      if (kind === 'process') {
        const pc = c as ANL.ProcessCpuContributor & ANL.ProcessMemContributor;
        evidence.push(
          E.evidenceRow({
            table:
              ['cpu', 'load', 'process_cpu'].includes(metric.toLowerCase())
                ? 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU'
                : 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM',
            column: ['cpu', 'load'].includes(metric.toLowerCase()) ? 'top_proc_usage' : 'top_proc_used_ram_bytes',
            value: pc.peak_cpu ?? pc.peak_ram_bytes,
            extra: { process: pc.name, pid: pc.pid },
          }),
        );
      } else if (kind === 'device') {
        const dc = c as ANL.DiskContributor;
        evidence.push(
          E.evidenceRow({
            table: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE',
            column: 'util',
            value: dc.peak_util,
            extra: { device: dc.device },
          }),
        );
      } else if (kind === 'interface') {
        const ic = c as ANL.NetworkContributor;
        evidence.push(
          E.evidenceRow({
            table: ic.kind === 'rx' ? 'UM_STAT_UM_HW_UM_IF_RX_STATISTICS_TABLE' : 'UM_STAT_UM_HW_UM_IF_TX_STATISTICS_TABLE',
            column: ic.column,
            value: ic.peak,
            extra: { interface: ic.interface },
          }),
        );
      }
    }
    log('top_contributors', `metric=${metric}  contributors=${contribs.length}`);
    return E.envelope({
      summary,
      data: result,
      time_range: [s, e],
      evidence: evidence.length > 0 ? evidence : null,
      warnings: result.warning ? [result.warning] : null,
      suggested_next_tools:
        contribs.length > 0 && kind === 'process'
          ? [
              E.nextTool('analyze_process', 'Deeper analysis of the top process', {
                process_name: (contribs[0] as ANL.ProcessCpuContributor).name,
              }),
            ]
          : null,
    });
  } catch (ex: any) {
    return E.errEnvelope(String(ex?.message ?? ex));
  }
}

function toolBuildTimeline(
  p: string,
  start: T.TimeLike,
  end: T.TimeLike,
  granularity: string,
): E.EnvelopeOut {
  try {
    const con = open(p);
    const s = T.parseTime(start);
    const e = T.parseTime(end);
    const gran = T.parseBucket(granularity);
    const events = ANL.buildTimeline(con, { start: s, end: e, granularity_seconds: gran });
    const summary = `${events.length} timeline event(s) across ${Math.floor((e - s) / 60)} minutes`;
    const evidence: any[] = [];
    for (const ev of events) {
      evidence.push(
        E.evidenceRow({
          table: ev.evidence.table ?? '',
          column: ev.evidence.column,
          timestamp: ev.t,
          value: ev.evidence.value,
          extra: { kind: ev.kind, metric: ev.metric },
        }),
      );
    }
    const firstPeak = events.find((ev) => ev.kind === 'peak');
    log('build_timeline', `gran=${gran}s  events=${events.length}`);
    return E.envelope({
      summary,
      data: { granularity_seconds: gran, events },
      time_range: [s, e],
      evidence: evidence.length > 0 ? evidence : null,
      warnings: events.length === 0 ? ['no notable events in window'] : null,
      suggested_next_tools:
        events.length > 0 ? [E.nextTool('snapshot_at', 'Inspect first peak in detail', { timestamp: firstPeak?.t ?? s })] : null,
    });
  } catch (ex: any) {
    return E.errEnvelope(String(ex?.message ?? ex));
  }
}

function toolInvestigateWindow(
  p: string,
  centerTime: T.TimeLike,
  before: string,
  after: string,
  includeProcesses: boolean,
  compareToBaseline: boolean,
): E.EnvelopeOut {
  try {
    const con = open(p);
    const center = T.parseTime(centerTime);
    const beforeS = T.parseBucket(before);
    const afterS = T.parseBucket(after);
    const s = center - beforeS;
    const e = center + afterS;

    const snap = toolSnapshotAt(p, center, null, 120);
    const hotspots = toolFindHotspots(p, s, e, 5);
    const timelineEvs = ANL.buildTimeline(con, { start: s, end: e, granularity_seconds: 60 });
    const contribCpu = ANL.topContributorsFor(con, 'cpu', s, e, 5);
    const contribDisk = ANL.topContributorsFor(con, 'disk', s, e, 5);
    const health = toolHealthSummary(p, s, e);
    const sysEvents = toolFindSystemEvents(p, s, e);

    let baselineData: any = null;
    let deltaChanges: any = null;
    if (compareToBaseline) {
      const duration = afterS + beforeS;
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (tmin !== null && tmax !== null) {
        const cands = ANL.findBaselinePeriods(con, { duration_seconds: duration, start: tmin, end: tmax, top_n: 1 });
        if (cands.length > 0) {
          const base = cands[0];
          baselineData = base;
          deltaChanges = toolFindChanges(p, base.start_epoch, base.end_epoch, s, e, 10);
        }
      }
    }

    const peak = hotspots && hotspots.hotspots && hotspots.hotspots.length > 0 ? hotspots.hotspots[0] : null;
    const sysEventsArr: any[] = sysEvents?.events ?? [];
    const verdictBits: string[] = [];
    // Surface system events first — reboots/failovers are often the root cause
    for (const ev of sysEventsArr) {
      if (ev.kind === 'os_reboot') {
        verdictBits.push(`OS reboot at ${ev.iso} (uptime reset: ${ev.detail?.uptime_before_secs}s → ${ev.detail?.uptime_after_secs}s)`);
      } else if (ev.kind === 'ha_failover') {
        verdictBits.push(`HA failover at ${ev.iso}: from=${ev.detail?.from}, reason=${ev.detail?.reason}`);
      } else if (ev.kind === 'ha_state_change') {
        verdictBits.push(`HA state change at ${ev.iso}: ${ev.detail?.from} → ${ev.detail?.to}`);
      }
    }
    if (peak) {
      verdictBits.push(
        `strongest anomaly: ${String(peak.table).replace('UM_STAT_UM_', '')}.${peak.column}=${peak.value} @ ${peak.iso} (z=${Number(peak.zscore).toFixed(1)})`,
      );
    }
    const topProc =
      contribCpu.contributors && contribCpu.contributors.length > 0
        ? (contribCpu.contributors[0] as ANL.ProcessCpuContributor)
        : null;
    if (topProc) {
      verdictBits.push(`top CPU process: ${topProc.name} (peak ${topProc.peak_cpu}%)`);
    }
    const summary = verdictBits.length > 0 ? verdictBits.join('; ') : 'no clear anomaly detected';

    const evidence: any[] = [];
    // Pin reboot/failover events as top-priority evidence
    for (const ev of sysEventsArr) {
      if (ev.kind === 'os_reboot' || ev.kind === 'ha_failover') {
        evidence.push(
          E.evidenceRow({
            table: ev.kind === 'os_reboot' ? 'UM_STAT_UM_SYSTEM' : 'cxl_cxl_stats',
            column: ev.kind === 'os_reboot' ? 'uptime' : 'fwha_cpv_failover_counter',
            timestamp: ev.t,
            value: ev.kind === 'os_reboot' ? ev.detail?.uptime_after_str : ev.detail?.failover_count,
            extra: ev.detail,
          }),
        );
      }
    }
    if (peak) {
      evidence.push(
        E.evidenceRow({
          table: peak.table,
          column: peak.column,
          timestamp: peak.t,
          value: peak.value,
          extra: { zscore: peak.zscore },
        }),
      );
    }
    if (topProc) {
      evidence.push(
        E.evidenceRow({
          table: 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU',
          column: 'top_proc_usage',
          value: topProc.peak_cpu,
          extra: { process: topProc.name, pid: topProc.pid },
        }),
      );
    }

    const nextTools: any[] = [
      E.nextTool('generate_report', 'Produce a TAC-style narrative for handoff', { path: p, start: s, end: e }),
    ];
    if (topProc && topProc.name) {
      nextTools.push(E.nextTool('analyze_process', 'Deep-dive on top contributing process', { path: p, process_name: topProc.name }));
    }

    const data: Record<string, any> = {
      center_epoch: center,
      center_iso: T.toIso(center),
      window_seconds: beforeS + afterS,
      snapshot: snap,
      system_events: sysEvents,
      hotspots,
      timeline: timelineEvs,
      top_processes_by_cpu: contribCpu,
      top_disk_devices: contribDisk,
      health,
    };
    if (includeProcesses) {
      data.top_processes_by_memory = ANL.topContributorsFor(con, 'memory', s, e, 5);
    }
    if (baselineData) {
      data.baseline = baselineData;
      data.changes_vs_baseline = deltaChanges;
    }

    log('investigate_window', `center=${T.toIso(center)}  window=${beforeS+afterS}s  hotspots=${hotspots?.hotspots?.length??0}  timeline_events=${timelineEvs.length}  sys_events=${sysEventsArr.length}  top_proc=${topProc?.name??'none'}`);
    return E.envelope({
      summary,
      data,
      time_range: [s, e],
      evidence: evidence.length > 0 ? evidence : null,
      suggested_next_tools: nextTools,
    });
  } catch (ex: any) {
    return E.errEnvelope(String(ex?.message ?? ex));
  }
}

function toolGenerateReport(
  p: string,
  start: T.TimeLike,
  end: T.TimeLike,
  focus: string | null,
  format: string,
  peerPath: string | null,
): E.EnvelopeOut {
  try {
    const con = open(p);
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
      if (start == null) start = tmin;
      if (end == null) end = tmax;
    }
    const s = T.parseTime(start as T.TimeLike);
    const e = T.parseTime(end as T.TimeLike);
    const durationS = e - s;
    const gateway = P.gatewayNameFromFilename(p) ?? 'unknown';

    const validate = ANL.validateDb(con);
    const timelineEvs = ANL.buildTimeline(con, { start: s, end: e, granularity_seconds: 60 });
    const hotspots = toolFindHotspots(p, s, e, 5);
    const health = toolHealthSummary(p, s, e);
    const sysEvents = toolFindSystemEvents(p, s, e);
    const sysEventsArr: any[] = sysEvents?.events ?? [];
    const contribCpu = ANL.topContributorsFor(con, 'cpu', s, e, 5);
    const contribMem = ANL.topContributorsFor(con, 'memory', s, e, 5);
    const contribDisk = ANL.topContributorsFor(con, 'disk', s, e, 5);

    let baselineBlock: any = null;
    let changes: any = null;
    const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_CPU');
    if (tmin && tmax && tmax - tmin > durationS * 2) {
      const baseCands = ANL.findBaselinePeriods(con, {
        duration_seconds: durationS,
        start: tmin,
        end: tmax,
        top_n: 1,
      });
      if (baseCands.length > 0) {
        const base = baseCands[0];
        baselineBlock = base;
        changes = toolFindChanges(p, base.start_epoch, base.end_epoch, s, e, 8);
      }
    }

    let peerBlock: any = null;
    if (peerPath) {
      try {
        peerBlock = toolCompareMembers([p, peerPath], 'cpu', s, e, '5m', 'max');
      } catch (pe: any) {
        peerBlock = { error: String(pe?.message ?? pe) };
      }
    }

    const evidence: any[] = [];
    // Reboots and HA failovers go first — they are usually the root cause
    for (const ev of sysEventsArr) {
      if (ev.kind === 'os_reboot' || ev.kind === 'ha_failover') {
        evidence.push(
          E.evidenceRow({
            table: ev.kind === 'os_reboot' ? 'UM_STAT_UM_SYSTEM' : 'cxl_cxl_stats',
            column: ev.kind === 'os_reboot' ? 'uptime' : 'fwha_cpv_failover_counter',
            timestamp: ev.t,
            value: ev.kind === 'os_reboot' ? ev.detail?.uptime_after_str : ev.detail?.failover_count,
            extra: ev.detail,
          }),
        );
      }
    }
    if (hotspots && Array.isArray(hotspots.hotspots)) {
      for (const h of hotspots.hotspots.slice(0, 3)) {
        evidence.push(
          E.evidenceRow({
            table: h.table,
            column: h.column,
            timestamp: h.t,
            value: h.value,
            extra: { zscore: h.zscore },
          }),
        );
      }
    }
    for (const c of (contribCpu.contributors ?? []).slice(0, 2) as ANL.ProcessCpuContributor[]) {
      evidence.push(
        E.evidenceRow({
          table: 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU',
          column: 'top_proc_usage',
          value: c.peak_cpu,
          extra: { process: c.name, pid: c.pid },
        }),
      );
    }

    const nSignals =
      (hotspots.hotspots && hotspots.hotspots.length > 0 ? 1 : 0) +
      (timelineEvs.length > 0 ? 1 : 0) +
      (contribCpu.contributors && contribCpu.contributors.length > 0 ? 1 : 0) +
      (changes && changes.changes && changes.changes.length > 0 ? 1 : 0) +
      (sysEventsArr.length > 0 ? 1 : 0);
    const confidenceLevels = ['low', 'medium', 'medium', 'high', 'high', 'high'];
    const confidence = confidenceLevels[Math.min(nSignals, 5)];

    const lines: string[] = [];
    lines.push(`# CPView History Report — \`${gateway}\``);
    lines.push('');
    lines.push(`- **DB:** \`${p}\``);
    lines.push(`- **Window:** ${T.toIso(s)} → ${T.toIso(e)}  (${Math.floor(durationS / 60)} min)`);
    lines.push(`- **Schema:** ${validate.schema_signature}  (${validate.table_count} tables)`);
    if (focus) lines.push(`- **Focus:** ${focus}`);
    lines.push(`- **Confidence:** **${confidence}**  (${nSignals}/5 signal types present)`);
    if (validate.warnings && validate.warnings.length > 0) {
      lines.push('');
      lines.push('> ! ' + validate.warnings.join('; '));
    }
    lines.push('');

    lines.push('## Executive summary');
    const peakH = hotspots.hotspots && hotspots.hotspots.length > 0 ? hotspots.hotspots[0] : null;
    const topProc =
      contribCpu.contributors && contribCpu.contributors.length > 0
        ? (contribCpu.contributors[0] as ANL.ProcessCpuContributor)
        : null;
    const sentences: string[] = [];
    // Lead with system events — they are most actionable for TAC
    const reboots = sysEventsArr.filter((ev) => ev.kind === 'os_reboot');
    const failovers = sysEventsArr.filter((ev) => ev.kind === 'ha_failover');
    if (reboots.length > 0) {
      sentences.push(`**${reboots.length} OS reboot(s)** detected in window (first at ${reboots[0].iso}).`);
    }
    if (failovers.length > 0) {
      sentences.push(`**${failovers.length} HA failover(s)** detected (first at ${failovers[0].iso}: ${failovers[0].detail?.reason ?? 'unknown reason'}).`);
    }
    if (peakH) {
      sentences.push(
        `Strongest anomaly in window is **${String(peakH.table).replace('UM_STAT_UM_', '')}.${peakH.column} = ${peakH.value}** at ${peakH.iso} (z=${Number(peakH.zscore ?? 0).toFixed(1)}).`,
      );
    }
    if (topProc) {
      sentences.push(`Top CPU consumer was **${topProc.name}** (pid ${topProc.pid}, peak ${topProc.peak_cpu}%).`);
    }
    if (baselineBlock) {
      sentences.push(`A calm baseline window was located at ${baselineBlock.start_iso}.`);
    }
    if (sentences.length === 0) sentences.push('No significant anomalies were detected in this window.');
    lines.push(sentences.join(' '));
    lines.push('');

    lines.push('## System events');
    if (sysEventsArr.length > 0) {
      lines.push(
        mdTable(
          ['kind', 'when', 'detail'],
          sysEventsArr.map((ev) => [ev.kind, ev.iso ?? T.toIso(ev.t), JSON.stringify(ev.detail ?? {})]),
        ),
      );
    } else {
      lines.push('_(no OS reboots or HA state changes detected in window)_');
    }
    lines.push('');

    lines.push('## Incident timeline');
    if (timelineEvs.length > 0) {
      for (const ev of timelineEvs) lines.push(`- \`${ev.iso}\` — ${ev.label}`);
    } else {
      lines.push('_(no notable rise/peak/recover events identified)_');
    }
    lines.push('');

    lines.push('## Top abnormal metrics');
    if (hotspots.hotspots && hotspots.hotspots.length > 0) {
      const rows = hotspots.hotspots.slice(0, 8).map((h: any) => [
        String(h.table).replace('UM_STAT_UM_', ''),
        h.column,
        h.iso,
        h.value,
        Number(h.zscore ?? 0).toFixed(2),
      ]);
      lines.push(mdTable(['table', 'column', 'when', 'value', 'z'], rows));
    } else {
      lines.push('_(none)_');
    }
    lines.push('');

    lines.push('## Contributing processes (CPU)');
    if (contribCpu.contributors && contribCpu.contributors.length > 0) {
      lines.push(
        mdTable(
          ['process', 'pid', 'peak_cpu', 'avg_cpu', 'samples'],
          contribCpu.contributors.map((c: any) => [c.name, c.pid, c.peak_cpu, c.avg_cpu, c.samples]),
        ),
      );
    } else {
      lines.push('_(no top-process samples in window)_');
    }
    lines.push('');

    if (contribMem.contributors && contribMem.contributors.length > 0) {
      lines.push('## Contributing processes (memory)');
      lines.push(
        mdTable(
          ['process', 'pid', 'peak_ram_bytes', 'avg_ram_bytes'],
          contribMem.contributors.map((c: any) => [c.name, c.pid, c.peak_ram_bytes, c.avg_ram_bytes]),
        ),
      );
      lines.push('');
    }

    lines.push('## Per-area findings');
    const labels: Array<[string, string]> = [
      ['CPU per core', 'cpu_per_core'],
      ['Load average', 'load_average'],
      ['Memory used (bytes)', 'memory_used_bytes'],
      ['Memory used ratio', 'memory_used_ratio'],
      ['Swap used', 'swap_used'],
      ['Disk util %', 'iostat_util'],
      ['Disk await ms', 'iostat_await'],
    ];
    for (const [label, key] of labels) {
      const v = (health as any)[key];
      if (v && typeof v === 'object' && v.max !== null && v.max !== undefined) {
        const avg = v.avg;
        const max = v.max;
        const fmt = (n: any) =>
          typeof n === 'number' ? n.toPrecision(3) : String(n);
        lines.push(`- **${label}**: avg=${fmt(avg)}, max=${fmt(max)}`);
      }
    }
    lines.push('');

    if (contribDisk.contributors && contribDisk.contributors.length > 0) {
      lines.push('## Disk hotspots');
      lines.push(
        mdTable(
          ['device', 'peak_util', 'peak_await_ms', 'peak_kbs'],
          contribDisk.contributors.map((c: any) => [c.device, c.peak_util, c.peak_await_ms, c.peak_kbs]),
        ),
      );
      lines.push('');
    }

    if (baselineBlock) {
      lines.push('## Comparison vs baseline');
      lines.push(
        `_Baseline window:_ \`${baselineBlock.start_iso}\` → \`${baselineBlock.end_iso}\` (score ${baselineBlock.score.toFixed(2)})`,
      );
      lines.push('');
      if (changes && changes.changes && changes.changes.length > 0) {
        lines.push(
          mdTable(
            ['table', 'column', 'baseline_avg', 'target_avg', 'pct_change'],
            changes.changes.map((c: any) => [
              String(c.table).replace('UM_STAT_UM_', ''),
              c.column,
              typeof c.baseline_avg === 'number' ? c.baseline_avg.toPrecision(3) : c.baseline_avg,
              typeof c.target_avg === 'number' ? c.target_avg.toPrecision(3) : c.target_avg,
              typeof c.pct_change === 'number' ? (c.pct_change >= 0 ? '+' : '') + c.pct_change.toFixed(1) + '%' : c.pct_change,
            ]),
          ),
        );
      }
      lines.push('');
    }

    if (peerBlock && !peerBlock.error) {
      lines.push('## Cluster member comparison');
      for (const ser of peerBlock.series ?? []) {
        const vals = (ser.points ?? []).map((pt: any) => pt.v).filter((v: any) => v !== null && v !== undefined);
        if (vals.length > 0) {
          const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
          const max = Math.max(...vals);
          lines.push(`- **${ser.gateway}** avg=${avg.toFixed(2)}  max=${max.toFixed(2)}`);
        }
      }
      lines.push('');
    } else if (peerBlock && peerBlock.error) {
      lines.push('## Cluster member comparison');
      lines.push(`_failed: ${peerBlock.error}_`);
      lines.push('');
    }

    lines.push('## Evidence');
    if (evidence.length > 0) {
      const rows = evidence.map((ev) => [
        ev.table ?? '',
        ev.column ?? '',
        ev.iso ?? '',
        ev.value ?? '',
        ev.process ?? ev.device ?? ev.interface ?? '',
      ]);
      lines.push(mdTable(['table', 'column', 'when', 'value', 'subject'], rows));
    } else {
      lines.push('_(no concrete rows pinned)_');
    }
    lines.push('');

    lines.push('## Suggested next checks');
    const suggestions: string[] = [];
    if (topProc && topProc.name) {
      suggestions.push(`- \`analyze_process(path, ${JSON.stringify(topProc.name)})\` — full activity profile`);
    }
    if (peakH) {
      suggestions.push(`- \`snapshot_at(path, ${peakH.t})\` — full state at peak`);
    }
    if (baselineBlock) {
      suggestions.push('- `compare_periods(...)` — diff baseline against incident on a specific metric');
    }
    suggestions.push("- `correlate(path, ['cpu','load','memory'])` — verify whether spikes co-move");
    for (const sLine of suggestions) lines.push(sLine);

    const markdown = lines.join('\n');

    const data: Record<string, any> = {
      gateway,
      focus,
      confidence,
      n_signals: nSignals,
      validate,
      system_events: sysEvents,
      timeline: timelineEvs,
      hotspots,
      top_contributors: { cpu: contribCpu, memory: contribMem, disk: contribDisk },
      health,
      baseline: baselineBlock,
      changes_vs_baseline: changes,
      peer_comparison: peerBlock,
    };
    if (format === 'markdown') data.markdown = markdown;

    const peakCenter = peakH?.t ?? Math.floor((s + e) / 2);
    const nextTools = [
      E.nextTool('investigate_window', 'Focus deeper around the strongest anomaly', { path: p, center_time: peakCenter }),
    ];
    log('generate_report', `gateway=${gateway}  confidence=${confidence}  signals=${nSignals}/5  hotspots=${hotspots?.hotspots?.length??0}  sys_events=${sysEventsArr.length}  baseline=${baselineBlock ? 'yes' : 'no'}`);
    return E.envelope({
      summary: `report generated for ${gateway} (${confidence} confidence)`,
      data,
      time_range: [s, e],
      evidence: evidence.length > 0 ? evidence : null,
      suggested_next_tools: nextTools,
    });
  } catch (ex: any) {
    return E.errEnvelope(String(ex?.message ?? ex));
  }
}

export function toolFindSystemEvents(p: string, start: T.TimeLike, end: T.TimeLike): Record<string, any> {
  try {
    const con = open(p);
    let startE: number, endE: number;
    if (start == null || end == null) {
      const [tmin, tmax] = D.timeRange(con, 'UM_STAT_UM_SYSTEM');
      startE = start != null ? T.parseTime(start as T.TimeLike) : (tmin ?? 0);
      endE = end != null ? T.parseTime(end as T.TimeLike) : (tmax ?? 0);
    } else {
      startE = T.parseTime(start as T.TimeLike);
      endE = T.parseTime(end as T.TimeLike);
    }

    const events: Array<Record<string, any>> = [];

    // Detect OS reboots via uptime string decrease
    if (D.hasTable(con, 'UM_STAT_UM_SYSTEM') && D.hasColumn(con, 'UM_STAT_UM_SYSTEM', 'uptime')) {
      const rows = con
        .prepare('SELECT Timestamp AS t, uptime FROM UM_STAT_UM_SYSTEM WHERE Timestamp BETWEEN ? AND ? ORDER BY Timestamp ASC')
        .all(startE, endE) as Array<{ t: number; uptime: string }>;
      let prev: { t: number; secs: number } | null = null;
      for (const r of rows) {
        const secs = parseUptimeSecs(r.uptime);
        if (secs !== null && prev !== null && secs < prev.secs - 60) {
          events.push({
            kind: 'os_reboot',
            t: r.t,
            iso: T.toIso(r.t),
            detail: {
              uptime_before_secs: prev.secs,
              uptime_after_secs: secs,
              uptime_after_str: r.uptime,
            },
          });
        }
        if (secs !== null) prev = { t: r.t, secs };
      }
    }

    // Detect HA state changes and failovers via cxl_cxl_stats
    if (D.hasTable(con, 'cxl_cxl_stats')) {
      const cols = D.tableColumns(con, 'cxl_cxl_stats').map((c) => c.name);
      const hasCols = (names: string[]) => names.every((n) => cols.includes(n));
      if (
        hasCols([
          'fwha_cpv_last_state_change',
          'fwha_cpv_last_state_event',
          'fwha_cpv_failover_counter',
          'fwha_cpv_last_failover_reason',
          'fwha_cpv_last_failover_from',
        ])
      ) {
        const haRows = con
          .prepare(
            'SELECT Timestamp AS t, fwha_cpv_last_state_change, fwha_cpv_last_state_event, ' +
              'fwha_cpv_failover_counter, fwha_cpv_last_failover_reason, fwha_cpv_last_failover_from ' +
              'FROM cxl_cxl_stats WHERE Timestamp BETWEEN ? AND ? ORDER BY Timestamp ASC',
          )
          .all(startE, endE) as Array<{
          t: number;
          fwha_cpv_last_state_change: string;
          fwha_cpv_last_state_event: string;
          fwha_cpv_failover_counter: number;
          fwha_cpv_last_failover_reason: string;
          fwha_cpv_last_failover_from: string;
        }>;
        let prevState: string | null = null;
        let prevFailoverCount: number | null = null;
        for (const r of haRows) {
          if (prevState !== null && r.fwha_cpv_last_state_change !== prevState) {
            events.push({
              kind: 'ha_state_change',
              t: r.t,
              iso: T.toIso(r.t),
              detail: {
                from: prevState,
                to: r.fwha_cpv_last_state_change,
                event: r.fwha_cpv_last_state_event,
              },
            });
          }
          if (prevFailoverCount !== null && r.fwha_cpv_failover_counter > prevFailoverCount) {
            events.push({
              kind: 'ha_failover',
              t: r.t,
              iso: T.toIso(r.t),
              detail: {
                failover_count: r.fwha_cpv_failover_counter,
                from: r.fwha_cpv_last_failover_from,
                reason: r.fwha_cpv_last_failover_reason,
                new_state: r.fwha_cpv_last_state_change,
              },
            });
          }
          prevState = r.fwha_cpv_last_state_change;
          prevFailoverCount = r.fwha_cpv_failover_counter;
        }
      }
    }

    events.sort((a, b) => a.t - b.t);

    // Check for state mismatch between authoritative and cached state
    const warnings: string[] = [];
    if (D.hasTable(con, 'cxl_cxl_stats') && D.hasTable(con, 'cxl_cxl_stats_status')) {
      try {
        // Find the latest non-ACTIVE state in cxl_cxl_stats
        const authState = con.prepare(
          `SELECT fwha_cpv_last_state_change, MIN(Timestamp) AS first_t, MAX(Timestamp) AS last_t, COUNT(*) AS c ` +
          `FROM cxl_cxl_stats WHERE Timestamp BETWEEN ? AND ? AND fwha_cpv_last_state_change != 'ACTIVE' ` +
          `GROUP BY fwha_cpv_last_state_change ORDER BY c DESC LIMIT 5`
        ).all(startE, endE) as Array<{ fwha_cpv_last_state_change: string; first_t: number; last_t: number; c: number }>;

        const statusActive = con.prepare(
          `SELECT COUNT(*) AS c FROM cxl_cxl_stats_status ` +
          `WHERE Timestamp BETWEEN ? AND ? AND member_id LIKE '%(local)%' AND member_state = 'ACTIVE'`
        ).get(startE, endE) as { c: number } | undefined;

        for (const row of authState) {
          if (statusActive && statusActive.c > 0) {
            warnings.push(
              `HA state mismatch: cxl_cxl_stats_status shows ACTIVE for local member across the window, ` +
              `but cxl_cxl_stats.fwha_cpv_last_state_change shows '${row.fwha_cpv_last_state_change}' ` +
              `from ${T.toIso(row.first_t)} to ${T.toIso(row.last_t)} (${row.c} samples). ` +
              `The cxl_cxl_stats column is authoritative (local fwha state machine).`
            );
          }
        }
      } catch { /* ignore */ }
    }

    log('find_system_events', `window=${T.toIso(startE)}→${T.toIso(endE)}  total_events=${events.length}  kinds=[${[...new Set(events.map(e=>e.kind))].join(',')}]`);
    return {
      window: { start: startE, end: endE, start_iso: T.toIso(startE), end_iso: T.toIso(endE) },
      events,
      count: events.length,
      event_kinds: [...new Set(events.map((e) => e.kind))],
      warnings,
    };
  } catch (e: any) {
    return errPayload(String(e?.message ?? e));
  }
}

// ===================================================================
// Resource implementations (return JSON-encoded strings)
// ===================================================================

function resGlossary(): string {
  return JSON.stringify({ aliases: A.ALIASES, glossary: A.GLOSSARY, categories: A.CATEGORIES }, null, 2);
}

function resTables(p: string): string {
  let con: Database;
  try {
    con = open(p);
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message ?? e) });
  }
  const out: Array<Record<string, any>> = [];
  for (const t of D.listTables(con)) {
    let n: number | null = null;
    try {
      const r = con.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number } | undefined;
      n = r?.n ?? null;
    } catch {
      n = null;
    }
    const [tmin, tmax] = D.timeRange(con, t);
    out.push({ table: t, rows: n, time_min: tmin, time_max: tmax });
  }
  return JSON.stringify(out, null, 2);
}

function resSchema(p: string): string {
  let con: Database;
  try {
    con = open(p);
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message ?? e) });
  }
  const out: Record<string, any> = {};
  for (const t of D.listTables(con)) {
    out[t] = D.tableColumns(con, t);
  }
  return JSON.stringify(out, null, 2);
}

function resOverview(p: string): string {
  return JSON.stringify(toolInspectDatabase(p), jsonReplacer, 2);
}

// ===================================================================
// Public: register all tools + resources onto the MCP server.
// ===================================================================

// Schema text cache for find_tables: keyed by DB path, rebuilt only on first call per path.
// The CPViewDB schema is static during a session — safe to cache indefinitely.
const schemaTextCache = new Map<string, string>();

export function registerCpviewTools(server: CPMcpServer): number {
  let registered = 0;
  const inc = () => {
    registered += 1;
  };

  // Logging wrapper: every tool call logs name + key args → result size + timing to stderr.
  // stderr is displayed in the VSCode Output panel under the MCP server name.
  function withLog(
    name: string,
    handler: (args: any) => Promise<ToolResult>,
  ): (args: any) => Promise<ToolResult> {
    return async (args: any) => {
      const t0 = Date.now();
      // Build a compact hint from the most useful args
      const hints: string[] = [];
      if (args.path)    hints.push(`file=${String(args.path).split(/[\\/]/).pop()}`);
      if (args.folder)  hints.push(`folder=${args.folder}`);
      if (args.table)   hints.push(`table=${args.table}`);
      if (args.keyword) hints.push(`kw=${args.keyword}`);
      if (args.column)  hints.push(`col=${args.column}`);
      if (args.mode)    hints.push(`mode=${args.mode}`);
      if (args.metric)  hints.push(`metric=${args.metric}`);
      if (args.process_name) hints.push(`proc=${args.process_name}`);
      if (args.query)        hints.push(`q=${String(args.query).slice(0, 40)}`);
      console.error(`[cpview] → ${name}  ${hints.join('  ')}`);
      try {
        const result = await handler(args);
        const bytes = result.content?.[0]?.text?.length ?? 0;
        const kb = (bytes / 1024).toFixed(1);
        console.error(`[cpview] ✓ ${name}  ${Date.now() - t0}ms  ${kb}kb`);
        return result;
      } catch (e: any) {
        console.error(`[cpview] ✗ ${name}  ERROR: ${e?.message ?? e}  ${Date.now() - t0}ms`);
        throw e;
      }
    };
  }

  // Local alias so every registration gets logging without touching call sites individually
  const tool = (name: string, desc: string, schema: any, handler: (args: any) => Promise<ToolResult>) =>
    server.tool(name, desc, schema, withLog(name, handler));

  // 1. list_cpview_files
  tool(
    'list_cpview_files',
    "Recursively scan a folder for CPViewDB.dat files. Returns each file with detected gateway hostname, size, and time range.",
    {
      folder: z.string().describe('Folder to scan'),
      max_depth: z.number().int().positive().optional().describe('Maximum recursion depth (default 6)'),
    },
    async (args: any) => asResult(toolListCpviewFiles(args.folder, args.max_depth ?? 6)),
  );
  inc();

  // 2. inspect_database
  tool(
    'inspect_database',
    'Return headline metrics and time coverage for a CPViewDB.dat. ' +
    'When the database is from a cluster member, includes an ha_context block that identifies ' +
    'the authoritative HA state column (cxl_cxl_stats.fwha_cpv_last_state_change) vs the misleading ' +
    'CCP cache (cxl_cxl_stats_status.member_state), and warns when they disagree.',
    { path: z.string().describe('Path to CPViewDB.dat') },
    async (args: any) => asResult(toolInspectDatabase(args.path)),
  );
  inc();

  // 3. search_schema
  tool(
    'search_schema',
    'Fuzzy search tables and columns for a keyword.',
    {
      path: z.string(),
      keyword: z.string(),
      limit: z.number().int().positive().optional(),
    },
    async (args: any) => asResult(toolSearchSchema(args.path, args.keyword, args.limit ?? 30)),
  );
  inc();

  // 4. time_convert
  tool(
    'time_convert',
    "Convert between time formats. Accepts epoch, ISO 8601, or relative like '1h ago' / 'now'.",
    { value: z.string(), tz: z.string().optional() },
    async (args: any) => asResult(toolTimeConvert(args.value, args.tz ?? null)),
  );
  inc();

  // 5. query_range
  tool(
    'query_range',
    'Raw rows from a table within [start, end]. Supports cursor pagination. Known FK columns (if_name, disk_path, top_proc_name, etc.) are resolved to their string values by default; set resolve_names=false to get raw integer IDs.',
    {
      path: z.string(),
      table: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      columns: z.array(z.string()).optional(),
      where: z.string().optional(),
      limit: z.number().int().positive().optional(),
      cursor: z.union([z.string(), z.number()]).optional(),
      order: z.enum(['asc', 'desc']).optional(),
      resolve_names: z.boolean().optional().describe('Auto-resolve known FK columns via cpview_ref_table (default true)'),
    },
    async (args: any) =>
      asResult(
        toolQueryRange(
          args.path,
          args.table,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.columns ?? null,
          args.where ?? null,
          args.limit ?? 5000,
          (args.cursor ?? null) as T.TimeLike,
          args.order ?? 'asc',
          args.resolve_names ?? true,
        ),
      ),
  );
  inc();

  // 6. aggregate
  tool(
    'aggregate',
    'Downsampled multi-column time series with optional group_by.',
    {
      path: z.string(),
      table: z.string(),
      columns: z.array(z.string()),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      bucket: z.union([z.string(), z.number()]).optional(),
      agg: z.enum(['avg', 'min', 'max', 'sum', 'count']).optional(),
      group_by: z.string().optional(),
      limit: z.number().int().positive().optional(),
    },
    async (args: any) =>
      asResult(
        toolAggregate(
          args.path,
          args.table,
          args.columns,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          (args.bucket ?? null) as string | number | null,
          args.agg ?? 'avg',
          args.group_by ?? null,
          args.limit ?? 5000,
        ),
      ),
  );
  inc();

  // 7. snapshot_at
  tool(
    'snapshot_at',
    'Nearest rows in each named table within ± tolerance of the given timestamp.',
    {
      path: z.string(),
      timestamp: z.union([z.string(), z.number()]),
      tables: z.array(z.string()).optional(),
      tolerance_seconds: z.number().int().positive().optional(),
    },
    async (args: any) => asResult(toolSnapshotAt(args.path, args.timestamp, args.tables ?? null, args.tolerance_seconds ?? 60)),
  );
  inc();

  // 8. find_events
  tool(
    'find_events',
    "Find peaks / threshold crossings / zscore outliers / largest deltas in a metric column.",
    {
      path: z.string(),
      table: z.string(),
      column: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      mode: z.enum(['peaks', 'threshold', 'zscore', 'delta']).optional(),
      top_n: z.number().int().positive().optional(),
      min_gap_seconds: z.number().int().nonnegative().optional(),
      threshold: z.number().optional(),
      op: z.string().optional(),
      zscore: z.number().optional(),
    },
    async (args: any) =>
      asResult(
        toolFindEvents(
          args.path,
          args.table,
          args.column,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.mode ?? 'peaks',
          args.top_n ?? 20,
          args.min_gap_seconds ?? 300,
          args.threshold ?? null,
          args.op ?? '>',
          args.zscore ?? 3.0,
        ),
      ),
  );
  inc();

  // 9. find_hotspots
  tool(
    'find_hotspots',
    'Scan all core metric tables (CPU, load, memory, disk, kernel mem, connections, slow-path %, interface errors) ' +
      'across the window and return the top extreme moments by Z-score plus any sustained-high metrics.',
    {
      path: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      top_n: z.number().int().positive().optional(),
    },
    async (args: any) =>
      asResult(
        toolFindHotspots(
          args.path,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.top_n ?? 5,
        ),
      ),
  );
  inc();

  // 10. find_changes
  tool(
    'find_changes',
    'For each core metric, compute (avg_target - avg_baseline) and rank by percent change.',
    {
      path: z.string(),
      baseline_start: z.union([z.string(), z.number()]),
      baseline_end: z.union([z.string(), z.number()]),
      target_start: z.union([z.string(), z.number()]),
      target_end: z.union([z.string(), z.number()]),
      top_n: z.number().int().positive().optional(),
    },
    async (args: any) =>
      asResult(
        toolFindChanges(args.path, args.baseline_start, args.baseline_end, args.target_start, args.target_end, args.top_n ?? 15),
      ),
  );
  inc();

  // 11. correlate
  tool(
    'correlate',
    'Pearson correlation matrix across multiple metrics over a window.',
    {
      path: z.string(),
      metrics: z.array(z.string()),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      bucket: z.union([z.string(), z.number()]).optional(),
    },
    async (args: any) =>
      asResult(
        toolCorrelate(
          args.path,
          args.metrics,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          (args.bucket ?? null) as string | number | null,
        ),
      ),
  );
  inc();

  // 12. compare_periods
  tool(
    'compare_periods',
    'Same metric, two windows. Returns per-column agg for A, B and delta.',
    {
      path: z.string(),
      table: z.string(),
      columns: z.array(z.string()),
      period_a_start: z.union([z.string(), z.number()]),
      period_a_end: z.union([z.string(), z.number()]),
      period_b_start: z.union([z.string(), z.number()]),
      period_b_end: z.union([z.string(), z.number()]),
      agg: z.enum(['avg', 'min', 'max', 'sum', 'count']).optional(),
    },
    async (args: any) =>
      asResult(
        toolComparePeriods(
          args.path,
          args.table,
          args.columns,
          args.period_a_start,
          args.period_a_end,
          args.period_b_start,
          args.period_b_end,
          args.agg ?? 'avg',
        ),
      ),
  );
  inc();

  // 13. compare_members
  tool(
    'compare_members',
    'Side-by-side time series of one metric across cluster members.',
    {
      paths: z.array(z.string()),
      metric: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      bucket: z.union([z.string(), z.number()]).optional(),
      agg: z.enum(['avg', 'min', 'max', 'sum', 'count']).optional(),
    },
    async (args: any) =>
      asResult(
        toolCompareMembers(
          args.paths,
          args.metric,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          (args.bucket ?? null) as string | number | null,
          args.agg ?? 'avg',
        ),
      ),
  );
  inc();

  // 14. health_summary
  tool(
    'health_summary',
    'Deep summary of a time window: CPU/load/mem/disk highlights, top processes, anomaly counts. ' +
    'When the gateway is a cluster member, includes ha_state_dwell showing time spent in each HA state ' +
    '(ACTIVE / DOWN / ACTIVE(!) etc.) from the authoritative cxl_cxl_stats table. ' +
    'Emits status_table_warning when cxl_cxl_stats_status disagrees with the authoritative state.',
    {
      path: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
    },
    async (args: any) =>
      asResult(toolHealthSummary(args.path, (args.start ?? null) as T.TimeLike, (args.end ?? null) as T.TimeLike)),
  );
  inc();

  // 15. export_csv
  tool(
    'export_csv',
    'Export query results to a local CSV file. Provide either `table` (+ time range/columns) OR `sql`.',
    {
      path: z.string(),
      output_path: z.string(),
      table: z.string().optional(),
      sql: z.string().optional(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      columns: z.array(z.string()).optional(),
      limit: z.number().int().positive().optional(),
    },
    async (args: any) =>
      asResult(
        toolExportCsv(
          args.path,
          args.output_path,
          args.table ?? null,
          args.sql ?? null,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.columns ?? null,
          args.limit ?? 1_000_000,
        ),
      ),
  );
  inc();

  // 16. sql_read
  tool(
    'sql_read',
    'Read-only SQL escape hatch with EXPLAIN scan detection, large-table guard, and byte budget.',
    {
      path: z.string(),
      query: z.string(),
      params: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
      limit: z.number().int().positive().optional(),
      timeout_seconds: z.number().positive().optional(),
      allow_full_scan: z.boolean().optional(),
      max_bytes: z.number().int().positive().optional(),
    },
    async (args: any) =>
      asResult(
        toolSqlRead(
          args.path,
          args.query,
          args.params ?? null,
          args.limit ?? 10000,
          args.timeout_seconds ?? 30,
          args.allow_full_scan ?? false,
          args.max_bytes ?? 8_000_000,
        ),
      ),
  );
  inc();

  // 17. validate_cpview_db
  tool(
    'validate_cpview_db',
    'Structural validation of a CPViewDB file: required tables, ref-table sanity, TZ decoding.',
    { path: z.string() },
    async (args: any) => asResult(toolValidateCpviewDb(args.path)),
  );
  inc();

  // 18. explain_metric
  tool(
    'explain_metric',
    "Human-readable explanation of a metric alias or 'table.column'.",
    { metric: z.string() },
    async (args: any) => asResult(toolExplainMetric(args.metric)),
  );
  inc();

  // 19. find_baseline_periods
  tool(
    'find_baseline_periods',
    "Automatically locate calm windows of the given duration.",
    {
      path: z.string(),
      duration: z.string().optional(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      top_n: z.number().int().positive().optional(),
    },
    async (args: any) =>
      asResult(
        toolFindBaselinePeriods(
          args.path,
          args.duration ?? '1h',
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.top_n ?? 3,
        ),
      ),
  );
  inc();

  // 20. analyze_process
  tool(
    'analyze_process',
    'Per-process activity report (CPU + memory, resolved via cpview_ref_table).',
    {
      path: z.string(),
      process_name: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      bucket: z.string().optional(),
    },
    async (args: any) =>
      asResult(
        toolAnalyzeProcess(
          args.path,
          args.process_name,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.bucket ?? '1m',
        ),
      ),
  );
  inc();

  // 21. top_contributors
  tool(
    'top_contributors',
    "Rank top contributors for an aggregate metric (cpu/load/memory/disk/network).",
    {
      path: z.string(),
      metric: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      top_n: z.number().int().positive().optional(),
    },
    async (args: any) =>
      asResult(
        toolTopContributors(
          args.path,
          args.metric,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.top_n ?? 10,
        ),
      ),
  );
  inc();

  // 22. build_timeline
  tool(
    'build_timeline',
    "Chronological event timeline across key metrics (rise / peak / recover).",
    {
      path: z.string(),
      start: z.union([z.string(), z.number()]),
      end: z.union([z.string(), z.number()]),
      granularity: z.string().optional(),
    },
    async (args: any) => asResult(toolBuildTimeline(args.path, args.start, args.end, args.granularity ?? '1m')),
  );
  inc();

  // 23. investigate_window
  tool(
    'investigate_window',
    'One-call incident investigation around `center_time`. ' +
      'Runs hotspots, timeline, system events, health summary, top contributors, and baseline comparison in one shot.',
    {
      path: z.string(),
      center_time: z.union([z.string(), z.number()]),
      before: z.string().optional(),
      after: z.string().optional(),
      include_processes: z.boolean().optional(),
      compare_to_baseline: z.boolean().optional(),
    },
    async (args: any) =>
      asResult(
        toolInvestigateWindow(
          args.path,
          args.center_time,
          args.before ?? '30m',
          args.after ?? '30m',
          args.include_processes ?? true,
          args.compare_to_baseline ?? true,
        ),
      ),
  );
  inc();

  // 24. generate_report
  tool(
    'generate_report',
    'Polished TAC-style handoff narrative for a window.',
    {
      path: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
      focus: z.string().optional(),
      format: z.enum(['markdown']).optional(),
      peer_path: z.string().optional(),
    },
    async (args: any) =>
      asResult(
        toolGenerateReport(
          args.path,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
          args.focus ?? null,
          args.format ?? 'markdown',
          args.peer_path ?? null,
        ),
      ),
  );
  inc();

  // 25. find_system_events
  tool(
    'find_system_events',
    'Detect system-level events: OS reboots (uptime decreases) and HA state changes / failovers. ' +
    'HA state is read from cxl_cxl_stats.fwha_cpv_last_state_change (authoritative — local fwha state machine, includes ACTIVE(!) degraded flag). ' +
    'The cxl_cxl_stats_status.member_state column reflects CCP membership cache and may be stale during a local DOWN — never use it for state analysis. ' +
    'Returns a warnings[] array when cxl_cxl_stats_status and cxl_cxl_stats disagree.',
    {
      path: z.string(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
    },
    async (args: any) =>
      asResult(
        toolFindSystemEvents(
          args.path,
          (args.start ?? null) as T.TimeLike,
          (args.end ?? null) as T.TimeLike,
        ),
      ),
  );
  inc();

  // 26. find_tables — semantic table discovery via MCP sampling (no API key needed)
  // Uses server.server.createMessage() to ask the host agent to rank tables by relevance.
  // Gracefully falls back with a clear error if the client doesn't support sampling.
  server.tool(
    'find_tables',
    'Semantic table discovery: given a natural-language query (e.g. "HA failover state machine", ' +
      '"routing BGP peers", "per-process CPU over time"), returns the most relevant tables from the ' +
      'full schema using LLM reasoning. Use this when you know the concept but not the table name. ' +
      'Prefer this over search_schema for concept-based discovery; use search_schema for column-level lookup.',
    {
      path: z.string().describe('Path to CPViewDB.dat'),
      query: z.string().describe('Natural-language description of what you are looking for'),
      top_n: z.number().int().min(1).max(20).optional().describe('Number of tables to return (default 10)'),
    },
    withLog('find_tables', async (args: any) => {
      const con = open(args.path);
      const topN: number = args.top_n ?? 10;

      // Build (or retrieve cached) compact schema string: "TABLE_NAME: col1, col2, col3" per line.
      // The schema is static for a given DB file — cache avoids re-reading 400+ tables on repeat calls.
      let schemaText = schemaTextCache.get(args.path);
      if (!schemaText) {
        const tables = D.listTables(con);
        schemaText = tables
          .map((t) => {
            const cols = D.tableColumns(con, t).map((c: any) => c.name).join(', ');
            return `${t}: ${cols}`;
          })
          .join('\n');
        schemaTextCache.set(args.path, schemaText);
      }
      const totalTables = schemaText.split('\n').length;

      let ranked: any[] = [];
      try {
        const samplingResult = await (server as any).server.createMessage({
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text:
                  `You are a CPView SQLite database schema expert.\n` +
                  `The user is investigating: "${args.query}"\n\n` +
                  `Below is the full schema (table name: column names).\n` +
                  `Return the ${topN} most relevant tables as a JSON array.\n` +
                  `Respond ONLY with the JSON — no explanation, no markdown fences.\n` +
                  `Format: [{"table":"<name>","reason":"<one sentence why relevant>"}]\n\n` +
                  `Schema:\n${schemaText}`,
              },
            },
          ],
          maxTokens: 1500,
          modelPreferences: { speedPriority: 1 }, // request fast model
        });

        const text: string =
          samplingResult.content?.type === 'text' ? (samplingResult.content as any).text : '';
        const match = text.match(/\[[\s\S]*\]/);
        if (match) ranked = JSON.parse(match[0]);
      } catch (e: any) {
        return asResult({
          error: 'sampling_not_supported',
          message: String(e?.message ?? e),
          fallback_hint: 'Use search_schema(path, keyword) with a domain keyword (e.g. "routed", "cxl", "fw") to discover tables manually.',
        });
      }

      return asResult({
        query: args.query,
        total_tables_scanned: totalTables,
        schema_cached: schemaTextCache.has(args.path),
        top_n: topN,
        tables: ranked,
        usage_hint: ranked.length > 0
          ? `Use query_range or aggregate on these tables to investigate. Call search_schema(path, tableName) for full column details.`
          : `No relevant tables found — try search_schema(path, keyword) with a domain keyword (e.g. 'routed', 'fw', 'ppak').`,
      });
    }),
  );
  inc();

  // ===== Resources =====
  registerResources(server);

  return registered;
}

function registerResources(server: CPMcpServer): void {
  const anyServer = server as any;

  // Static resource: cpview://glossary
  anyServer.resource('glossary', 'cpview://glossary', async (uri: URL) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: resGlossary() }],
  }));

  // Templated resources
  try {
    const tablesTpl = new ResourceTemplate('cpview://{path}/tables', { list: undefined });
    anyServer.resource('cpview-tables', tablesTpl, async (uri: URL, vars: any) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: resTables(decodeURIComponent(vars.path)) }],
    }));

    const schemaTpl = new ResourceTemplate('cpview://{path}/schema', { list: undefined });
    anyServer.resource('cpview-schema', schemaTpl, async (uri: URL, vars: any) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: resSchema(decodeURIComponent(vars.path)) }],
    }));

    const overviewTpl = new ResourceTemplate('cpview://{path}/overview', { list: undefined });
    anyServer.resource('cpview-overview', overviewTpl, async (uri: URL, vars: any) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: resOverview(decodeURIComponent(vars.path)) }],
    }));
  } catch (e) {
    console.error('[cpview-history-mcp] Failed to register templated resources:', e);
  }
}
