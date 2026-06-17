#!/usr/bin/env node

import { z } from 'zod';
import { createMcpServer, launchMCPServer, createServerModule, SessionContext } from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CloudGuardWAFAPIManager } from './api-manager.js';
import { Settings } from './settings.js';
import { runGetObjects } from './tools/get-objects.js';
import { runManageObjects } from './tools/manage-objects.js';
import { runWafConsultant } from './tools/waf-consultant.js';

const { server, pkg } = createMcpServer(import.meta.url, {
    description: 'CloudGuard WAF MCP server for Check Point WAF management',
});

// Read-only is the default; pass --allow-writes or WAF_ALLOW_WRITES=true to register write tools and enable mutations
const readOnlyMode = !process.argv.includes('--allow-writes') && process.env.WAF_ALLOW_WRITES !== 'true' && process.env.WAF_ALLOW_WRITES !== '1' && process.env.WAF_ALLOW_WRITES !== 'yes';

// Create a multi-user server module
const serverModule = createServerModule(
    server,
    Settings,
    pkg,
    CloudGuardWAFAPIManager
);

// Tool to execute GraphQL queries against CloudGuard WAF API
server.tool(
    'call_waf_api',
    `Execute a GraphQL query or mutation against the CloudGuard WAF API. 

Use this for any WAF operations like querying assets, practices, profiles, zones, etc.

Example queries:
- Get assets: { getAssets { status assets { id name assetType } } }
- Get practices: { getPractices { id name practiceType } }
- Get profiles: { getProfiles { id name profileType } }`,
    {
        query: z
            .string()
            .describe(
                'The GraphQL query or mutation to execute (e.g., "{ getAssets { status assets { id name } } }")'
            ),
        variables: z
            .record(z.any())
            .optional()
            .describe('Optional variables for the GraphQL query'),
    },
    async (
        { query, variables }: { query: string; variables?: Record<string, unknown> },
        extra: { sessionId?: string }
    ) => {
        try {
            // Block mutations unless write operations are enabled (per-session check covers HTTP transport)
            const settings = SessionContext.getSettings(serverModule, extra) as Settings;
            if (!settings.allowWrites && query.trim().toLowerCase().startsWith('mutation')) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: '❌ Write operations are disabled. GraphQL mutations are not allowed in read-only mode. Pass --allow-writes or set WAF_ALLOW_WRITES=true to enable mutations.',
                        },
                    ],
                    isError: true,
                };
            }

            const apiManager = SessionContext.getAPIManager(
                serverModule,
                extra
            );

            const result = await apiManager.executeGraphQL(
                query,
                variables || {}
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: `GraphQL Response:\n${JSON.stringify(result, null, 2)}`,
                    },
                ],
            };
        } catch (error) {
            console.error('GraphQL API error:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `GraphQL Error: ${(error as Error).message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// Tool to get enforcement status
server.tool(
    'get_enforcement_status',
    'Get the current session status including the publish state and number of pending changes. Returns information about the active configuration session.',
    {
        sessionId: z
            .string()
            .optional()
            .describe('Optional session ID. If not provided, returns the current active session status.'),
    },
    async (
        { sessionId }: { sessionId?: string },
        extra: { sessionId?: string }
    ) => {
        try {
            const apiManager = SessionContext.getAPIManager(
                serverModule,
                extra
            );

            const result = await apiManager.getSessionStatus(sessionId);

            // Format the response
            let responseText = `📊 Session Status\n${'='.repeat(40)}\n\n`;
            responseText += `Session ID: ${result.id}\n`;
            responseText += `Publish State: ${result.publishState}\n`;
            responseText += `Pending Changes: ${result.numberOfChanges}\n`;
            responseText += `Description: ${result.sessionDescription || 'N/A'}\n`;
            responseText += `Is Owned: ${result.isOwned ? 'Yes' : 'No'}\n`;
            responseText += `Is Active: ${result.isActive ? 'Yes' : 'No'}\n`;

            return {
                content: [
                    {
                        type: 'text',
                        text: responseText,
                    },
                ],
            };
        } catch (error) {
            console.error('Get enforcement status error:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `❌ Get Enforcement Status Error: ${(error as Error).message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// Tool to publish and enforce changes (write operation - disabled in read-only mode)
if (!readOnlyMode) {
server.tool(
    'publish_and_enforce',
    'CRITICAL: Publish and enforce pending changes. This is a MUTATING operation that makes permanent changes to the security configuration. REQUIRES EXPLICIT USER APPROVAL. Never call this tool automatically - the user must explicitly request to publish and enforce changes. Use only when the user explicitly asks to "publish", "deploy", "activate", or "enforce" changes.',
    {
        confirmPublishAndEnforce: z
            .boolean()
            .describe(
                'Must be true to proceed. Acknowledges that this will publish and enforce changes, making permanent modifications to the security configuration.'
            ),
    },
    { destructiveHint: true },
    async (
        { confirmPublishAndEnforce }: { confirmPublishAndEnforce: boolean },
        extra: { sessionId?: string }
    ) => {
        // Require explicit confirmation to prevent accidental publishing
        if (!confirmPublishAndEnforce) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `This tool requires explicit confirmation (confirmPublishAndEnforce: true) because it publishes and enforces changes, making permanent modifications to the security configuration. This tool should ONLY be called when the user explicitly requests to publish and enforce changes.`,
                    },
                ],
                isError: true,
            };
        }

        try {
            const apiManager = SessionContext.getAPIManager(
                serverModule,
                extra
            );

            const result = await apiManager.publishAndEnforce();

            // Format the response
            let responseText = `📋 Publish and Enforce Result\n${'='.repeat(40)}\n\n`;

            // Publish status
            responseText += `📤 Publish Status:\n`;
            responseText += `   Valid: ${result.publish.isValid ? '✅ Yes' : '❌ No'}\n`;

            if (result.publish.errors.length > 0) {
                responseText += `   Errors:\n`;
                result.publish.errors.forEach(
                    (err: { message: string }, i: number) => {
                        responseText += `      ${i + 1}. ${err.message}\n`;
                    }
                );
            }

            if (result.publish.warnings.length > 0) {
                responseText += `   Warnings:\n`;
                result.publish.warnings.forEach(
                    (warn: { message: string }, i: number) => {
                        responseText += `      ${i + 1}. ${warn.message}\n`;
                    }
                );
            }

            // Enforce status (only if publish was successful)
            if (result.enforce) {
                responseText += `\n🚀 Enforce Status:\n`;
                responseText += `   Job ID: ${result.enforce.id}\n`;
                responseText += `   Status: ${result.enforce.status}\n`;
            }

            // Overall result
            responseText += `\n${'='.repeat(40)}\n`;
            responseText += `Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}\n`;
            responseText += `Message: ${result.message}\n`;

            if (result.success) {
                responseText += `\n⚠️ WARNING: Changes have been published and enforcement has been initiated. This is a permanent modification to the security configuration.`;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: responseText,
                    },
                ],
            };
        } catch (error) {
            console.error('Publish and enforce error:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `❌ Publish and Enforce Error: ${(error as Error).message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);
} // end read-only gate for publish_and_enforce

// get_objects - unified WAF object retrieval
server.tool(
    'get_objects',
    'Unified tool to retrieve WAF objects (assets, practices, profiles, agents, zones, behaviors, triggers). Automatically detects object type from user intent or uses explicit object_type. Supports multiple object types in a single query. When relevant, includes consultant suggestions on your configuration (e.g. assets without practices).',
    {
        object_type: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe(
                'Type(s) to retrieve: "assets", "practices", "profiles", "agents", "zones", "behaviors", "triggers". Single type or JSON array of types.'
            ),
        user_intent: z
            .string()
            .optional()
            .describe(
                'Natural language description of what objects you need (e.g., "show me all my assets", "list security practices").'
            ),
        filters: z.record(z.any()).optional().describe('Optional filters: matchSearch, sortBy, practiceType, etc.'),
        auto_detect: z.boolean().optional().describe('Enable auto-detection from user_intent (default: true).'),
    },
    async (params, extra: { sessionId?: string }) => {
        const apiManager = SessionContext.getAPIManager(serverModule, extra);
        const settings = SessionContext.getSettings(serverModule, extra);
        return runGetObjects(apiManager, params, settings);
    }
);

// manage_objects - unified CRUD for WAF objects (write operation - disabled in read-only mode)
if (!readOnlyMode) {
server.tool(
    'manage_objects',
    `Unified tool for create, update, and delete operations on WAF objects.

**Subtypes by object_type:**
- assets: WebApplication, WebAPI
- practices: WebApplication, WebAPI, RateLimit, Caching
- profiles: AppSecGateway, Embedded, Docker, Kubernetes, SdWan, SdWanSettings, Quantum. ALL profiles require profileSubType in data (valid values: AppSec, AccessControl, Aws, Azure, VMware, HyperV, Kong, Istio, APISIX, Nginx, NginxProxyManager, SWAGDocker, Envoy)
- behaviors: TrustedSource, Exception, WebUserResponse
- triggers: Log, Report
- zones: Generic

**Visibility (practices & behaviors):**
- Local (default): owned by an asset. Requires ownerId = asset ID.
- Shared: standalone, reusable across assets. Set visibility: "Shared" in data, no ownerId needed.

**Key constraints:**
- TrustedSource behavior: numOfSources (Int) must match sourcesIdentifiers count; sourcesIdentifiers are plain strings like "SourceIP"
- Exception behavior with Local visibility needs ownerId. Do NOT pass practiceId for Exception (causes error)
- WebUserResponse behavior with Local visibility needs ownerId AND practiceId
- Only ONE practice per type per asset is allowed
- Only ONE WebUserResponse behavior per asset+practice connection is allowed
- Local behaviors (with ownerId) cascade-delete when the owning asset is deleted and cannot be independently deleted via deleteBehavior`,
    {
        object_type: z.enum(['assets', 'practices', 'behaviors', 'profiles', 'triggers', 'zones']),
        subtype: z.string().describe(
            'Object subtype. Assets: WebApplication|WebAPI. Practices: WebApplication|WebAPI|RateLimit|Caching. ' +
            'Profiles: AppSecGateway|Embedded|Docker|Kubernetes|SdWan|SdWanSettings|Quantum. Behaviors: TrustedSource|Exception|WebUserResponse. ' +
            'Triggers: Log|Report. Zones: Generic.'
        ),
        action: z.enum(['create', 'update', 'delete']),
        id: z.string().optional().describe('Required for update/delete.'),
        practiceId: z.string().optional().describe('Practice ID for connecting behaviors/triggers to a practice. Required for WebUserResponse and TrustedSource behaviors. Do NOT pass for Exception behaviors (causes error). Optional for triggers.'),
        ownerId: z.string().optional().describe('Asset ID that owns the object. Required for Local visibility practices and behaviors. Local behaviors (with ownerId) cascade-delete when the owning asset is deleted and cannot be independently deleted via deleteBehavior.'),
        data: z.record(z.any()).optional().describe('Object-specific data for create/update.'),
    },
    async (params, extra: { sessionId?: string }) => {
        const apiManager = SessionContext.getAPIManager(serverModule, extra);
        return runManageObjects(apiManager, params);
    }
);
} // end read-only gate for manage_objects

// waf_consultant - best-practice recommendations
server.tool(
    'waf_consultant',
    'CloudGuard WAF consultant. Provides best-practice recommendations and guidance based on WAF configuration. Uses official CloudGuard WAF documentation to explain settings and suggest next actions or tools.',
    {
        user_prompt: z.string().describe("The user's request or question."),
        waf_configuration: z.record(z.any()).optional().describe("The user's WAF configuration or relevant subset."),
        agent_uncertainty: z.string().optional().describe('What the agent is unsure about.'),
        available_tools: z
            .array(z.object({ name: z.string(), description: z.string() }))
            .describe('List of available tools that can be recommended.'),
        conversation_context: z.string().optional().describe('Short summary of prior conversation.'),
    },
    async (params, extra: { sessionId?: string }) => {
        const settings = SessionContext.getSettings(serverModule, extra);
        return runWafConsultant(params, settings);
    }
);

export { server };

const main = async () => {
    await launchMCPServer(
        join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
        serverModule
    );
};

main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
});
