import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext, toolErrorFrom } from '@chkp/mcp-utils';
import { EXPOSED_CREDENTIALS_API_BASE } from '../constants.js';
import { parseListParam } from '../schemas.js';
import type { ArgosERMAPIManager } from '../client.js';
import type { ServerModule } from './types.js';
import { readJson } from '../helpers/response.js';
import { isRequestWide, itemError } from '../helpers/item-error.js';

// Lookups are reported one by one, so a failure for one domain does not hide
// the others. A failure that applies to the whole request - the credentials
// were rejected - ends the call instead, as does every lookup failing: then
// there is nothing to report but the failure.

async function lookupDomains(
    apiManager: ArgosERMAPIManager,
    domains: string[],
    maskPassword: boolean,
    failures: unknown[]
): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    for (const domain of domains) {
        try {
            const response = await apiManager.post(
                `${EXPOSED_CREDENTIALS_API_BASE}/by_domain/`,
                { domain, mask_password: maskPassword }
            );
            results.push(await readJson(response));
        } catch (e) {
            if (isRequestWide(e)) throw e;
            failures.push(e);
            results.push({ domain, ...itemError(e) });
        }
    }
    return results;
}

async function lookupEmails(
    apiManager: ArgosERMAPIManager,
    emails: string[],
    maskPassword: boolean,
    failures: unknown[]
): Promise<unknown> {
    try {
        const response = await apiManager.post(
            `${EXPOSED_CREDENTIALS_API_BASE}/by_email/bulk`,
            { email: emails, mask_password: maskPassword }
        );
        return await readJson(response);
    } catch (e) {
        if (isRequestWide(e)) throw e;
        failures.push(e);
        return itemError(e);
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
                        'If True (default), passwords are masked in results for both domain and email lookups.'
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
                const failures: unknown[] = [];

                if (domains.length > 0) {
                    results.domains = await lookupDomains(
                        apiManager,
                        domains,
                        mask_password,
                        failures
                    );
                }
                if (emails.length > 0) {
                    results.emails = await lookupEmails(
                        apiManager,
                        emails,
                        mask_password,
                        failures
                    );
                }
                // One request per domain, one for all the emails.
                const lookups = domains.length + (emails.length > 0 ? 1 : 0);
                if (failures.length === lookups) throw failures[0];

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(results, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return toolErrorFrom(
                    error,
                    'Error checking credential exposure'
                );
            }
        }
    );
}
