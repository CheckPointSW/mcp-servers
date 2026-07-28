/**
 * get_objects - Unified WAF object retrieval
 * Retrieves assets, practices, profiles, agents, zones, behaviors, triggers.
 * When relevant, includes consultant suggestions on the user's configuration.
 */

import {
    GET_ASSETS,
    GET_PRACTICES,
    GET_PROFILES,
    GET_AGENTS,
    GET_ZONES,
    GET_BEHAVIORS,
    GET_TRIGGERS,
} from '../graphql/queries.js';
import { withConsultantAdvice, getAvailableTools } from '../middleware/consultant-middleware.js';
import type { Settings } from '../settings.js';

export interface GetObjectsApiManager {
    executeGraphQL<T = Record<string, unknown>>(
        query: string,
        variables?: Record<string, unknown>
    ): Promise<T>;
}

interface ObjectTypeConfig {
    queryName: string;
    graphqlQuery: string;
    variables?: Record<string, unknown>;
    dataPath: string[];
    essentialFields?: string[];
}

/** Include cause and code when present so "fetch failed" shows the real error. */
function formatErrorForTool(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    const parts = [msg];
    if (err instanceof Error && err.cause) {
        const c = err.cause;
        if (c instanceof Error) {
            parts.push(`cause: ${c.message}`);
            if ('code' in c && typeof (c as NodeJS.ErrnoException).code === 'string') {
                parts.push((c as NodeJS.ErrnoException).code!);
            }
        } else {
            parts.push(`cause: ${String(c)}`);
        }
    }
    if (err instanceof Error && 'code' in err && typeof (err as NodeJS.ErrnoException).code === 'string') {
        parts.push((err as NodeJS.ErrnoException).code!);
    }
    return parts.join('; ');
}

const OBJECT_TYPE_CONFIGS: Record<string, ObjectTypeConfig> = {
    assets: {
        queryName: 'getAssets',
        graphqlQuery: GET_ASSETS,
        dataPath: ['getAssets', 'assets'],
        essentialFields: ['id', 'name', 'assetType', 'objectStatus'],
        variables: { globalObject: false },
    },
    practices: {
        queryName: 'getPractices',
        graphqlQuery: GET_PRACTICES,
        dataPath: ['getPractices'],
        essentialFields: ['id', 'name', 'practiceType', 'objectStatus'],
        variables: { includePrivatePractices: true },
    },
    profiles: {
        queryName: 'getProfiles',
        graphqlQuery: GET_PROFILES,
        dataPath: ['getProfiles'],
        essentialFields: ['id', 'name', 'profileType', 'objectStatus'],
    },
    agents: {
        queryName: 'getAgents',
        graphqlQuery: GET_AGENTS,
        dataPath: ['getAgents'],
        essentialFields: ['id', 'name', 'agentType', 'status', 'platform'],
    },
    zones: {
        queryName: 'getZones',
        graphqlQuery: GET_ZONES,
        dataPath: ['getZones', 'zones'],
        essentialFields: ['id', 'name', 'objectStatus'],
    },
    behaviors: {
        queryName: 'getBehaviors',
        graphqlQuery: GET_BEHAVIORS,
        dataPath: ['getBehaviors'],
        essentialFields: ['id', 'name', 'behaviorType', 'visibility', 'objectStatus'],
        variables: { includePrivateBehaviors: true },
    },
    triggers: {
        queryName: 'getTriggers',
        graphqlQuery: GET_TRIGGERS,
        dataPath: ['getTriggers'],
        essentialFields: ['id', 'name', 'triggerType', 'objectStatus'],
    },
};

function detectObjectTypes(
    userIntent: string | undefined,
    explicitType: string | string[] | undefined,
    autoDetect: boolean
): string[] {
    if (explicitType) {
        let types: string[];
        if (Array.isArray(explicitType)) {
            types = explicitType;
        } else if (typeof explicitType === 'string' && explicitType.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(explicitType);
                types = Array.isArray(parsed) ? parsed : [explicitType];
            } catch {
                types = [explicitType];
            }
        } else {
            types = [explicitType];
        }
        return types.map((t) => String(t).toLowerCase().trim());
    }
    if (autoDetect && userIntent) {
        return detectFromIntent(userIntent);
    }
    return [];
}

function detectFromIntent(userIntent: string): string[] {
    const lowerIntent = userIntent.toLowerCase();
    const detectedTypes: string[] = [];
    const keywords: Record<string, string[]> = {
        assets: ['asset', 'application', 'web app', 'webapp', 'web application', 'protected asset', 'url'],
        practices: ['practice', 'security practice', 'protection', 'policy', 'waf practice', 'security policy'],
        profiles: ['profile', 'security profile', 'protection profile', 'waf profile'],
        agents: ['agent', 'deployed agent', 'enforcement agent', 'waf agent', 'deployment'],
        zones: ['zone', 'security zone', 'network zone', 'logical zone'],
        behaviors: ['behavior', 'behaviour', 'security behavior', 'threat behavior'],
        triggers: ['trigger', 'alert', 'notification', 'log trigger', 'report trigger'],
    };
    for (const [type, typeKeywords] of Object.entries(keywords)) {
        if (typeKeywords.some((keyword) => lowerIntent.includes(keyword))) {
            detectedTypes.push(type);
        }
    }
    if (lowerIntent.includes('all') && (lowerIntent.includes('object') || lowerIntent.includes('everything'))) {
        return Object.keys(OBJECT_TYPE_CONFIGS);
    }
    if (detectedTypes.length === 0) {
        const listingKeywords = ['show', 'list', 'get', 'display', 'retrieve', 'fetch'];
        if (listingKeywords.some((kw) => lowerIntent.includes(kw))) {
            if (lowerIntent.includes('protect') || lowerIntent.includes('security')) {
                return ['assets', 'practices'];
            }
        }
    }
    return detectedTypes;
}

