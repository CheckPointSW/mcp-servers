import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { ALERT_API_BASE } from '../constants.js';
import {
    resolveSpecificCustomerId,
    populateCustomers,
    getCustomers,
} from '../session.js';
import type { ServerModule } from './types.js';

export function registerAnalyticsTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    server.registerTool(
        'get_security_analytics',
        {
            description: `Get comprehensive security posture analytics and risk assessment overview.

WHEN TO USE:
- User wants overall security health summary
- User asks for risk assessment or security metrics
- User needs high-level security overview for reporting

MULTI-TENANT:
- Requires a specific customer (not ALL). Will prompt if none selected.
- Pass customer_id to override for a single call.`,
            inputSchema: {
                customer_id: z
                    .string()
                    .optional()
                    .describe(
                        'One-off customer override. Does not change the active session.'
                    ),
            },
        },
        async ({ customer_id }, extra) => {
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
                    'Security analytics',
                    customer_id,
                    server
                );

                const response = await apiManager.get(
                    `${ALERT_API_BASE}/analytics/${resolved}/risks/current`
                );
                const data = await response.json();

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(data, null, 2),
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
                            text: `Error retrieving security analytics: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
