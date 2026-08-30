import { z } from 'zod';

/**
 * Upstream record shapes.
 *
 * These mirror the Python server's models field for field, including the
 * camelCase key names it emits and its habit of writing absent optional fields
 * as explicit nulls, so output from the two servers is directly
 * diff-comparable. Unknown upstream fields are dropped.
 */

/** Absent optional fields are serialised as null, matching the Python models. */
export function orNull<T>(value: T | null | undefined): T | null {
    return value ?? null;
}

/**
 * Drop keys whose value is null or undefined.
 *
 * For *request* payloads only: upstream treats an explicit null filter
 * differently from an absent one. Tool output keeps its nulls.
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(
            ([, value]) => value !== null && value !== undefined
        )
    ) as Partial<T>;
}

const looseString = z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : null));
const looseRecord = z
    .unknown()
    .transform((v) =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
            ? (v as Record<string, unknown>)
            : null
    );

/**
 * ASSUMPTION: some tenants leak the database digit representation of the
 * severity enum. Re-map it to the documented lowercase words.
 */
const SEVERITY_BY_DIGIT: Record<string, string> = {
    '1': 'lowest',
    '2': 'low',
    '3': 'medium',
    '4': 'high',
    '5': 'critical',
};

export function normalizeSeverity(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return SEVERITY_BY_DIGIT[value] ?? (value || null);
}

// ---- Event ------------------------------------------------------------------

export const eventSchema = z
    .object({
        eventId: z.unknown(),
        type: looseString,
        state: looseString,
        severity: z.unknown(),
        saas: looseString,
        description: looseString,
        entityId: looseString,
        eventCreated: looseString,
        confidenceIndicator: looseString,
    })
    .passthrough()
    .transform((raw) => ({
        eventId:
            typeof raw.eventId === 'string'
                ? raw.eventId
                : String(raw.eventId ?? ''),
        type: raw.type,
        state: raw.state,
        severity: normalizeSeverity(raw.severity),
        saas: raw.saas,
        description: raw.description,
        entityId: raw.entityId,
        eventCreated: raw.eventCreated,
        confidenceIndicator: raw.confidenceIndicator,
    }));

export type Event = z.infer<typeof eventSchema>;

export function toEvent(raw: unknown): Event {
    return eventSchema.parse(raw);
}

// ---- Entity -----------------------------------------------------------------

const sectoolResultSchema = z
    .object({
        entityId: looseString,
        entityType: looseString,
        payload: looseRecord,
        score: looseString,
        securityResultEntityId: looseString,
        securityResultEntityType: looseString,
        statusCode: looseString,
        statusDescription: looseString,
        verdict: z
            .unknown()
            .transform((v) => (typeof v === 'string' ? v : 'unknown')),
    })
    .passthrough()
    .transform((raw) => ({
        entityId: raw.entityId,
        entityType: raw.entityType,
        payload: raw.payload,
        score: raw.score,
        securityResultEntityId: raw.securityResultEntityId,
        securityResultEntityType: raw.securityResultEntityType,
        statusCode: raw.statusCode,
        statusDescription: raw.statusDescription,
        verdict: raw.verdict,
    }));

const engineResultsSchema = z
    .array(sectoolResultSchema)
    .nullish()
    .transform((v) => orNull(v));

const entitySecurityResultSchema = z
    .object({
        combinedVerdict: looseRecord,
        ap: engineResultsSchema,
        dlp: engineResultsSchema,
        clicktimeProtection: engineResultsSchema,
        shadowIt: engineResultsSchema,
        av: engineResultsSchema,
    })
    .passthrough()
    .transform((raw) => ({
        combinedVerdict: raw.combinedVerdict,
        ap: raw.ap,
        dlp: raw.dlp,
        clicktimeProtection: raw.clicktimeProtection,
        shadowIt: raw.shadowIt,
        av: raw.av,
    }));

