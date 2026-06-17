import { ExternalTokenManager } from '@chkp/quantum-infra';
import { Settings } from './settings.js';
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
 * API manager for CloudGuard WAF.
 * Provides GraphQL API access for WAF operations.
 */
export class CloudGuardWAFAPIManager {
    private readonly wafHost: string;
    private readonly wafEndpoint: string;
    private readonly tokenManager: ExternalTokenManager;

    constructor(private readonly settings: Settings) {
        this.wafHost = settings.getCloudInfraGateway();
        this.wafEndpoint = settings.getWafEndpoint();
        this.tokenManager = new ExternalTokenManager(settings);
    }

    /**
     * Create a new CloudGuardWAFAPIManager instance from settings
     */
    static create(settings: Settings): CloudGuardWAFAPIManager {
        return new CloudGuardWAFAPIManager(settings);
    }

    /**
     * Execute a GraphQL query or mutation
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
     * Legacy callApi method - delegates to executeGraphQL
     */
    async callApi(
        _method: string,
        _uri: string,
        data: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        // If data contains a query, execute it as GraphQL
        if (data.query) {
            return this.executeGraphQL(
                data.query as string,
                (data.variables as Record<string, unknown>) || {}
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
