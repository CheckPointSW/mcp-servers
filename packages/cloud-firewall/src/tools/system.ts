import { z } from 'zod';
import { defineTool, jsonResult, type AnyToolDef } from './types.js';

export function systemTools(version: string): AnyToolDef[] {
    return [
        defineTool({
            name: 'ping',
            description:
                'Verify the cloud-firewall MCP server is alive; returns the package version and active mode',
            tier: 0,
            schema: {
                text: z
                    .string()
                    .describe('Optional text to echo back in the response')
                    .optional(),
            },
            handler: async (args, ctx) =>
                jsonResult({
                    status: 'ok',
                    server: 'cloud-firewall',
                    version,
                    mode: ctx.settings.mode,
                    echo: args.text ?? null,
                }),
        }),
    ];
}
