import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GLOSSARY } from '../content/glossary.js';
import { PERSONA } from '../content/persona.js';
import {
    promptMessage,
    registerPrompt,
    registerResource,
} from '../tools/shared/result.js';

/**
 * Prompts and the glossary resource.
 *
 * The three task prompts are intent-shaped templates that orchestrate the
 * tools; they carry the PII discipline and the "use the aggregator, do not
 * page through raw rows yourself" rules that keep answers cheap and safe.
 */

const GLOSSARY_URI = 'hec://glossary';

const GLOSSARY_DESCRIPTION =
    'Canonical terminology for Harmony Email & Collaboration (HEC): entity vs. event vs. ' +
    'verdict; the five detection engines (Anti-Phishing, DLP, Click-time Protection, ' +
    'Shadow IT, Antivirus); enumerated event types, states and severities; the ' +
    'restore-request lifecycle; SaaS sources; Anti-Phishing exception types. The analyst ' +
    'persona loads this to use customer-recognised vocabulary.';

const PERSONA_DESCRIPTION =
    'The cyber-security analyst persona for this server. Returns the voice, vocabulary, ' +
    'refusal stances and time-window conventions the assistant should follow. Load it once ' +
    'at the start of a conversation.';

const ACTIVITY_DESCRIPTION =
    'Summarize Harmony Email & Collaboration (HEC) security activity over a rolling time ' +
    "window. Use for questions like 'did phishing increase this week?', 'what are the top " +
    "threats?', 'recap the last 24 hours'.";

const RESTORE_DESCRIPTION =
    'Report on Harmony Email & Collaboration (HEC) restore requests: the pending queue, the ' +
    'resolved count over a window, or the manual-vs-automatic trend. Use for questions like ' +
    "'show all pending restore requests', 'how many restore requests were resolved last " +
    "week?', or 'are most restores manual or automatic?'";

const SINGLE_DESCRIPTION =
    'Investigate one Harmony Email & Collaboration (HEC) detection. Use for questions like ' +
    "'explain this detection', 'why was this email flagged?', 'why was the sender, URL or " +
    "attachment treated as malicious?'. Takes an entity id.";

function activityTemplate(timeWindow: string): string {
    return `You are answering a security-activity summary question. Follow the analyst
persona loaded from the server \`instructions\` (or the \`analyst_persona\`
prompt). Use HEC vocabulary as defined in \`hec://glossary\`.

User's window of interest: **${timeWindow}**

# How to answer

1. Compute the absolute UTC time window from "${timeWindow}":
   - "last 24 hours" / "today" → now - 24h to now
   - "this week" / "last 7 days" → now - 7d to now
   - "last 30 days" → now - 30d to now
   - Anything else → translate to a rolling window from now (UTC).
   Format both bounds as ISO 8601 with millisecond precision and a \`Z\` suffix
   (e.g. \`2026-06-08T12:34:56.000Z\`).

2. Call the \`summarize_events\` aggregator with:
   - \`start_date\` = computed start, \`end_date\` = computed end.
   - \`group_by\` = the smallest set of axes the question needs. Defaults that
     usually work: \`["type", "severity", "day"]\`. Add \`"state"\` if the user
     asked about remediation, \`"saas"\` if they asked about source mix.
   - \`compare_to_previous_window=true\` whenever the question is comparative
     ("did X increase", "is this above normal"). The previous-window counts
     come back under \`previous_window\` in a single call.
   - Read \`total_count\` and \`truncated\` honestly. If \`truncated=true\`, tell
     the user the counts cover only the first N events scanned.
   - Do **not** call the raw \`query_events\` tool to bucket events yourself —
     the aggregator already returns counts.

3. Format the answer as:
   - **Headline**: one sentence — "Yes, phishing detections rose 38% vs. last
     week" or "Activity is steady — nothing unusual in the last 24 hours".
   - **Table** (3-5 rows): the most relevant breakdown (e.g. event_type x
     count from \`counts.type\`, or severity x count from \`counts.severity\`).
     Markdown table.
   - **So what** (one short paragraph): what stands out, in plain language.
     Do not speculate about attacker attribution.

# Do not

- Do not call \`query_events\` to fetch raw events when \`summarize_events\`
  answers the question — payload-in-the-LLM is the cost we're avoiding.
- Do not call \`get_event\` for every event — only spot-check the top 1-2 if
  needed to ground a claim.
- Do not invent severity values like "Critical" or "Highest"; the wire
  format is lowercase.
- Do not hide truncation. If \`truncated=true\`, disclose it in the headline.`;
}

