#!/usr/bin/env node
import { Command } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import fs from 'fs';
import http from 'http';
import { randomUUID } from 'crypto';
import { ToolPolicyCallback } from './tool-policy.js';
import { SettingsManager } from './settings-manager.js';

export interface CliOption {
  flag: string;
  description: string;
  env?: string;
  default?: string;
  type?: 'string' | 'boolean';
}

export interface ServerConfig {
  name: string;
  description?: string;
  options: CliOption[];
}

export interface ServerModule {
  server: any; // The MCP server instance (used for stdio transport)
  Settings: {
    fromArgs(options: any): any;
    fromHeaders(headers: Record<string, string | string[]>): any;
  };
  settingsManager: any; // SettingsManager instance for multi-user support
  apiManagerFactory: any; // APIManagerFactory instance for multi-user support
  sessionManager: any; // SessionManager instance for session lifecycle management
  pkg: { version: string };
  toolPolicyCallback?: ToolPolicyCallback; // Optional tool policy callback
  createServerInstance?: () => any; // Factory function to create new server instances for HTTP sessions
}

export type TransportType = 'stdio' | 'http';

/**
 * Launch an MCP server with configuration-driven CLI options
 * @param configPath Path to the server configuration JSON file
 * @param serverModule The server module containing server, Settings, and pkg
 */
export async function launchMCPServer(
  configPath: string,
  serverModule: ServerModule
): Promise<void> {
  // Load configuration
  const config: ServerConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Create commander program for CLI options
  const program = new Command();
  
  if (config.description) {
    program.description(config.description);
  }
  
  // Dynamically add options from config
  config.options.forEach(option => {
    const envValue = option.env ? process.env[option.env] : undefined;
    const defaultValue = envValue || option.default;
    
    if (option.type === 'boolean') {
      const boolDefault = envValue === 'true' || option.default === 'true';
      program.option(option.flag, option.description, boolDefault);
    } else {
      program.option(option.flag, option.description, defaultValue);
    }
  });
  
  // Always add transport options regardless of server-config
  const transportTypeDefault = process.env.MCP_TRANSPORT_TYPE || 'stdio';
  program.option('--transport <type>', 'Transport type (stdio or http)', transportTypeDefault);
  
  // Always add transport-port option regardless of server-config
  const transportPortDefault = process.env.MCP_TRANSPORT_PORT || '3000';
  program.option('--transport-port <number>', 'Port for network transports (e.g., HTTP)', transportPortDefault);

  const debugDefault = process.env.DEBUG === 'true' || false;
  program.option('--debug', 'Enable debug mode', debugDefault);

  // Add telemetry options
  const telemetryEnabledDefault = process.env.TELEMETRY_DISABLED === 'true' ? false : true;
  program.option('--no-telemetry', 'Disable anonymous usage telemetry', telemetryEnabledDefault);
  
  const telemetryUrlDefault = process.env.TELEMETRY_URL || 'https://metrics.security.ai.checkpoint.com/api/v1/metrics/collect';
  program.option('--telemetry-url <url>', 'URL for telemetry server', telemetryUrlDefault);

  // Parse arguments
  program.parse(process.argv);
  const options = program.opts();
  
  // Set telemetry environment variables from CLI options
  if (options.telemetry === false) {
    process.env.TELEMETRY_DISABLED = 'true';
  }
  if (options.telemetryUrl) {
    process.env.TELEMETRY_URL = options.telemetryUrl;
  }
  
  // Initialize settings from CLI args
  if (!serverModule.settingsManager) {
    throw new Error('ServerModule must have a settingsManager. Create it with createServerModule.');
  }
  
  const settings = serverModule.settingsManager.createFromArgs(options);
  
  // Apply tool policy if a callback was provided
  // This must happen after all tools are registered but before connecting
  if (typeof serverModule.server.applyToolPolicy === 'function') {
    console.error('[launchMCPServer] Applying tool policy before connecting');
    serverModule.server.applyToolPolicy();
  }
  
  // Determine transport type from options or environment variable
  const transportType = (options.transport || process.env.MCP_TRANSPORT_TYPE || 'stdio').toLowerCase() === 'http' ? 'http' : 'stdio';
  
  // Always try to read transport-port from CLI args or environment variable
  const transportPort = options.transportPort 
    ? parseInt(options.transportPort, 10) 
    : process.env.MCP_TRANSPORT_PORT
      ? parseInt(process.env.MCP_TRANSPORT_PORT, 10)
      : 3000;
  
  if (transportType === 'http') {
    // Launch Streamable server
    await launchHTTPServer(config, serverModule, transportPort);
  } else {
    // Start stdio server
    const transport = new StdioServerTransport();
    const defaultSessionId = 'default';
    
    // Initialize the default session
    const sessionMetadata = {
      type: 'stdio',
      startedAt: new Date()
    };
    
    serverModule.sessionManager.createSession(defaultSessionId, sessionMetadata);
        
    // Add default session context for stdio transport
    (transport as any).extraContext = () => {
      return {
        sessionId: defaultSessionId,
        transport
      };
    };
    
    await serverModule.server.connect(transport);
    
    console.error(`${config.name} running on stdio transport. Version: ${serverModule.pkg.version}`);
    console.error(`Transport type: stdio`);
  }
}

