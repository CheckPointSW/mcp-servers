import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handle, registerTool } from './shared/result.js';
import { apiFor } from './shared/session.js';
import type { ServerModule } from './types.js';

const LIST_SCOPES_DESCRIPTION = `List the Harmony Email & Collaboration (HEC) scopes that the configured credentials can reach.

WHEN TO USE:
- Confirming which tenant this server is bound to
- Diagnosing a permissions or wrong-tenant problem before investigating further

PURPOSE:
- A scope is a \`<farm>:<customer>\` string identifying one tenant on one HEC farm
- Read-only, and the cheapest possible check that credentials and connectivity work`;

export function registerScopeTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    registerTool(
        server,
        'list_scopes',
        LIST_SCOPES_DESCRIPTION,
        {},
        async (_args, extra) =>
            handle('list_scopes', async () => {
                const api = apiFor(serverModule, extra);
                return { scopes: await api.getScopes() };
            })
    );
}
