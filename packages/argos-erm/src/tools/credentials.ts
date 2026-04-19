import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { EXPOSED_CREDENTIALS_API_BASE } from '../constants.js';
import { parseListParam } from '../schemas.js';
import type { ArgosERMAPIManager } from '../client.js';
import type { ServerModule } from './types.js';

async function lookupDomains(
    apiManager: ArgosERMAPIManager,
    domains: string[]
): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    for (const domain of domains) {
        try {
            const response = await apiManager.post(
                `${EXPOSED_CREDENTIALS_API_BASE}/by_domain/`,
                { domain }
            );
            results.push(await response.json());
        } catch (e) {
            results.push({
                domain,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }
    return results;
}

async function lookupEmails(
    apiManager: ArgosERMAPIManager,
    emails: string[],
    maskPassword: boolean
): Promise<unknown> {
    try {
        const response = await apiManager.post(
            `${EXPOSED_CREDENTIALS_API_BASE}/by_email/bulk`,
            { email: emails, mask_password: maskPassword }
        );
        return await response.json();
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export function registerCredentialTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    server.registerTool(
        'check_credential_exposure',
        {
            description: `Check for exposed credentials in data breaches by domain or email address.

WHEN TO USE:
- User wants to check if company credentials have been compromised
- User asks about specific email addresses in data breaches

INPUT TYPES:
- Domains: "company.com" (without @)
- Email addresses: "user@company.com" (with @)
- Mixed lists supported`,
            inputSchema: {
                inputs: z
                    .union([z.string(), z.array(z.string())])
                    .describe(
                        'Domain(s) or email(s) to check for exposed credentials.'
                    ),
                mask_password: z
                    .boolean()
                    .default(true)
                    .describe(
                        'If True (default), passwords are masked in results.'
                    ),
            },
        },
        async ({ inputs, mask_password = true }, extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const inputsList = parseListParam(inputs);
                if (!inputsList || inputsList.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({}),
                            },
                        ],
                    };
                }

                const domains = inputsList.filter(
                    (item) => !item.includes('@')
                );
                const emails = inputsList.filter((item) => item.includes('@'));

                const results: Record<string, unknown> = {};

                if (domains.length > 0) {
                    results.domains = await lookupDomains(apiManager, domains);
                }
                if (emails.length > 0) {
                    results.emails = await lookupEmails(
                        apiManager,
                        emails,
                        mask_password
                    );
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
                            text: `Error checking credential exposure: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
