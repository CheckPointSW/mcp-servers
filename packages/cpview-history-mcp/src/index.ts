#!/usr/bin/env node

import { launchMCPServer, createServerModule, createMcpServer } from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Settings } from './settings.js';
import { CpviewHistoryAPIManager } from './api-manager.js';
import { registerCpviewTools } from './tools.js';
import { allowedRootsConfigured } from './paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { server, pkg } = createMcpServer(import.meta.url, {
  description: 'MCP server for analyzing Check Point cpview history (CPViewDB.dat) SQLite databases',
});

console.error('cpview-history-mcp starting up');
console.error(`Version: ${pkg.version}`);

// Warm the allowed-roots cache now so a bad CPVIEW_ALLOWED_ROOTS entry is
// reported at boot rather than on the first tool call.
const rootsConfigured = allowedRootsConfigured();

const isHttpTransport =
  (process.env.MCP_TRANSPORT_TYPE ?? '').toLowerCase() === 'http' ||
  process.argv.some((a, i) => a.toLowerCase() === '--transport=http' ||
    (a === '--transport' && (process.argv[i + 1] ?? '').toLowerCase() === 'http'));

if (isHttpTransport && !rootsConfigured) {
  console.error('================================================================');
  console.error('[cpview-history-mcp] WARNING: starting in HTTP transport mode without CPVIEW_ALLOWED_ROOTS set.');
  console.error('[cpview-history-mcp] Any MCP client connected to this server can read or write any path this');
  console.error('[cpview-history-mcp] process account can access on this host — there is no directory confinement.');
  console.error('[cpview-history-mcp] Set CPVIEW_ALLOWED_ROOTS to a comma-separated list of absolute directories');
  console.error('[cpview-history-mcp] to restrict tool file access before exposing this server to multiple callers.');
  console.error('================================================================');
}

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
