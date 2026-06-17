/**
 * Friendly metric aliases that map to (table, column) tuples and the
 * cpview glossary used by resources/tools and "did you mean" suggestions.
 */

import type { DatabaseSync as Database } from 'node:sqlite';

export type MetricRef = [string, string];

export const ALIASES: Record<string, MetricRef> = {
  // CPU
  cpu:            ['UM_STAT_UM_CPU_UM_CPU_TABLE', 'cpu_usage'],
  cpu_usage:      ['UM_STAT_UM_CPU_UM_CPU_TABLE', 'cpu_usage'],
  cpu_per_core:   ['UM_STAT_UM_CPU_UM_CPU_TABLE', 'cpu_usage'],
  load_average:   ['UM_STAT_UM_SYSTEM',           'load_average'],
  load:           ['UM_STAT_UM_SYSTEM',           'load_average'],

  // Memory
  memory:         ['UM_STAT_UM_MEMORY',           'real_used'],
  mem:            ['UM_STAT_UM_MEMORY',           'real_used'],
  mem_free:       ['UM_STAT_UM_MEMORY',           'real_free'],
  swap:           ['UM_STAT_UM_MEMORY',           'swap_used'],

  // Disk
  disk:           ['UM_STAT_UM_DISK_UM_DISK_TABLE', 'disk_used'],
  disk_free:      ['UM_STAT_UM_DISK_UM_DISK_TABLE', 'disk_free'],
  iostat_util:    ['UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE', 'util'],
  iostat_await:   ['UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE', 'await'],

  // Network interfaces
  if_rx_bytes:    ['UM_STAT_UM_HW_UM_IF_RX_STATISTICS_TABLE', 'rx_bytes'],
  if_tx_bytes:    ['UM_STAT_UM_HW_UM_IF_TX_STATISTICS_TABLE', 'tx_bytes'],
  if_rx_packets:  ['UM_STAT_UM_HW_UM_IF_RX_STATISTICS_TABLE', 'rx_packets'],
  if_tx_packets:  ['UM_STAT_UM_HW_UM_IF_TX_STATISTICS_TABLE', 'tx_packets'],
  if_errors_rx:   ['UM_STAT_UM_HW_UM_IF_ERR_STATISTICS_TABLE', 'rx_errors'],
  if_errors_tx:   ['UM_STAT_UM_HW_UM_IF_ERR_STATISTICS_TABLE', 'tx_errors'],

  // Processes
  top_proc_cpu:   ['UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU', 'top_proc_usage'],
  top_proc_mem:   ['UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM', 'top_proc_used_ram_bytes'],
};

export const GLOSSARY: Record<string, string> = {
  Timestamp: 'Epoch seconds (gateway local clock interpreted as UTC unless TIMEZONE table says otherwise).',
  cpu_usage: 'Per-core CPU utilization percent (0-100). Grouped by name_of_cpu.',
  name_of_cpu: 'CPU core index (0-based).',
  real_total: 'Total physical RAM in bytes.',
  real_used: 'Used physical RAM in bytes.',
  real_free: 'Free physical RAM in bytes.',
  swap_used: 'Used swap in bytes.',
  swap_total: 'Total swap in bytes.',
  load_average: 'Linux load average (1-minute) at sampling time.',
  uptime: 'Human-readable uptime string from /proc/uptime.',
  disk_total: 'Filesystem total bytes for the given disk_path.',
  disk_used: 'Filesystem used bytes.',
  disk_free: 'Filesystem free bytes.',
  rx_bytes: 'Interface received bytes (cumulative or per sample window depending on column).',
  tx_bytes: 'Interface transmitted bytes.',
  rrqms: 'Read requests merged per second.',
  wrqms: 'Write requests merged per second.',
  rs: 'Read requests per second.',
  ws: 'Write requests per second.',
  rkbs: 'Read KB per second.',
  wkbs: 'Write KB per second.',
  util: 'Device utilization percent (iostat).',
  await: 'Average wait time in ms (iostat).',
  svctm: 'Average service time in ms (iostat).',
  top_proc_pid: 'Top process PID at the sample.',
  top_proc_name: 'Top process name (often interned in cpview_ref_table).',
  top_proc_usage: 'Top process CPU percent (can exceed 100 on multi-core).',
  top_proc_used_ram_bytes: 'Top process resident set size (RSS) in bytes.',
  cpview_ref_table: 'String-interning table: (seq INTEGER, val TEXT). Some columns store seq IDs that resolve here.',
  TIMEZONE: 'Per-sample timezone name and offset-in-seconds.',
  'UM_STAT_UM_*': 'Unified Monitor system statistics — the core cpview history tables.',
};

