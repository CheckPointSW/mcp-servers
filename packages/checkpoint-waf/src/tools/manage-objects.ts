/**
 * manage_objects - Unified CRUD for WAF objects
 * Supports: assets, practices, zones, behaviors, profiles, triggers
 */

import {
    CREATE_WEB_APP_ASSET,
    UPDATE_WEB_APP_ASSET,
    CREATE_WEB_API_ASSET,
    UPDATE_WEB_API_ASSET,
    DELETE_ASSET,
    CREATE_PRACTICE,
    UPDATE_PRACTICE,
    CREATE_WEB_API_PRACTICE,
    UPDATE_WEB_API_PRACTICE,
    CREATE_RATE_LIMIT_PRACTICE,
    UPDATE_RATE_LIMIT_PRACTICE,
    CREATE_CACHING_PRACTICE,
    UPDATE_CACHING_PRACTICE,
    DELETE_PRACTICE,
    CREATE_ZONE,
    UPDATE_ZONE,
    DELETE_ZONE,
    CREATE_TRUSTED_SOURCE_BEHAVIOR,
    CREATE_EXCEPTION_BEHAVIOR,
    CREATE_WEB_USER_RESPONSE_BEHAVIOR,
    UPDATE_TRUSTED_SOURCE_BEHAVIOR,
    UPDATE_EXCEPTION_BEHAVIOR,
    UPDATE_WEB_USER_RESPONSE_BEHAVIOR,
    DELETE_BEHAVIOR,
    CREATE_APPSEC_GATEWAY_PROFILE,
    CREATE_EMBEDDED_PROFILE,
    CREATE_DOCKER_PROFILE,
    CREATE_KUBERNETES_PROFILE,
    UPDATE_APPSEC_GATEWAY_PROFILE,
    UPDATE_EMBEDDED_PROFILE,
    UPDATE_DOCKER_PROFILE,
    UPDATE_KUBERNETES_PROFILE,
    CREATE_SDWAN_PROFILE,
    UPDATE_SDWAN_PROFILE,
    CREATE_SDWAN_SETTINGS_PROFILE,
    UPDATE_SDWAN_SETTINGS_PROFILE,
    CREATE_QUANTUM_PROFILE,
    UPDATE_QUANTUM_PROFILE,
    DELETE_PROFILE,
    CREATE_LOG_TRIGGER,
    CREATE_REPORT_TRIGGER,
    UPDATE_LOG_TRIGGER,
    UPDATE_REPORT_TRIGGER,
    DELETE_TRIGGER,
    PRACTICE_USED_BY,
    BEHAVIOR_USED_BY,
    TRIGGER_USED_BY,
    UPDATE_PRACTICE_TRIGGERS,
    GET_APPSEC_GATEWAY_PROFILE_USED_BY,
    GET_EMBEDDED_PROFILE_USED_BY,
    GET_DOCKER_PROFILE_USED_BY,
    GET_KUBERNETES_PROFILE_USED_BY,
} from '../graphql/queries.js';

export interface ManageObjectsApiManager {
    executeGraphQL<T = Record<string, unknown>>(
        query: string,
        variables?: Record<string, unknown>
    ): Promise<T>;
}

export interface ManageObjectsParams {
    object_type: string;
    subtype: string;
    action: 'create' | 'update' | 'delete';
    id?: string;
    practiceId?: string;
    ownerId?: string;
    data?: Record<string, unknown>;
}

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function ok(text: string): ToolResult {
    return { content: [{ type: 'text', text }] };
}

function err(text: string): ToolResult {
    return { content: [{ type: 'text', text }], isError: true };
}

function requireData(params: ManageObjectsParams): ToolResult | null {
    if (!params.data) return err('data is required for create/update.');
    return null;
}

function requireId(params: ManageObjectsParams): ToolResult | null {
    if (!params.id) return err('id is required for update/delete.');
    return null;
}

const POINTED_FROM_ERROR = "can't be deleted since it is pointed from other objects";

