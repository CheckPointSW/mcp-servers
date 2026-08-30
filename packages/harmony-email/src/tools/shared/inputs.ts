import { z } from 'zod';
import { ValidationError } from '../../core/errors.js';
import { parseIso } from './aggregate.js';

/** Filter enums and window validation shared by the query and summarize tools. */

/**
 * Values mirror the upstream event model. Upstream does not validate these
 * filters, so an out-of-enum value silently matches nothing - enforcing them
 * at the tool boundary is the only thing standing between the model and a
 * plausible-looking zero result.
 */
export const EVENT_TYPES = [
    'phishing',
    'suspicious_phishing',
    'malware',
    'suspicious_malware',
    'dlp',
    'anomaly',
    'shadow_it',
    'malicious_url',
    'malicious_url_click',
    'alert',
    'spam',
    'graymail',
] as const;

export const EVENT_STATES = [
    'new',
    'detected',
    'pending',
    'remediated',
    'dismissed',
    'exception',
] as const;

export const EVENT_SEVERITIES = [
    'lowest',
    'low',
    'medium',
    'high',
    'critical',
] as const;

/**
 * The entity store's own registry naming, which differs from the saas ids
 * (`gdrive_file`, `o365_onedrive_file`, `ms_teams_file`).
 */
export const SAAS_ENTITY_TYPES = [
    'box2_file',
    'dropbox2_file',
    'gdrive_file',
    'google_mail_attachment',
    'google_mail_email',
    'ms_teams_file',
    'ms_teams_message',
    'o365_onedrive_file',
    'o365_sharepoint_file',
    'office365_emails_attachment',
    'office365_emails_email',
    'seg_emails_attachment',
    'seg_emails_email',
    'sharefile2_file',
    'slack2_file',
    'slack2_message',
] as const;

/** SaaS sources the entity search accepts. */
export const KNOWN_SAAS = [
    'email',
    'office365_emails',
    'office365_onedrive',
    'office365_sharepoint',
    'o365_onedrive',
    'o365_sharepoint',
    'sharefile',
    'slack',
    'slack2',
    'ms_teams',
    'google_mail',
    'box2',
    'dropbox2',
    'google_drive',
] as const;

/**
 * ASSUMPTION: upstream silently accepts an unknown `saas` and answers 200 with
 * zero entities, so an out-of-registry value is rejected here instead of
 * looking like "nothing matched". Shared by `query_entities` and
 * `summarize_entities`: the same typo must not be an error in one and a
 * plausible zero in the other.
 */
export function assertKnownSaas(saas: string): void {
    if (!(KNOWN_SAAS as readonly string[]).includes(saas)) {
        throw new ValidationError(
            `unknown saas "${saas}"; expected one of ${[...KNOWN_SAAS].sort().join(', ')}`
        );
    }
}

export const SAAS_ATTR_OPS = [
    'is',
    'isNot',
    'contains',
    'doesNotContain',
    'in',
    'notIn',
] as const;

/**
 * One predicate inside HEC's `entityExtendedFilter` array.
 *
 * The gateway requires this exact three-field tuple on every clause; the
 * dotted-attribute key form (`{"entityPayload.isRestoreRequested": true}`)
 * comes back as HTTP 422. Encoding the shape here rejects bad input at the
 * tool boundary instead of round-tripping to the gateway.
 */
export const extendedFilterClauseSchema = z
    .object({
        saasAttrName: z
            .string()
            .min(1)
            .describe(
                'Dotted path to the attribute being filtered. Examples: ' +
                    '`entityPayload.isRestoreRequested`, `entityPayload.isRestored`, ' +
                    '`entityPayload.isRestoreDeclined`, `entityPayload.fromEmail`.'
            ),
        saasAttrOp: z
            .enum(SAAS_ATTR_OPS)
            .describe(
                'Comparison operator. `is`/`isNot` for booleans and exact matches, ' +
                    '`contains`/`doesNotContain` for substrings, `in`/`notIn` for membership.'
            ),
        saasAttrValue: z
            .union([z.string().min(1), z.boolean(), z.number()])
            .describe(
                'Value to compare against - string, boolean, or number. Always sent ' +
                    'to HEC as a string (`true`/`false` for booleans).'
            ),
    })
    .strict();

export type ExtendedFilterClause = z.infer<typeof extendedFilterClauseSchema>;

/**
 * Upstream parses the boolean path with strtobool, which needs `"true"` /
 * `"false"` text, so every value is serialised to a string.
 */
export function serializeExtendedFilter(
    clauses: ExtendedFilterClause[]
): Record<string, string>[] {
    return clauses.map((clause) => ({
        saasAttrName: clause.saasAttrName,
        saasAttrOp: clause.saasAttrOp,
        saasAttrValue:
            typeof clause.saasAttrValue === 'boolean'
                ? clause.saasAttrValue
                    ? 'true'
                    : 'false'
                : String(clause.saasAttrValue),
    }));
}

/**
 * Reject an inverted window.
 *
 * An inverted window used to sail through to upstream and come back as a
 * silent zero count. Unparsable values pass through untouched: upstream stays
 * the authority on date syntax, and this only rejects windows that parse.
 */
export function ensureWindowOrder(
    startDate: string,
    endDate?: string | null
): void {
    if (!endDate) return;
    let start: number;
    let end: number;
    try {
        start = parseIso(startDate);
        end = parseIso(endDate);
    } catch {
        return;
    }
    if (start > end) {
        throw new Error(
            `start_date "${startDate}" is after end_date "${endDate}" - swap them`
        );
    }
}

export const RETURN_MODES = ['full', 'summary', 'count'] as const;
export type ReturnMode = (typeof RETURN_MODES)[number];
