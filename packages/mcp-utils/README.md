# @chkp/mcp-utils

Shared utilities for Check Point MCP servers.

## Features

### Configuration-Driven MCP Server Launcher

The `launchMCPServer` function provides a configuration-driven approach to launching MCP servers, eliminating boilerplate code and making CLI options maintainable through JSON configuration files.

## Usage

### 1. Create a Server Configuration File

Create a `server-config.json` file in your server package:

```json
{
  "name": "My MCP Server",
  "description": "Description of my MCP server",
  "options": [
    {
      "flag": "--api-key <key>",
      "description": "API key for authentication",
      "env": "API_KEY",
      "type": "string"
    },
    {
      "flag": "--host <host>",
      "description": "Server host",
      "env": "SERVER_HOST",
      "default": "localhost",
      "type": "string"
    },
    {
      "flag": "--verbose",
      "description": "Enable verbose output",
      "env": "VERBOSE",
      "type": "boolean"
    }
  ]
}
```

### 2. Update Your Server's Main Function

Replace your manual CLI setup with the launcher:

```typescript
import { launchMCPServer } from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Your existing server, Settings, and pkg imports...

const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    { server, Settings, pkg }
  );
};

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
```

### 3. Add Dependency

Add `@chkp/mcp-utils` to your package.json:

```json
{
  "dependencies": {
    "@chkp/mcp-utils": "*"
  }
}
```

## Configuration Schema

### ServerConfig

- `name` (string): Display name for the server
- `description` (string, optional): Description shown in help text
- `options` (CliOption[]): Array of CLI options

### CliOption

- `flag` (string): Commander.js-style flag definition (e.g., `--api-key <key>`, `--verbose`)
- `description` (string): Help text for the option
- `env` (string, optional): Environment variable name to read default from
- `default` (string, optional): Default value if not provided via CLI or env
- `type` ('string' | 'boolean', optional): Option type (defaults to 'string')

## HTTP Transport

By default, servers launched with `launchMCPServer` use **stdio** transport, which is the standard mode for MCP clients like Claude Desktop and Cursor. For hosted or multi-user deployments, an **HTTP transport** (MCP Streamable HTTP) is also available.

> **Security notice before you continue:** The HTTP server has no built-in authentication and no TLS. Any client that can reach the port can establish a session, and credentials travel in cleartext. Only use HTTP transport behind an authenticated reverse proxy (nginx, Caddy, a cloud load balancer) that terminates TLS and enforces authentication. If you are running the server on the same machine as your MCP client, use the default stdio transport — it has none of these concerns.

### Starting the server in HTTP mode

```bash
MCP_TRANSPORT_TYPE=http MCP_TRANSPORT_PORT=3000 my-mcp-server
# or
my-mcp-server --transport http --transport-port 3000
```

The server exposes:
- `POST/GET/DELETE /mcp` — MCP protocol endpoint
- `GET /health` — server status (active session count, version)

HTTP request bodies are limited to **4 MiB** by default. Set
`MCP_MAX_HTTP_BODY_BYTES` to a positive integer to change the limit (for example,
`8388608` for 8 MiB). Requests exceeding it receive HTTP `413`, including requests
sent with chunked transfer encoding. The limit is enforced while reading, before
JSON parsing or session creation.
An empty value uses the default; other invalid values fail HTTP startup. To let
clients receive the rejection while uploading, the server discards up to four
times the body limit (at most 32 MiB) or waits at most one second before closing
the rejected connection.

For both stdio and HTTP, request parameters are checked before tool-schema
validation: arrays and objects may contain at most **10,000** items/properties,
with at most **100,000** values and **64** nesting levels across the parameters.
Oversized calls to registered, enabled tools return `isError: true` with
`VALIDATION_ERROR` and record a failed telemetry event when telemetry is enabled,
without executing the tool. Unknown or disabled tools retain the SDK's usual
rejection without logging or reporting their requested names through this guard.
Other request methods receive a protocol-level invalid-parameters error.
These shared limits also cover generated tools and nested collections; individual
tool schemas may impose smaller limits.

### Connecting an MCP client

