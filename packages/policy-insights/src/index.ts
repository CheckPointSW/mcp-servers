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

// Add the init tool
server.tool(
  `${SERVER_PACKAGE_NAME.split('/').pop().replace(/-mcp$/, '')}__init`,
  'Verify, login and initialize management connection. Use this tool on your first interaction with the server.',
  z.object({}).strict(),
  async (args: Record<string, unknown>, extra: any) => {
    try {
      // Get API manager for this session
      const apiManager = SessionContext.getAPIManager(serverModule, extra);

      // Check if environment is MDS
      const isMds = await apiManager.isMds();

      if (!isMds) {
        return {
          content: [
            {
              type: 'text',
              text: `${SERVER_PACKAGE_NAME} server is up and running. The environment is NOT part of Multi Domain system, there is no need to use domain parameters in tool calls.`,
            },
          ],
        };
      } else {
        // Get domains for MDS environment
        const domains = await apiManager.getDomains();

        // Format domain information
        const domainList = domains
          .map((domain: { name: string; type: string }) => `${domain.name} (${domain.type})`)
          .join(', ');

        return {
          content: [
            {
              type: 'text',
              text: `${SERVER_PACKAGE_NAME} server is up and running. The environment is part of Multi Domain system. You need to use the domain parameter for calling APIs, if you are not sure which to use, ask the user. The domains in the system are: ${domainList}`,
            },
          ],
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error initializing ${SERVER_PACKAGE_NAME} connection: ${errorMessage}`,
          },
        ],
      };
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
      return await executeApiTool(toolName, toolDef, args, extra);
    }
  );
}

/**
 * Executes an API tool with the provided arguments
 *
 * @param toolName Name of the tool to execute
 * @param definition Tool definition
 * @param toolArgs Arguments provided by the user
 * @param extra The session context from MCP server
 * @returns Call tool result
 */
async function executeApiTool(
  toolName: string,
  definition: McpToolDefinition,
  validatedArgs: Record<string, any>,
  extra?: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // Prepare URL, query parameters, headers, and request body
    const urlPath = definition.pathTemplate as string;

    // Debug logging
    console.error(`=== Executing tool "${toolName}" ===`);
    console.error(`URL Path: ${urlPath}`);
    console.error(`Method: ${definition.method}`);
    console.error(`Raw args:`, JSON.stringify(validatedArgs, null, 2));
    console.error(`RequestBody:`, JSON.stringify(validatedArgs?.['requestBody'], null, 2));
    console.error(`Extra context:`, JSON.stringify(extra, null, 2));
    console.error(`Definition:`, JSON.stringify(definition, null, 2));

    let domain = undefined;
    if (validatedArgs.domain) {
      domain =
        typeof validatedArgs.domain === 'string' && validatedArgs.domain.trim() !== ''
          ? validatedArgs.domain
          : undefined;
      console.error(`Sending request to domain:`, JSON.stringify(domain, null, 2));
    }
    // Execute the request
    // Ensure requestBody is never undefined to avoid sanitizeData issues
    const requestBody = validatedArgs?.['requestBody'] || {};

    if (validatedArgs.domains_to_process) {
      requestBody['domains-to-process'] =
        typeof validatedArgs.domain === 'string' && validatedArgs.domain.trim() !== ''
          ? validatedArgs.domain
          : undefined;
    }

    const resp = await runApi('POST', urlPath, requestBody, extra, domain);

    console.error(`=== DEBUG: Response received ===`);
    console.error(`Response:`, JSON.stringify(resp, null, 2));

    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  } catch (error) {
    console.error(`=== DEBUG: Error in executeApiTool ===`);
    console.error(`Error type:`, typeof error);
    console.error(`Error:`, error);
    console.error(`Error stack:`, error instanceof Error ? error.stack : 'No stack trace');

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error executing tool '${toolName}': ${errorMessage}` }],
    };
  }
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