interface DisplayObject {
    id: string;
    name: string;
    type: string;
    subType: string;
    objectStatus: string;
}

interface TriggerUsedBy {
    container: string;
    practices: string[];
}

function isPointedFromError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes(POINTED_FROM_ERROR);
}

async function detachFromAssets(
    api: ManageObjectsApiManager,
    refs: DisplayObject[],
    removeField: 'removePractices' | 'removeBehaviors' | 'removeProfiles',
    objectId: string
): Promise<void> {
    for (const ref of refs) {
        if (ref.objectStatus === 'Deleted') continue;
        const sub = ref.subType;
        if (sub === 'WebApplication') {
            await api.executeGraphQL(UPDATE_WEB_APP_ASSET, {
                id: ref.id,
                assetInput: { [removeField]: [objectId] },
            });
        } else if (sub === 'WebAPI') {
            await api.executeGraphQL(UPDATE_WEB_API_ASSET, {
                id: ref.id,
                assetInput: { [removeField]: [objectId] },
            });
        } else if (ref.type.toLowerCase() === 'zone' || sub === 'Generic') {
            await api.executeGraphQL(UPDATE_ZONE, {
                id: ref.id,
                zoneInput: { [removeField]: [objectId] },
            });
        }
    }
}

// ─── Assets ──────────────────────────────────────────────────────────────────

/**
 * Normalizes flat/shorthand asset input into the nested structure the GraphQL schema expects.
 * Handles: practiceId → practices[], profileId → profiles[], triggerId → triggers inside practices.
 */
function normalizeAssetInput(data: Record<string, unknown>): Record<string, unknown> {
    const input = { ...data };

    // Normalize profiles: string or profileId → string[]
    if (typeof input.profileId === 'string') {
        input.profiles = input.profiles ?? [input.profileId];
        delete input.profileId;
    }
    if (typeof input.profiles === 'string') {
        input.profiles = [input.profiles];
    }

    // Collect top-level triggers (to attach to practices)
    let topTriggers: string[] = [];
    if (typeof input.triggerId === 'string') {
        topTriggers.push(input.triggerId);
        delete input.triggerId;
    }
    if (Array.isArray(input.triggers)) {
        topTriggers = topTriggers.concat(input.triggers as string[]);
        delete input.triggers;
    }

    // Normalize practices
    if (typeof input.practiceId === 'string') {
        input.practices = input.practices ?? [{ practiceId: input.practiceId }];
        delete input.practiceId;
    }
    if (Array.isArray(input.practices)) {
        input.practices = (input.practices as unknown[]).map((p) => {
            if (typeof p === 'string') return { practiceId: p };
            return p;
        });
    }

    // Attach top-level triggers into each practice entry
    if (topTriggers.length > 0 && Array.isArray(input.practices)) {
        input.practices = (input.practices as Record<string, unknown>[]).map((p) => {
            if (!p.triggers) return { ...p, triggers: topTriggers };
            return p;
        });
    }

    return input;
}

/**
 * Normalizes asset update input for the GraphQL update schema.
 * The update schema uses addURLs/removeURLs/updateURLs instead of URLs,
 * and addPractices/removePractices instead of practices, etc.
 * This converts a flat "URLs" array into "addURLs" so LLMs can use
 * the intuitive { URLs: ["http://..."] } format.
 */
function normalizeAssetUpdateInput(data: Record<string, unknown>): Record<string, unknown> {
    const input = { ...data };

    // Normalize URLs → addURLs (update schema doesn't accept "URLs" directly)
    if (Array.isArray(input.URLs) && !input.addURLs && !input.updateURLs) {
        input.addURLs = input.URLs;
        delete input.URLs;
    }

    return input;
}

