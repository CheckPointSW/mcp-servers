/**
 * Utility functions for MCP servers
 */

import { APIManagerFactory } from './api-manager-factory.js';
import { ServerModule } from './launcher.js';
import { SessionContext } from './session-context.js';
import { SessionManager } from './session-manager.js';
import { SettingsManager } from './settings-manager.js';
import { ToolPolicyCallback } from './tool-policy.js';

/**
 * Gets a header value in a case-insensitive way, handling both underscore and hyphen separators
 * @param headers The headers object
 * @param key The header key to look for
 * @returns The header value as a string, or undefined if not found
 */
export function getHeaderValue(headers: Record<string, string | string[]>, key: string): string | undefined {
  // Normalize the input key to use hyphens (headers are always normalized to hyphens in SettingsManager)
  // Then check case variations
  const normalizedKey = key.replace(/_/g, '-');
  const value = headers[normalizedKey] || headers[normalizedKey.toUpperCase()] || headers[normalizedKey.toLowerCase()];
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
 * Tracks registrations made on a server so they can be replayed on new instances
 */
interface ServerRegistration {
    type: 'tool' | 'prompt' | 'resource';
    method: string;
    args: any[];
}

/**
 * Wraps a server to track all registrations (tools, prompts, resources)
 * Returns the wrapped server and a factory function to create new instances with the same registrations
 */
function wrapServerWithTracking(server: any, createServerFn: () => any): {
    wrappedServer: any,
    createInstance: () => any
} {
    const registrations: ServerRegistration[] = [];

    // Wrap the server methods to track registrations
    const originalTool = server.tool?.bind(server);
    const originalPrompt = server.prompt?.bind(server);
    const originalResource = server.resource?.bind(server);

    if (originalTool) {
        server.tool = function(...args: any[]) {
            registrations.push({ type: 'tool', method: 'tool', args: [...args] });
            return originalTool(...args);
        };
    }

    if (originalPrompt) {
        server.prompt = function(...args: any[]) {
            registrations.push({ type: 'prompt', method: 'prompt', args: [...args] });
            return originalPrompt(...args);
        };
    }

    if (originalResource) {
        server.resource = function(...args: any[]) {
            registrations.push({ type: 'resource', method: 'resource', args: [...args] });
            return originalResource(...args);
        };
    }

    // Factory function to create new server instances with all registrations
    const createInstance = () => {
        const newServer = createServerFn();

        // Replay all registrations on the new server
        for (const reg of registrations) {
            if (newServer[reg.method]) {
                newServer[reg.method](...reg.args);
            }
        }

        // Apply tool policy if it was set on the original server
        if (typeof server.setToolPolicy === 'function' && typeof newServer.setToolPolicy === 'function') {
            const toolPolicy = (server as any)._toolPolicyCallback;
            if (toolPolicy) {
                newServer.setToolPolicy(toolPolicy);
            }
        }

        return newServer;
    };

    return { wrappedServer: server, createInstance };
}

/**
 * Creates a ServerModule with multi-user support.
 * This will set up the SettingsManager, APIManagerFactory, SessionManager
 * to properly manage settings, API clients, sessions, and session events.
 *
 * @param server MCP server instance
 * @param Settings The Settings class (with fromArgs and fromHeaders static methods)
 * @param pkg Package info object with version
 * @param apiManagerClass API Manager class to use for API calls
 * @param toolPolicyCallback Optional callback to filter which tools are available
 * @param createServerFn Optional factory function to create new server instances (for HTTP multi-user support)
 * @returns A ServerModule with multi-user support
 */

export function createServerModule(
    server: any,
    Settings: any,
    pkg: { version: string; },
    apiManagerClass: any,
    toolPolicyCallback?: ToolPolicyCallback,
    createServerFn?: () => any
): ServerModule {
    // Create the settings manager
    const settingsManager = new SettingsManager(Settings);

    // Create the API manager factory
    const apiManagerFactory = new APIManagerFactory(apiManagerClass, settingsManager);

    // Create the session manager
    const sessionManager = new SessionManager();

    // Set tool policy on the server if provided
    if (toolPolicyCallback && typeof server.setToolPolicy === 'function') {
        console.error('[createServerModule] Setting tool policy callback on server');
        server.setToolPolicy(toolPolicyCallback);
    }

    // Auto-discover createServerFn if not provided but available on the server
    const serverFactory = createServerFn || (server as any)._createServerFn;

    // Wrap server to track registrations and create factory if createServerFn is provided or discovered
    let createServerInstance: (() => any) | undefined;
    if (serverFactory) {
        const { wrappedServer, createInstance } = wrapServerWithTracking(server, serverFactory);
        createServerInstance = createInstance;
        console.error('[createServerModule] Server factory enabled - HTTP multi-user support active');
        // Note: We don't replace 'server' with wrappedServer because the wrapping happens in-place
    } else {
        console.error('[createServerModule] Warning: No server factory provided - HTTP multi-user may have issues');
    }

    // Create and return the server module
    return {
        server,
        Settings,
        settingsManager,
        apiManagerFactory,
        sessionManager,
        pkg,
        toolPolicyCallback,
        createServerInstance
    };
}
