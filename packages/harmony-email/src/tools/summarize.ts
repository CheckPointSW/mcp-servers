import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HarmonyEmailAPIManager } from '../api-manager.js';
import { log } from '../core/redact.js';
import {
    asDayBuckets,
    asRecord,
    bump,
    isoDate,
    partialReasonFor,
    previousWindow,
    strOrNone,
    type DayBucket,
    type PartialReason,
} from './shared/aggregate.js';
import {
    EVENT_SEVERITIES,
    EVENT_STATES,
    EVENT_TYPES,
    SAAS_ENTITY_TYPES,
    assertKnownSaas,
    ensureWindowOrder,
    extendedFilterClauseSchema,
    serializeExtendedFilter,
    type ExtendedFilterClause,
} from './shared/inputs.js';
import { compact, normalizeSeverity } from './shared/schemas.js';
import { handle, registerTool } from './shared/result.js';
import { apiFor } from './shared/session.js';
import type { ServerModule } from './types.js';

/**
 * The two server-side aggregators.
 *
 * These are the only composite tools in this server. They are justified
 * because they are both generic (they answer a family of questions, not one
 * phrasing) and data-reducing (they return counts, never the underlying rows).
 * Anything that would just script two thin calls belongs in a prompt instead.
 */

const EVENT_AXES = ['type', 'severity', 'state', 'saas', 'day'] as const;
type EventAxis = (typeof EVENT_AXES)[number];

const ENTITY_AXES = [
    'entity_type',
    'saas',
    'day',
    'ap_verdict',
    'dlp_verdict',
    'clicktime_protection_verdict',
    'shadow_it_verdict',
    'av_verdict',
    'restore_state',
    'remediation_mode',
] as const;
type EntityAxis = (typeof ENTITY_AXES)[number];

const VERDICT_AXES: Partial<Record<EntityAxis, string>> = {
    ap_verdict: 'ap',
    dlp_verdict: 'dlp',
    clicktime_protection_verdict: 'clicktimeProtection',
    shadow_it_verdict: 'shadowIt',
    av_verdict: 'av',
};

type RestoreState = 'none' | 'pending' | 'restored' | 'declined';
type RemediationMode = 'manual' | 'automatic' | 'n_a';

function truthy(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string')
        return ['true', '1', 'yes'].includes(value.toLowerCase());
    if (typeof value === 'number') return Boolean(value);
    return false;
}

/**
 * ASSUMPTION: restore precedence is declined > restored > pending > none. If
 * upstream flags disagree we take the more-resolved label: a closed ticket wins.
 */
export function deriveRestoreState(
    payload: Record<string, unknown>
): RestoreState {
    if (truthy(payload.isRestoreDeclined)) return 'declined';
    if (truthy(payload.isRestored)) return 'restored';
    if (truthy(payload.isRestoreRequested)) return 'pending';
    return 'none';
}

/**
 * ASSUMPTION: a non-empty `restoreAutoDecision` means a policy fired
 * automatically; empty or absent means a human decided.
 */
export function deriveRemediationMode(
    payload: Record<string, unknown>,
    restoreState: RestoreState
): RemediationMode {
    if (restoreState === 'none' || restoreState === 'pending') return 'n_a';
    const raw = payload.restoreAutoDecision;
    return typeof raw === 'string' && raw ? 'automatic' : 'manual';
}

function engineVerdict(
    security: Record<string, unknown>,
    engineKey: string
): string {
    const results = security[engineKey];
    if (!Array.isArray(results) || results.length === 0) return 'no_finding';
    const verdict = asRecord(results[0]).verdict;
    return typeof verdict === 'string' && verdict ? verdict : 'no_finding';
}

/**
 * Is anything left unscanned once the cap stops us mid-page?
 *
 * Reaching the cap is not by itself a truncation: a cap that lands exactly on
 * the last record scanned everything, and reporting that as partial would send
 * an analyst looking for data that is not missing. It is only a truncation when
 * this page has more records, another page exists, or the upstream total is
 * above what was counted.
 */
function moreToScan(
    index: number,
    pageLength: number,
    scrollId: string | null,
    totalCount: number | null,
    scanned: number
): boolean {
    return (
        index + 1 < pageLength ||
        scrollId !== null ||
        (totalCount !== null && totalCount > scanned)
    );
}

