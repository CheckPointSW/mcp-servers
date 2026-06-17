#!/usr/bin/env node

import { launchMCPServer, createServerModule, createMcpServer } from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Settings } from './settings.js';
import { CpviewHistoryAPIManager } from './api-manager.js';
import { registerCpviewTools } from './tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { server, pkg } = createMcpServer(import.meta.url, {
  description: 'MCP server for analyzing Check Point cpview history (CPViewDB.dat) SQLite databases',
});

console.error('cpview-history-mcp starting up');
console.error(`Version: ${pkg.version}`);

const serverModule = createServerModule(server, Settings, pkg, CpviewHistoryAPIManager);

const registered = registerCpviewTools(server);
console.error(`Registered ${registered} tools`);

const main = async () => {
  await launchMCPServer(join(__dirname, 'server-config.json'), serverModule);
};

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
