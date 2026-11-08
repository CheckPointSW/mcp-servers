#!/usr/bin/env node

import {
    createMcpServer,
    launchMCPServer,
    createServerModule,
} from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CloudFirewallAPIManager } from './api-manager.js';
import { Settings } from './settings.js';
import { createWriteModePolicy, registerTools } from './tools/register.js';
import { allTools } from './tools/index.js';
import { registerPrompts } from './prompts.js';
import { cloudFirewallInstructions } from './instructions.js';

const { server, pkg } = createMcpServer(
    import.meta.url,
    {
        description: 'MCP server for Check Point Cloud Firewall management',
    },
    { instructions: cloudFirewallInstructions }
);

const serverModule = createServerModule(
    server,
    Settings,
    pkg,
    CloudFirewallAPIManager
);

const tools = allTools(pkg.version);
registerTools(server, serverModule, tools);

// Multi-step playbooks, offered to the client as prompts. They are not gated by
// mode: a prompt only tells the model what order to work in, and the tools it
// names are each still authorized on their own terms when called. The deploy
// playbook says what to do when the write tool is absent rather than pretending
// it is there.
registerPrompts(server);

// Write tools are hidden from tools/list unless mode is 'write' — the
// marketplace read-only-by-default convention. The launcher applies it after
// resolving settings from the CLI flags; mcp-utils also copies and applies it
// on each HTTP session server. Visibility only, and process-wide: the per-call
// authorization check lives in runTool (tools/register.ts).
server.setToolPolicy(createWriteModePolicy(serverModule, tools));

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