// ---- summarize_events -------------------------------------------------------

const SUMMARIZE_EVENTS_DESCRIPTION = `Count HEC security events over a time window, grouped by one or more axes.

WHEN TO USE:
- "Summarize email security activity", "did phishing increase this week?", "what are the top threats?"
- Any question answered by counts rather than by a list of events

PURPOSE:
- Paginates upstream server-side and returns counts only - never event bodies - so a wide window stays cheap
- \`group_by\` accepts \`type\`, \`severity\`, \`state\`, \`saas\` and \`day\`; pass several to get several breakdowns in one call
- \`compare_to_previous_window\` adds the same counts for the immediately preceding window of equal length, which is what "increase" questions need

READ THE RESULT HONESTLY:
- \`total_count\` is the matches across all pages; \`events_scanned\` is how many were actually counted
- When \`truncated\` is true the counts are partial and \`partial_reason\` says why: \`scan_cap\` means \`max_events_scanned\` was reached, \`upstream_error\` / \`scroll_expired\` / \`rate_limited\` mean a later page failed after retries and the counts stop there. Disclose this to the user`;

interface SummarizeEventsArgs {
    start_date: string;
    group_by: EventAxis[];
    end_date?: string;
    event_types?: string[];
    event_states?: string[];
    severities?: string[];
    saas?: string[];
    description?: string;
    compare_to_previous_window?: boolean;
    max_events_scanned?: number;
}

interface EventWindowResult {
    window_start: string;
    window_end: string | null;
    events_scanned: number;
    total_count: number;
    truncated: boolean;
    partial_reason: PartialReason | null;
    counts: Partial<Record<EventAxis, Record<string, number>>>;
    by_day: DayBucket[] | null;
    previous_window: EventWindowResult | null;
}

async function aggregateEvents(
    api: HarmonyEmailAPIManager,
    args: SummarizeEventsArgs,
    startDate: string,
    endDate: string | undefined
): Promise<EventWindowResult> {
    const requestData: Record<string, unknown> = compact({
        startDate,
        endDate,
        eventTypes: args.event_types,
        eventStates: args.event_states,
        severities: args.severities,
        saas: args.saas,
        description: args.description,
    });

    const axes = new Set(args.group_by);
    const counts: Partial<Record<EventAxis, Record<string, number>>> = {};
    for (const axis of axes) if (axis !== 'day') counts[axis] = {};
    const dayCounts: Record<string, number> = {};
    const maxScanned = args.max_events_scanned ?? 50_000;

    let eventsScanned = 0;
    let truncated = false;
    let partialReason: PartialReason | undefined;
    let totalCount: number | null = null;
    let scrollId: string | null = null;

    // ASSUMPTION: counters-only path; no per-event payload retained.
    for (;;) {
        if (scrollId !== null) requestData.scrollId = scrollId;

        let page;
        try {
            page = await api.queryEvents(requestData);
        } catch (error) {
            // A transient page failure after at least one scanned page yields
            // honest partial counts. Zero pages means we know nothing: re-throw.
            const reason = partialReasonFor(error);
            if (eventsScanned === 0 || reason === null) throw error;
            truncated = true;
            partialReason = reason;
            log('summarize_events.partial_on_page_failure', {
                events_scanned: eventsScanned,
                reason,
            });
            break;
        }

        scrollId = page.scrollId;
        if (page.total !== null) totalCount = page.total;

        let capReached = false;
        for (let index = 0; index < page.records.length; index++) {
            const event = page.records[index];
            if (axes.has('type')) bump(counts.type!, strOrNone(event.type));
            if (axes.has('severity'))
                bump(counts.severity!, normalizeSeverity(event.severity));
            if (axes.has('state')) bump(counts.state!, strOrNone(event.state));
            if (axes.has('saas')) bump(counts.saas!, strOrNone(event.saas));
            if (axes.has('day')) bump(dayCounts, isoDate(event.eventCreated));

            eventsScanned += 1;
            if (eventsScanned >= maxScanned) {
                capReached = true;
                if (
                    moreToScan(
                        index,
                        page.records.length,
                        scrollId,
                        totalCount,
                        eventsScanned
                    )
                ) {
                    truncated = true;
                    partialReason = 'scan_cap';
                }
                break;
            }
        }

        if (capReached || scrollId === null || page.records.length === 0) break;
    }

    return {
        window_start: startDate,
        window_end: endDate ?? null,
        events_scanned: eventsScanned,
        // ASSUMPTION: when the envelope omits both totals, the scanned count is
        // the best lower bound we can honestly report.
        total_count: totalCount ?? eventsScanned,
        truncated,
        partial_reason: partialReason ?? null,
        counts,
        by_day: axes.has('day') ? asDayBuckets(dayCounts) : null,
        previous_window: null,
    };
}