function restoreTemplate(mode: string, timeWindow: string): string {
    return `You are answering a restore-request reporting question. Follow the analyst
persona loaded from the server \`instructions\` (or the \`analyst_persona\`
prompt). Use the terminology in \`hec://glossary\` — in particular: a restore
request is NOT an event type. It lives on the entity payload as three
booleans: \`entityPayload.isRestoreRequested\`, \`entityPayload.isRestoreDeclined\`,
\`entityPayload.isRestored\`. (The \`entityPayload.\` prefix is mandatory when
used as a \`saasAttrName\` in \`extended_filter\`.)

Each \`extended_filter\` entry follows the \`ExtendedFilterClause\` shape:
\`{saasAttrName, saasAttrOp, saasAttrValue}\` — \`saasAttrOp\` must be one of
\`is\`, \`isNot\`, \`contains\`, \`doesNotContain\`, \`in\`, \`notIn\`, and
\`saasAttrValue\` is always a string (use \`"true"\` / \`"false"\` for booleans).
Any other shape (e.g. a dotted-attribute key like
\`{"entityPayload.isRestoreRequested": true}\`) is rejected at the tool boundary.

Mode: **${mode}**
Time window (used for \`resolved\` and \`trend\` modes): **${timeWindow}**

# How to answer

All three modes use the **same** tool — \`summarize_entities\` — with different
\`group_by\` axes. The aggregator paginates and counts server-side; the LLM
never sees the raw entity list.

## If mode = "pending"

Call \`summarize_entities\` with:
- \`saas\` = "office365_emails"  (also consider "google_mail" if relevant)
- \`start_date\` = start of the window (required upstream; default to the
  last 30 days if the user didn't say)
- \`group_by\` = \`["restore_state"]\`
- \`extended_filter\` = three predicates pre-filtering to pending only:
  - \`{"saasAttrName": "entityPayload.isRestoreRequested", "saasAttrOp": "is", "saasAttrValue": "true"}\`
  - \`{"saasAttrName": "entityPayload.isRestored",         "saasAttrOp": "is", "saasAttrValue": "false"}\`
  - \`{"saasAttrName": "entityPayload.isRestoreDeclined",  "saasAttrOp": "is", "saasAttrValue": "false"}\`
- \`sample_limit\` = 15  (or whatever the user implied — never above 50)

The result's \`counts.restore_state.pending\` is the headline number;
\`sample\` is the list to render. Format as a markdown table with columns:
entity_id, saas_entity_type, entity_created, restore_state.

If \`counts.restore_state.pending > len(sample)\`, add a one-line "and N more"
footer.

## If mode = "resolved"

Call \`summarize_entities\` with \`group_by=["restore_state"]\` and
\`extended_filter\` filtering to \`entityPayload.isRestoreRequested = true\`.

Sum \`counts.restore_state.restored + counts.restore_state.declined\` for the
total. Format as: one headline number, then a 2-row table (restored,
declined).

## If mode = "trend"

\`extended_filter\` clauses are AND-ed, so "restored or declined" cannot be a
single query. Call \`summarize_entities\` twice, both with
\`group_by=["remediation_mode", "day"]\`:

1. \`{"saasAttrName": "entityPayload.isRestored", "saasAttrOp": "is", "saasAttrValue": "true"}\`
2. \`{"saasAttrName": "entityPayload.isRestoreDeclined", "saasAttrOp": "is", "saasAttrValue": "true"}\`

Do **not** filter on \`isRestoreRequested=true\` alone for this mode: that set
still holds every pending request, so unresolved mail would land in the trend.

In each result \`counts.remediation_mode\` is the manual-vs-automatic split
(\`n_a\` means still pending and should not appear here; if it does, say so
rather than folding it into either bucket) and \`by_day\` is the daily volume.

Format as a markdown table plus one summary sentence that claims only what the
counts show ("32 restores last week, 70% of them manual").

**Two limits, both worth stating whenever the user leans on the trend**:
- The axes are marginal, not cross-tabulated: there is no manual-vs-automatic
  split *per day*. Do not present one.
- \`by_day\` buckets entities by \`entity_created\` (when the email arrived),
  not by when the restore was actioned.

# Vocabulary reminders

- \`restore_state\` values: \`none | pending | restored | declined\`.
- \`remediation_mode\` values: \`manual | automatic | n_a\`. The \`automatic\`
  bucket corresponds to what the glossary calls \`policy\` / \`dnp_action\`.
  When you talk to the user, use "automatic" (their wording), not "policy".

# Do not

- Do not call \`query_events\` for restore reporting — restore lifecycle is
  on the entity, not on events.
- Do not call \`query_entities\` to fetch entities and walk \`entity_actions\`
  yourself — that defeats the whole point of \`summarize_entities\`.
- Do not include recipient or subject content in the table — those are not
  returned by the entity tools by design.`;
}

