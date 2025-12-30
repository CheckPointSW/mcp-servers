import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CPMcpServer } from './mcp-server.js';

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
 * @returns Object containing the server instance and the package info
 */
export function createMcpServer(
  importMetaUrl: string,
  serverInfo: { description: string; name?: string; version?: string; [key: string]: any },
  options?: any
): { server: CPMcpServer; pkg: any } {
  const pkg = readPackageJson(importMetaUrl);
  
  const fullServerInfo = {
    ...serverInfo,
    name: serverInfo.name || pkg.name,
    version: serverInfo.version || pkg.version
  };
  
  const server = new CPMcpServer(fullServerInfo, options);
  
  return { server, pkg };
}