export interface MetricInfo {
  canonical: string;
  unit: string | null;
  expected_range: string | null;
  higher_is_bad: boolean | null;
  interpretation: string;
  caveats: string[];
  related: string[];
  matched_alias?: string;
  source?: string;
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  cpu: {
    canonical: 'UM_STAT_UM_CPU_UM_CPU_TABLE.cpu_usage',
    unit: 'percent',
    expected_range: '0-100 per core; workload dependent',
    higher_is_bad: true,
    interpretation: 'Per-core CPU utilization sampled per core. Multiple rows per timestamp (one per name_of_cpu).',
    caveats: [
      '100% on a single core does not mean total saturation; aggregate via AVG across name_of_cpu for an overall view.',
      'Brief 100% bursts are normal during policy install or routing recalculation.',
    ],
    related: ['load', 'top_proc_cpu', 'iostat_util'],
  },
  load: {
    canonical: 'UM_STAT_UM_SYSTEM.load_average',
    unit: 'Linux load (1-min)',
    expected_range: 'below physical core count is healthy; > 2x cores indicates queueing',
    higher_is_bad: true,
    interpretation: '1-minute load average. Higher than CPU core count means processes are waiting for CPU or I/O.',
    caveats: [
      'Load includes uninterruptible sleep (D-state) — high load with low CPU often means I/O wait.',
      'Compare against physical core count, not against another gateway.',
    ],
    related: ['cpu', 'iostat_await', 'iostat_util'],
  },
  memory: {
    canonical: 'UM_STAT_UM_MEMORY.real_used',
    unit: 'bytes',
    expected_range: 'varies with platform; compare real_used/real_total ratio',
    higher_is_bad: true,
    interpretation: 'Resident memory in use. Use ratio real_used/real_total for cross-gateway comparison.',
    caveats: [
      'Linux caches inflate real_used; a high value alone is not pathological.',
      'Watch swap_used and memory growth slope rather than absolute value.',
    ],
    related: ['mem_free', 'swap', 'top_proc_mem'],
  },
  mem_free: {
    canonical: 'UM_STAT_UM_MEMORY.real_free',
    unit: 'bytes',
    expected_range: 'non-zero; trending toward zero is concerning',
    higher_is_bad: false,
    interpretation: 'Free physical RAM. Often near-zero on healthy Linux systems because of page cache.',
    caveats: ['Use with swap to spot real pressure, not on its own.'],
    related: ['memory', 'swap'],
  },
  swap: {
    canonical: 'UM_STAT_UM_MEMORY.swap_used',
    unit: 'bytes',
    expected_range: 'ideally 0; sustained > 0 means memory pressure',
    higher_is_bad: true,
    interpretation: 'Used swap. Anything > 0 on a gateway is usually worth investigating.',
    caveats: ['A small steady-state value (residual from old swap-outs) may be harmless if not growing.'],
    related: ['memory', 'mem_free'],
  },
  disk: {
    canonical: 'UM_STAT_UM_DISK_UM_DISK_TABLE.disk_used',
    unit: 'bytes',
    expected_range: 'watch used/total ratio per disk_path; > 90% is concerning',
    higher_is_bad: true,
    interpretation: 'Filesystem bytes used per disk_path. Multiple rows per timestamp (one per mount).',
    caveats: ['Compute used/total; the absolute value depends on the partition size.'],
    related: ['disk_free', 'iostat_util'],
  },
  iostat_util: {
    canonical: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE.util',
    unit: 'percent',
    expected_range: '0-100 per device; sustained > 80% is a bottleneck',
    higher_is_bad: true,
    interpretation: 'Per-device utilization from iostat. 100% means the device is saturated.',
    caveats: [
      'Not meaningful for SSDs in the same way as spinning disks — they can show 100% but still serve more requests.',
      'Combine with await to confirm a real I/O bottleneck.',
    ],
    related: ['iostat_await', 'disk'],
  },
  iostat_await: {
    canonical: 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE.await',
    unit: 'milliseconds',
    expected_range: '< 10 ms healthy; > 50 ms indicates I/O latency',
    higher_is_bad: true,
    interpretation: 'Average wait time for I/O requests, including queue time.',
    caveats: ['Spikes during fsync/log rotation are normal — sustained high await is the signal.'],
    related: ['iostat_util', 'load'],
  },
  if_rx_bytes: {
    canonical: 'UM_STAT_UM_HW_UM_IF_RX_STATISTICS_TABLE.rx_bytes',
    unit: 'bytes (cumulative or per-sample, schema-dependent)',
    expected_range: 'interface-dependent',
    higher_is_bad: false,
    interpretation: 'Bytes received on the interface.',
    caveats: ['Confirm whether the column is cumulative or delta before computing rates.'],
    related: ['if_tx_bytes', 'if_errors_rx'],
  },
  if_tx_bytes: {
    canonical: 'UM_STAT_UM_HW_UM_IF_TX_STATISTICS_TABLE.tx_bytes',
    unit: 'bytes (cumulative or per-sample, schema-dependent)',
    expected_range: 'interface-dependent',
    higher_is_bad: false,
    interpretation: 'Bytes transmitted on the interface.',
    caveats: ['Confirm whether the column is cumulative or delta before computing rates.'],
    related: ['if_rx_bytes', 'if_errors_tx'],
  },
  if_errors_rx: {
    canonical: 'UM_STAT_UM_HW_UM_IF_ERR_STATISTICS_TABLE.rx_errors',
    unit: 'count',
    expected_range: '0 healthy; any non-zero rate is worth investigating',
    higher_is_bad: true,
    interpretation: 'RX errors on the interface (CRC, frame, dropped).',
    caveats: ['A small non-zero baseline can exist on some NICs; watch for sustained growth.'],
    related: ['if_rx_bytes', 'if_errors_tx'],
  },
  top_proc_cpu: {
    canonical: 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU.top_proc_usage',
    unit: 'percent (can exceed 100 on multi-core)',
    expected_range: 'process-dependent',
    higher_is_bad: true,
    interpretation: 'Top process CPU usage at the sample. top_proc_name is interned via cpview_ref_table.',
    caveats: [
      'Values > 100% are normal for multi-threaded processes (per-core summed).',
      'Process name is a seq id; resolve via cpview_ref_table.',
    ],
    related: ['cpu', 'load', 'top_proc_mem'],
  },
  top_proc_mem: {
    canonical: 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM.top_proc_used_ram_bytes',
    unit: 'bytes (RSS)',
    expected_range: 'process-dependent',
    higher_is_bad: true,
    interpretation: 'Top process resident memory at the sample.',
    caveats: ['Process name is a seq id; resolve via cpview_ref_table.'],
    related: ['memory', 'swap', 'top_proc_cpu'],
  },
};

