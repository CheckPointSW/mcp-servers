/** Time-window maths and counters shared by the two summarize tools. */

import {
    RateLimitError,
    ScrollExpiredError,
    TransportError,
    UpstreamError,
} from '../../core/errors.js';

/**
 * Why a summarize result is partial: the scan cap was hit, or a page failed
 * after at least one page had been scanned.
 */
export type PartialReason =
    | 'scan_cap'
    | 'upstream_error'
    | 'scroll_expired'
    | 'rate_limited';

/**
 * Classify a mid-scan page failure, or null when it must be re-thrown.
 *
 * Pages already counted are real, so a later-page failure returns what was
 * counted rather than discarding it. The cursor cases are the ones easy to get
 * wrong: a 5xx carrying a scrollId reaches here as `ScrollExpiredError`,
 * because the client attributes any such 5xx to an expired cursor, and an
 * exhausted 429 is a `RateLimitError`, which is not an `UpstreamError`.
 * Anything else (a bad filter, a 403) is the caller's problem, not a partial
 * scan, and is re-thrown.
 */
export function partialReasonFor(error: unknown): PartialReason | null {
    if (error instanceof ScrollExpiredError) return 'scroll_expired';
    if (error instanceof RateLimitError) return 'rate_limited';
    if (error instanceof UpstreamError || error instanceof TransportError) {
        return 'upstream_error';
    }
    return null;
}

export interface DayBucket {
    date: string;
    count: number;
}

const HAS_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse an ISO 8601 instant, treating a naive timestamp as UTC.
 *
 * JavaScript reads a date-time with no offset as *local* time, which would
 * silently shift a naive window by the operator's timezone. HEC timestamps are
 * UTC, so an absent offset is filled in.
 */
export function parseIso(value: string): number {
    const normalized = HAS_TIMEZONE.test(value.trim())
        ? value.trim()
        : `${value.trim()}Z`;
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed))
        throw new Error(`not an ISO 8601 timestamp: "${value}"`);
    return parsed;
}

export function formatIso(epochMs: number): string {
    // Milliseconds are zeroed so the window bounds read cleanly in output.
    return new Date(Math.floor(epochMs / 1000) * 1000).toISOString();
}

/** The window of equal length immediately before this one. */
export function previousWindow(
    startDate: string,
    endDate?: string | null
): [string, string] {
    const start = parseIso(startDate);
    const end = endDate ? parseIso(endDate) : Date.now();
    const delta = end - start;
    return [formatIso(start - delta), formatIso(start)];
}

export function bump(
    counter: Record<string, number>,
    key: string | null | undefined
): void {
    const actual = key ?? 'unknown';
    counter[actual] = (counter[actual] ?? 0) + 1;
}

export function strOrNone(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

/** The UTC calendar date of a timestamp, for day bucketing. */
export function isoDate(value: unknown): string | null {
    if (typeof value !== 'string' || !value) return null;
    try {
        return new Date(parseIso(value)).toISOString().slice(0, 10);
    } catch {
        return null;
    }
}

/** Day buckets in ascending date order, with `unknown` last. */
export function asDayBuckets(dayCounts: Record<string, number>): DayBucket[] {
    const buckets = Object.keys(dayCounts)
        .filter((key) => key !== 'unknown')
        .sort()
        .map((date) => ({ date, count: dayCounts[date] }));
    if ('unknown' in dayCounts)
        buckets.push({ date: 'unknown', count: dayCounts.unknown });
    return buckets;
}

export function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}