async function handleAsset(
    api: ManageObjectsApiManager,
    params: ManageObjectsParams
): Promise<ToolResult> {
    const { action, subtype } = params;
    const subtypeKey = subtype.toLowerCase();
    const isWebAPI = subtypeKey === 'webapi';

    if (action === 'create') {
        const check = requireData(params);
        if (check) return check;
        const mutation = isWebAPI ? CREATE_WEB_API_ASSET : CREATE_WEB_APP_ASSET;
        const assetInput = normalizeAssetInput(params.data!);
        const result = await api.executeGraphQL(mutation, { assetInput });
        return ok(`Successfully created asset.\n${JSON.stringify(result, null, 2)}`);
    }

    if (action === 'update') {
        const check = requireId(params) ?? requireData(params);
        if (check) return check;
        const mutation = isWebAPI ? UPDATE_WEB_API_ASSET : UPDATE_WEB_APP_ASSET;
        const assetInput = normalizeAssetUpdateInput(params.data!);
        await api.executeGraphQL(mutation, { id: params.id, assetInput });
        return ok(`Successfully updated asset (ID: ${params.id}).`);
    }

    if (action === 'delete') {
        const check = requireId(params);
        if (check) return check;
        await api.executeGraphQL(DELETE_ASSET, { id: params.id });
        return ok(`Successfully deleted asset (ID: ${params.id}).`);
    }

    return err(`Unknown action: ${action}`);
}

// ─── Practices ───────────────────────────────────────────────────────────────

const PRACTICE_CREATE_MUTATIONS: Record<string, string> = {
    webapplication: CREATE_PRACTICE,
    webapi: CREATE_WEB_API_PRACTICE,
    ratelimit: CREATE_RATE_LIMIT_PRACTICE,
    caching: CREATE_CACHING_PRACTICE,
};

const PRACTICE_UPDATE_MUTATIONS: Record<string, string> = {
    webapplication: UPDATE_PRACTICE,
    webapi: UPDATE_WEB_API_PRACTICE,
    ratelimit: UPDATE_RATE_LIMIT_PRACTICE,
    caching: UPDATE_CACHING_PRACTICE,
};

async function handlePractice(
    api: ManageObjectsApiManager,
    params: ManageObjectsParams
): Promise<ToolResult> {
    const { action, subtype } = params;
    const subtypeKey = subtype.toLowerCase();

    if (action === 'create') {
        const createMutation = PRACTICE_CREATE_MUTATIONS[subtypeKey];
        if (!createMutation) {
            return err(
                `Unknown practice subtype: ${subtype}. ` +
                'Valid subtypes: WebApplication, WebAPI, RateLimit, Caching.'
            );
        }
        const check = requireData(params);
        if (check) return check;
        const result = await api.executeGraphQL(createMutation, {
            ownerId: params.ownerId,
            practiceInput: params.data,
        });
        return ok(`Successfully created practice.\n${JSON.stringify(result, null, 2)}`);
    }

    if (action === 'update') {
        const updateMutation = PRACTICE_UPDATE_MUTATIONS[subtypeKey];
        if (!updateMutation) {
            return err(
                `Unknown practice subtype: ${subtype}. ` +
                'Valid subtypes: WebApplication, WebAPI, RateLimit, Caching.'
            );
        }
        const check = requireId(params) ?? requireData(params);
        if (check) return check;
        await api.executeGraphQL(updateMutation, {
            id: params.id,
            practiceInput: params.data,
            ownerId: params.ownerId,
        });
        return ok(`Successfully updated practice (ID: ${params.id}).`);
    }

    if (action === 'delete') {
        const check = requireId(params);
        if (check) return check;
        try {
            await api.executeGraphQL(DELETE_PRACTICE, { id: params.id });
        } catch (e) {
            if (!isPointedFromError(e)) throw e;
            const res = await api.executeGraphQL<{ practiceUsedBy: DisplayObject[] }>(
                PRACTICE_USED_BY, { id: params.id }
            );
            await detachFromAssets(api, res.practiceUsedBy, 'removePractices', params.id!);
            await api.executeGraphQL(DELETE_PRACTICE, { id: params.id });
        }
        return ok(`Successfully deleted practice (ID: ${params.id}).`);
    }

    return err(`Unknown action: ${action}`);
}