/**
 * Launch an MCP server with Streamable HTTP transport
 * @param config Server configuration
 * @param serverModule The server module containing server, Settings, and pkg
 * @param port Port to listen on
 */
async function launchHTTPServer(
  config: ServerConfig,
  serverModule: ServerModule,
  port: number
): Promise<void> {
  // Map to store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Map to store per-session server instances (if using server factory)
  const serverInstances: Record<string, any> = {};
  
  // Create HTTP server
  const server = http.createServer(async (req, res) => {
    // Handle requests to the root URL
    if (req.url === '/' || req.url === '/mcp') {
      // Get the session ID from headers
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      // Handle different request methods
      if (req.method === 'POST') {
        // For POST requests, need to parse the body
        const chunks: Buffer[] = [];
        
        try {
          // Read the request body
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const bodyBuffer = Buffer.concat(chunks);
          let body;
          
          // Try to parse JSON body
          try {
            const bodyText = bodyBuffer.toString('utf8');
            if (bodyText) {
              body = JSON.parse(bodyText);
            }
          } catch (err) {
            console.error('Error parsing request body:', err);
          }
          
          let transport: StreamableHTTPServerTransport;
          
          if (sessionId && transports[sessionId]) {
            // Reuse existing transport for the session
            const verbose = SettingsManager.globalDebugState;
            if (verbose) {
              console.error('[launchHTTPServer] Verbose: Reusing existing transport for session:', sessionId);
            }
            transport = transports[sessionId];

            // Initialize settings from headers
            if (!serverModule.settingsManager) {
              throw new Error('ServerModule must have a settingsManager. Create it with createServerModule.');
            }

            if (verbose) {
              console.error('[launchHTTPServer] Verbose: Converting headers for existing session');
            }
            const envHeaders = headersToEnvVars(req.headers, config);
            if (verbose) {
              console.error('[launchHTTPServer] Verbose: Creating settings from headers for existing session');
            }
            serverModule.settingsManager.createFromHeaders(envHeaders, sessionId);
          } else if (!sessionId && body && body.method === 'initialize') {
            // New initialization request
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sid: string) => {
                const verbose = SettingsManager.globalDebugState;
                if (verbose) {
                  console.error('[launchHTTPServer] Verbose: New session initialized:', sid);
                }
                // Store the transport by session ID
                transports[sid] = transport;

                if (verbose) {
                  console.error('[launchHTTPServer] Verbose: Converting headers for new session');
                  console.error('[launchHTTPServer] Verbose: Raw request headers:', Object.keys(req.headers));
                }
                // Create session in the session manager
                const headers = headersToEnvVars(req.headers, config);
                if (verbose) {
                  console.error('[launchHTTPServer] Verbose: Converted headers count:', Object.keys(headers).length);
                }

                const metadata = {
                  userAgent: req.headers['user-agent'],
                  origin: req.headers.origin || req.headers.referer,
                  remoteAddress: req.socket.remoteAddress,
                  initialPath: req.url
                };

                if (verbose) {
                  console.error('[launchHTTPServer] Verbose: Creating session in session manager');
                }
                serverModule.sessionManager.createSession(sid, metadata);

                // Set up the session-specific settings
                if (verbose) {
                  console.error('[launchHTTPServer] Verbose: Creating settings from headers for new session');
                }
                serverModule.settingsManager.createFromHeaders(headers, sid);
                if (verbose) {
                  console.error('[launchHTTPServer] Verbose: Session initialization complete');
                }

              }
            });

            // Clean up transport when closed
            (transport as any).onclose = () => {
              const sid = (transport as any).sessionId;
              if (sid) {
                delete transports[sid];

                // Clean up per-session server instance if exists
                if (serverInstances[sid]) {
                  delete serverInstances[sid];
                }

                // Clean up session-specific resources
                serverModule.settingsManager.clearSession(sid);
                serverModule.apiManagerFactory.clearSession(sid);

                // Remove the session from session manager (this will also clean up SessionContext data)
                serverModule.sessionManager.removeSession(sid);

              }
            };

            // Initialize settings from headers will be done in the onsessioninitialized callback
            // once we know the session ID
            if (!serverModule.settingsManager) {
              throw new Error('ServerModule must have a settingsManager. Create it with createServerModule.');
            }

            // Configure the transport to include session information in the extra context
            // Cast to any as the type definition may not include this property
            (transport as any).extraContext = (msg: any) => {
              const sessionId = (transport as any).sessionId;
              return {
                sessionId,
                transport
              };
            };

            // Create a per-session server instance if factory is available
            let serverToConnect: any;
            if (serverModule.createServerInstance) {
              // Use per-session server instance (recommended for HTTP multi-user)
              const sessionServer = serverModule.createServerInstance();
              serverToConnect = sessionServer;

              // Store the server instance for this session
              // We'll store it after we know the session ID in a deferred manner
              const originalOnSessionInit = (transport as any).onsessioninitialized;
              (transport as any).onsessioninitialized = (sid: string) => {
                serverInstances[sid] = sessionServer;
                if (originalOnSessionInit) {
                  originalOnSessionInit(sid);
                }
              };
            } else {
              // Fall back to shared server instance (not recommended for multi-user)
              serverToConnect = serverModule.server;
              console.error('Warning: Using shared server instance. Consider providing createServerInstance for better multi-user support.');
            }

            // Connect to the MCP server - only needed for new transports
            await serverToConnect.connect(transport)
              .catch((error: Error) => {
                console.error('Error connecting to HTTP transport:', error);
              });
          } else {
            // Invalid request
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided',
              },
              id: null,
            }));
            return;
          }
          
          // Handle the request with parsed body
          await transport.handleRequest(req, res, body);
        } catch (error) {
          console.error('Error handling POST request:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Internal server error: ' + (error as Error).message,
            },
            id: null,
          }));
        }
      } else if (req.method === 'GET') {
        // GET requests for HTTP streaming
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid or missing session ID');
          return;
        }
        
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } else if (req.method === 'DELETE') {
        // DELETE requests for session termination
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid or missing session ID');
          return;
        }
        
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } else {
        // Unsupported methods
        res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, POST, DELETE' });
        res.end('Method not allowed');
      }
    } else if (req.url === '/health' || req.url === '/status') {
      // Handle health checks
      res.writeHead(200, { 'Content-Type': 'application/json' });
      
      // Get session information
      const sessionCount = serverModule.sessionManager.getSessionCount();

      res.end(JSON.stringify({
        status: 'ok',
        server: config.name,
        version: serverModule.pkg.version,
        activeSessions: sessionCount,
      }));
    } else {
      // 404 for unknown routes
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  
  // Start HTTP server
  server.listen(port, () => {
    console.error(`${config.name} running on HTTP transport at http://localhost:${port}. Version: ${serverModule.pkg.version}`);
    console.error(`Transport type: HTTP, Transport-port: ${port}`);
  });
  
  // Handle server errors
  server.on('error', (err) => {
    console.error(`Server error: ${err.message}`);
  });
}

