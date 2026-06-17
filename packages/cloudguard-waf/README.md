# Check Point CloudGuard WAF MCP

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for CloudGuard WAF?

The CloudGuard WAF MCP server provides AI-powered access to your Check Point WAF environment. It enables natural language interactions for querying WAF status, managing policies, and automating security operations through any MCP-compatible AI assistant.

## Use with other MCPs for Best Results

While CloudGuard WAF MCP works well on its own, it is designed to be used alongside other Check Point MCP servers (found in this repo) for comprehensive security management across your entire Check Point infrastructure.

## Features

- **Publish and enforce** configuration changes with safety confirmations
- Execute any GraphQL query/mutation against CloudGuard WAF API
- View WAF configuration settings
- Full GraphQL API integration with Check Point CloudGuard

## Example Use Cases

### Query Assets
"Show me all the WAF assets."  
*→ Executes GraphQL query to retrieve all assets with their details.*

### Query Practices
"List all security practices."  
*→ Executes GraphQL query to retrieve all practices and their configurations.*

### Publish and Enforce Changes
"I've made configuration changes. Please publish and enforce them."  
*→ Validates, publishes, and enforces pending configuration changes with explicit user confirmation.*

> **⚠️ Critical Operation:** The publish and enforce operation makes permanent changes to your security configuration. The tool requires explicit confirmation before proceeding.

---

### ⚠️ Performance Notice
This MCP server makes API calls to your CloudGuard WAF instance. Response times depend on your WAF deployment and network connectivity.

---

## Configuration Options

This server supports configuration via command-line arguments or environment variables:

### Required Configuration

- `WAF_CLIENT_ID`: CloudGuard WAF client ID for authentication
- `WAF_ACCESS_KEY`: CloudGuard WAF access key for authentication

