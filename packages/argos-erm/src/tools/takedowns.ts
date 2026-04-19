import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { TAKEDOWN_API_BASE } from '../constants.js';
import { parseListParam } from '../schemas.js';
import {
    resolveSpecificCustomerId,
    populateCustomers,
    getCustomers,
} from '../session.js';
import type { ServerModule } from './types.js';

export function registerTakedownTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore TS2589 — MCP SDK Zod3/4 compat causes deep type instantiation
    server.registerTool(
        'get_takedown_requests',
        {
            description: `Retrieve active takedown requests for the customer.

WHEN TO USE:
- User asks about takedowns, phishing site removals, or brand abuse takedowns
- User wants to see the status of takedown requests
- User needs to filter takedowns by status or reason

MULTI-TENANT:
- Requires a specific customer (not ALL). Will prompt if none selected.
- Pass customer_id to override for a single call without changing the session.

RETURNS:
- List of takedown requests with id, reason, url, status, brand, alert_ref_id,
  hosting_providers, created_date, last_status_change_date.`,
            inputSchema: {
                statuses: z
                    .string()
                    .optional()
                    .describe(
                        'Filter by status. Single value or JSON array string: ' +
                            "'pending', 'request_sent', 'success', 'cancelled', " +
                            "'duplicate', 'false_positive', 'demo', 'failed', 'expired', " +
                            "'rejected', 'rejected_by_hoster', 'pending_configuration', " +
                            "'pending_approval', 'pending_details'."
                    ),
                reasons: z
                    .string()
                    .optional()
                    .describe(
                        'Filter by reason. Single value or JSON array string: ' +
                            "'phishing', 'brand_abuse', 'impersonating_application', " +
                            "'unofficial_application_distribution', 'malicious_content', " +
                            "'social_media_impersonation', 'social_media_employee_impersonation', " +
                            "'fake_job_post', 'sensitive_file_on_antivirus_repository', " +
                            "'instant_messaging_impersonation', 'other'."
                    ),
                from_created_date: z
                    .string()
                    .optional()
                    .describe(
                        'Filter takedowns created after this date (format: YYYY-MM-DD).'
                    ),
                to_created_date: z
                    .string()
                    .optional()
                    .describe(
                        'Filter takedowns created before this date (format: YYYY-MM-DD).'
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
                statuses,
                reasons,
                from_created_date,
                to_created_date,
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
                    'Takedown requests',
                    customer_id,
                    server
                );

                const filters: Record<string, unknown> = {};

                const statusList = parseListParam(statuses);
                if (statusList) filters.status = statusList;

                const reasonList = parseListParam(reasons);
                if (reasonList) filters.reason = reasonList;

                if (from_created_date || to_created_date) {
                    const dateFilter: Record<string, string> = {};
                    if (from_created_date) dateFilter.from = from_created_date;
                    if (to_created_date) dateFilter.to = to_created_date;
                    filters.created_date = dateFilter;
                }

                const payload: Record<string, unknown> = {
                    customer_id: resolved,
                    filters,
                };

                const response = await apiManager.post(
                    `${TAKEDOWN_API_BASE}/request`,
                    payload
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
                            text: `Error retrieving takedown requests: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
