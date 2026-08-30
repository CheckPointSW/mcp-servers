#!/usr/bin/env node

import {
    createMcpServer,
    createServerModule,
    launchMCPServer,
} from '@chkp/mcp-utils';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HarmonyEmailAPIManager } from './api-manager.js';
import { runCheck } from './check.js';
import { PERSONA } from './content/persona.js';
import { registerGlossaryResource, registerPrompts } from './prompts/index.js';
import { Settings } from './settings.js';
import { registerActionTools } from './tools/actions.js';
import { registerDownloadTools } from './tools/download.js';
import { registerEmailReaderTools } from './tools/email-reader.js';
import { registerEntityTools } from './tools/entities.js';
import { registerEventTools } from './tools/events.js';
import { registerExceptionTools } from './tools/exceptions.js';
import { registerMisclassificationTools } from './tools/misclassification.js';
import { registerScopeTools } from './tools/scopes.js';
import { registerSummarizeTools } from './tools/summarize.js';
import { registerTaskTools } from './tools/tasks.js';

const { server, pkg } = createMcpServer(
    import.meta.url,
    {
        description:
            'Harmony Email & Collaboration MCP Server - investigate email security events, entities and restore requests via the HEC SmartAPI',
    },
    // The SOC-analyst persona: voice, vocabulary, refusal stances and the
    // confirm-first discipline for the side-effecting tools.
    { instructions: PERSONA }
);

const serverModule = createServerModule(
    server,
    Settings,
    pkg,
    HarmonyEmailAPIManager
);

// Registration order is the order these are advertised to the client. Persona
// and glossary come first so a client that lists capabilities sees them up top.
registerPrompts(server);
registerGlossaryResource(server);
registerScopeTools(server, serverModule);
registerEntityTools(server, serverModule);
registerEventTools(server, serverModule);
registerTaskTools(server, serverModule);
registerExceptionTools(server, serverModule);
registerDownloadTools(server, serverModule);
registerEmailReaderTools(server, serverModule);
registerMisclassificationTools(server, serverModule);
registerActionTools(server, serverModule);
registerSummarizeTools(server, serverModule);

export { server };

/**
 * `--check` is an operator smoke, not an MCP session, so it is handled before
 * the launcher takes over argv. Its JSON report goes to stderr, keeping stdout
 * reserved for the MCP stdio channel.
 */
async function main(): Promise<void> {
    if (process.argv.includes('--check')) {
        let settings: Settings;
        try {
            settings = Settings.fromArgs(parseCheckArgs(process.argv.slice(2)));
        } catch (error) {
            // A bad flag or env var is an operator mistake, not a crash.
            console.error(
                `harmony-email-mcp: configuration error: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            process.exit(2);
        }
        const exitCode = await runCheck(
            HarmonyEmailAPIManager.create(settings),
            {
                deep: process.argv.includes('--all'),
            }
        );
        process.exit(exitCode);
    }

    await launchMCPServer(
        join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
        serverModule
    );
}

/**
 * Minimal `--hec-foo value` parser for the check path only. The real CLI is
 * commander, wired by launchMCPServer, but that also connects a transport.
 */
function parseCheckArgs(argv: string[]): Record<string, string | undefined> {
    const options: Record<string, string | undefined> = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--hec-')) continue;
        const [flag, inlineValue] = arg.split('=', 2);
        const camel = flag
            .slice(2)
            .replace(/-([a-z])/g, (_match, letter: string) =>
                letter.toUpperCase()
            );
        options[camel] = inlineValue ?? argv[++i];
    }
    return options;
}

main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
});
