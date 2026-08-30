import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { pathIdProblem, type HarmonyEmailAPIManager } from '../api-manager.js';
import { ValidationError } from '../core/errors.js';
import { orNull } from './shared/schemas.js';
import { handle, registerTool } from './shared/result.js';
import { apiFor } from './shared/session.js';
import type { ServerModule } from './types.js';

/**
 * The entity-action tools.
 *
 * All three actions hit the same upstream route and differ only by the action
 * name (and the decline-only reason). They are non-idempotent - re-running
 * enqueues a fresh task with no upstream dedup - so validation is strict and
 * every tool defaults to `confirm: false`, a preview that makes no upstream
 * call at all.
 */

type ActionName = 'quarantine' | 'restore' | 'decline_restore_request';

const ENTITY_TYPE_MAX_LENGTH = 128;
const DECLINE_REASON_MAX_LENGTH = 1000;

const CONFIRM_DESCRIPTION =
    '`false` (default): return a dry-run preview - echo the exact payload that would be sent, ' +
    'but make NO upstream call. `true`: actually execute the action. These actions are ' +
    'irreversible and not idempotent, so always run with `confirm: false` first and get ' +
    'explicit human go-ahead before re-calling with `confirm: true`.';

const ENTITY_TYPE_HINT =
    '`entity_type` is the SaaS entity type (e.g. `office365_emails_email`), shown as ' +
    '`saasEntityType` on `get_entity`.';

function checkEntityId(value: string): string {
    const problem = pathIdProblem(value);
    if (problem !== null) throw new ValidationError(`entity id ${problem}`);
    return value;
}

function checkEntityType(value: string): string {
    if (!value) throw new ValidationError('entity_type must be non-empty');
    if (value.length > ENTITY_TYPE_MAX_LENGTH) {
        throw new ValidationError(
            `entity_type must be at most ${ENTITY_TYPE_MAX_LENGTH} characters`
        );
    }
    if (!/^[\x21-\x7e]+$/.test(value)) {
        throw new ValidationError(
            'entity_type contains whitespace or non-printable/non-ASCII characters'
        );
    }
    return value;
}

function checkNoDuplicates(values: string[]): string[] {
    if (new Set(values).size !== values.length) {
        throw new ValidationError('entity_ids must not contain duplicates');
    }
    return values;
}

interface ActionOutput {
    submitted: boolean;
    dry_run: boolean;
    action: ActionName;
    entity_ids: string[];
    entity_type: string;
    decline_reason: string | null;
    tasks: { entityId: string | null; taskId: string | null }[];
}

/**
 * Run an entity action, or preview it when `confirm` is false.
 *
 * The batch limit is checked *before* the preview branch, so an oversized list
 * is rejected loudly in both modes rather than silently truncated.
 */
async function executeEntityAction(
    api: HarmonyEmailAPIManager,
    {
        entityIds,
        entityType,
        actionName,
        confirm,
        declineReason,
    }: {
        entityIds: string[];
        entityType: string;
        actionName: ActionName;
        confirm: boolean;
        declineReason?: string;
    }
): Promise<ActionOutput> {
    entityIds.forEach(checkEntityId);
    checkNoDuplicates(entityIds);
    checkEntityType(entityType);

    const limit = api.actionBatchLimit;
    if (entityIds.length > limit) {
        throw new ValidationError(
            `too many entities: ${entityIds.length} requested but the action batch limit is ` +
                `${limit} (set HEC_ACTION_BATCH_LIMIT to change it)`
        );
    }

    const base = {
        action: actionName,
        entity_ids: entityIds,
        entity_type: entityType,
        decline_reason: orNull(declineReason),
    };

    if (!confirm) {
        return { submitted: false, dry_run: true, ...base, tasks: [] };
    }

    const rows = await api.actOnEntity({
        entityIds,
        entityType,
        actionName,
        declineReason,
    });

    return {
        submitted: true,
        dry_run: false,
        ...base,
        tasks: rows.map((row) => ({
            entityId: typeof row.entityId === 'string' ? row.entityId : null,
            taskId: typeof row.taskId === 'string' ? row.taskId : null,
        })),
    };
}

const entityIdSchema = z
    .string()
    .min(1)
    .max(256)
    .describe('The HEC entity id.');
const entityTypeSchema = z
    .string()
    .min(1)
    .max(ENTITY_TYPE_MAX_LENGTH)
    .describe('SaaS entity type, e.g. `office365_emails_email`.');
const confirmSchema = z.boolean().default(false).describe(CONFIRM_DESCRIPTION);

interface SingleArgs {
    entity_id: string;
    entity_type: string;
    confirm?: boolean;
}
interface BatchArgs {
    entity_ids: string[];
    entity_type: string;
    confirm?: boolean;
}
interface DenySingleArgs extends SingleArgs {
    restore_decline_reason?: string;
}
interface DenyBatchArgs extends BatchArgs {
    restore_decline_reason?: string;
}

const DESTRUCTIVE = {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: true,
};

/**
 * Single-entity and batch variants are separate tools on purpose: a deployment
 * can permit one and withhold the other.
 */