// ─── Zones ────────────────────────────────────────────────────────────────────

async function handleZone(
    api: ManageObjectsApiManager,
    params: ManageObjectsParams
): Promise<ToolResult> {
    const { action } = params;

    if (action === 'create') {
        const check = requireData(params);
        if (check) return check;
        const result = await api.executeGraphQL(CREATE_ZONE, { zoneInput: params.data });
        return ok(`Successfully created zone.\n${JSON.stringify(result, null, 2)}`);
    }

    if (action === 'update') {
        const check = requireId(params) ?? requireData(params);
        if (check) return check;
        await api.executeGraphQL(UPDATE_ZONE, { id: params.id, zoneInput: params.data });
        return ok(`Successfully updated zone (ID: ${params.id}).`);
    }

    if (action === 'delete') {
        const check = requireId(params);
        if (check) return check;
        await api.executeGraphQL(DELETE_ZONE, { id: params.id });
        return ok(`Successfully deleted zone (ID: ${params.id}).`);
    }

    return err(`Unknown action: ${action}`);
}

// ─── Behaviors ───────────────────────────────────────────────────────────────

const BEHAVIOR_CREATE_MUTATIONS: Record<string, string> = {
    trustedsource: CREATE_TRUSTED_SOURCE_BEHAVIOR,
    exception: CREATE_EXCEPTION_BEHAVIOR,
    webuserresponse: CREATE_WEB_USER_RESPONSE_BEHAVIOR,
};

const BEHAVIOR_UPDATE_MUTATIONS: Record<string, string> = {
    trustedsource: UPDATE_TRUSTED_SOURCE_BEHAVIOR,
    exception: UPDATE_EXCEPTION_BEHAVIOR,
    webuserresponse: UPDATE_WEB_USER_RESPONSE_BEHAVIOR,
};

/**
 * Normalizes TrustedSource behavior update input.
 * The update schema uses addSourcesIdentifiers/removeSourcesIdentifiers
 * instead of sourcesIdentifiers. This converts the intuitive
 * { sourcesIdentifiers: [...] } format to { addSourcesIdentifiers: [...] }.
 */
function normalizeTrustedSourceUpdateInput(data: Record<string, unknown>): Record<string, unknown> {
    const input = { ...data };
    if (Array.isArray(input.sourcesIdentifiers) && !input.addSourcesIdentifiers && !input.removeSourcesIdentifiers && !input.updateSourcesIdentifiers) {
        input.addSourcesIdentifiers = input.sourcesIdentifiers;
        delete input.sourcesIdentifiers;
    }
    return input;
}

async function handleBehavior(
    api: ManageObjectsApiManager,
    params: ManageObjectsParams
): Promise<ToolResult> {
    const { action, subtype } = params;
    const subtypeKey = subtype.toLowerCase();

    if (action === 'create') {
        const mutation = BEHAVIOR_CREATE_MUTATIONS[subtypeKey];
        if (!mutation) {
            return err(
                `Unknown behavior subtype: ${subtype}. ` +
                'Valid subtypes: TrustedSource, Exception, WebUserResponse.'
            );
        }
        const check = requireData(params);
        if (check) return check;
        const result = await api.executeGraphQL(mutation, {
            ownerId: params.ownerId,
            practiceId: params.practiceId,
            behaviorInput: params.data,
        });
        return ok(`Successfully created ${subtype} behavior.\n${JSON.stringify(result, null, 2)}`);
    }

    if (action === 'update') {
        const updateMutation = BEHAVIOR_UPDATE_MUTATIONS[subtypeKey];
        if (!updateMutation) {
            return err(
                `Unknown behavior subtype: ${subtype}. ` +
                'Valid subtypes: TrustedSource, Exception, WebUserResponse.'
            );
        }
        const check = requireId(params) ?? requireData(params);
        if (check) return check;
        const behaviorInput = subtypeKey === 'trustedsource'
            ? normalizeTrustedSourceUpdateInput(params.data!)
            : params.data;
        await api.executeGraphQL(updateMutation, {
            id: params.id,
            behaviorInput,
        });
        return ok(`Successfully updated ${subtype} behavior (ID: ${params.id}).`);
    }

    if (action === 'delete') {
        const check = requireId(params);
        if (check) return check;
        try {
            await api.executeGraphQL(DELETE_BEHAVIOR, { id: params.id });
        } catch (e) {
            if (!isPointedFromError(e)) {
                // Detect local behavior "does not exist" error and provide helpful guidance
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('does not exist')) {
                    return err(
                        `${msg}\n\nNote: Local behaviors (created with ownerId) cannot be independently deleted via deleteBehavior. ` +
                        `They are automatically cascade-deleted when the owning asset is deleted. ` +
                        `To remove this behavior, delete the owning asset instead.`
                    );
                }
                throw e;
            }
            const res = await api.executeGraphQL<{ behaviorUsedBy: DisplayObject[] }>(
                BEHAVIOR_USED_BY, { id: params.id }
            );
            await detachFromAssets(api, res.behaviorUsedBy, 'removeBehaviors', params.id!);
            await api.executeGraphQL(DELETE_BEHAVIOR, { id: params.id });
        }
        return ok(`Successfully deleted ${subtype} behavior (ID: ${params.id}).`);
    }

    return err(`Unknown action: ${action}`);
}