export const CATEGORIES: Record<string, string[]> = {
  cpu: ['UM_STAT_UM_CPU', 'UM_STAT_UM_CPU_UM_CPU_TABLE', 'UM_STAT_UM_CPU_UM_CPU_CLASSIFICATION', 'UM_STAT_UM_CPU_UM_CPU_ORDERED_TABLE'],
  memory: ['UM_STAT_UM_MEMORY'],
  system: ['UM_STAT_UM_SYSTEM'],
  disk: ['UM_STAT_UM_DISK_UM_DISK_TABLE', 'UM_STAT_UM_IOSTAT_UM_IOSTAT_TABLE'],
  network: ['UM_STAT_UM_HW_UM_IF_TABLE', 'UM_STAT_UM_HW_UM_IF_RX_STATISTICS_TABLE', 'UM_STAT_UM_HW_UM_IF_TX_STATISTICS_TABLE', 'UM_STAT_UM_HW_UM_IF_ERR_STATISTICS_TABLE'],
  processes: ['UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_CPU', 'UM_STAT_UM_PROC_UM_TOP_PROC_TABLE_BY_MEM', 'UM_STAT_UM_PROC_UM_MEM_PROC_TABLE'],
  ha_cluster: ['cxl_cxl_stats', 'cxl_cxl_stats_status'],
};

export function resolveMetric(spec: string): MetricRef {
  if (spec.includes('.')) {
    const idx = spec.indexOf('.');
    const t = spec.slice(0, idx).trim();
    const c = spec.slice(idx + 1).trim();
    return [t, c];
  }
  const key = spec.trim().toLowerCase();
  if (key in ALIASES) return ALIASES[key];
  throw new Error(`unknown metric '${spec}'; pass 'table.column' or an alias`);
}

export function metricInfo(spec: string): MetricInfo | null {
  const key = spec.trim().toLowerCase();
  if (key in METRIC_INFO) {
    return { ...METRIC_INFO[key] };
  }
  if (key in ALIASES) {
    const [tbl, col] = ALIASES[key];
    const canon = `${tbl}.${col}`.toLowerCase();
    for (const [k, v] of Object.entries(METRIC_INFO)) {
      if (v.canonical.toLowerCase() === canon) {
        return { ...v, matched_alias: k };
      }
    }
  }
  if (spec.includes('.')) {
    const idx = spec.indexOf('.');
    const t = spec.slice(0, idx).trim();
    const c = spec.slice(idx + 1).trim();
    const canonical = `${t}.${c}`;
    for (const [k, v] of Object.entries(METRIC_INFO)) {
      if (v.canonical.toLowerCase() === canonical.toLowerCase()) {
        return { ...v, matched_alias: k };
      }
    }
    if (c in GLOSSARY) {
      return {
        canonical,
        unit: null,
        expected_range: null,
        higher_is_bad: null,
        interpretation: GLOSSARY[c],
        caveats: [],
        related: [],
        source: 'glossary',
      };
    }
  }
  return null;
}

/**
 * Compute close matches similar to Python's difflib.get_close_matches.
 * Uses normalized Levenshtein distance with a similarity cutoff.
 */
export function suggest(name: string, choices: Iterable<string>, k = 5, cutoff = 0.4): string[] {
  const items = Array.from(choices);
  const scored: { choice: string; score: number }[] = [];
  for (const ch of items) {
    const sim = similarity(name, ch);
    if (sim >= cutoff) scored.push({ choice: ch, score: sim });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.choice);
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  const dist = levenshtein(A, B);
  const maxLen = Math.max(A.length, B.length);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev: number[] = new Array(n + 1);
  const cur: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

export function knownTables(con: Database): string[] {
  const rows = con
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function knownColumns(con: Database, table: string): string[] {
  const rows = con.prepare(`PRAGMA table_info("${table.replace(/"/g, '')}")`).all() as { name: string }[];
  return rows.map((r) => r.name);
}
