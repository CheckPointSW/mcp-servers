#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Settings } from '@chkp/quantum-infra';
import { launchMCPServer } from '@chkp/mcp-utils';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import * as Scripts from './scripts/index.js';

// Import all script classes
import { runScript } from '@chkp/quantum-gw-cli-base';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;


// Create a new MCP server instance
const server = new McpServer({
  name: 'gw-cli',
  description: 'MCP server to run Connection Analysis on a Check Point gateway',
  version: '0.0.1'
});

// Connection Analysis Tools
server.tool(
  'start_connection_analysis',
  'Start a debug connection analysis on the target gateway, the user can then reproduce the issue and report back.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
    source_ip: z.string().describe('Source IP address for the connection'),
    destination_ip: z.string().describe('Destination IP address for the connection')
  },
  async ({ target_gateway, source_ip, destination_ip }) => {
    const result = await runScript(server, 
      Scripts.StartConnectionDebugScript,
      target_gateway,
      { source_ip, destination_ip }
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'stop_connection_analysis',
  'Stop a debug connection analysis on the target gateway and get the results of the debug script.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
    source_ip: z.string().describe('Source IP address for the connection'),
    destination_ip: z.string().describe('Destination IP address for the connection')
  },
  async ({ target_gateway, source_ip, destination_ip }) => {
    const result = await runScript(server, 
      Scripts.StopConnectionDebugScript,
      target_gateway,
      { source_ip, destination_ip }
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

export { server };

const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    { server, Settings, pkg }
  );
};

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