To obtain these credentials, log in to the [Check Point Infinity Portal](https://portal.checkpoint.com), navigate to **CloudGuard WAF > Settings > API Keys**, and create a new API key. The `WAF_REGION` setting must match the region of your Infinity Portal account.

### Optional Configuration

- `WAF_REGION`: CloudGuard WAF region (default: `EU`)
  - `EU` - Europe (cloudinfra-gw.portal.checkpoint.com)
  - `US` - United States (cloudinfra-gw-us.portal.checkpoint.com)
  - `AU` - Australia/Asia Pacific (cloudinfra-gw.ap.portal.checkpoint.com)
  - `IN` - India (cloudinfra-gw.in.portal.checkpoint.com)
  - `AE` - United Arab Emirates (cloudinfra-gw.ae.portal.checkpoint.com)
  - `CA` - Canada (cloudinfra-gw.ca.portal.checkpoint.com)
  - `DEV` - Development (dev-cloudinfra-gw.kube1.iaas.checkpoint.com)

- `WAF_ALLOW_WRITES`: Enable write operations (default: unset = read-only). Set to `true` to expose `manage_objects` and `publish_and_enforce` and allow GraphQL mutations via `call_waf_api`. Equivalent to passing `--allow-writes` on the command line.

---

## Client Configuration

### Prerequisites

Download and install the latest version of [Node.js](https://nodejs.org/en/download/) if you don't already have it installed.  
You can check your installed version by running:

```bash
node -v      # Should print "v20" or higher
nvm current  # Should print "v20" or higher
```

### Supported Clients

This server has been tested with Claude Desktop, Cursor, GitHub Copilot, and Windsurf clients.  
It is expected to work with any MCP client that supports the Model Context Protocol.

### Basic Configuration Example

```json
{
  "mcpServers": {
    "cloudguard-waf": {
      "command": "npx",
      "args": ["@chkp/cloudguard-waf-mcp"],
      "env": {
        "WAF_CLIENT_ID": "your-client-id",
        "WAF_ACCESS_KEY": "your-access-key",
        "WAF_REGION": "EU"
      }
    }
  }
}
```

### Configuring the Claude Desktop App

#### For macOS:

```bash
# Create the config file if it doesn't exist
touch "$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# Open the config file in TextEdit
open -e "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

#### For Windows:

```cmd
code %APPDATA%\Claude\claude_desktop_config.json
```

Add the server configuration:

```json
{
  "mcpServers": {
    "cloudguard-waf": {
      "command": "npx",
      "args": ["@chkp/cloudguard-waf-mcp"],
      "env": {
        "WAF_CLIENT_ID": "your-client-id",
        "WAF_ACCESS_KEY": "your-access-key",
        "WAF_REGION": "EU"
      }
    }
  }
}
```

### VSCode 

Enter VSCode settings and type "mcp" in the search bar.
You should see the option to edit the configuration file.
Add this configuration:

```json
{
  "mcp": {
    "inputs": [],
    "servers": {
      "cloudguard-waf": {
        "command": "npx",
        "args": [
          "@chkp/cloudguard-waf-mcp"
        ],
        "env": {
          "WAF_CLIENT_ID": "your-client-id",
          "WAF_ACCESS_KEY": "your-access-key",
          "WAF_REGION": "EU"
        }
      }
    }
  }
}
```

### Windsurf

Enter Windsurf settings and type "mcp" in the search bar.
You should see the option to edit the configuration file.
Add the configuration as Claude Desktop App.

### Cursor

Enter Cursor settings and click on "MCP Servers" in the left menu.
You should see the option to add a new MCP Server.
Add the configuration as Claude Desktop App.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_objects` | Unified retrieval of WAF objects — assets, practices, profiles, zones, agents, behaviors, triggers |
| `manage_objects` | Create, update, and delete WAF objects with subtype-specific validation |
| `call_waf_api` | Execute any GraphQL query/mutation against CloudGuard WAF API |
| `get_enforcement_status` | Get the current session status including publish state and pending changes |
| `publish_and_enforce` | **⚠️ CRITICAL** Publish and enforce pending configuration changes |
| `waf_consultant` | Best-practice recommendations grounded in official CloudGuard WAF documentation |

### GraphQL API Access

The `call_waf_api` tool allows you to execute any GraphQL query or mutation against the CloudGuard WAF API. Example queries:

```graphql
# Get all assets
{ getAssets { status assets { id name assetType objectStatus } } }

# Get all practices
{ getPractices { id name practiceType category } }

# Get all profiles
{ getProfiles { id name profileType } }

# Get all zones
{ getZones { status zones { id name objectStatus } } }
```

### Session Status

The `get_enforcement_status` tool retrieves information about the current configuration session:

- **Session ID**: Unique identifier for the session
- **Publish State**: Current state (Active, InProgress, Discarded, Published, Publishing)
- **Number of Changes**: Count of pending changes that haven't been published
- **Session Description**: Optional description of the session
- **Is Owned**: Whether you own this session
- **Is Active**: Whether this is the active session

Example usage:
```json
{
  "sessionId": "optional-session-id"
}
```

If `sessionId` is not provided, it returns the current active session status.

### Critical Operations

The `publish_and_enforce` tool is a destructive operation that makes permanent changes to your security configuration. It:

1. **Validates** all pending configuration changes
2. **Publishes** the changes if validation passes
3. **Enforces** the published policy to active enforcement points

**Important:** This tool requires explicit confirmation (`confirmPublishAndEnforce: true`) before executing. The AI assistant should NEVER call this tool automatically — it should only be invoked when the user explicitly asks to publish, deploy, activate, or enforce changes.

#### About `destructiveHint`

The server marks `publish_and_enforce` with `destructiveHint: true` per the MCP specification. This is a signal to MCP clients that the tool makes irreversible changes — well-behaved clients may display a warning or confirmation dialog before the tool runs.

**However, `destructiveHint` is a hint, not a hard gate.** Two important limitations:

- **Client support varies** — there is no spec-mandated blocking behavior, so some clients may ignore the hint entirely.
- **Agentic pipelines can bypass it** — the hint does not suspend execution and hand control to a human. An automated pipeline can still call the tool without any human ever seeing a confirmation prompt.

The server-side protection is the `confirmPublishAndEnforce: true` parameter, which the tool enforces itself regardless of client behavior. Future versions may use MCP elicitation to provide a spec-level human-in-the-loop gate once client support is broad enough.

---

## HTTP Transport

By default, this server uses **stdio** transport, which is the standard mode for MCP clients like Claude Desktop and Cursor. For hosted or multi-user deployments, an **HTTP transport** (MCP Streamable HTTP) is also available.

> **Security notice before you continue:** The HTTP server has no built-in authentication and no TLS. Any client that can reach the port can establish a session, and credentials travel in cleartext. Only use HTTP transport behind an authenticated reverse proxy (nginx, Caddy, a cloud load balancer) that terminates TLS and enforces authentication. If you are running the server on the same machine as your MCP client, use the default stdio transport — it has none of these concerns.

### Starting the server in HTTP mode

```bash
MCP_TRANSPORT_TYPE=http MCP_TRANSPORT_PORT=3000 npx @chkp/cloudguard-waf-mcp
# or
npx @chkp/cloudguard-waf-mcp --transport http --transport-port 3000
```

The server exposes:
- `POST/GET/DELETE /mcp` — MCP protocol endpoint
- `GET /health` — server status (active session count, version)

### Connecting an MCP client

Point your MCP client at `http://<host>:3000/mcp`. Example for Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cloudguard-waf": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## Development

### Prerequisites

- Node.js 20+  
- npm 10+  

### Setup

```bash
# Install all dependencies
npm install
```

### Build

```bash
# Build all packages
npm run build
```

### Running Locally

You can run the server locally for development using [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) or any compatible MCP client.

```bash
node FULL_PATH_TO_SERVER/packages/cloudguard-waf/dist/index.js --client-id "your-client-id" --access-key "your-access-key" --region "EU"
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your CloudGuard WAF instance.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **WAF data is exposed to the model.** Ensure that you only use models and providers that comply with your organization's policies for handling sensitive data and PII.
