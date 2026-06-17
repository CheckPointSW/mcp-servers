/**
 * Flexible time parsing: epoch, ISO 8601, relative ("1h ago").
 */

export type TimeLike = number | string | null | undefined;

const REL_RE = /^\s*(?:(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)(?:\s+ago)?|now)\s*$/i;

const UNIT_SEC: Record<string, number> = {
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  d: 86400, day: 86400, days: 86400,
  w: 604800, week: 604800, weeks: 604800,
};

export interface ParseTimeOptions {
  now?: Date;
}

export function parseTime(value: TimeLike, opts: ParseTimeOptions = {}): number {
  if (value === null || value === undefined) {
    throw new Error('time value is null');
  }
  if (typeof value === 'number') {
    let v = value;
    if (v > 1e12) v = v / 1000.0;
    return Math.floor(v);
  }
  if (typeof value !== 'string') {
    throw new Error(`unsupported time type: ${typeof value}`);
  }
  const s = value.trim();
  if (!s) throw new Error('empty time string');

  // Pure integer
  if (/^-?\d+$/.test(s)) {
    return parseTime(parseInt(s, 10), opts);
  }
  // Pure float
  if (/^-?\d+\.\d+$/.test(s)) {
    return parseTime(parseFloat(s), opts);
  }

  // Relative
  const m = s.match(REL_RE);
  if (m) {
    const ref = opts.now ?? new Date();
    if (s.toLowerCase().trim() === 'now') {
      return Math.floor(ref.getTime() / 1000);
    }
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const deltaSec = n * UNIT_SEC[unit];
    return Math.floor(ref.getTime() / 1000) - deltaSec;
  }

  // ISO 8601 — accept with/without TZ, with Z, with space separator
  let iso = s.replace(' ', 'T');
  // Handle no timezone — assume UTC
  // If iso ends with Z it's UTC; if it has +/- offset after the time portion, native Date parses it
  // If it has none, we append Z
  const hasTz = /Z$/.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso);
  if (!hasTz) iso = iso + 'Z';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`could not parse time '${value}'`);
  }
  return Math.floor(dt.getTime() / 1000);
}

export function toIso(epoch: number | null | undefined, tz?: string | null): string {
  if (epoch === null || epoch === undefined) return '';
  const dt = new Date(Math.floor(Number(epoch)) * 1000);
  if (!tz) return dt.toISOString();
  const offsetMin = parseOffsetMinutes(tz);
  if (offsetMin === null) return dt.toISOString();
  // Build local-time-like ISO with offset suffix
  const adjusted = new Date(dt.getTime() + offsetMin * 60 * 1000);
  const Y = adjusted.getUTCFullYear();
  const Mo = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const D = String(adjusted.getUTCDate()).padStart(2, '0');
  const H = String(adjusted.getUTCHours()).padStart(2, '0');
  const Mi = String(adjusted.getUTCMinutes()).padStart(2, '0');
  const S = String(adjusted.getUTCSeconds()).padStart(2, '0');
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offH = String(Math.floor(absMin / 60)).padStart(2, '0');
  const offM = String(absMin % 60).padStart(2, '0');
  return `${Y}-${Mo}-${D}T${H}:${Mi}:${S}${sign}${offH}:${offM}`;
}

function parseOffsetMinutes(tz: string): number | null {
  const s = tz.trim().toUpperCase();
  if (s === 'UTC' || s === 'Z' || s === 'GMT') return 0;
  const m = s.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const sign = m[1] === '+' ? 1 : -1;
    const h = parseInt(m[2], 10);
    const mm = parseInt(m[3], 10);
    return sign * (h * 60 + mm);
  }
  const ints = s.match(/^-?\d+$/);
  if (ints) {
    const seconds = parseInt(s, 10);
    return Math.floor(seconds / 60);
  }
  return null;
}

const NICE_BUCKETS = [
  1, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400,
];

export function pickBucketSeconds(start: number, end: number, targetPoints = 200): number {
  const span = Math.max(1, end - start);
  const raw = Math.max(1, Math.floor(span / targetPoints));
  for (const n of NICE_BUCKETS) {
    if (raw <= n) return n;
  }
  return raw;
}

export interface ParseBucketOptions {
  start?: number | null;
  end?: number | null;
}

const BUCKET_UNIT: Record<string, number> = {
  s: 1, sec: 1,
  m: 60, min: 60,
  h: 3600, hr: 3600,
  d: 86400, day: 86400,
  w: 604800, week: 604800,
};

export function parseBucket(
  b: string | number | null | undefined,
  opts: ParseBucketOptions = {},
): number {
  if (b === null || b === undefined || b === '' || b === 'auto') {
    if (opts.start !== undefined && opts.end !== undefined &&
        opts.start !== null && opts.end !== null) {
      return pickBucketSeconds(opts.start, opts.end);
    }
    return 60;
  }
  if (typeof b === 'number') return Math.max(1, Math.floor(b));
  const s = String(b).trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day|w|week)s?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    if (!(unit in BUCKET_UNIT)) throw new Error(`bad bucket: ${b}`);
    return n * BUCKET_UNIT[unit];
  }
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  throw new Error(`bad bucket: ${b}`);
}
