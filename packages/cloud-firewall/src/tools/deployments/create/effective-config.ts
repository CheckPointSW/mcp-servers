import { z } from 'zod';
import { scrub, SECRET_KEY_PATTERN } from '../shared.js';

/**
 * What the backend does when an optional create field is omitted, declared
 * once beside the zod field it describes (see whenOmitted). The field's
 * description, the confirm:false effective-configuration table and the
 * intake guidance all read this, so a default cannot be stated one way in
 * the schema and another way in the text a user approves.
 *
 *   default          the backend applies a known, fixed value — show it
 *   backend-chooses  the backend decides per request/environment; no fixed value
 *   not-set          nothing is configured; `note` says what that means
 *
 * Backend defaults are declared `backend-chooses`, never copied into
 * `default`: a copied value is what the user approves even after the backend
 * changes it. `default` remains for values this server itself guarantees.
 */
export type FieldOmission = (
    | { source: 'default'; value: unknown }
    | { source: 'backend-chooses'; note: string }
    | { source: 'not-set'; note?: string }
) & {
    /**
     * When false for the parsed args, an omitted field is not applicable and
     * is left out of the table (e.g. management server IPs for Smart-1
     * Cloud). A provided field is always shown — the user is approving it.
     */
    appliesWhen?: (args: Record<string, unknown>) => boolean;
};

export type FieldSource = 'provided' | FieldOmission['source'];

export interface EffectiveField {
    path: string;
    value: unknown;
    source: FieldSource;
}

// Keyed by the exact zod instance placed in the shape. `.describe()` and
// friends return a NEW instance, so re-describing a field (Azure's
// managementName) must call whenOmitted again — the coverage test catches a
// field whose metadata was lost that way.
const omissions = new WeakMap<z.ZodRawShape[string], FieldOmission>();

function omissionText(omission: FieldOmission): string {
    switch (omission.source) {
        case 'default':
            return `Omit for the backend default ${JSON.stringify(omission.value)}.`;
        case 'backend-chooses':
            return `Omit to let the backend choose (${omission.note}).`;
        case 'not-set':
            return `Omit to leave unset${omission.note ? ` (${omission.note})` : ''}.`;
    }
}

/**
 * Declare an optional field's omission behavior and append it to the field's
 * description. Call last, on the instance that goes into the shape.
 */
export function whenOmitted<T extends z.ZodTypeAny>(
    schema: T,
    omission: FieldOmission
): T {
    const described = schema.describe(
        [schema.description, omissionText(omission)].filter(Boolean).join(' ')
    ) as T;
    omissions.set(described, omission);
    return described;
}

export function omissionOf(
    schema: z.ZodRawShape[string]
): FieldOmission | undefined {
    return omissions.get(schema);
}

/** A field's own value when shown; secret-shaped keys never are. */
const HIDDEN = 'provided (hidden)';

/**
 * Every field of a create schema with the value that will apply and where it
 * comes from, in schema order. Nested objects (managementSettings,
 * vendorSettings) are flattened to dotted paths.
 *
 * `args` are the zod-parsed inputs, so a "$env:CFW_SIC_*" reference has
 * already been resolved to the secret itself: secrets are matched by key
 * name (the same pattern the read tools scrub with) and always shown as
 * hidden, never by value. Reporting which environment reference matched would
 * make this preview an oracle for guessing that environment value.
 */
export function effectiveConfiguration(
    shape: z.ZodRawShape,
    args: Record<string, unknown>,
    prefix = '',
    root: Record<string, unknown> = args
): EffectiveField[] {
    return Object.entries(shape).flatMap(([key, field]): EffectiveField[] => {
        const path = prefix + key;
        const value = args?.[key];
        const inner = field instanceof z.ZodOptional ? field.unwrap() : field;
        if (inner instanceof z.ZodObject)
            return effectiveConfiguration(
                inner.shape,
                (value ?? {}) as Record<string, unknown>,
                `${path}.`,
                root
            );
        if (value !== undefined)
            return [
                {
                    path,
                    // scrub() covers a nested object this walk does not
                    // recurse into (any wrapper other than ZodOptional), so
                    // a secret inside it is dropped rather than shown.
                    value: SECRET_KEY_PATTERN.test(key) ? HIDDEN : scrub(value),
                    source: 'provided',
                },
            ];
        const omission = omissions.get(field);
        // Required fields cannot be omitted after parsing; an optional field
        // without metadata is a schema bug the coverage test reports.
        if (!omission || (omission.appliesWhen && !omission.appliesWhen(root)))
            return [];
        return [
            {
                path,
                value:
                    omission.source === 'default'
                        ? omission.value
                        : omission.source === 'backend-chooses'
                          ? `(backend chooses: ${omission.note})`
                          : `(not set${omission.note ? `: ${omission.note}` : ''})`,
                source: omission.source,
            },
        ];
    });
}
