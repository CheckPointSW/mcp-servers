/**
 * Read-only enforcement for caller-supplied GraphQL documents.
 *
 * The operation type of a GraphQL document cannot be determined by inspecting
 * the start of the string. Comments and commas are "ignored tokens" that may
 * precede any token (GraphQL spec 2.1.4, 2.1.5), and a document's definitions
 * have no required order, so a mutation can legitimately appear after a
 * comment, a comma, or a fragment definition. Parsing is the only way to
 * classify the document the same way the server will execute it.
 */

import { parse, type OperationDefinitionNode } from 'graphql';

export type GraphQLClassification =
    | { readOnly: true }
    | { readOnly: false; reason: 'write-operations'; operations: string[] }
    | { readOnly: false; reason: 'unparseable' };

/**
 * Classify a caller-supplied GraphQL document as read-only or not.
 *
 * Allowlists `query` operations instead of denylisting `mutation`, so
 * subscriptions and any operation type added to GraphQL later are refused
 * rather than silently permitted. Fails closed: a document that does not parse
 * is never reported read-only, because we cannot prove what the server would
 * do with it.
 */
export function classifyGraphQLDocument(query: string): GraphQLClassification {
    let document;
    try {
        document = parse(query);
    } catch {
        return {
            readOnly: false,
            reason: 'unparseable',
        };
    }

    const writeOperations = document.definitions
        .filter((def): def is OperationDefinitionNode => def.kind === 'OperationDefinition')
        .filter((def) => def.operation !== 'query');

    if (writeOperations.length === 0) {
        return { readOnly: true };
    }

    return {
        readOnly: false,
        reason: 'write-operations',
        operations: writeOperations.map((def) =>
            def.name ? `${def.operation} ${def.name.value}` : def.operation
        ),
    };
}

/**
 * Message shown when read-only mode refuses a document. Names the offending
 * operations but never echoes the document itself, which may carry
 * configuration details that do not belong in a tool response or a log line.
 */
export function describeRefusal(classification: GraphQLClassification): string {
    if (classification.readOnly) {
        throw new Error('describeRefusal called for a permitted document');
    }

    if (classification.reason === 'unparseable') {
        return (
            '❌ Query rejected: the GraphQL document could not be parsed, so it cannot be ' +
            'confirmed as read-only. Fix the syntax and retry.'
        );
    }

    return (
        '❌ Write operations are disabled. This server is running in read-only mode and ' +
        `refused the following operation(s): ${classification.operations.join(', ')}. ` +
        'Pass --allow-writes or set WAF_ALLOW_WRITES=true to enable write operations.'
    );
}

/** Thrown when the read-only gate refuses a caller-supplied document. */
export class WriteOperationBlockedError extends Error {
    readonly classification: GraphQLClassification;

    constructor(classification: GraphQLClassification) {
        super(describeRefusal(classification));
        this.name = 'WriteOperationBlockedError';
        this.classification = classification;
    }
}

/**
 * Resolve the write access that applies to a single session.
 *
 * A per-session value may only drop write access, never grant it. In HTTP
 * transport the per-session value comes from a client-supplied header, so
 * without this clamp a client of a server deployed read-only could re-enable
 * writes for itself by sending WAF-ALLOW-WRITES: true.
 */
export function resolveWriteAccess(requested: boolean, processAllowsWrites: boolean): boolean {
    return requested && processAllowsWrites;
}

/**
 * Record a write decision on stderr so blocked and permitted writes are
 * distinguishable in audit logs. Logs operation names only, never the document
 * or its variables.
 */
export function auditWriteDecision(
    outcome: 'blocked' | 'permitted',
    tool: string,
    detail: string
): void {
    console.error(`[waf-write-audit] outcome=${outcome} tool=${tool} ${detail}`);
}
