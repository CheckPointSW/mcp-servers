#!/usr/bin/env node

import { z } from 'zod';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ReputationClient, ReputationSettings } from './lib/reputation-client.js';
import { isValidFileHash, isValidIp, getReputationVerdict } from './lib/common-utils.js';
import { 
  launchMCPServer, 
  createServerModule,
  SessionContext,
  createMcpServer,
  toolErrorFrom,
  McpErrorCode,
  toolError
} from '@chkp/mcp-utils';

const { server, pkg } = createMcpServer(import.meta.url, {
  description: "Check Point security reputation about IP, URL, File hashes - Get their current verdict"
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
            return toolError(McpErrorCode.VALIDATION_ERROR, 'Resource must be provided and cannot be empty');
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
            return toolErrorFrom(error, 'Error getting URL reputation');
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
            return toolError(McpErrorCode.VALIDATION_ERROR, 'IP address must be provided and cannot be empty');
        }

        // Validate IP format
        if (!isValidIp(args.ip as string)) {
            return toolError(McpErrorCode.VALIDATION_ERROR, 'Invalid IP address format. Please provide a valid IPv4 or IPv6 address.');
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
            return toolErrorFrom(error, 'Error getting IP reputation');
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
            return toolError(McpErrorCode.VALIDATION_ERROR, 'File hash must be provided and cannot be empty');
        }

        // Validate hash format
        if (!isValidFileHash(args.hash as string)) {
            return toolError(McpErrorCode.VALIDATION_ERROR, 'Invalid file hash format. Please provide a valid MD5, SHA-1, SHA-256.');
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
            return toolErrorFrom(error, 'Error getting file hash reputation');
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
