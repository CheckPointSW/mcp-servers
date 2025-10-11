/**
 * Utility functions for MCP servers
 */

import { ZodSchema, z } from 'zod';
import { APIManager } from '@chkp/quantum-infra';
import { McpServer, McpTool } from '@modelcontextprotocol/sdk/server';
import { APIManagerFactory } from './api-manager-factory.js';
import { ServerModule } from './launcher.js';
import { SessionContext } from './session-context.js';
import { SessionManager } from './session-manager.js';
import { SettingsManager } from './settings-manager.js';

/**
 * Gets a header value in a case-insensitive way
 * @param headers The headers object
 * @param key The header key to look for
 * @returns The header value as a string, or undefined if not found
 */
export function getHeaderValue(headers: Record<string, string | string[]>, key: string): string | undefined {
  const value = headers[key] || headers[key.toUpperCase()] || headers[key.toLowerCase()];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

/**
 * Creates a runApi function for use in MCP server tools
 * @param serverModule The server module to use for API calls
 * @returns A function that can be used to call APIs
 */
export function createApiRunner(serverModule: ServerModule): 
  (method: string, uri: string, data: Record<string, any>, extra: any, domain?: string) => Promise<Record<string, any>> {
  
  return async (method: string, uri: string, data: Record<string, any>, extra: any, domain?: string): Promise<Record<string, any>> => {
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    return await apiManager.callApi(method, uri, data, domain);
  };
}/**
 * Creates a ServerModule with multi-user support.
 * This will set up the SettingsManager, APIManagerFactory, SessionManager
 * to properly manage settings, API clients, sessions, and session events.
 *
 * @param server MCP server instance
 * @param Settings The Settings class (with fromArgs and fromHeaders static methods)
 * @param pkg Package info object with version
 * @param apiManagerClass API Manager class to use for API calls
 * @returns A ServerModule with multi-user support
 */

export function createServerModule(
    server: any,
    Settings: any,
    pkg: { version: string; },
    apiManagerClass: any
): ServerModule {
    // Create the settings manager
    const settingsManager = new SettingsManager(Settings);

    // Create the API manager factory
    const apiManagerFactory = new APIManagerFactory(apiManagerClass, settingsManager);

    // Create the session manager
    const sessionManager = new SessionManager();

    // Create the session event manager
    // Create and return the server module
    return {
        server,
        Settings,
        settingsManager,
        apiManagerFactory,
        sessionManager,
        pkg
    };
}

/**
 * Formats a string to be compatible with the Check Point API.
 * Converts camelCase to snake_case, but preserves kebab-case for specific keys.
 * @param str The string to format.
 * @returns The formatted string.
 */
function formatApiKey(str: string): string {
  // Keywords that should be in kebab-case
  const kebabCaseKeywords = [
    'os-name',
    'one-time-password',
    'hardware-model',
    'ipv4-address',
    'ipv4-mask-wildcard',
    'is-sub-domain',
  ];

  if (kebabCaseKeywords.includes(str)) {
    return str;
  }

  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Creates a standard API tool and adds it to the MCP server.
 * This function abstracts the common pattern of defining a Zod schema,
 * creating a tool handler that calls a Check Point API, and returning
 * the response.
 *
 * @param server The McpServer instance.
 * @param serverModule The server module containing session and API managers.
 * @param toolName The name of the tool.
 * @param description A description of what the tool does.
 * @param command The Check Point API command to execute (e.g., 'show-hosts').
 * @param schema The Zod schema defining the tool's arguments.
 */
export function createApiTool<T extends z.ZodObject<any>>(
  server: McpServer,
  serverModule: ServerModule,
  toolName: string,
  description: string,
  command: string,
  schema: T
): void {
  server.tool(
    toolName,
    description,
    schema,
    async (args: z.infer<T>, extra: any) => {
      try {
        const apiManager = SessionContext.getAPIManager(serverModule, extra);

        // Extract domain from args if it exists, otherwise undefined
        const domain = 'domain' in args ? args.domain : undefined;

        // Prepare params for the API call, excluding 'domain' and formatting keys
        const params: Record<string, any> = {};
        for (const key in args) {
          if (key !== 'domain' && args[key] !== undefined) {
            params[formatApiKey(key)] = args[key];
          }
        }

        const resp = await apiManager.callApi('POST', command, params, domain);
        return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: 'text',
            text: `Error executing '${toolName}': ${errorMessage}`
          }]
        };
      }
    }
  );
}
