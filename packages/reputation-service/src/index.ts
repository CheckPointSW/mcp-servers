#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReputationClient, ReputationSettings } from './lib/reputation-client.js';
import { isValidFileHash, isValidIp, getReputationVerdict } from './lib/common-utils.js';
import { 
  launchMCPServer, 
  createServerModule,
  SessionContext
} from '@chkp/mcp-utils';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);
process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

const server = new McpServer({
    name: 'Check Point Reputation Service',
    description:
        "Check Point security reputation about IP, URL, File hashes - Get their current verdict",
    version: '1.0.0'
});

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  ReputationSettings,
  pkg,
  ReputationClient
);

// --- TOOLS ---

server.tool(
    'reputation_url',
    'Get a reputation of a URL or a domain',
    {
        resource: z.string().describe('The URL or domain to check reputation for'),
    },
    async (args: Record<string, unknown>, extra: any) => {
        if (typeof args.resource !== 'string' || args.resource.trim() === '') {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Resource must be provided and cannot be empty' }, null, 2) }] };
        }

        try {
            // Get settings from session context
            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ReputationClient(settings);
            const result = await client.getReputation('url', args.resource as string);
            const verdict = getReputationVerdict(result.risk, result.confidence);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: `${result.resource} is ${verdict}.`
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Error getting URL reputation: ${error.message}` }, null, 2) }] };
        }
    }
);

server.tool(
    'reputation_ip',
    'Get a reputation of an IP address',
    {
        ip: z.string(),
    },
    async (args: Record<string, unknown>, extra: any) => {
        if (typeof args.ip !== 'string' || args.ip.trim() === '') {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'IP address must be provided and cannot be empty' }, null, 2) }] };
        }

        // Validate IP format
        if (!isValidIp(args.ip as string)) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid IP address format. Please provide a valid IPv4 or IPv6 address.' }, null, 2) }] };
        }

        try {
            // Get settings from session context
            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ReputationClient(settings);
            const result = await client.getReputation('ip', args.ip as string);
            const verdict = getReputationVerdict(result.risk, result.confidence);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: `${result.resource} is ${verdict}.`
                    }, null, 2)
                }]
            };
        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Error getting IP reputation: ${error.message}` }, null, 2) }] };
        }
    }
);

server.tool(
    'reputation_file',
    'Get a reputation of a file hash (MD5, SHA-1, SHA-256)',
    {
        hash: z.string(),
    },
    async (args: Record<string, unknown>, extra: any) => {
        if (typeof args.hash !== 'string' || args.hash.trim() === '') {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'File hash must be provided and cannot be empty' }, null, 2) }] };
        }

        // Validate hash format
        if (!isValidFileHash(args.hash as string)) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid file hash format. Please provide a valid MD5, SHA-1, SHA-256.' }, null, 2) }] };
        }

        try {
            // Get settings from session context
            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ReputationClient(settings);
            const result = await client.getReputation('file', args.hash as string);

            const verdict = getReputationVerdict(result.risk, result.confidence);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: `${result.resource} is ${verdict}.`
                    }, null, 2)
                }]
            };
        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Error getting file hash reputation: ${error.message}` }, null, 2) }] };
        }
    }
);

export { server };

const main = async () => {
    await launchMCPServer(
        join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
        serverModule
    );
};
main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
});
