import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { IOC_API_BASE } from '../constants.js';
import { parseListParam } from '../schemas.js';
import type { ArgosERMAPIManager } from '../client.js';
import type { ServerModule } from './types.js';

function detectIocType(ioc: string): string | null {
    if (/^[a-f0-9]{64}$/.test(ioc)) return 'file/sha256';
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ioc)) return 'ipv4';
    if (
        /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}$/.test(
            ioc
        )
    )
        return 'domain';
    if (ioc.startsWith('http')) return 'url';
    return null;
}

async function enrichSingleIoc(
    apiManager: ArgosERMAPIManager,
    ioc: string
): Promise<Record<string, unknown>> {
    const iocType = detectIocType(ioc);
    if (!iocType) {
        return { ioc, error: 'Unknown IOC type' };
    }
    try {
        const response = await apiManager.get(
            `${IOC_API_BASE}/${iocType}?value=${encodeURIComponent(ioc)}`
        );
        const responseData = await response.json();
        return responseData.data || {};
    } catch (e) {
        return { ioc, error: e instanceof Error ? e.message : String(e) };
    }
}

export function registerIocTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    server.registerTool(
        'enrich_iocs',
        {
            description: `Enrich Indicators of Compromise (IOCs) with threat intelligence and reputation data.

WHEN TO USE:
- User provides suspicious IPs, domains, URLs, or file hashes
- User wants to analyze IOCs found in alerts or logs

SUPPORTED IOC TYPES:
- IPv4 addresses, Domains, URLs, SHA256 file hashes
- Auto-detection based on format`,
            inputSchema: {
                iocs: z
                    .union([z.string(), z.array(z.string())])
                    .describe('Single IOC string or list of IOCs to analyze.'),
            },
        },
        async ({ iocs }, extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const iocsList = parseListParam(iocs);
                if (!iocsList || iocsList.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify([]),
                            },
                        ],
                    };
                }

                const results: Record<string, unknown>[] = [];
                for (const ioc of iocsList) {
                    results.push(await enrichSingleIoc(apiManager, ioc));
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(results, null, 2),
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
                            text: `Error enriching IOCs: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