// ---- summarize_entities -----------------------------------------------------

const SUMMARIZE_ENTITIES_DESCRIPTION = `Count HEC entities (emails and files) over a time window, grouped by one or more axes.

WHEN TO USE:
- Restore-request reporting: pending queue size, resolved counts, manual vs automatic remediation trend
- Verdict breakdowns per engine, or entity volume per day or SaaS
- Any question answered by counts rather than by a list of entities

PURPOSE:
- Paginates upstream server-side and returns counts - never \`entityPayload\` or \`saasInfo\` - so a wide window stays cheap and no personal data is included. \`sample_limit\` is the one exception, and it is still payload-free
- \`group_by\` accepts \`entity_type\`, \`saas\`, \`day\`, the five per-engine verdict axes (\`ap_verdict\`, \`dlp_verdict\`, \`clicktime_protection_verdict\`, \`shadow_it_verdict\`, \`av_verdict\`), \`restore_state\` and \`remediation_mode\`
- \`restore_state\` is derived as declined > restored > pending > none; \`remediation_mode\` is \`n_a\` until a request is resolved, then \`automatic\` when a policy decided and \`manual\` when a person did
- \`sample_limit\` adds up to 50 slim entity rows when the user needs examples rather than only numbers: ids, SaaS, timestamps, restore state and the scalar fields of the combined verdict. No subject, addresses, headers or attachment names

READ THE RESULT HONESTLY:
- \`by_day\` buckets on \`entityCreated\`, which is when the message arrived, not when it was actioned
- When \`truncated\` is true the counts are partial and \`partial_reason\` says why: \`scan_cap\` means \`max_entities_scanned\` was reached, \`upstream_error\` / \`scroll_expired\` / \`rate_limited\` mean a later page failed after retries and the counts stop there. Disclose this to the user`;

interface SummarizeEntitiesArgs {
    saas: string;
    start_date: string;
    group_by: EntityAxis[];
    end_date?: string;
    entity_type?: string;
    extended_filter?: ExtendedFilterClause[];
    compare_to_previous_window?: boolean;
    sample_limit?: number;
    max_entities_scanned?: number;
}

interface EntitySampleRow {
    entity_id: string;
    saas: string | null;
    saas_entity_type: string | null;
    entity_created: string | null;
    entity_action_state: string | null;
    restore_state: RestoreState;
    remediation_mode: RemediationMode;
    combined_verdict: Record<string, unknown> | null;
}

interface EntityWindowResult {
    window_start: string;
    window_end: string | null;
    saas: string;
    entities_scanned: number;
    total_count: number;
    truncated: boolean;
    partial_reason: PartialReason | null;
    counts: Partial<Record<EntityAxis, Record<string, number>>>;
    by_day: DayBucket[] | null;
    sample: EntitySampleRow[] | null;
    previous_window: EntityWindowResult | null;
}

/**
 * The combined verdict trimmed to its scalar fields.
 *
 * `combinedVerdict` is an opaque passthrough record, so forwarding it whole
 * would let a field added upstream later ride into what is otherwise a
 * counts-only tool. Verdict labels and scores are scalars; nested objects and
 * arrays are dropped rather than sampled.
 */
function verdictScalars(
    verdict: Record<string, unknown>
): Record<string, unknown> | undefined {
    const scalars: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(verdict)) {
        const kind = typeof value;
        if (kind === 'string' || kind === 'number' || kind === 'boolean') {
            scalars[key] = value;
        }
    }
    return Object.keys(scalars).length > 0 ? scalars : undefined;
}

