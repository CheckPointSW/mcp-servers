import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { CVE_INTEL_API_BASE } from '../constants.js';
import { parseListParam } from '../schemas.js';
import type { ServerModule } from './types.js';

export function registerVulnerabilityTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    server.registerTool(
        'get_vulnerability_details',
        {
            description: `Get comprehensive details about a specific CVE including exploitability and organizational exposure.

WHEN TO USE:
- User mentions a specific CVE ID and wants detailed information
- User needs CVSS scores, descriptions, and impact assessment`,
            inputSchema: {
                cve_id: z
                    .string()
                    .describe(
                        'The CVE identifier to lookup (e.g., "CVE-2021-44228").'
                    ),
            },
        },
        async ({ cve_id }, extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const response = await apiManager.get(
                    `${CVE_INTEL_API_BASE}/vulnerability/${cve_id}`
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
                            text: `Error retrieving vulnerability details: ${msg}`,
                        },
                    ],
                };
            }
        }
    );

    server.registerTool(
        'search_vulnerabilities_by_technology',
        {
            description: `Search for vulnerabilities affecting specific technology products and versions.

WHEN TO USE:
- User asks about vulnerabilities in specific software
- User wants to assess risk for particular technology versions`,
            inputSchema: {
                technology_name: z
                    .string()
                    .describe(
                        'Software product name (e.g., "Apache HTTP Server", "MySQL").'
                    ),
                technology_versions: z
                    .union([z.string(), z.array(z.string())])
                    .describe('Version(s) to search.'),
                cvss_min: z
                    .union([z.number(), z.string()])
                    .optional()
                    .describe('Minimum CVSS score threshold (0.0-10.0).'),
                modified_days_back: z
                    .number()
                    .default(365)
                    .describe(
                        'Search CVEs modified in the last N days (default: 365).'
                    ),
                page_size: z
                    .number()
                    .default(50)
                    .describe('Results per page (default: 50).'),
                page_number: z
                    .number()
                    .default(1)
                    .describe('Page number for pagination.'),
            },
        },
        async (
            {
                technology_name,
                technology_versions,
                cvss_min,
                modified_days_back = 365,
                page_size = 50,
                page_number = 1,
            },
            extra
        ) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const techVersionsList = parseListParam(technology_versions);
                if (!techVersionsList || techVersionsList.length === 0) {
                    throw new Error(
                        'At least one technology version is required.'
                    );
                }

                const filters: Record<string, unknown> = {
                    technology_name,
                    technology_versions: techVersionsList,
                };

                if (cvss_min !== undefined) {
                    filters.cvss_min = cvss_min;
                }

                const modifiedFrom = new Date();
                modifiedFrom.setDate(
                    modifiedFrom.getDate() - modified_days_back
                );
                filters.last_updated_from = modifiedFrom.toISOString();

                const requestPayload = {
                    filters,
                    pagination: { page_size, page_number },
                    sort: [{}],
                };

                const response = await apiManager.post(
                    `${CVE_INTEL_API_BASE}/vulnerabilities`,
                    requestPayload
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
                            text: `Error searching vulnerabilities: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
