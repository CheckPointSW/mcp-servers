import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { ASSET_CONFIG_API_BASE } from '../constants.js';
import { parseListParam } from '../schemas.js';
import { enrichAssetsWithTechnologies } from '../helpers/enrichment.js';
import {
    resolveSpecificCustomerId,
    populateCustomers,
    getCustomers,
} from '../session.js';
import type { ServerModule } from './types.js';

export function registerAssetTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    server.registerTool(
        'get_assets',
        {
            description: `Retrieve and explore the organization's digital asset inventory with comprehensive filtering.

WHEN TO USE:
- User wants to see what assets are being monitored
- User asks about specific types of assets (domains, IPs, cloud resources)
- User needs to understand technology stack or attack surface

TECHNOLOGY ENRICHMENT:
- Set fetch_technologies=True to get detailed tech stack for each asset

MULTI-TENANT:
- Requires a specific customer (not ALL). Will prompt if none selected.
- Pass customer_id to override for a single call.`,
            inputSchema: {
                page_number: z
                    .number()
                    .default(1)
                    .describe('Page number for pagination (starts at 1).'),
                asset_type: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe(
                        'Types of assets: "domain", "subdomain", "ip", "url", "s3_bucket", "email", etc.'
                    ),
                status: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe(
                        'Monitoring status. Default: ["monitored_asm_and_ti", "monitored_asm"]'
                    ),
                created_from: z
                    .string()
                    .optional()
                    .describe(
                        'Show assets created after this date (YYYY-MM-DD).'
                    ),
                asset_name: z
                    .string()
                    .optional()
                    .describe('Filter by asset name (partial matching).'),
                discovery_precision: z
                    .number()
                    .default(0)
                    .describe('Minimum discovery confidence (0-100).'),
                fetch_technologies: z
                    .boolean()
                    .default(false)
                    .describe(
                        'Include technology stack with versions, CVE counts, and risk scores.'
                    ),
                customer_id: z
                    .string()
                    .optional()
                    .describe(
                        'One-off customer override. Does not change the active session.'
                    ),
            },
        },
        async (
            {
                page_number = 1,
                asset_type,
                status,
                created_from,
                asset_name,
                discovery_precision = 0,
                fetch_technologies = false,
                customer_id,
            },
            extra
        ) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                if (getCustomers().length === 0) {
                    await populateCustomers(apiManager);
                }

                const resolved = await resolveSpecificCustomerId(
                    apiManager,
                    'Asset inventory',
                    customer_id,
                    server
                );

                const assetTypeList = parseListParam(asset_type);
                const statusList = parseListParam(status);

                const requestPayload: Record<string, unknown> = {
                    customer_id: resolved,
                    page_number,
                    discovery_precision,
                };

                if (assetTypeList) {
                    requestPayload.type = assetTypeList;
                }
                requestPayload.status = statusList || [
                    'monitored_asm_and_ti',
                    'monitored_asm',
                ];
                if (created_from) {
                    requestPayload.created_from = created_from;
                }
                if (asset_name) {
                    requestPayload.asset_name = asset_name;
                }

                const response = await apiManager.post(
                    `${ASSET_CONFIG_API_BASE}/assets/`,
                    requestPayload
                );
                const assetsData = await response.json();

                if (typeof assetsData !== 'object' || assetsData === null) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    error: 'Invalid response format',
                                    raw: assetsData,
                                }),
                            },
                        ],
                    };
                }

                if (
                    fetch_technologies &&
                    assetsData.assets &&
                    Array.isArray(assetsData.assets)
                ) {
                    await enrichAssetsWithTechnologies(
                        assetsData,
                        resolved,
                        apiManager,
                        ASSET_CONFIG_API_BASE
                    );
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(assetsData, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error retrieving assets: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
