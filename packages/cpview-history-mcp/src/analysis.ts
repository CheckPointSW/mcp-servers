/**
 * Shared analysis primitives used by the higher-level investigation tools.
 */

import type { DatabaseSync as Database } from 'node:sqlite';
import * as D from './db.js';
import * as T from './timeutil.js';

// ---------------------------------------------------------------------------
// Process name <-> seq resolution (cpview_ref_table interning)
// ---------------------------------------------------------------------------

export function resolveProcessSeqs(con: Database, name: string): Array<[number, string]> {
  try {
    const exact = con
      .prepare('SELECT seq, val FROM cpview_ref_table WHERE val = ? COLLATE NOCASE')
      .all(name) as Array<{ seq: number; val: string }>;
    if (exact.length > 0) {
      return exact.map((r) => [r.seq, r.val]);
    }
    const like = con
      .prepare(
        'SELECT seq, val FROM cpview_ref_table WHERE val LIKE ? COLLATE NOCASE ORDER BY length(val) ASC LIMIT 25',
      )
      .all(`%${name}%`) as Array<{ seq: number; val: string }>;
    return like.map((r) => [r.seq, r.val]);
  } catch {
    return [];
  }
}

export function resolveSeqMap(con: Database, seqs: Array<number | null | undefined>): Map<number, string> {
  const uniq = Array.from(new Set(seqs.filter((s): s is number => typeof s === 'number' && Number.isInteger(s)))).sort((a, b) => a - b);
  const out = new Map<number, string>();
  if (uniq.length === 0) return out;
  const placeholders = uniq.map(() => '?').join(',');
  try {
    const rows = con
      .prepare(`SELECT seq, val FROM cpview_ref_table WHERE seq IN (${placeholders})`)
      .all(...uniq) as Array<{ seq: number; val: string }>;
    for (const r of rows) out.set(r.seq, r.val);
  } catch {
    // ignore
  }
  return out;
}

// ---------------------------------------------------------------------------
// Baseline finder
// ---------------------------------------------------------------------------

const BASELINE_METRICS: Array<{ table: string; column: string; agg: string }> = [
  { table: 'UM_STAT_UM_CPU_UM_CPU_TABLE', column: 'cpu_usage', agg: 'max' },
  { table: 'UM_STAT_UM_SYSTEM', column: 'load_average', agg: 'max' },
  { table: 'UM_STAT_UM_MEMORY', column: 'real_used', agg: 'avg' },
];

export interface BaselineCandidate {
  start_epoch: number;
  end_epoch: number;
  start_iso: string;
  end_iso: string;
  score: number;
  metrics: Array<{ table: string; column: string; avg: number | null; max: number | null }>;
}

export interface FindBaselineOpts {
  duration_seconds: number;
  start: number;
  end: number;
  top_n?: number;
}

export function findBaselinePeriods(con: Database, opts: FindBaselineOpts): BaselineCandidate[] {
  const topN = opts.top_n ?? 3;
  if (opts.end - opts.start < opts.duration_seconds) return [];
  const step = Math.max(60, Math.floor(opts.duration_seconds / 2));

  type Stat = { table: string; column: string; lo: number; hi: number; mu: number; rng: number };
  const metricStats: Stat[] = [];
  for (const m of BASELINE_METRICS) {
    if (!D.hasTable(con, m.table) || !D.hasColumn(con, m.table, m.column)) continue;
    const row = con
      .prepare(
        `SELECT MIN("${m.column}") AS lo, MAX("${m.column}") AS hi, AVG("${m.column}") AS mu FROM "${m.table}" WHERE "Timestamp" BETWEEN ? AND ?`,
      )
      .get(opts.start, opts.end) as { lo: number | null; hi: number | null; mu: number | null } | undefined;
    if (!row || row.lo === null) continue;
    metricStats.push({
      table: m.table,
      column: m.column,
      lo: row.lo,
      hi: row.hi ?? 0,
      mu: row.mu ?? 0,
      rng: Math.max(1e-9, (row.hi ?? 0) - (row.lo ?? 0)),
    });
  }
  if (metricStats.length === 0) return [];

  const candidates: BaselineCandidate[] = [];
  let t = opts.start;
  while (t + opts.duration_seconds <= opts.end) {
    const wStart = t;
    const wEnd = t + opts.duration_seconds;
    let totalScore = 0;
    const perMetric: BaselineCandidate['metrics'] = [];
    let skip = false;
    for (const m of metricStats) {
      const r = con
        .prepare(
          `SELECT AVG("${m.column}") AS mu, MAX("${m.column}") AS hi FROM "${m.table}" WHERE "Timestamp" BETWEEN ? AND ?`,
        )
        .get(wStart, wEnd) as { mu: number | null; hi: number | null } | undefined;
      if (!r || r.mu === null) {
        skip = true;
        break;
      }
      if (r.hi !== null && r.hi >= m.hi * 0.95) {
        skip = true;
        break;
      }
      const norm = ((r.hi ?? 0) - m.lo) / m.rng;
      totalScore += norm;
      perMetric.push({ table: m.table, column: m.column, avg: r.mu, max: r.hi });
    }
    if (!skip) {
      candidates.push({
        start_epoch: wStart,
        end_epoch: wEnd,
        start_iso: T.toIso(wStart),
        end_iso: T.toIso(wEnd),
        score: totalScore,
        metrics: perMetric,
      });
    }
    t += step;
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, topN);
}