function singleTemplate(entityId: string): string {
    return `You are answering a single-email investigation question. Follow the analyst
persona loaded from the server \`instructions\` (or the \`analyst_persona\`
prompt). Use HEC vocabulary as defined in \`hec://glossary\`.

\`get_entity\` returns the full upstream record, which on email entities
typically includes the message subject, addresses (to/cc/bcc/recipients),
attachment metadata, links, and headers in \`entity_payload\` / \`saas_info\`.
Treat that data as sensitive — refer to it abstractly ("the email's
subject", "an external recipient") unless the analyst explicitly asks to
see the raw values.

Entity id to investigate: **${entityId}**

# How to answer

1. Call \`get_entity(entity_id="${entityId}")\` once.

2. From the returned \`Entity\`, extract:
   - \`entity_security_result.combined_verdict\` — the overall verdict.
   - Per engine in \`entity_security_result.{ap, dlp, clicktimeProtection,
     shadowIt, av}\`:
     - which engine(s) returned a non-clean verdict;
     - the \`verdict\` and \`score\` they assigned;
     - the \`status_code\` / \`status_description\` for any engine that errored.
   - \`entity_actions\` — the action history (quarantine, restore, decline,
     etc.) with timestamps.
   - \`entity_available_actions\` — what an admin could do next.
   - Restore flags on \`entity_payload\` if present: \`isRestoreRequested\`,
     \`isRestoreDeclined\`, \`isRestored\`.

3. If the entity is not found, say so plainly — do not retry with a
   different id.

4. Format the answer as a short narrative (not a table):

   **Verdict.** One sentence stating the combined verdict and the most
   damning per-engine finding.

   **Engines that flagged it.** A short list, one line per engine that
   returned non-clean, naming the engine in plain English (e.g. "Anti-
   Phishing (AP)" not "ap") and what it said.

   **Action history.** What's already been done — quarantine, restore,
   decline, etc. — and when. If nothing has been actioned, say so.

   **What to consider next.** One short paragraph naming the available
   actions and what a Tier-1 analyst would typically do. Do not speculate
   about attacker identity or attribution.

# Do not

- Do not paste the raw subject, recipient addresses, header values, link
  URLs, or attachment names into the answer — refer to them abstractly
  (e.g. "the email's subject", "an internal recipient") unless the analyst
  explicitly asks to see the raw values. The data IS in \`entity_payload\` /
  \`saas_info\`, so the discipline is yours, not the API's.
- Do not invent verdicts that didn't come back. If an engine returned
  \`clean\`, say it returned clean.
- Do not call \`query_entities\` or \`query_events\` to chase additional
  context unless the user explicitly asks for "what else is going on with
  this sender" or similar follow-up.

# Deep-dive follow-ups

If the user asks for raw headers / body / attachment content verbatim, call
\`download_entity(entity_id="${entityId}")\` — defaults strip the
\`X-CLOUD-SEC-AV-*\` pipeline headers; pass \`original=true\` if they want the
message exactly as the upstream mail server delivered it. Body comes back
base64-encoded in \`body_base64\`.

If the analyst concludes the verdict was wrong (false positive or false
negative), offer to call \`report_misclassification(entity_ids=["${entityId}"], classification=..., confident=...)\`.
Always run with \`confirm=false\` first so the user can review the planned
submission, then re-run with \`confirm=true\` to actually send it.`;
}

export function registerPrompts(server: McpServer): void {
    registerPrompt(server, 'analyst_persona', PERSONA_DESCRIPTION, null, () =>
        promptMessage(PERSONA)
    );

    registerPrompt(
        server,
        'security_activity_summary',
        ACTIVITY_DESCRIPTION,
        {
            time_window: z
                .string()
                .optional()
                .describe(
                    'Rolling window, e.g. "last 24 hours" or "this week".'
                ),
        },
        (args) =>
            promptMessage(activityTemplate(args.time_window || 'last 24 hours'))
    );

    registerPrompt(
        server,
        'restore_request_report',
        RESTORE_DESCRIPTION,
        {
            // Deliberately free-form, so model-invented synonyms ("open",
            // "active") still land on the pending branch.
            mode: z
                .string()
                .optional()
                .describe('pending, resolved, or trend.'),
            time_window: z
                .string()
                .optional()
                .describe('Rolling window for the resolved and trend modes.'),
        },
        (args) =>
            promptMessage(
                restoreTemplate(
                    args.mode || 'pending',
                    args.time_window || 'last 7 days'
                )
            )
    );

    registerPrompt(
        server,
        'single_email_investigation',
        SINGLE_DESCRIPTION,
        {
            entity_id: z.string().describe('The HEC entity id to investigate.'),
        },
        (args) => promptMessage(singleTemplate(args.entity_id ?? ''))
    );
}

export function registerGlossaryResource(server: McpServer): void {
    registerResource(
        server,
        'HEC SmartAPI Glossary',
        GLOSSARY_URI,
        { description: GLOSSARY_DESCRIPTION, mimeType: 'application/json' },
        () => GLOSSARY
    );
}