Point your MCP client at `http://<host>:3000/mcp`. Example for Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-server": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Error Reporting

One rule, and `CPMcpServer` enforces it for you:

> A failure must either be **thrown**, or already be a correctly-shaped `isError`
> result. Never return a failure as a plain value.

**You do not need to write error handling for your tools to be correct.** Every
tool is wrapped, whether you register it with `registerTool()` or the older
`tool()`. Anything you throw — an HTTP failure, a missing file, a SQLite error,
a failed subprocess, a Zod validation error, a plain `Error` — is converted into
a spec-compliant result with `isError: true` and a stable `error_code`, and
reported to telemetry as a failure. Prompts and resources are wrapped the same
way, through either method name. A handler that simply lets errors propagate is
doing the right thing:

```ts
server.tool('my_tool', 'does a thing', { id: z.string() }, async (args, extra) => {
  const resp = await runApi('POST', 'show-thing', { uid: args.id }, extra);
  return { content: [{ type: 'text', text: JSON.stringify(resp) }] };
});
```

Do **not** write this — it makes a failed call look successful, which is exactly
what the wrapper exists to prevent:

```ts
// ANTI-PATTERN: no isError, so callers and telemetry both see a success.
try {
  ...
} catch (error) {
  return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
}
```

### Opting in to a better message or code

Catch only when you can add something the classifier cannot infer — the
operation's context, or a more specific code:

```ts
import { McpErrorCode, toolError, toolErrorFrom, McpToolError } from '@chkp/mcp-utils';

// Keep your context, and get a classified code for free.
catch (error) {
  return toolErrorFrom(error, 'Failed to parse rulebase');
}

// Or state the code yourself, with extra context for programmatic callers.
return toolError(McpErrorCode.OPERATION_FAILED, `Simulation failed: ${detail}`, {
  retryable: false,
  details: { task },
});

// From a client or helper, throw so every caller benefits.
throw new McpToolError(McpErrorCode.AUTH_FAILED, 'API key rejected', {
  upstreamStatus: 401,
});
```

### Error codes

`AUTH_FAILED`, `PERMISSION_DENIED`, `NOT_FOUND`, `VALIDATION_ERROR`,
`RATE_LIMITED`, `TIMEOUT`, `UPSTREAM_UNREACHABLE`, `UPSTREAM_ERROR`,
`RESOURCE_UNAVAILABLE`, `OPERATION_FAILED`, `INTERNAL`.

Codes are cause-agnostic on purpose: they describe what went wrong for the
caller, not which subsystem produced it. An error result looks like this:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "NOT_FOUND: Could not reach your Management" }],
  "structuredContent": {
    "error_code": "NOT_FOUND",
    "error_message": "Could not reach your Management",
    "upstream_status": 404,
    "retryable": false
  }
}
```

### Spotting unflagged failures

Run a server with `CP_MCP_STRICT_ERRORS=true` to log a warning whenever a tool
returns a result that is not flagged as an error but looks like one. It is a
heuristic and never changes behaviour — it just points at handlers worth a
second look during development.

## Benefits

- **Consistent Error Reporting**: Tool failures are flagged and coded centrally, without per-package work
- **Zero Boilerplate**: Reduces main function from ~15 lines to ~5 lines
- **Configuration-Driven**: All CLI options in maintainable JSON files  
- **Environment Variable Support**: Automatic mapping of env vars to options
- **Type Safety**: TypeScript interfaces for all configuration
- **Consistent Help**: Automatic help text generation
- **Easy Maintenance**: Change options without touching code

## Migration Example

**Before:**
```typescript
const main = async () => {
  const program = new Command();
  program
    .option('--api-key <key>', 'API key')
    .option('--host <host>', 'Server host', process.env.SERVER_HOST || 'localhost')
    .option('--verbose', 'Enable verbose output', process.env.VERBOSE === 'true');
  program.parse(process.argv);
  const options = program.opts();
  Settings.setSettings(Settings.fromArgs(options));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Server running...');
};
```

**After:**
```typescript
const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    { server, Settings, pkg }
  );
};
```
