import { NotFoundError, UpstreamError } from './errors.js';
import { log } from './redact.js';

/**
 * Shape guards for upstream payloads.
 *
 * Every failure message describes the *shape* only - type and length - never
 * the content, because these payloads carry customer data.
 */

export function shapePreview(data: unknown): string {
    if (Array.isArray(data)) return `array len=${data.length}`;
    if (data === null) return 'null';
    if (typeof data === 'object')
        return `object keys=${Object.keys(data).length}`;
    return typeof data;
}

function isRecord(data: unknown): data is Record<string, unknown> {
    return data !== null && typeof data === 'object' && !Array.isArray(data);
}

export function expectRecord(
    data: unknown,
    where: string
): Record<string, unknown> {
    if (isRecord(data)) return data;
    const preview = shapePreview(data);
    log('smart_api.unexpected_payload', {
        path: where,
        expected: 'object',
        got: preview,
    });
    throw new UpstreamError(
        `unexpected ${where} payload shape: expected object, got ${preview}`
    );
}

export function expectRecordList(
    data: unknown,
    where: string
): Record<string, unknown>[] {
    if (!Array.isArray(data)) {
        const preview = shapePreview(data);
        log('smart_api.unexpected_payload', {
            path: where,
            expected: 'array',
            got: preview,
        });
        throw new UpstreamError(
            `unexpected ${where} payload shape: expected array, got ${preview}`
        );
    }
    return data.map((item) => expectRecord(item, where));
}

/**
 * Accept either a bare object or a one-element array of objects: the public
 * singular GETs return a list of one.
 *
 * An empty array means not-found. The AP-exception handler signals a miss by
 * returning `recordsNumber: 0` with `success: true` under the same route as
 * the list endpoint, so there is no 404 to key off.
 */
export function unwrapSingleton(
    data: unknown,
    where: string
): Record<string, unknown> {
    if (isRecord(data)) return data;

    if (Array.isArray(data)) {
        if (data.length === 1 && isRecord(data[0])) return data[0];
        const preview = `array len=${data.length}`;
        log('smart_api.unexpected_payload', {
            path: where,
            expected: 'singleton',
            got: preview,
        });
        if (data.length === 0)
            throw new NotFoundError(`${where}: empty response (no records)`);
        throw new UpstreamError(
            `unexpected ${where} payload shape: expected singleton, got ${preview}`
        );
    }

    const preview = shapePreview(data);
    log('smart_api.unexpected_payload', {
        path: where,
        expected: 'singleton',
        got: preview,
    });
    throw new UpstreamError(
        `unexpected ${where} payload shape: expected singleton, got ${preview}`
    );
}