/**
 * Convert HTTP headers to environment variable format
 * Map headers to the environment variables defined in the server config
 * @param headers HTTP headers object
 * @param config Optional server config to use for mapping
 * @returns Headers converted to environment variable format
 */
function headersToEnvVars(
  headers: http.IncomingHttpHeaders,
  config?: ServerConfig
): Record<string, string | string[]> {
  const verbose = SettingsManager.globalDebugState;

  if (verbose) {
    console.error('[headersToEnvVars] Verbose: Converting headers to env vars');
    console.error('[headersToEnvVars] Verbose: Input headers count:', Object.keys(headers).length);
    console.error('[headersToEnvVars] Verbose: Input header keys:', Object.keys(headers));

    // Early check - if headers is empty
    if (!headers || Object.keys(headers).length === 0) {
      console.error('[headersToEnvVars] Verbose: WARNING - Headers object is empty');
    }
  }

  if (!headers || Object.keys(headers).length === 0) {
    return {};
  }

  const result: Record<string, string | string[]> = {};

  // First, convert all headers to uppercase with underscores
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      // Convert header names to environment variable format (UPPER_CASE)
      const envName = name.toUpperCase().replace(/-/g, '_');
      result[envName] = value;
      if (verbose) {
        console.error(`[headersToEnvVars] Verbose: Basic mapping: "${name}" -> "${envName}"`);
      }
    }
  }

  if (verbose) {
    console.error('[headersToEnvVars] Verbose: After basic mapping, result keys:', Object.keys(result));
  }

  // If we have a config, try to map header values to the environment variables defined in the config
  if (config && config.options) {
    if (verbose) {
      console.error('[headersToEnvVars] Verbose: Config provided, building header-to-env mapping');
    }
    // Create a map of lowercase header name -> env var name
    const headerToEnvMap: Record<string, string> = {};

    // Build a mapping from header keys to environment variable names based on config
    for (const option of config.options) {
      if (option.env) {
        // Create mappings for different formats of the same option
        const flagName = option.flag
          .split(' ')[0]                   // Extract just the flag part (e.g., --api-key from --api-key <key>)
          .replace(/^--?/, '')             // Remove leading -- or -
          .replace(/-/g, '_');             // Convert dashes to underscores

        headerToEnvMap[flagName.toLowerCase()] = option.env;
        if (verbose) {
          console.error(`[headersToEnvVars] Verbose: Mapping: "${flagName.toLowerCase()}" -> "${option.env}"`);
        }

        // Also map the env name to itself (in case header is already in env var format)
        headerToEnvMap[option.env.toLowerCase()] = option.env;
      }
    }

    if (verbose) {
      console.error('[headersToEnvVars] Verbose: headerToEnvMap:', headerToEnvMap);
    }

    // Look for headers that match our config options
    let mappedCount = 0;
    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (headerValue !== undefined) {
        const normalizedHeaderName = headerName.toLowerCase().replace(/-/g, '_');
        const envVarName = headerToEnvMap[normalizedHeaderName];

        if (envVarName) {
          // We found a matching environment variable in the config
          result[envVarName] = headerValue;
          mappedCount++;
          if (verbose) {
            console.error(`[headersToEnvVars] Verbose: Config mapping: "${headerName}" -> "${envVarName}"`);
          }
        }
      }
    }

    if (verbose) {
      console.error(`[headersToEnvVars] Verbose: Mapped ${mappedCount} headers using config`);
    }
  } else if (verbose) {
    console.error('[headersToEnvVars] Verbose: No config provided, skipping config-based mapping');
  }

  if (verbose) {
    console.error('[headersToEnvVars] Verbose: Final result keys:', Object.keys(result));
    console.error('[headersToEnvVars] Verbose: Final result (sanitized):',
      Object.fromEntries(
        Object.entries(result).map(([k, v]) =>
          [k, (k.toLowerCase().includes('key') || k.toLowerCase().includes('token') || k.toLowerCase().includes('password')) ? '***' : v]
        )
      )
    );
  }

  return result;
}
