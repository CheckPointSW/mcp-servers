/**
 * Consultant middleware - automatically calls waf_consultant after tool execution
 * when security concerns are detected, and merges advice into the response.
 */

import { getConsultantAdvice, type ConsultantAdvice, type RunWafConsultantParams } from '../tools/waf-consultant.js';
import type { Settings } from '../settings.js';

export type WithConsultantAdvice<T> = T & { consultant_advice?: ConsultantAdvice };

const DISABLE_ENV = 'DISABLE_AUTO_CONSULTANT';

export interface ConsultationTrigger {
    shouldConsult: boolean;
    reason?: string;
    prompt?: string;
}

export interface AvailableTool {
    name: string;
    description: string;
}

/**
 * Analyze get_objects result to decide if we should call the consultant.
 */
export function analyzeForConsultation(
    toolName: string,
    data: Record<string, unknown>
): ConsultationTrigger {
    if (toolName !== 'get_objects') {
        return { shouldConsult: false };
    }

    const objects = data.objects as Record<string, unknown> | undefined;
    if (!objects) return { shouldConsult: false };

    const assetsObj = objects.assets as { items?: unknown[] } | undefined;
    if (assetsObj?.items && Array.isArray(assetsObj.items)) {
        const items = assetsObj.items as Record<string, unknown>[];
        const unprotectedAssets = items.filter((a) => {
            const practices = a.practices as unknown[] | undefined;
            const profiles = a.profiles as unknown[] | undefined;
            return !practices?.length || !profiles?.length;
        });
        if (unprotectedAssets.length > 0) {
            return {
                shouldConsult: true,
                reason: 'unprotected_assets',
                prompt: `${unprotectedAssets.length} asset(s) may need security practices or profiles attached. Consider using manage_objects to assign practices and profiles.`,
            };
        }
    }

    const overall = data.overall_summary as { total_objects_retrieved?: number } | undefined;
    if (overall?.total_objects_retrieved === 0) {
        return {
            shouldConsult: true,
            reason: 'empty_results',
            prompt: 'No WAF objects were retrieved. Would you like guidance on creating assets, practices, or other objects?',
        };
    }

    if (assetsObj?.items && Array.isArray(assetsObj.items)) {
        const items = assetsObj.items as Record<string, unknown>[];
        const newOrLock = items.filter(
            (a) => a.objectStatus === 'New' || a.objectStatus === 'Lock'
        );
        if (newOrLock.length > 0) {
            return {
                shouldConsult: true,
                reason: 'new_or_lock_objects',
                prompt: `${newOrLock.length} asset(s) have status New or Lock. Review if they need to be configured or published.`,
            };
        }
    }

    return { shouldConsult: false };
}

/**
 * Get the list of available tools for consultant recommendations.
 */
export function getAvailableTools(): AvailableTool[] {
    return [
        { name: 'get_objects', description: 'Retrieve WAF objects (assets, practices, profiles, agents, zones, behaviors, triggers)' },
        { name: 'manage_objects', description: 'Create, update, or delete WAF objects' },
        { name: 'publish_and_enforce', description: 'Publish and deploy configuration changes' },
        { name: 'call_waf_api', description: 'Execute custom GraphQL queries' },
        { name: 'waf_consultant', description: 'Get best-practice recommendations' },
    ];
}

/**
 * Wrap a tool result with consultant advice when applicable.
 * Non-blocking: on consultant failure, returns the original result.
 */
export async function withConsultantAdvice<T extends Record<string, unknown>>(
    toolName: string,
    result: T,
    availableTools: AvailableTool[],
    conversationContext?: string,
    settings?: Settings
): Promise<WithConsultantAdvice<T>> {
    if (process.env[DISABLE_ENV] === 'true' || process.env[DISABLE_ENV] === '1') {
        return result;
    }

    const trigger = analyzeForConsultation(toolName, result);
    if (!trigger.shouldConsult || !trigger.prompt) return result;

    try {
        const params: RunWafConsultantParams = {
            user_prompt: trigger.prompt,
            waf_configuration: result.objects as Record<string, unknown> | undefined,
            available_tools: availableTools,
            conversation_context: conversationContext,
        };
        const advice = await getConsultantAdvice(params, settings);
        return { ...result, consultant_advice: advice };
    } catch {
        return result;
    }
}
