import { z } from 'zod';
import { NotFoundError, UpstreamError, ValidationError } from './errors.js';

/**
 * HEC v1.0 wraps every request body in `{"requestData": ...}` and every
 * response in `{"responseEnvelope": {...}, "responseData": ...}`. These
 * helpers isolate that shape so tool code never has to know about it.
 */

/** Upstream may add fields at any time, so envelope parsing stays permissive. */
const responseEnvelopeSchema = z
    .object({
        success: z.boolean().default(true),
        scrollId: z.string().nullish(),
        recordsNumber: z.number().nullish(),
        totalRecordsNumber: z.number().nullish(),
        errorCode: z.string().nullish(),
        errorMessage: z.string().nullish(),
    })
    .passthrough();

const v1ResponseSchema = z
    .object({
        responseEnvelope: responseEnvelopeSchema.nullish(),
        responseData: z.unknown().nullish(),
    })
    .passthrough();

export interface UnwrappedResponse {
    data: unknown;
    scrollId: string | null;
    total: number | null;
}

export function wrapRequestData(
    data: Record<string, unknown>
): Record<string, unknown> {
    return { requestData: data };
}

/**
 * Validate the v1.0 envelope and return `(responseData, scrollId, total)`.
 * Non-paginated endpoints yield null for both scrollId and total.
 *
 * Throws NotFoundError / ValidationError / UpstreamError when the envelope
 * reports `success: false`, mapped from the upstream error code.
 */
export function unwrapV1Response(raw: unknown): UnwrappedResponse {
    const parsed = v1ResponseSchema.safeParse(raw);
    if (!parsed.success) {
        throw new UpstreamError(
            'Upstream returned a response that is not a v1.0 envelope'
        );
    }

    const env = parsed.data.responseEnvelope;
    const data = parsed.data.responseData ?? null;

    if (!env || env.success) {
        // ASSUMPTION: live query envelopes carry the cross-page total in
        // `recordsNumber`; prefer `totalRecordsNumber` when upstream sets it.
        const total = env
            ? (env.totalRecordsNumber ?? env.recordsNumber ?? null)
            : null;
        return { data, scrollId: env?.scrollId ?? null, total };
    }

    const code = (env.errorCode ?? '').toLowerCase();
    const message = env.errorMessage ?? 'request failed';
    if (code.includes('not_found') || code.endsWith('not-found'))
        throw new NotFoundError(message);
    if (
        code.includes('invalid') ||
        code.includes('bad_request') ||
        code.startsWith('validation')
    ) {
        throw new ValidationError(message);
    }
    throw new UpstreamError(`${code || 'unknown'}: ${message}`);
}
