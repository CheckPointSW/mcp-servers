/**
 * Utility functions for MCP servers
 */

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
