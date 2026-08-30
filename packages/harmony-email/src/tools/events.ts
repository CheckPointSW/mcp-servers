import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    EVENT_SEVERITIES,
    EVENT_STATES,
    EVENT_TYPES,
    RETURN_MODES,
    ensureWindowOrder,
    type ReturnMode,
} from './shared/inputs.js';
import { compact, toEvent } from './shared/schemas.js';
import { handle, registerTool } from './shared/result.js';
import { apiFor } from './shared/session.js';
import type { ServerModule } from './types.js';

const GET_EVENT_DESCRIPTION = `Fetch a single Harmony Email & Collaboration (HEC) security event by id.

WHEN TO USE:
- An event id turned up in a query or in a user's message and you need its detail

PURPOSE:
- Returns the event type (\`phishing\`, \`malware\`, \`dlp\`, \`anomaly\`, ...), state (\`new\`, \`detected\`, \`pending\`, \`remediated\`, \`dismissed\`, \`exception\`), severity, SaaS source, the entity id it relates to, \`eventCreated\`, and \`confidenceIndicator\`
- Severity is normalised to lowercase \`lowest|low|medium|high|critical\`; a numeric 1..5 from upstream is mapped onto the same words
- Read-only. Message body, subject and recipients are deliberately not returned - use \`get_entity\` for those`;

const QUERY_EVENTS_DESCRIPTION = `Search HEC security events by time window plus optional filters.

WHEN TO USE:
- "What happened in the last 24 hours?", "show me phishing since Monday"
- You need the raw event list. For counts broken down by type, severity, state, SaaS or day, use \`summarize_events\` instead - it paginates server-side and returns counts only

DEFAULT BEHAVIOR:
- \`start_date\` is required, ISO 8601 UTC with a millisecond \`Z\` suffix
- The result always includes \`total_count\` (matches across all pages) and \`scroll_id\` for continuation
- Read-only

RETURN MODE:
- \`count\`: only \`total_count\`, no event list. Use when the user wants a number
- \`full\` (default) and \`summary\` are equivalent here: events are already structured summaries with no opaque blocks to drop
- Prefer the smallest mode that answers the question

NOTE:
- Restore requests are NOT an event type. Use \`query_entities\` with an \`extended_filter\` on \`entityPayload.isRestoreRequested\`, or \`summarize_entities\` grouped by \`restore_state\``;

const returnModeSchema = z
    .enum(RETURN_MODES)
    .default('full')
    .describe('How much to send back: full, summary, or count.');

interface QueryEventsArgs {
    start_date: string;
    end_date?: string;
    event_types?: string[];
    event_states?: string[];
    severities?: string[];
    saas?: string[];
    description?: string;
    event_ids?: string[];
    scroll_id?: string;
    return_mode?: ReturnMode;
}

export function registerEventTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    registerTool<{ event_id: string }>(
        server,
        'get_event',
        GET_EVENT_DESCRIPTION,
        {
            event_id: z.string().min(1).max(256).describe('The HEC event id.'),
        },
        async (args, extra) =>
            handle('get_event', async () => {
                const api = apiFor(serverModule, extra);
                return toEvent(await api.getEvent(args.event_id));
            })
    );

    registerTool<QueryEventsArgs>(
        server,
        'query_events',
        QUERY_EVENTS_DESCRIPTION,
        {
            start_date: z
                .string()
                .min(1)
                .max(64)
                .describe(
                    'ISO 8601 UTC start of window, e.g. `2026-06-08T00:00:00.000Z`.'
                ),
            end_date: z
                .string()
                .max(64)
                .optional()
                .describe(
                    'ISO 8601 UTC end of window. Defaults to now upstream.'
                ),
            event_types: z
                .array(z.enum(EVENT_TYPES))
                .optional()
                .describe('Filter by event type.'),
            event_states: z
                .array(z.enum(EVENT_STATES))
                .optional()
                .describe('Filter by event state.'),
            severities: z
                .array(z.enum(EVENT_SEVERITIES))
                .optional()
                .describe('Filter by severity (lowercase).'),
            saas: z
                .array(z.string())
                .optional()
                .describe(
                    'Filter by SaaS source, e.g. `office365_emails`, `google_mail`.'
                ),
            description: z
                .string()
                .max(512)
                .optional()
                .describe(
                    'Free-text substring match on the event description.'
                ),
            event_ids: z
                .array(z.string())
                .optional()
                .describe('Fetch specific event ids.'),
            scroll_id: z
                .string()
                .max(4096)
                .optional()
                .describe('Pagination cursor from a prior call.'),
            return_mode: returnModeSchema,
        },
        async (args, extra) =>
            handle('query_events', async () => {
                ensureWindowOrder(args.start_date, args.end_date);
                const api = apiFor(serverModule, extra);

                const requestData = compact({
                    startDate: args.start_date,
                    endDate: args.end_date,
                    eventTypes: args.event_types,
                    eventStates: args.event_states,
                    severities: args.severities,
                    saas: args.saas,
                    description: args.description,
                    eventIds: args.event_ids,
                    scrollId: args.scroll_id,
                });

                const page = await api.queryEvents(requestData);
                const returnMode = args.return_mode ?? 'full';

                return {
                    return_mode: returnMode,
                    total_count: page.total,
                    // `full` and `summary` are equivalent: an event carries no
                    // opaque payload block that a summary view could drop.
                    events:
                        returnMode === 'count'
                            ? null
                            : page.records.map(toEvent),
                    scroll_id: page.scrollId,
                };
            })
    );
}