const entityActionSchema = z
    .object({
        entityActionName: z.string(),
        entityActionDate: looseString,
        entityActionResponseCode: looseString,
        entityActionResponseText: looseString,
        entityActionState: looseString,
    })
    .passthrough()
    .transform((raw) => ({
        entityActionName: raw.entityActionName,
        entityActionDate: raw.entityActionDate,
        entityActionResponseCode: raw.entityActionResponseCode,
        entityActionResponseText: raw.entityActionResponseText,
        entityActionState: raw.entityActionState,
    }));

const entityInfoSchema = z
    .object({
        entityId: z.string(),
        customerId: looseString,
        saas: looseString,
        saasEntityType: looseString,
        entityCreated: looseString,
        entityUpdated: looseString,
        entityActionState: looseString,
    })
    .passthrough()
    .transform((raw) => ({
        entityId: raw.entityId,
        customerId: raw.customerId,
        saas: raw.saas,
        saasEntityType: raw.saasEntityType,
        entityCreated: raw.entityCreated,
        entityUpdated: raw.entityUpdated,
        entityActionState: raw.entityActionState,
    }));

/**
 * `saasInfo` and `entityPayload` are passed through verbatim: they are engine-
 * and SaaS-specific, and on email entities carry the subject, addresses,
 * attachment metadata, links and headers. Sensitive, but the caller asked.
 */
export const entitySchema = z
    .object({
        entityInfo: entityInfoSchema,
        saasInfo: looseRecord,
        entityPayload: looseRecord,
        entitySecurityResult: entitySecurityResultSchema
            .nullish()
            .transform((v) => orNull(v)),
        entityActions: z.array(entityActionSchema).nullish(),
        entityAvailableActions: z.array(z.string()).nullish(),
    })
    .passthrough()
    .transform((raw) => ({
        entityInfo: raw.entityInfo,
        saasInfo: raw.saasInfo,
        entityPayload: raw.entityPayload,
        entitySecurityResult: raw.entitySecurityResult,
        entityActions: raw.entityActions ?? [],
        entityAvailableActions: raw.entityAvailableActions ?? [],
    }));

export type Entity = z.infer<typeof entitySchema>;

export function toEntity(raw: unknown): Entity {
    return entitySchema.parse(raw);
}

/** The query_entities summary view: an entity minus its two opaque blocks. */
export function toEntitySummary(
    raw: unknown
): Omit<Entity, 'entityPayload' | 'saasInfo'> {
    const {
        entityPayload: _payload,
        saasInfo: _saasInfo,
        ...rest
    } = toEntity(raw);
    return rest;
}

// ---- Task -------------------------------------------------------------------

export const TASK_STATUSES = [
    'init',
    'inprogress',
    'completed',
    'failed',
    'stopped',
    'paused',
] as const;

export const taskSchema = z
    .object({
        taskId: z.string(),
        status: z.enum(TASK_STATUSES),
        actor: looseString,
        startedAt: looseString,
        finishedAt: looseString,
    })
    .passthrough()
    .transform((raw) => ({
        taskId: raw.taskId,
        status: raw.status,
        actor: raw.actor,
        startedAt: raw.startedAt,
        finishedAt: raw.finishedAt,
    }));

export type Task = z.infer<typeof taskSchema>;

export function toTask(raw: unknown): Task {
    return taskSchema.parse(raw);
}

// ---- Anti-Phishing exception ------------------------------------------------

export const EXCEPTION_TYPES = [
    'whitelist',
    'blacklist',
    'spam_whitelist',
] as const;
export type ExceptionTypeName = (typeof EXCEPTION_TYPES)[number];

export const apExceptionSchema = z
    .object({
        id: z.string(),
        type: z
            .enum(EXCEPTION_TYPES)
            .nullish()
            .transform((v) => orNull(v)),
        value: looseString,
        actor: looseString,
        createdAt: looseString,
        updatedAt: looseString,
    })
    .passthrough()
    .transform((raw) => ({
        id: raw.id,
        type: raw.type,
        value: raw.value,
        actor: raw.actor,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    }));

export type APException = z.infer<typeof apExceptionSchema>;

export function toApException(raw: unknown): APException {
    return apExceptionSchema.parse(raw);
}
