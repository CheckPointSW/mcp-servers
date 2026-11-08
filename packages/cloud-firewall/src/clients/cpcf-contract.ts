import { z } from 'zod';

/**
 * Validate only the read structure exposed by the proxy. Status values are
 * backend observations, not a closed set of states interpreted by the MCP.
 * Other fields pass through unchanged, including nulls and nested data;
 * tools redact secrets before returning them to the model.
 * Breaking changes to this minimal structure require a new backend API
 * version, with the previous version remaining available to existing clients.
 */
const observationSchema = z
    .object({ id: z.string().min(1), name: z.string(), status: z.string() })
    .passthrough();

/**
 * vpcEndpointService: the AWS VPC endpoint service the customer's Gateway Load
 * Balancer endpoint connects to. The backend sets it only once provisioning
 * succeeds (all gateways running and passing status checks); absent before.
 */
export const cpcfDeploymentSchema = observationSchema.extend({
    vpcEndpointService: z.string().min(1).nullish(),
});
export const cpcfGatewaySchema = observationSchema;

/**
 * GCP wiring read: only the group id the tool exists for, the status it is read
 * with, and the gateway list container. Gateway records are forwarded unchecked.
 */
export const cpcfGcpDeploymentInfoSchema = z
    .object({
        interceptDeploymentGroupId: z.string().min(1),
        status: z.string(),
        gateways: z.array(z.record(z.string(), z.unknown())),
    })
    .passthrough();

/** Metrics are forwarded without interpreting their series or values. */
export const cpcfMonitoringSchema = z
    .record(z.string(), z.unknown())
    .optional();

/** A usable create id is essential for reconciling an accepted write. */
export const cpcfCreateResultSchema = z
    .object({ id: z.string().min(1) })
    .passthrough();

/** Peering statuses remain open backend observations; optional/additive metadata passes through. */
export const cpcfVnetPeeringSchema = z
    .object({
        id: z.string().min(1),
        vnetResourceId: z.string().min(1),
        status: z.string(),
    })
    .passthrough();

/** Accepted peering requests return ids used to reconcile their asynchronous outcome. */
export const cpcfVnetPeeringResultSchema = z
    .object({ ids: z.array(z.string().min(1)).min(1) })
    .passthrough();

const MAX_REPORTED_ISSUES = 5;

/** The JSON type of a value, for messages — never the value itself. */
function jsonType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function formatPath(path: PropertyKey[]): string {
    if (path.length === 0) return '(root)';
    return path
        .map((part, i) =>
            typeof part === 'number'
                ? `[${part}]`
                : i === 0
                  ? String(part)
                  : `.${String(part)}`
        )
        .join('');
}

function valueAt(root: unknown, path: PropertyKey[]): unknown {
    let node = root;
    for (const part of path) {
        if (node === null || typeof node !== 'object') return undefined;
        node = (node as Record<PropertyKey, unknown>)[part];
    }
    return node;
}

/**
 * One line per issue, built only from the schema (paths, expected types, enum
 * options we define) and the received value's TYPE. zod's own issue messages
 * are not used: validation messages can embed the received value, and response
 * values may be customer data.
 */
function describeIssue(issue: z.ZodIssue, raw: unknown): string {
    const received = jsonType(valueAt(raw, issue.path));
    let expected: string;
    switch (issue.code) {
        case 'invalid_type':
            expected = issue.expected;
            break;
        case 'invalid_value':
            expected = issue.values.map((o) => `'${String(o)}'`).join(' | ');
            break;
        case 'too_small':
            expected = `non-empty ${issue.origin}`;
            break;
        default:
            expected = `a value passing ${issue.code}`;
    }
    return `${formatPath(issue.path)}: expected ${expected}, received ${received}`;
}

/**
 * A 2xx response that violates the minimal pinned API contract. This is not
 * transient or a caller input error: investigate backend compatibility before
 * migrating the MCP. Messages contain only field paths and types, never values.
 */
export class CpcfContractError extends Error {
    /** Read by tools/errors.ts: the message is ours and contains no response values. */
    readonly safeForModel = true;

    constructor(
        readonly operation: string,
        readonly issues: string[],
        hint?: string
    ) {
        const listed = issues.slice(0, MAX_REPORTED_ISSUES).join('; ');
        const more =
            issues.length > MAX_REPORTED_ISSUES
                ? ` (+${issues.length - MAX_REPORTED_ISSUES} more)`
                : '';
        super(
            `Cloud Firewall response shape changed for ${operation}: ${listed}${more} — the response violates the pinned API contract; check backend compatibility; retrying will not help.${hint ? ` ${hint}` : ''}`
        );
        this.name = 'CpcfContractError';
    }

    toModelText(toolName: string): string {
        return `${toolName} failed: ${this.message}`;
    }
}

/** Validate a parsed body against its contract, or throw CpcfContractError. */
export function parseContract<T extends z.ZodTypeAny>(
    schema: T,
    raw: unknown,
    operation: string,
    hint?: string
): z.output<T> {
    const result = schema.safeParse(raw);
    if (result.success) return result.data;
    throw new CpcfContractError(
        operation,
        result.error.issues.map((issue) => describeIssue(issue, raw)),
        hint
    );
}
