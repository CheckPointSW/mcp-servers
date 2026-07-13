#!/usr/bin/env node
/**
 * Workforce AI MCP Server (Check Point MCP catalog package).
 *
 * Exposes Check Point Workforce AI REST operations as MCP tools. The tool set is
 * code-generated at build time from an OpenAPI spec (see scripts/generate-tools.ts,
 * src/tools/tools.g.ts). Transport, CLI parsing, per-session management, telemetry,
 * and tool-policy gating are provided by the shared @chkp/mcp-utils framework;
 * CloudInfra authentication is provided by @chkp/quantum-infra.
 *
 * Configuration (CLI flag / env var — see src/server-config.json):
 *   --client-id  / CP_CI_CLIENT_ID   CloudInfra API key client ID (required)
 *   --access-key / CP_CI_ACCESS_KEY  CloudInfra API key secret    (required)
 *   --gateway    / CP_CI_GATEWAY     CloudInfra gateway URL        (required)
 *   --region     / REGION            Region (optional; auto-detected from gateway)
 *   --write-mode / WRITE_MODE        Enable write tools (default: read-only)
 */

import {
  createMcpServer,
  createServerModule,
  launchMCPServer,
  SessionContext,
} from '@chkp/mcp-utils';
import type { ToolPolicyCallback } from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { Settings } from './settings.js';
import { WorkforceApiManager } from './api-manager.js';
import { toolDefinitionMap } from './tools/tools.g.js';
import { WRITE_TOOLS } from './tools/write-tools.g.js';

const { server, pkg } = createMcpServer(import.meta.url, {
  description:
    'MCP server for Check Point Workforce AI — query and manage AI & Browse security policies, assets, users, and the GenAI application catalog.',
});

// Write tools (create / modify / delete) are gated behind WRITE_MODE; the server
// is read-only by default, matching the standalone server. The policy is read
// lazily from the environment when applied (after tools are registered) so
// WRITE_MODE=true unlocks the 24 write tools. Disabled tools are hidden from
// tools/list — parity with the old tool-filter behaviour.
const writeModePolicy: ToolPolicyCallback = (toolName: string) =>
  process.env.WRITE_MODE?.toLowerCase() === 'true' || !WRITE_TOOLS.has(toolName);

const serverModule = createServerModule(server, Settings, pkg, WorkforceApiManager, writeModePolicy);

// Bridge the generated tool map onto the framework's server.tool(...) API.
// Registering through server.tool earns automatic telemetry and tool-policy
// from CPMcpServer. Each generated schema is a top-level z.object, so `.shape`
// yields the ZodRawShape the SDK expects (and validates against per call).
for (const [name, def] of toolDefinitionMap) {
  const shape = (def.zodValidationSchema as any)?.shape;
  if (!shape || typeof shape !== 'object') {
    throw new Error(
      `Tool '${name}' has no object input shape (zodValidationSchema is not a z.object); regenerate tools.g.ts.`,
    );
  }
  server.tool(name, def.description, shape, async (args: Record<string, any>, extra: any) => {
    const api = SessionContext.getAPIManager(serverModule, extra) as WorkforceApiManager;
    return api.executeTool(name, def, args ?? {});
  });
}

export { server };

const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    serverModule,
  );
};

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