export function registerActionTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    const singleShape = {
        entity_id: entityIdSchema,
        entity_type: entityTypeSchema,
        confirm: confirmSchema,
    };
    const batchShape = {
        entity_ids: z
            .array(entityIdSchema)
            .min(1)
            .describe('Entity ids to act on. Duplicates are rejected.'),
        entity_type: entityTypeSchema,
        confirm: confirmSchema,
    };
    const reasonSchema = z
        .string()
        .max(DECLINE_REASON_MAX_LENGTH)
        .optional()
        .describe(
            'Concise reason for the decline, recorded as the audit trail - e.g. ' +
                '"confirmed phishing, end-user restore not warranted".'
        );

    registerTool<SingleArgs>(
        server,
        'action_quarantine',
        `Quarantine a single HEC entity (email or file) - move it out of the user's mailbox or drive into quarantine.

${ENTITY_TYPE_HINT}

Quarantine is irreversible from this tool (use \`action_restore\` to put a message back) and is not idempotent. On submit it returns a \`taskId\` poll-able via \`get_task\`.

${CONFIRM_DESCRIPTION}`,
        singleShape,
        async (args, extra) =>
            handle('action_quarantine', () =>
                executeEntityAction(apiFor(serverModule, extra), {
                    entityIds: [args.entity_id],
                    entityType: args.entity_type,
                    actionName: 'quarantine',
                    confirm: args.confirm ?? false,
                })
            ),
        DESTRUCTIVE
    );

    registerTool<BatchArgs>(
        server,
        'action_quarantine_batch',
        `Quarantine several HEC entities in one call, up to the configured action batch limit (default 50; an oversized list is rejected, never truncated).

Higher blast radius than the single-entity \`action_quarantine\` - scope the entity list carefully.

${ENTITY_TYPE_HINT}

${CONFIRM_DESCRIPTION}`,
        batchShape,
        async (args, extra) =>
            handle('action_quarantine_batch', () =>
                executeEntityAction(apiFor(serverModule, extra), {
                    entityIds: args.entity_ids,
                    entityType: args.entity_type,
                    actionName: 'quarantine',
                    confirm: args.confirm ?? false,
                })
            ),
        DESTRUCTIVE
    );

    registerTool<SingleArgs>(
        server,
        'action_restore',
        `Restore a single quarantined HEC entity back to the user's mailbox or drive.

${ENTITY_TYPE_HINT}

Restore is not idempotent. On submit it returns a \`taskId\` poll-able via \`get_task\`.

${CONFIRM_DESCRIPTION}`,
        singleShape,
        async (args, extra) =>
            handle('action_restore', () =>
                executeEntityAction(apiFor(serverModule, extra), {
                    entityIds: [args.entity_id],
                    entityType: args.entity_type,
                    actionName: 'restore',
                    confirm: args.confirm ?? false,
                })
            ),
        DESTRUCTIVE
    );

    registerTool<BatchArgs>(
        server,
        'action_restore_batch',
        `Restore several quarantined HEC entities in one call, up to the configured action batch limit (default 50; an oversized list is rejected, never truncated).

Higher blast radius than the single-entity \`action_restore\` - scope the entity list carefully.

${ENTITY_TYPE_HINT}

${CONFIRM_DESCRIPTION}`,
        batchShape,
        async (args, extra) =>
            handle('action_restore_batch', () =>
                executeEntityAction(apiFor(serverModule, extra), {
                    entityIds: args.entity_ids,
                    entityType: args.entity_type,
                    actionName: 'restore',
                    confirm: args.confirm ?? false,
                })
            ),
        DESTRUCTIVE
    );

    registerTool<DenySingleArgs>(
        server,
        'action_deny_restore',
        `Deny a pending end-user restore request for a single quarantined HEC entity - the message stays quarantined.

${ENTITY_TYPE_HINT}

Provide \`restore_decline_reason\`, drawn from the analyst's own words; it is recorded as the decline's audit trail.

Declining is not idempotent.

${CONFIRM_DESCRIPTION}`,
        { ...singleShape, restore_decline_reason: reasonSchema },
        async (args, extra) =>
            handle('action_deny_restore', () =>
                executeEntityAction(apiFor(serverModule, extra), {
                    entityIds: [args.entity_id],
                    entityType: args.entity_type,
                    actionName: 'decline_restore_request',
                    confirm: args.confirm ?? false,
                    declineReason: args.restore_decline_reason,
                })
            ),
        DESTRUCTIVE
    );

    registerTool<DenyBatchArgs>(
        server,
        'action_deny_restore_batch',
        `Deny pending restore requests for several quarantined HEC entities in one call, up to the configured action batch limit (default 50; an oversized list is rejected, never truncated).

Higher blast radius than the single-entity \`action_deny_restore\` - scope the entity list carefully.

${ENTITY_TYPE_HINT}

Provide \`restore_decline_reason\`, drawn from the analyst's own words; it is recorded as the decline's audit trail.

${CONFIRM_DESCRIPTION}`,
        { ...batchShape, restore_decline_reason: reasonSchema },
        async (args, extra) =>
            handle('action_deny_restore_batch', () =>
                executeEntityAction(apiFor(serverModule, extra), {
                    entityIds: args.entity_ids,
                    entityType: args.entity_type,
                    actionName: 'decline_restore_request',
                    confirm: args.confirm ?? false,
                    declineReason: args.restore_decline_reason,
                })
            ),
        DESTRUCTIVE
    );
}