// ─── Profiles ────────────────────────────────────────────────────────────────

async function handleProfile(
    api: ManageObjectsApiManager,
    params: ManageObjectsParams
): Promise<ToolResult> {
    const { action, subtype } = params;
    const subtypeKey = subtype.toLowerCase();

    if (action === 'create') {
        const check = requireData(params);
        if (check) return check;

        if (subtypeKey === 'appsecgateway' || subtypeKey === 'appsec' || subtypeKey === 'appsecsaas' || subtypeKey === 'gateway') {
            const result = await api.executeGraphQL(CREATE_APPSEC_GATEWAY_PROFILE, {
                profileInput: params.data,
            });
            return ok(`Successfully created AppSec Gateway profile.\n${JSON.stringify(result, null, 2)}`);
        }

        if (subtypeKey === 'embedded') {
            const result = await api.executeGraphQL(CREATE_EMBEDDED_PROFILE, {
                profileInput: params.data,
            });
            return ok(`Successfully created Embedded profile.\n${JSON.stringify(result, null, 2)}`);
        }

        if (subtypeKey === 'docker') {
            const result = await api.executeGraphQL(CREATE_DOCKER_PROFILE, {
                profileInput: params.data,
            });
            return ok(`Successfully created Docker profile.\n${JSON.stringify(result, null, 2)}`);
        }

        if (subtypeKey === 'kubernetes' || subtypeKey === 'k8s') {
            const result = await api.executeGraphQL(CREATE_KUBERNETES_PROFILE, {
                profileInput: params.data,
            });
            return ok(`Successfully created Kubernetes profile.\n${JSON.stringify(result, null, 2)}`);
        }

        if (subtypeKey === 'sdwan') {
            const result = await api.executeGraphQL(CREATE_SDWAN_PROFILE, { input: params.data });
            return ok(`Successfully created SdWan profile.\n${JSON.stringify(result, null, 2)}`);
        }

        if (subtypeKey === 'sdwansettings') {
            const result = await api.executeGraphQL(CREATE_SDWAN_SETTINGS_PROFILE, { input: params.data });
            return ok(`Successfully created SdWanSettings profile.\n${JSON.stringify(result, null, 2)}`);
        }

        if (subtypeKey === 'quantum') {
            const result = await api.executeGraphQL(CREATE_QUANTUM_PROFILE, { input: params.data });
            return ok(`Successfully created Quantum profile.\n${JSON.stringify(result, null, 2)}`);
        }

        return err(
            `Unknown profile subtype: ${subtype}. ` +
            'Valid subtypes: AppSecGateway (or AppSec), Embedded, Docker, Kubernetes (or K8s), SdWan, SdWanSettings, Quantum.'
        );
    }

    if (action === 'update') {
        const check = requireId(params) ?? requireData(params);
        if (check) return check;

        if (subtypeKey === 'appsecgateway' || subtypeKey === 'appsec' || subtypeKey === 'appsecsaas' || subtypeKey === 'gateway') {
            await api.executeGraphQL(UPDATE_APPSEC_GATEWAY_PROFILE, { id: params.id, profileInput: params.data });
            return ok(`Successfully updated AppSec Gateway profile (ID: ${params.id}).`);
        }
        if (subtypeKey === 'embedded') {
            await api.executeGraphQL(UPDATE_EMBEDDED_PROFILE, { id: params.id, profileInput: params.data });
            return ok(`Successfully updated Embedded profile (ID: ${params.id}).`);
        }
        if (subtypeKey === 'docker') {
            await api.executeGraphQL(UPDATE_DOCKER_PROFILE, { id: params.id, profileInput: params.data });
            return ok(`Successfully updated Docker profile (ID: ${params.id}).`);
        }
        if (subtypeKey === 'kubernetes' || subtypeKey === 'k8s') {
            await api.executeGraphQL(UPDATE_KUBERNETES_PROFILE, { id: params.id, profileInput: params.data });
            return ok(`Successfully updated Kubernetes profile (ID: ${params.id}).`);
        }
        if (subtypeKey === 'sdwan') {
            await api.executeGraphQL(UPDATE_SDWAN_PROFILE, { id: params.id, input: params.data });
            return ok(`Successfully updated SdWan profile (ID: ${params.id}).`);
        }
        if (subtypeKey === 'sdwansettings') {
            await api.executeGraphQL(UPDATE_SDWAN_SETTINGS_PROFILE, { id: params.id, input: params.data });
            return ok(`Successfully updated SdWanSettings profile (ID: ${params.id}).`);
        }
        if (subtypeKey === 'quantum') {
            await api.executeGraphQL(UPDATE_QUANTUM_PROFILE, { id: params.id, input: params.data });
            return ok(`Successfully updated Quantum profile (ID: ${params.id}).`);
        }

        return err(
            `Unknown profile subtype: ${subtype}. ` +
            'Valid subtypes: AppSecGateway (or AppSec), Embedded, Docker, Kubernetes (or K8s), SdWan, SdWanSettings, Quantum.'
        );
    }

    if (action === 'delete') {
        const check = requireId(params);
        if (check) return check;
        try {
            await api.executeGraphQL(DELETE_PROFILE, { id: params.id });
        } catch (e) {
            if (!isPointedFromError(e)) throw e;
            const profileUsedByQueries: Record<string, string> = {
                appsecgateway: GET_APPSEC_GATEWAY_PROFILE_USED_BY,
                appsec: GET_APPSEC_GATEWAY_PROFILE_USED_BY,
                appsecsaas: GET_APPSEC_GATEWAY_PROFILE_USED_BY,
                gateway: GET_APPSEC_GATEWAY_PROFILE_USED_BY,
                embedded: GET_EMBEDDED_PROFILE_USED_BY,
                docker: GET_DOCKER_PROFILE_USED_BY,
                kubernetes: GET_KUBERNETES_PROFILE_USED_BY,
                k8s: GET_KUBERNETES_PROFILE_USED_BY,
            };
            const usedByQuery = profileUsedByQueries[subtypeKey];
            if (!usedByQuery) throw e;
            const res = await api.executeGraphQL<Record<string, { usedBy: DisplayObject[] }>>(
                usedByQuery, { id: params.id }
            );
            const profileData = Object.values(res)[0];
            if (profileData?.usedBy) {
                await detachFromAssets(api, profileData.usedBy, 'removeProfiles', params.id!);
            }
            await api.executeGraphQL(DELETE_PROFILE, { id: params.id });
        }
        return ok(`Successfully deleted ${subtype} profile (ID: ${params.id}).`);
    }

    return err(`Unknown action: ${action}`);
}

