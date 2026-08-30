import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toTask } from './shared/schemas.js';
import { handle, registerTool } from './shared/result.js';
import { apiFor } from './shared/session.js';
import type { ServerModule } from './types.js';

const GET_TASK_DESCRIPTION = `Fetch the current state of a HEC asynchronous task - the background job a bulk action creates.

WHEN TO USE:
- Following up on the \`task_id\` returned by a quarantine, restore or deny-restore action
- The user asks whether a bulk action finished

PURPOSE:
- Returns the task id, status (\`init\`, \`inprogress\`, \`completed\`, \`failed\`, \`stopped\`, \`paused\`), the actor who started it, and start/finish timestamps
- Read-only. Poll rather than assume: a completed action still reports per-entity outcomes on the entity itself`;

export function registerTaskTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    registerTool<{ task_id: string; scope?: string }>(
        server,
        'get_task',
        GET_TASK_DESCRIPTION,
        {
            task_id: z
                .string()
                .min(1)
                .max(256)
                .describe('Task id returned by an action tool.'),
            scope: z
                .string()
                .max(256)
                .optional()
                .describe(
                    'Query a tenant other than the server-configured one.'
                ),
        },
        async (args, extra) =>
            handle('get_task', async () => {
                const api = apiFor(serverModule, extra);
                return toTask(await api.getTask(args.task_id, args.scope));
            })
    );
}