async function executeObjectQuery(
    objectType: string,
    apiManager: GetObjectsApiManager,
    filters?: Record<string, unknown>
): Promise<{ success: boolean; objectType: string; data?: unknown[]; error?: string; queryTime?: number }> {
    const config = OBJECT_TYPE_CONFIGS[objectType];
    const startTime = Date.now();
    try {
        const variables = { ...config.variables, ...filters } as Record<string, unknown>;
        const result = (await apiManager.executeGraphQL(config.graphqlQuery, variables)) as Record<string, unknown>;
        const queryTime = Date.now() - startTime;
        let data: unknown = result;
        for (const path of config.dataPath) {
            data = (data as Record<string, unknown>)?.[path];
        }
        const arr = Array.isArray(data) ? data : data ? [data] : [];
        return { success: true, objectType, data: arr, queryTime };
    } catch (err: unknown) {
        return { success: false, objectType, error: formatErrorForTool(err), queryTime: Date.now() - startTime };
    }
}

function formatUnifiedResponse(
    objectTypes: string[],
    queryResults: Array<{ success: boolean; objectType: string; data?: unknown[]; error?: string; queryTime?: number }>,
    startTime: number
): Record<string, unknown> {
    const response: Record<string, unknown> = {
        query_metadata: {
            object_types_requested: objectTypes,
            total_queries: objectTypes.length,
            total_processing_time: Date.now() - startTime,
            timestamp: new Date().toISOString(),
        },
        objects: {},
        summary: {},
    };
    const objects = response.objects as Record<string, unknown>;
    const summary = response.summary as Record<string, unknown>;

    for (let i = 0; i < objectTypes.length; i++) {
        const objectType = objectTypes[i];
        const result = queryResults[i];
        if (result.success) {
            const data = result.data || [];
            objects[objectType] = {
                object_type: objectType,
                count: data.length,
                items: data,
                query_time: result.queryTime,
            };
            const config = OBJECT_TYPE_CONFIGS[objectType];
            const sample =
                config.essentialFields && data.length > 0
                    ? (data as Record<string, unknown>[]).slice(0, 3).map((item) => {
                          const s: Record<string, unknown> = {};
                          config.essentialFields!.forEach((field) => {
                              s[field] = item[field];
                          });
                          return s;
                      })
                    : undefined;
            summary[objectType] = {
                total_count: data.length,
                query_time: result.queryTime,
                status: 'success',
                ...(sample !== undefined && { sample }),
            };
        } else {
            objects[objectType] = { object_type: objectType, error: result.error, query_time: result.queryTime };
            summary[objectType] = { status: 'error', error: result.error, query_time: result.queryTime };
        }
    }

    const totalObjects = Object.values(objects).reduce(
        (sum: number, obj) => sum + (((obj as Record<string, unknown>).count as number) || 0),
        0
    );
    response.overall_summary = {
        total_object_types: objectTypes.length,
        total_objects_retrieved: totalObjects,
        successful_queries: queryResults.filter((r) => r.success).length,
        failed_queries: queryResults.filter((r) => !r.success).length,
    };
    return response;
}

export interface GetObjectsParams {
    object_type?: string | string[];
    user_intent?: string;
    filters?: Record<string, unknown>;
    auto_detect?: boolean;
}

export async function runGetObjects(
    apiManager: GetObjectsApiManager,
    params: GetObjectsParams,
    settings?: Settings
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const objectTypes = detectObjectTypes(
        params.user_intent,
        params.object_type,
        params.auto_detect !== false
    );

    if (objectTypes.length === 0) {
        return {
            content: [
                {
                    type: 'text',
                    text: 'Could not determine object type. Please provide object_type or user_intent. Valid types: assets, practices, profiles, agents, zones, behaviors, triggers.',
                },
            ],
            isError: true,
        };
    }

    const invalidTypes = objectTypes.filter((t) => !OBJECT_TYPE_CONFIGS[t]);
    if (invalidTypes.length > 0) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Invalid object type(s): ${invalidTypes.join(', ')}. Valid: ${Object.keys(OBJECT_TYPE_CONFIGS).join(', ')}`,
                },
            ],
            isError: true,
        };
    }

    const startTime = Date.now();
    const queryResults = await Promise.all(
        objectTypes.map((type) => executeObjectQuery(type, apiManager, params.filters))
    );

    const errors = queryResults.filter((r) => !r.success);
    if (errors.length > 0) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Failed to retrieve ${errors.length} type(s): ${errors.map((e) => e.error).join('; ')}`,
                },
            ],
            isError: true,
        };
    }

    const formatted = formatUnifiedResponse(objectTypes, queryResults, startTime);
    const enhanced = await withConsultantAdvice(
        'get_objects',
        formatted,
        getAvailableTools(),
        params.user_intent ? `User requested: ${params.user_intent}` : undefined,
        settings
    );

    return { content: [{ type: 'text', text: JSON.stringify(enhanced, null, 2) }] };
}
