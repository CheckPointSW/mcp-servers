import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { IOC_API_BASE } from '../constants.js';
import { parseListParam } from '../schemas.js';
import type { ArgosERMAPIManager } from '../client.js';
import type { ServerModule } from './types.js';

/**
 * Detect the IOC type from its format. Hex is case-insensitive, so the
 * SHA256 pattern accepts upper, lower and mixed case.
 */
export function detectIocType(ioc: string): string | null {
    if (/^[a-f0-9]{64}$/i.test(ioc)) return 'file/sha256';
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

/**
 * Normalise an IOC value for the backend. The IOC API validates SHA256
 * values against a lowercase-only pattern and domains are case-insensitive,
 * so both are lowercased. URLs are left as-is because their path and query
 * may be case-sensitive.
 */
export function normalizeIocValue(ioc: string, iocType: string): string {
    if (iocType === 'file/sha256' || iocType === 'domain') {
        return ioc.toLowerCase();
    }
    return ioc;
}

/**
 * Parse the enrich_iocs input into individual IOCs. Items are trimmed and
 * empty items dropped. A plain string is also split on commas, so
 * "hash1, hash2" becomes two IOCs, unless it contains "://": commas are
 * legal in URLs and splitting one would enrich a truncated URL.
 *
 * This lives here rather than in parseListParam because other tools take
 * filter values that legitimately contain commas or leading spaces.
 */
export function parseIocList(
    iocs: string | string[] | undefined | null
): string[] {
    const list = parseListParam(iocs) ?? [];
    const isPlainString =
        typeof iocs === 'string' && list.length === 1 && list[0] === iocs;
    const items =
        isPlainString && !iocs.includes('://') ? iocs.split(',') : list;
    return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

async function enrichSingleIoc(
    apiManager: ArgosERMAPIManager,
    ioc: string
): Promise<Record<string, unknown>> {
    const iocType = detectIocType(ioc);
    if (!iocType) {
        return { ioc, error: 'Unknown IOC type' };
    }
    const value = normalizeIocValue(ioc, iocType);
    try {
        const response = await apiManager.get(
            `${IOC_API_BASE}/${iocType}?value=${encodeURIComponent(value)}`
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
- IPv4 addresses, Domains, URLs, SHA256 file hashes (any letter case)
- Auto-detection based on format
- MD5 and SHA1 hashes are not supported`,
            inputSchema: {
                iocs: z
                    .union([z.string(), z.array(z.string())])
                    .describe(
                        'Single IOC string, comma-separated string, or list of IOCs to analyze. Pass URLs as a list, since a string containing a URL is not split on commas.'
                    ),
            },
        },
        async ({ iocs }, extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const iocsList = parseIocList(iocs);
                if (iocsList.length === 0) {
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
