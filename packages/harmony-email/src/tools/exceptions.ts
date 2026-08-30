import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    EXCEPTION_TYPES,
    toApException,
    type ExceptionTypeName,
} from './shared/schemas.js';
import { handle, registerTool } from './shared/result.js';
import { apiFor } from './shared/session.js';
import type { ServerModule } from './types.js';

const LIST_DESCRIPTION = `List the Anti-Phishing (AP) exceptions configured on this tenant.

WHEN TO USE:
- Explaining why a message was allowed or blocked despite an engine verdict
- Auditing what is currently exempted from Anti-Phishing

PURPOSE:
- \`whitelist\` always allows, \`blacklist\` always blocks, \`spam_whitelist\` allows through the spam filter only
- Each entry can match by sender email, domain or IP, recipient, subject, link domain, or attachment hash
- Read-only`;

const GET_DESCRIPTION = `Fetch one Anti-Phishing exception entry by id.

WHEN TO USE:
- Drilling into a specific entry surfaced by \`list_ap_exceptions\`

PURPOSE:
- \`exc_id\` is the entry id from \`list_ap_exceptions\`; \`exc_type\` must match the list it came from
- Read-only`;

const excTypeSchema = z
    .enum(EXCEPTION_TYPES)
    .describe(
        'Which exception list to read: whitelist, blacklist or spam_whitelist.'
    );

const scopeSchema = z
    .string()
    .max(256)
    .optional()
    .describe('Query a tenant other than the server-configured one.');

export function registerExceptionTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    registerTool<{ exc_type: ExceptionTypeName; scope?: string }>(
        server,
        'list_ap_exceptions',
        LIST_DESCRIPTION,
        { exc_type: excTypeSchema, scope: scopeSchema },
        async (args, extra) =>
            handle('list_ap_exceptions', async () => {
                const api = apiFor(serverModule, extra);
                const rows = await api.listApExceptions(
                    args.exc_type,
                    args.scope
                );
                return { exceptions: rows.map(toApException) };
            })
    );

    registerTool<{
        exc_type: ExceptionTypeName;
        exc_id: string;
        scope?: string;
    }>(
        server,
        'get_ap_exception',
        GET_DESCRIPTION,
        {
            exc_type: excTypeSchema,
            exc_id: z.string().min(1).max(256).describe('Exception entry id.'),
            scope: scopeSchema,
        },
        async (args, extra) =>
            handle('get_ap_exception', async () => {
                const api = apiFor(serverModule, extra);
                return toApException(
                    await api.getApException(
                        args.exc_type,
                        args.exc_id,
                        args.scope
                    )
                );
            })
    );
}