async function aggregateEntities(
    api: HarmonyEmailAPIManager,
    args: SummarizeEntitiesArgs,
    startDate: string,
    endDate: string | undefined
): Promise<EntityWindowResult> {
    const requestData: Record<string, unknown> = compact({
        entityFilter: compact({
            saas: args.saas,
            startDate,
            saasEntity: args.entity_type,
            endDate,
        }),
        entityExtendedFilter: args.extended_filter
            ? serializeExtendedFilter(args.extended_filter)
            : undefined,
    });

    const axes = new Set(args.group_by);
    const counts: Partial<Record<EntityAxis, Record<string, number>>> = {};
    for (const axis of axes) if (axis !== 'day') counts[axis] = {};
    const dayCounts: Record<string, number> = {};
    const sample: EntitySampleRow[] = [];
    const sampleLimit = args.sample_limit ?? 0;
    const maxScanned = args.max_entities_scanned ?? 50_000;

    let entitiesScanned = 0;
    let truncated = false;
    let partialReason: PartialReason | undefined;
    let totalCount: number | null = null;
    let scrollId: string | null = null;

    // ASSUMPTION: counters-only path; no per-entity payload retained.
    for (;;) {
        if (scrollId !== null) requestData.scrollId = scrollId;

        let page;
        try {
            page = await api.queryEntities(requestData);
        } catch (error) {
            const reason = partialReasonFor(error);
            if (entitiesScanned === 0 || reason === null) throw error;
            truncated = true;
            partialReason = reason;
            log('summarize_entities.partial_on_page_failure', {
                entities_scanned: entitiesScanned,
                reason,
            });
            break;
        }

        scrollId = page.scrollId;
        if (page.total !== null) totalCount = page.total;

        let capReached = false;
        for (let index = 0; index < page.records.length; index++) {
            const entity = page.records[index];
            const payload = asRecord(entity.entityPayload);
            const info = asRecord(entity.entityInfo);
            const security = asRecord(entity.entitySecurityResult);
            const restoreState = deriveRestoreState(payload);
            const remediationMode = deriveRemediationMode(
                payload,
                restoreState
            );

            if (axes.has('entity_type')) {
                bump(counts.entity_type!, strOrNone(info.saasEntityType));
            }
            if (axes.has('saas')) bump(counts.saas!, strOrNone(info.saas));
            if (axes.has('day')) bump(dayCounts, isoDate(info.entityCreated));
            for (const [axis, engineKey] of Object.entries(VERDICT_AXES)) {
                if (axes.has(axis as EntityAxis)) {
                    bump(
                        counts[axis as EntityAxis]!,
                        engineVerdict(security, engineKey)
                    );
                }
            }
            if (axes.has('restore_state'))
                bump(counts.restore_state!, restoreState);
            if (axes.has('remediation_mode'))
                bump(counts.remediation_mode!, remediationMode);

            if (sampleLimit > 0 && sample.length < sampleLimit) {
                sample.push(
                    compact({
                        entity_id: String(info.entityId ?? ''),
                        saas: strOrNone(info.saas) ?? undefined,
                        saas_entity_type:
                            strOrNone(info.saasEntityType) ?? undefined,
                        entity_created:
                            strOrNone(info.entityCreated) ?? undefined,
                        entity_action_state:
                            strOrNone(info.entityActionState) ?? undefined,
                        restore_state: restoreState,
                        remediation_mode: remediationMode,
                        combined_verdict: verdictScalars(
                            asRecord(security.combinedVerdict)
                        ),
                    }) as EntitySampleRow
                );
            }

            entitiesScanned += 1;
            if (entitiesScanned >= maxScanned) {
                capReached = true;
                if (
                    moreToScan(
                        index,
                        page.records.length,
                        scrollId,
                        totalCount,
                        entitiesScanned
                    )
                ) {
                    truncated = true;
                    partialReason = 'scan_cap';
                }
                break;
            }
        }

        if (capReached || scrollId === null || page.records.length === 0) break;
    }

    return {
        window_start: startDate,
        window_end: endDate ?? null,
        saas: args.saas,
        entities_scanned: entitiesScanned,
        total_count: totalCount ?? entitiesScanned,
        truncated,
        partial_reason: partialReason ?? null,
        counts,
        by_day: axes.has('day') ? asDayBuckets(dayCounts) : null,
        sample: sampleLimit > 0 ? sample : null,
        previous_window: null,
    };
}

// ---- registration -----------------------------------------------------------

