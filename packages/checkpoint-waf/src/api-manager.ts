import { ExternalTokenManager } from '@chkp/quantum-infra';
import { Settings } from './settings.js';
import {
    auditWriteDecision,
    classifyGraphQLDocument,
    WriteOperationBlockedError,
} from './graphql-guard.js';
import {
    PUBLISH_CHANGES,
    ENFORCE_POLICY,
    GET_SESSION_STATUS,
} from './graphql/queries.js';

/**
 * GraphQL response structure
 */
interface GraphQLResponse<T = Record<string, unknown>> {
    data?: T;
    errors?: Array<{
        message: string;
        extensions?: Record<string, unknown>;
    }>;
}

/**
 * Publish changes response
 */
interface PublishChangesResponse {
    publishChanges: {
        isValid: boolean;
        errors: Array<{ message: string }>;
        warnings: Array<{ message: string }>;
    };
}

/**
 * Enforce policy response
 */
interface EnforcePolicyResponse {
    enforcePolicy: {
        id: string;
        status: string;
    };
}

/**
 * Session status response
 */
interface SessionStatusResponse {
    sessionStatus: {
        id: string;
        numberOfChanges: number;
        publishState: string;
        sessionDescription: string;
        isOwned: boolean;
        isActive: boolean;
    };
}

/**
 * API manager for Check Point WAF.
 * Provides GraphQL API access for WAF operations.
 */
export class CheckPointWAFAPIManager {
    private readonly wafHost: string;
    private readonly wafEndpoint: string;
    private readonly tokenManager: ExternalTokenManager;

    constructor(private readonly settings: Settings) {
        this.wafHost = settings.getCloudInfraGateway();
        this.wafEndpoint = settings.getWafEndpoint();
        this.tokenManager = new ExternalTokenManager(settings);
    }

    /**
     * Create a new CheckPointWAFAPIManager instance from settings
     */
    static create(settings: Settings): CheckPointWAFAPIManager {
        return new CheckPointWAFAPIManager(settings);
    }

    /**
     * Execute a GraphQL document supplied by the caller.
     *
     * Every path that forwards an arbitrary, caller-controlled document must
     * go through here rather than executeGraphQL, so that adding a new entry
     * point later cannot reintroduce the read-only bypass. executeGraphQL
     * stays unguarded for the server's own fixed queries and mutations, which
     * are gated by tool registration instead.
     */
    async executeUserGraphQL<T = Record<string, unknown>>(
        query: string,
        variables: Record<string, unknown> = {},
        {
            allowWrites,
            auditTool = 'call_waf_api',
        }: { allowWrites: boolean; auditTool?: string }
    ): Promise<T> {
        const classification = classifyGraphQLDocument(query);
        if (!classification.readOnly) {
            const detail =
                classification.reason === 'write-operations'
                    ? `reason=write-operations operations=${classification.operations.join(',')}`
                    : 'reason=unparseable';

            if (!allowWrites) {
                auditWriteDecision('blocked', auditTool, detail);
                throw new WriteOperationBlockedError(classification);
            }

            if (classification.reason === 'write-operations') {
                auditWriteDecision(
                    'permitted',
                    auditTool,
                    `operations=${classification.operations.join(',')}`
                );
            }
        }

        return this.executeGraphQL<T>(query, variables);
    }

    /**
     * Execute a GraphQL query or mutation.
     *
     * Raw transport with no read-only enforcement — for the server's own fixed
     * documents only. Use executeUserGraphQL for caller-supplied documents.
     */
    async executeGraphQL<T = Record<string, unknown>>(
        query: string,
        variables: Record<string, unknown> = {}
    ): Promise<T> {
        const token = await this.tokenManager.getToken();

        const graphqlUrl = `${this.wafHost}${this.wafEndpoint}`;
        const response = await fetch(graphqlUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                query,
                variables,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `GraphQL request failed: ${response.status} ${response.statusText} - ${errorText}`
            );
        }