// ─── Triggers ────────────────────────────────────────────────────────────────

async function handleTrigger(
    api: ManageObjectsApiManager,
    params: ManageObjectsParams
): Promise<ToolResult> {
    const { action, subtype } = params;
    const subtypeKey = subtype.toLowerCase();

    if (action === 'create') {
        const check = requireData(params);
        if (check) return check;

        if (subtypeKey === 'log' || subtypeKey === 'logtrigger') {
            const result = await api.executeGraphQL(CREATE_LOG_TRIGGER, {
                triggerInput: params.data,
            });
            return ok(`Successfully created Log trigger.\n${JSON.stringify(result, null, 2)}`);
        }

        if (subtypeKey === 'report' || subtypeKey === 'reporttrigger') {
            const result = await api.executeGraphQL(CREATE_REPORT_TRIGGER, {
                triggerInput: params.data,
            });
            return ok(`Successfully created Report trigger.\n${JSON.stringify(result, null, 2)}`);
        }

        return err(
            `Unknown trigger subtype: ${subtype}. ` +
            'Valid subtypes: Log, Report.'
        );
    }

    if (action === 'update') {
        const check = requireId(params) ?? requireData(params);
        if (check) return check;

        if (subtypeKey === 'log' || subtypeKey === 'logtrigger') {
            await api.executeGraphQL(UPDATE_LOG_TRIGGER, { id: params.id, triggerInput: params.data });
            return ok(`Successfully updated Log trigger (ID: ${params.id}).`);
        }

        if (subtypeKey === 'report' || subtypeKey === 'reporttrigger') {
            await api.executeGraphQL(UPDATE_REPORT_TRIGGER, { id: params.id, triggerInput: params.data });
            return ok(`Successfully updated Report trigger (ID: ${params.id}).`);
        }

        return err(
            `Unknown trigger subtype: ${subtype}. ` +
            'Valid subtypes: Log, Report.'
        );
    }

    if (action === 'delete') {
        const check = requireId(params);
        if (check) return check;
        try {
            await api.executeGraphQL(DELETE_TRIGGER, { id: params.id });
        } catch (e) {
            if (!isPointedFromError(e)) throw e;
            const res = await api.executeGraphQL<{ triggerUsedBy: TriggerUsedBy[] }>(
                TRIGGER_USED_BY, { id: params.id }
            );
            for (const entry of res.triggerUsedBy) {
                for (const practiceId of entry.practices) {
                    await api.executeGraphQL(UPDATE_PRACTICE_TRIGGERS, {
                        addTriggers: [],
                        removeTriggers: [params.id],
                        practiceId,
                        containerId: entry.container,
                    });
                }
            }
            await api.executeGraphQL(DELETE_TRIGGER, { id: params.id });
        }
        return ok(`Successfully deleted ${subtype} trigger (ID: ${params.id}).`);
    }

    return err(`Unknown action: ${action}`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runManageObjects(
    apiManager: ManageObjectsApiManager,
    params: ManageObjectsParams
): Promise<ToolResult> {
    const { object_type, subtype, action } = params;

    if (!object_type || !subtype || !action) {
        return err(
            'object_type, subtype, and action are required. ' +
            'Valid object_type: assets, practices, zones, behaviors, profiles, triggers.'
        );
    }

    try {
        switch (object_type) {
            case 'assets':    return await handleAsset(apiManager, params);
            case 'practices': return await handlePractice(apiManager, params);
            case 'zones':     return await handleZone(apiManager, params);
            case 'behaviors': return await handleBehavior(apiManager, params);
            case 'profiles':  return await handleProfile(apiManager, params);
            case 'triggers':  return await handleTrigger(apiManager, params);
            default:
                return err(
                    `Unknown object_type: ${object_type}. ` +
                    'Valid values: assets, practices, zones, behaviors, profiles, triggers.'
                );
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err(`${action} ${object_type} failed: ${msg}`);
    }
}