export function registerSummarizeTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    registerTool<SummarizeEventsArgs>(
        server,
        'summarize_events',
        SUMMARIZE_EVENTS_DESCRIPTION,
        {
            start_date: z
                .string()
                .min(1)
                .max(64)
                .describe(
                    'ISO 8601 UTC start of window, e.g. `2026-06-08T00:00:00.000Z`.'
                ),
            group_by: z
                .array(z.enum(EVENT_AXES))
                .min(1)
                .describe(
                    'Axes to count by. Pass several to get several breakdowns at once.'
                ),
            end_date: z
                .string()
                .max(64)
                .optional()
                .describe('ISO 8601 UTC end of window.'),
            event_types: z
                .array(z.enum(EVENT_TYPES))
                .optional()
                .describe('Pre-filter by type.'),
            event_states: z
                .array(z.enum(EVENT_STATES))
                .optional()
                .describe('Pre-filter by state.'),
            severities: z
                .array(z.enum(EVENT_SEVERITIES))
                .optional()
                .describe('Pre-filter by severity.'),
            saas: z
                .array(z.string())
                .optional()
                .describe('Pre-filter by SaaS source.'),
            description: z
                .string()
                .max(512)
                .optional()
                .describe(
                    'Free-text substring match on the event description.'
                ),
            compare_to_previous_window: z
                .boolean()
                .default(false)
                .describe('Also count the preceding window of equal length.'),
            max_events_scanned: z
                .number()
                .int()
                .positive()
                .max(500_000)
                .default(50_000)
                .describe('Safety cap on how many events are scanned.'),
        },
        async (args, extra) =>
            handle('summarize_events', async () => {
                ensureWindowOrder(args.start_date, args.end_date);
                const api = apiFor(serverModule, extra);
                const current = await aggregateEvents(
                    api,
                    args,
                    args.start_date,
                    args.end_date
                );
                if (!args.compare_to_previous_window) return current;

                const [prevStart, prevEnd] = previousWindow(
                    args.start_date,
                    args.end_date
                );
                current.previous_window = await aggregateEvents(
                    api,
                    args,
                    prevStart,
                    prevEnd
                );
                return current;
            })
    );

    registerTool<SummarizeEntitiesArgs>(
        server,
        'summarize_entities',
        SUMMARIZE_ENTITIES_DESCRIPTION,
        {
            saas: z
                .string()
                .min(1)
                .max(64)
                .describe(
                    'SaaS source, e.g. `office365_emails` or `google_mail`.'
                ),
            start_date: z
                .string()
                .min(1)
                .max(64)
                .describe(
                    'ISO 8601 UTC start of window, e.g. `2026-06-08T00:00:00.000Z`.'
                ),
            group_by: z
                .array(z.enum(ENTITY_AXES))
                .min(1)
                .describe(
                    'Axes to count by. Pass several to get several breakdowns at once.'
                ),
            end_date: z
                .string()
                .max(64)
                .optional()
                .describe('ISO 8601 UTC end of window.'),
            entity_type: z
                .enum(SAAS_ENTITY_TYPES)
                .optional()
                .describe('Narrow to one entity sub-type.'),
            extended_filter: z
                .array(extendedFilterClauseSchema)
                .optional()
                .describe('Server-side predicates, AND-ed together.'),
            compare_to_previous_window: z
                .boolean()
                .default(false)
                .describe('Also count the preceding window of equal length.'),
            sample_limit: z
                .number()
                .int()
                .min(0)
                .max(50)
                .default(0)
                .describe(
                    'Include up to this many slim example rows. No payloads.'
                ),
            max_entities_scanned: z
                .number()
                .int()
                .positive()
                .max(500_000)
                .default(50_000)
                .describe('Safety cap on how many entities are scanned.'),
        },
        async (args, extra) =>
            handle('summarize_entities', async () => {
                assertKnownSaas(args.saas);
                ensureWindowOrder(args.start_date, args.end_date);
                const api = apiFor(serverModule, extra);
                const current = await aggregateEntities(
                    api,
                    args,
                    args.start_date,
                    args.end_date
                );
                if (!args.compare_to_previous_window) return current;

                const [prevStart, prevEnd] = previousWindow(
                    args.start_date,
                    args.end_date
                );
                current.previous_window = await aggregateEntities(
                    api,
                    args,
                    prevStart,
                    prevEnd
                );
                return current;
            })
    );
}