// ---------------------------------------------------------------------------
// Top contributors
// ---------------------------------------------------------------------------

// FK-resolved names can come back as a string (resolved) or the raw numeric seq id
// when no mapping exists, hence `string | number` for name/device/interface fields.
export interface ProcessCpuContributor {
  name: string | number;
  pid: number;
  peak_cpu: number;
  avg_cpu: number;
  samples: number;
}
export interface ProcessMemContributor {
  name: string | number;
  pid: number;
  peak_ram_bytes: number;
  avg_ram_bytes: number;
  samples: number;
}
export interface DiskContributor {
  device: string | number;
  peak_util: number;
  avg_util: number;
  peak_await_ms: number;
  avg_await_ms: number;
  peak_kbs: number;
  samples: number;
}
export interface NetworkContributor {
  kind: 'rx' | 'tx';
  interface: string | number;
  peak: number;
  avg: number;
  column: string;
  samples: number;
}
export type Contributor =
  | ProcessCpuContributor
  | ProcessMemContributor
  | DiskContributor
  | NetworkContributor;

export interface ContributorsResult {
  metric: string;
  kind?: string;
  contributors: Contributor[];
  warning?: string;
}

export function topContributorsFor(
  con: Database,
  metricIn: string,
  start: number,
  end: number,
  topN = 10,
): ContributorsResult {
  const metric = metricIn.toLowerCase();

  if (metric === 'cpu' || metric === 'load' || metric === 'process_cpu') {
    if (!D.hasTable(con, 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU')) {
      return { metric, contributors: [], warning: 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU missing' };
    }
    const rows = con
      .prepare(
        'SELECT top_proc_name, top_proc_pid, MAX(top_proc_usage) AS peak, AVG(top_proc_usage) AS avg_cpu, COUNT(*) AS samples ' +
          'FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU WHERE Timestamp BETWEEN ? AND ? ' +
          'GROUP BY top_proc_name, top_proc_pid ORDER BY peak DESC LIMIT ?',
      )
      .all(start, end, topN) as Array<{
      top_proc_name: number;
      top_proc_pid: number;
      peak: number;
      avg_cpu: number;
      samples: number;
    }>;
    const names = resolveSeqMap(con, rows.map((r) => r.top_proc_name));
    return {
      metric,
      kind: 'process',
      contributors: rows.map((r) => ({
        name: names.get(r.top_proc_name) ?? r.top_proc_name,
        pid: r.top_proc_pid,
        peak_cpu: r.peak,
        avg_cpu: r.avg_cpu,
        samples: r.samples,
      })),
    };
  }

  if (metric === 'memory' || metric === 'mem') {
    if (!D.hasTable(con, 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM')) {
      return { metric, contributors: [], warning: 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM missing' };
    }
    const rows = con
      .prepare(
        'SELECT top_proc_name, top_proc_pid, MAX(top_proc_used_ram_bytes) AS peak, AVG(top_proc_used_ram_bytes) AS avg_ram, COUNT(*) AS samples ' +
          'FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM WHERE Timestamp BETWEEN ? AND ? ' +
          'GROUP BY top_proc_name, top_proc_pid ORDER BY peak DESC LIMIT ?',
      )
      .all(start, end, topN) as Array<{
      top_proc_name: number;
      top_proc_pid: number;
      peak: number;
      avg_ram: number;
      samples: number;
    }>;
    const names = resolveSeqMap(con, rows.map((r) => r.top_proc_name));
    return {
      metric,
      kind: 'process',
      contributors: rows.map((r) => ({
        name: names.get(r.top_proc_name) ?? r.top_proc_name,
        pid: r.top_proc_pid,
        peak_ram_bytes: r.peak,
        avg_ram_bytes: r.avg_ram,
        samples: r.samples,
      })),
    };
  }

  if (metric === 'disk' || metric === 'iostat' || metric === 'io') {
    if (!D.hasTable(con, 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE')) {
      return { metric, contributors: [], warning: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE missing' };
    }
    const rows = con
      .prepare(
        'SELECT device_name, MAX(util) AS peak_util, AVG(util) AS avg_util, MAX(await) AS peak_await, AVG(await) AS avg_await, ' +
          'MAX(rkbs+wkbs) AS peak_kbs, COUNT(*) AS samples FROM UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE ' +
          'WHERE Timestamp BETWEEN ? AND ? GROUP BY device_name ORDER BY peak_util DESC LIMIT ?',
      )
      .all(start, end, topN) as Array<{
      device_name: number;
      peak_util: number;
      avg_util: number;
      peak_await: number;
      avg_await: number;
      peak_kbs: number;
      samples: number;
    }>;
    const names = resolveSeqMap(con, rows.map((r) => r.device_name));
    return {
      metric,
      kind: 'device',
      contributors: rows.map((r) => ({
        device: names.get(r.device_name) ?? r.device_name,
        peak_util: r.peak_util,
        avg_util: r.avg_util,
        peak_await_ms: r.peak_await,
        avg_await_ms: r.avg_await,
        peak_kbs: r.peak_kbs,
        samples: r.samples,
      })),
    };
  }

  if (metric === 'network' || metric === 'net' || metric === 'interface' || metric === 'if') {
    const contributors: NetworkContributor[] = [];
    const tables: Array<[string, string, 'rx' | 'tx']> = [
      ['UM_STAT_UM_HW_UM_IF_RX_STATISTICS_TABLE', 'rx_bytes', 'rx'],
      ['UM_STAT_UM_HW_UM_IF_TX_STATISTICS_TABLE', 'tx_bytes', 'tx'],
    ];
    for (const [table, col, kind] of tables) {
      if (!D.hasTable(con, table) || !D.hasColumn(con, table, col)) continue;
      const cols = D.tableColumns(con, table).map((c) => c.name);
      const ifCol = ['interface_name', 'if_name', 'name'].find((c) => cols.includes(c));
      if (!ifCol) continue;
      const rows = con
        .prepare(
          `SELECT "${ifCol}" AS iface, MAX("${col}") AS peak, AVG("${col}") AS avg_v, COUNT(*) AS samples FROM "${table}" WHERE Timestamp BETWEEN ? AND ? GROUP BY iface ORDER BY peak DESC LIMIT ?`,
        )
        .all(start, end, topN) as Array<{ iface: number; peak: number; avg_v: number; samples: number }>;
      const names = resolveSeqMap(con, rows.map((r) => r.iface));
      for (const r of rows) {
        contributors.push({
          kind,
          interface: names.get(r.iface) ?? r.iface,
          peak: r.peak,
          avg: r.avg_v,
          column: col,
          samples: r.samples,
        });
      }
    }
    return { metric, kind: 'interface', contributors: contributors.slice(0, topN * 2) };
  }

  return { metric, contributors: [], warning: `unknown contributor metric '${metric}'` };
}

// ---------------------------------------------------------------------------
// Timeline event builder
// ---------------------------------------------------------------------------

const TIMELINE_TRACKS: Array<{ label: string; table: string; column: string }> = [
  { label: 'CPU', table: 'UM_STAT_UM_CPU_UM_CPU_TABLE', column: 'cpu_usage' },
  { label: 'load', table: 'UM_STAT_UM_SYSTEM', column: 'load_average' },
  { label: 'memory_used', table: 'UM_STAT_UM_MEMORY', column: 'real_used' },
  { label: 'disk_util', table: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE', column: 'util' },
  { label: 'disk_await', table: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE', column: 'await' },
];

export interface TimelineEvent {
  t: number;
  iso: string;
  label: string;
  metric: string;
  kind: 'rise' | 'peak' | 'recover';
  evidence: { table: string; column: string; threshold?: number; mean?: number; stddev?: number; value?: number };
}

export interface BuildTimelineOpts {
  start: number;
  end: number;
  granularity_seconds?: number;
}

export function buildTimeline(con: Database, opts: BuildTimelineOpts): TimelineEvent[] {
  const granularity = opts.granularity_seconds ?? 60;
  const events: TimelineEvent[] = [];
  for (const track of TIMELINE_TRACKS) {
    if (!D.hasTable(con, track.table) || !D.hasColumn(con, track.table, track.column)) continue;
    const col = track.column;
    const stat = con
      .prepare(
        `SELECT AVG("${col}") AS mu, AVG("${col}"*"${col}") - AVG("${col}")*AVG("${col}") AS var, MAX("${col}") AS hi, MIN("${col}") AS lo FROM "${track.table}" WHERE Timestamp BETWEEN ? AND ?`,
      )
      .get(opts.start, opts.end) as { mu: number | null; var: number | null; hi: number | null; lo: number | null } | undefined;
    if (!stat || stat.mu === null) continue;
    const mu = stat.mu;
    const sd = Math.sqrt(Math.max(0, stat.var ?? 0));
    const hi = stat.hi;
    if (hi === null || hi <= mu) continue;
    const threshold = mu + Math.max(2 * sd, (hi - mu) * 0.4);

    const rows = con
      .prepare(
        `SELECT (Timestamp/${granularity})*${granularity} AS b, MAX("${col}") AS v FROM "${track.table}" WHERE Timestamp BETWEEN ? AND ? GROUP BY b ORDER BY b`,
      )
      .all(opts.start, opts.end) as Array<{ b: number; v: number | null }>;
    let riseT: number | null = null;
    let peakT: number | null = null;
    let recoverT: number | null = null;
    let peakV: number | null = null;
    for (const r of rows) {
      const v = r.v;
      if (v === null) continue;
      if (riseT === null && v >= threshold) riseT = r.b;
      if (peakV === null || v > peakV) {
        peakV = v;
        peakT = r.b;
      }
      if (riseT !== null && peakT !== null && r.b > peakT && v < threshold && recoverT === null) {
        recoverT = r.b;
      }
    }
    if (riseT !== null) {
      events.push({
        t: riseT,
        iso: T.toIso(riseT),
        label: `${track.label} begins rising (>= ${threshold.toFixed(2)})`,
        metric: track.label,
        kind: 'rise',
        evidence: { table: track.table, column: col, threshold, mean: mu, stddev: sd },
      });
    }
    if (peakT !== null) {
      events.push({
        t: peakT,
        iso: T.toIso(peakT),
        label: `${track.label} peaks at ${peakV}`,
        metric: track.label,
        kind: 'peak',
        evidence: { table: track.table, column: col, value: peakV ?? undefined, mean: mu, stddev: sd },
      });
    }
    if (recoverT !== null) {
      events.push({
        t: recoverT,
        iso: T.toIso(recoverT),
        label: `${track.label} returns below ${threshold.toFixed(2)}`,
        metric: track.label,
        kind: 'recover',
        evidence: { table: track.table, column: col, threshold },
      });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

// ---------------------------------------------------------------------------
// Process timeline + analysis
// ---------------------------------------------------------------------------

export interface AnalyzeProcessOpts {
  process_name: string;
  start: number;
  end: number;
  bucket_seconds?: number;
}

export interface ProcCpuSeriesPoint {
  t: number;
  iso: string;
  peak_cpu: number;
  avg_cpu: number;
  pids: number;
}
export interface ProcMemSeriesPoint {
  t: number;
  iso: string;
  peak_ram_bytes: number;
  avg_ram_bytes: number;
}
export interface AnalyzeProcessResult {
  process_query: string;
  found: boolean;
  matched_names: string[];
  warning?: string;
  cpu_series?: ProcCpuSeriesPoint[];
  cpu?: {
    peak_cpu: number | null;
    avg_cpu: number | null;
    samples: number;
    distinct_pids: number;
    first_seen_epoch: number | null;
    last_seen_epoch: number | null;
    first_seen_iso: string | null;
    last_seen_iso: string | null;
  };
  pids_seen?: number[];
  memory_series?: ProcMemSeriesPoint[];
  memory?: {
    peak_ram_bytes: number | null;
    avg_ram_bytes: number | null;
  };
}

export function analyzeProcess(con: Database, opts: AnalyzeProcessOpts): AnalyzeProcessResult {
  const bucket = opts.bucket_seconds ?? 60;
  const matches = resolveProcessSeqs(con, opts.process_name);
  if (matches.length === 0) {
    return {
      process_query: opts.process_name,
      found: false,
      matched_names: [],
      warning: 'no cpview_ref_table entries match',
    };
  }
  const seqs = matches.map(([s]) => s);
  const placeholders = seqs.map(() => '?').join(',');
  const out: AnalyzeProcessResult = {
    process_query: opts.process_name,
    found: true,
    matched_names: matches.map(([, v]) => v),
  };

  if (D.hasTable(con, 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU')) {
    const cpuRows = con
      .prepare(
        `SELECT (Timestamp/${bucket})*${bucket} AS b, MAX(top_proc_usage) AS peak, AVG(top_proc_usage) AS avg_v, COUNT(DISTINCT top_proc_pid) AS pids FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU WHERE Timestamp BETWEEN ? AND ? AND top_proc_name IN (${placeholders}) GROUP BY b ORDER BY b`,
      )
      .all(opts.start, opts.end, ...seqs) as Array<{ b: number; peak: number; avg_v: number; pids: number }>;
    out.cpu_series = cpuRows.map((r) => ({
      t: r.b,
      iso: T.toIso(r.b),
      peak_cpu: r.peak,
      avg_cpu: r.avg_v,
      pids: r.pids,
    }));
    const agg = con
      .prepare(
        `SELECT MAX(top_proc_usage) AS peak, AVG(top_proc_usage) AS avg_v, COUNT(*) AS samples, COUNT(DISTINCT top_proc_pid) AS pid_count, MIN(Timestamp) AS first_seen, MAX(Timestamp) AS last_seen FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU WHERE Timestamp BETWEEN ? AND ? AND top_proc_name IN (${placeholders})`,
      )
      .get(opts.start, opts.end, ...seqs) as
      | { peak: number | null; avg_v: number | null; samples: number; pid_count: number; first_seen: number | null; last_seen: number | null }
      | undefined;
    out.cpu = {
      peak_cpu: agg?.peak ?? null,
      avg_cpu: agg?.avg_v ?? null,
      samples: agg?.samples ?? 0,
      distinct_pids: agg?.pid_count ?? 0,
      first_seen_epoch: agg?.first_seen ?? null,
      last_seen_epoch: agg?.last_seen ?? null,
      first_seen_iso: agg?.first_seen ? T.toIso(agg.first_seen) : null,
      last_seen_iso: agg?.last_seen ? T.toIso(agg.last_seen) : null,
    };
    const pidRows = con
      .prepare(
        `SELECT DISTINCT top_proc_pid FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU WHERE Timestamp BETWEEN ? AND ? AND top_proc_name IN (${placeholders}) ORDER BY top_proc_pid`,
      )
      .all(opts.start, opts.end, ...seqs) as Array<{ top_proc_pid: number }>;
    out.pids_seen = pidRows.map((r) => r.top_proc_pid);
  }

  if (D.hasTable(con, 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM')) {
    const memRows = con
      .prepare(
        `SELECT (Timestamp/${bucket})*${bucket} AS b, MAX(top_proc_used_ram_bytes) AS peak, AVG(top_proc_used_ram_bytes) AS avg_v FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM WHERE Timestamp BETWEEN ? AND ? AND top_proc_name IN (${placeholders}) GROUP BY b ORDER BY b`,
      )
      .all(opts.start, opts.end, ...seqs) as Array<{ b: number; peak: number; avg_v: number }>;
    out.memory_series = memRows.map((r) => ({
      t: r.b,
      iso: T.toIso(r.b),
      peak_ram_bytes: r.peak,
      avg_ram_bytes: r.avg_v,
    }));
    const agg = con
      .prepare(
        `SELECT MAX(top_proc_used_ram_bytes) AS peak, AVG(top_proc_used_ram_bytes) AS avg_v FROM UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM WHERE Timestamp BETWEEN ? AND ? AND top_proc_name IN (${placeholders})`,
      )
      .get(opts.start, opts.end, ...seqs) as { peak: number | null; avg_v: number | null } | undefined;
    out.memory = {
      peak_ram_bytes: agg?.peak ?? null,
      avg_ram_bytes: agg?.avg_v ?? null,
    };
  }

  return out;
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

const REQUIRED_TABLES = [
  'UM_STAT_UM_CPU',
  'UM_STAT_UM_CPU_UM_CPU_TABLE',
  'UM_STAT_UM_SYSTEM',
  'UM_STAT_UM_MEMORY',
];

const NICE_TO_HAVE = [
  'UM_STAT_UM_DISK_UM_DISK_TABLE',
  'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE',
  'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU',
  'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM',
  'cpview_ref_table',
  'TIMEZONE',
];

export interface ValidateDbResult {
  valid: boolean;
  schema_signature: string;
  table_count: number;
  missing_required: string[];
  missing_optional: string[];
  ref_table_rows: number | null;
  timezone_offset_seconds: number | null;
  time_range: {
    start_epoch: number | null;
    end_epoch: number | null;
    start_iso: string | null;
    end_iso: string | null;
    duration_seconds: number | null;
  };
  cross_table_time_ranges: Array<{ table: string; start: number; end: number }>;
  warnings: string[];
}

export function validateDb(con: Database): ValidateDbResult {
  const tables = D.listTables(con);
  const tableset = new Set(tables);
  const missingRequired = REQUIRED_TABLES.filter((t) => !tableset.has(t));
  const missingOptional = NICE_TO_HAVE.filter((t) => !tableset.has(t));
  const warnings: string[] = [];

  let tmin: number | null = null;
  let tmax: number | null = null;
  for (const cand of ['UM_STAT_UM_CPU', 'UM_STAT_UM_CPU_UM_CPU_TABLE', 'UM_STAT_UM_SYSTEM']) {
    if (tableset.has(cand)) {
      const [lo, hi] = D.timeRange(con, cand);
      tmin = lo;
      tmax = hi;
      if (tmin && tmax) break;
    }
  }

  const consistency: Array<{ table: string; start: number; end: number }> = [];
  for (const cand of ['UM_STAT_UM_MEMORY', 'UM_STAT_UM_SYSTEM', 'UM_STAT_UM_DISK_UM_DISK_TABLE']) {
    if (tableset.has(cand)) {
      const [a, b] = D.timeRange(con, cand);
      if (a === null || b === null) continue;
      consistency.push({ table: cand, start: a, end: b });
      if (tmin && a && Math.abs(a - tmin) > 86400) {
        warnings.push(`${cand} start diverges from CPU table by > 1 day`);
      }
    }
  }

  let refCount: number | null = null;
  if (tableset.has('cpview_ref_table')) {
    try {
      const r = con.prepare('SELECT COUNT(*) AS n FROM cpview_ref_table').get() as { n: number };
      refCount = r.n;
    } catch {
      warnings.push('cpview_ref_table present but unreadable');
    }
  } else {
    warnings.push('cpview_ref_table missing — process/device names cannot be resolved');
  }

  const tzOffset = D.detectTzOffsetSeconds(con);
  if (tzOffset === null && tableset.has('TIMEZONE')) {
    warnings.push('TIMEZONE table present but offset could not be decoded');
  }

  const sigParts = REQUIRED_TABLES.filter((t) => tableset.has(t)).concat(NICE_TO_HAVE.filter((t) => tableset.has(t)));
  const schemaSignature = `v1.${sigParts.length}-of-${REQUIRED_TABLES.length + NICE_TO_HAVE.length}`;

  if (missingRequired.length > 0) {
    warnings.push(`missing required tables: ${JSON.stringify(missingRequired)}`);
  }

  return {
    valid: missingRequired.length === 0,
    schema_signature: schemaSignature,
    table_count: tables.length,
    missing_required: missingRequired,
    missing_optional: missingOptional,
    ref_table_rows: refCount,
    timezone_offset_seconds: tzOffset,
    time_range: {
      start_epoch: tmin,
      end_epoch: tmax,
      start_iso: tmin ? T.toIso(tmin) : null,
      end_iso: tmax ? T.toIso(tmax) : null,
      duration_seconds: tmin && tmax ? tmax - tmin : null,
    },
    cross_table_time_ranges: consistency,
    warnings,
  };
}