        const result: GraphQLResponse<T> = await response.json();

        if (result.errors && result.errors.length > 0) {
            const errorMessages = result.errors
                .map((e) => e.message)
                .join('; ');
            throw new Error(`GraphQL errors: ${errorMessages}`);
        }

        if (!result.data) {
            throw new Error('GraphQL response contained no data');
        }

        return result.data;
    }

    /**
     * Legacy callApi method - delegates to executeUserGraphQL
     */
    async callApi(
        _method: string,
        _uri: string,
        data: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        // If data contains a query, execute it as GraphQL. The document is
        // caller-supplied, so it goes through the read-only gate.
        if (data.query) {
            return this.executeUserGraphQL(
                data.query as string,
                (data.variables as Record<string, unknown>) || {},
                { allowWrites: this.settings.allowWrites, auditTool: 'callApi' }
            );
        }

        throw new Error(
            'Use call_waf_api with a GraphQL query, or use publish_and_enforce for deployment operations'
        );
    }

    /**
     * Publish pending configuration changes
     */
    async publishChanges(): Promise<{
        success: boolean;
        isValid: boolean;
        errors: Array<{ message: string }>;
        warnings: Array<{ message: string }>;
    }> {
        const result =
            await this.executeGraphQL<PublishChangesResponse>(PUBLISH_CHANGES);

        const publishResult = result.publishChanges;

        return {
            success: publishResult.isValid,
            isValid: publishResult.isValid,
            errors: publishResult.errors || [],
            warnings: publishResult.warnings || [],
        };
    }

    /**
     * Enforce the published policy
     */
    async enforcePolicy(): Promise<{
        success: boolean;
        id: string;
        status: string;
    }> {
        const result =
            await this.executeGraphQL<EnforcePolicyResponse>(ENFORCE_POLICY);

        const enforceResult = result.enforcePolicy;

        return {
            success: true,
            id: enforceResult.id,
            status: enforceResult.status,
        };
    }

    /**
     * Get the session status including publish state and number of pending changes
     */
    async getSessionStatus(sessionId?: string): Promise<{
        success: boolean;
        id: string;
        numberOfChanges: number;
        publishState: string;
        sessionDescription: string;
        isOwned: boolean;
        isActive: boolean;
    }> {
        const variables = sessionId ? { sessionId } : {};
        const result = await this.executeGraphQL<SessionStatusResponse>(
            GET_SESSION_STATUS,
            variables
        );

        const sessionStatus = result.sessionStatus;

        return {
            success: true,
            id: sessionStatus.id,
            numberOfChanges: sessionStatus.numberOfChanges,
            publishState: sessionStatus.publishState,
            sessionDescription: sessionStatus.sessionDescription,
            isOwned: sessionStatus.isOwned,
            isActive: sessionStatus.isActive,
        };
    }

    /**
     * Publish and enforce changes in a single operation.
     *
     * IMPORTANT: This is a destructive operation that makes permanent changes
     * to the security configuration.
     */
    async publishAndEnforce(): Promise<{
        success: boolean;
        publish: {
            success: boolean;
            isValid: boolean;
            errors: Array<{ message: string }>;
            warnings: Array<{ message: string }>;
        };
        enforce?: {
            success: boolean;
            id: string;
            status: string;
        };
        message: string;
    }> {
        // Step 1: Publish changes
        const publishResult = await this.publishChanges();

        // If publish failed or is invalid, don't proceed with enforcement
        if (!publishResult.isValid) {
            return {
                success: false,
                publish: publishResult,
                message: `Publish failed with ${publishResult.errors.length} error(s). Enforcement was not attempted.`,
            };
        }

        // Step 2: Enforce the policy
        const enforceResult = await this.enforcePolicy();

        return {
            success: true,
            publish: publishResult,
            enforce: enforceResult,
            message:
                'Changes have been published and enforcement has been initiated.',
        };
    }
}
