/**
 * Consistent tool result envelope: evidence + suggested next tools.
 */

import { toIso } from './timeutil.js';

export interface TimeRangeEnvelope {
  start_epoch: number | null;
  end_epoch: number | null;
  start_iso: string | null;
  end_iso: string | null;
  duration_seconds: number | null;
}

export interface EnvelopeOut {
  ok: boolean;
  summary?: string;
  time_range?: TimeRangeEnvelope;
  timezone?: string;
  data?: any;
  warnings?: string[];
  next_cursor?: any;
  evidence?: any[];
  suggested_next_tools?: any[];
  error?: string;
  [k: string]: any;
}

export interface EnvelopeInput {
  summary?: string;
  data?: any;
  time_range?: [number | null | undefined, number | null | undefined] | null;
  timezone?: string | null;
  warnings?: string[] | null;
  next_cursor?: any;
  evidence?: any[] | null;
  suggested_next_tools?: any[] | null;
  error?: string | null;
  extra?: Record<string, any>;
}

export function envelope(input: EnvelopeInput = {}): EnvelopeOut {
  const out: EnvelopeOut = { ok: !input.error };
  if (input.summary) out.summary = input.summary;
  if (input.time_range != null) {
    const [s, e] = input.time_range;
    out.time_range = {
      start_epoch: s ?? null,
      end_epoch: e ?? null,
      start_iso: s ? toIso(s) : null,
      end_iso: e ? toIso(e) : null,
      duration_seconds: s != null && e != null ? e - s : null,
    };
  }
  if (input.timezone != null) out.timezone = input.timezone;
  if (input.data !== undefined && input.data !== null) out.data = input.data;
  if (input.warnings && input.warnings.length > 0) out.warnings = input.warnings;
  if (input.next_cursor !== undefined && input.next_cursor !== null) {
    out.next_cursor = input.next_cursor;
  }
  if (input.evidence && input.evidence.length > 0) out.evidence = input.evidence;
  if (input.suggested_next_tools && input.suggested_next_tools.length > 0) {
    out.suggested_next_tools = input.suggested_next_tools;
  }
  if (input.error) out.error = input.error;
  if (input.extra) {
    for (const [k, v] of Object.entries(input.extra)) {
      out[k] = v;
    }
  }
  return out;
}

export interface EvidenceRowInput {
  table: string;
  column?: string | null;
  timestamp?: number | null;
  value?: any;
  extra?: Record<string, any>;
}

export function evidenceRow(input: EvidenceRowInput): Record<string, any> {
  const e: Record<string, any> = { table: input.table };
  if (input.column != null) e.column = input.column;
  if (input.timestamp != null) {
    e.timestamp = input.timestamp;
    e.iso = toIso(input.timestamp);
  }
  if (input.value !== undefined && input.value !== null) e.value = input.value;
  if (input.extra) {
    for (const [k, v] of Object.entries(input.extra)) {
      e[k] = v;
    }
  }
  return e;
}

export function nextTool(tool: string, reason: string, args: Record<string, any> = {}): Record<string, any> {
  return { tool, reason, args };
}

export function errEnvelope(message: string, input: { extra?: Record<string, any> } = {}): EnvelopeOut {
  return envelope({ error: message, extra: input.extra });
}
