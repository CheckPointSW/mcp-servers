#!/usr/bin/env node

import { z } from 'zod';
import { McpToolDefinition, toolDefinitionMap } from './toolDefinitionMap.js';
import { Settings, APIManagerForAPIKey } from '@chkp/quantum-infra';
import {
  launchMCPServer,
  createServerModule,
  SessionContext,
  createApiRunner,
  createMcpServer,
  toolErrorFrom,
} from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { zodSchemas } from './zodSchemas.js';
import { getServerInfo } from './serverInfo.js';

/**
 * Create MCP Server with telemetry support
 */
const { server, pkg } = createMcpServer(import.meta.url, getServerInfo());

/**
 * Server configuration
 */
const SERVER_PACKAGE_NAME = pkg['name'];

// Create a multi-user server module for session management
const serverModule = createServerModule(server, Settings, pkg, APIManagerForAPIKey);

// Create an API runner function
const runApi = createApiRunner(serverModule);

// Management API version: v2.1 (R82.10+)

// Add the init tool
server.tool(
  `${SERVER_PACKAGE_NAME.split('/').pop().replace(/-mcp$/, '')}__init`,
  'Verify, login and initialize management connection. Use this tool on your first interaction with the server.',
  {},
  async (args: Record<string, unknown>, extra: any) => {
    try {
      // Get API manager for this session
      const apiManager = SessionContext.getAPIManager(serverModule, extra);

      const environment = await apiManager.describeDomainEnvironment();
      return {
        content: [
          {
            type: 'text',
            text: `${SERVER_PACKAGE_NAME} server is up and running. ${environment}`,
          },
        ],
      };
    } catch (error) {
      return toolErrorFrom(error, `Error initializing ${SERVER_PACKAGE_NAME} connection`);
    }
  }
);

// Register all tools from the tool definition map dynamically
for (const toolDef of toolDefinitionMap) {
  const toolName = toolDef.name;
  if (!toolName) {
    console.error('❌ Tool definition missing name:', toolDef);
    continue;
  }
  server.tool(
    toolName,
    toolDef.description as string,
    zodSchemas[toolName as keyof typeof zodSchemas],
    async (args: Record<string, unknown>, extra: any) => {
      // args are already validated by the MCP framework using the Zod schema
      return await executeApiTool(toolDef, args, extra);
    }
  );
}

/**
 * Executes an API tool with the provided arguments
 *
 * @param definition Tool definition
 * @param toolArgs Arguments provided by the user
 * @param extra The session context from MCP server
 * @returns Call tool result
 */
async function executeApiTool(
  definition: McpToolDefinition,
  validatedArgs: Record<string, any>,
  extra?: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Prepare URL, query parameters, headers, and request body
  const urlPath = definition.pathTemplate as string;

  let domain = undefined;
  if (validatedArgs.domain) {
    domain =
      typeof validatedArgs.domain === 'string' && validatedArgs.domain.trim() !== ''
        ? validatedArgs.domain
        : undefined;
  }
  // Execute the request
  // Ensure requestBody is never undefined to avoid sanitizeData issues
  const requestBody = validatedArgs?.['requestBody'] || {};

  if (validatedArgs.domains_to_process) {
    requestBody['domains-to-process'] = [validatedArgs.domains_to_process];
    requestBody['ignore-warnings'] = true;
  }

  const resp = await runApi('POST', urlPath, requestBody, extra, domain);

  return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
}

export { server };

/**
 * Main function to start the server
 */
async function main() {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    serverModule
  );
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
