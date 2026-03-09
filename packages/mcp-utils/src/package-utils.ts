import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CPMcpServer } from './mcp-server.js';
import { Implementation as ServerInfo } from '@modelcontextprotocol/sdk/types.js';
import { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Read and parse the package.json file relative to the calling module
 * Also sets process.env.CP_MCP_MAIN_PKG with the package name and version
 * @param importMetaUrl - The import.meta.url from the calling module
 * @returns Parsed package.json object
 */
export function readPackageJson(importMetaUrl: string): any {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(importMetaUrl)), '../package.json'), 'utf-8')
  );
  
  // Set the environment variable for telemetry/logging
  process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;
  
  return pkg;
}

/**
 * Create a CPMcpServer instance with automatic package info from package.json
 * @param importMetaUrl - The import.meta.url from the calling module
 * @param serverInfo - Server configuration (description is required, name and version will be set from package.json)
 * @param options - Optional server options
 * @returns Object containing the server instance, package info, and a factory function to create new instances
 */
export function createMcpServer(
    importMetaUrl: string,
    serverInfo: Partial<ServerInfo> & { description: string },
    options?: ServerOptions
): { server: CPMcpServer; pkg: any } {
    const pkg = readPackageJson(importMetaUrl);
 
    const fullServerInfo: ServerInfo = {
        ...serverInfo,
        name: serverInfo.name || pkg.name,
        version: serverInfo.version || pkg.version,
    };
 
// Factory function to create new server instances with the same configuration
    const createServerFn = () => {
      return new CPMcpServer(fullServerInfo, options);
    };

    const server = new CPMcpServer(fullServerInfo, options);


    // Store the factory on the server for automatic discovery by createServerModule
    (server as any)._createServerFn = createServerFn;

    return { server, pkg };
}
 
