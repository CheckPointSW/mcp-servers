# Check Point Quantum Gaia MCP Server

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your network environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Network Management?
 
Network configurations often span hundreds of interfaces, routing protocols, and security policies across diverse network devices. Understanding, monitoring, or optimizing these environments is slow and error-prone. 
MCP changes this: exposing network management data in a modular, context-rich format, ready for AI systems to consume. Enabling the AI to use your data with precision. Ask real-world questions, and get structured, actionable answers—instantly.

## Features

- Query and visualize network management data such as: DHCP, DNS, NTP,
- Retrieve and analyze networking configurations including BGP, OSPF, IS-IS, PBR, route filters and more.
- List and inspect interfaces

## Example Use Cases

### Network Health Monitoring
"Show me the status of all BGP peers and identify any that are down."  
*→ Returns comprehensive BGP peer status with connection states.*

### Route Policy Auditing
"List all PBR rules and show which traffic they're affecting."  
*→ Surfaces policy-based routing configurations and priorities.*

### Network Troubleshooting
"Check if IPv6 is enabled and show all IS-IS neighbors."  
*→ Traces network protocol status and adjacency information.*

### Interface Management
"Show all network interfaces organized by type and their operational status."  
*→ Delivers structured interface data for topology analysis.*

### Configuration Validation
"Verify DNS and NTP settings across all cluster members."  
*→ Returns network service configurations for validation.*

---

## Authentication

This server uses **interactive dialog-based authentication** for connecting to Check Point Gaia systems:

### How Authentication Works

1. **Interactive Prompts**: When you first use a tool, the server will prompt you for connection details
2. **Credential Caching**: Authentication credentials are securely cached for **15 minutes** per gateway session
3. **Touch-Based Renewal**: Each successful API call extends the cache timeout, keeping active sessions alive
4. **Per-Gateway Sessions**: Each gateway maintains its own independent authentication session
5. **Automatic Re-authentication**: When credentials expire, you'll be prompted again seamlessly

### Connection Parameters

All tools require gateway connection details:
- **gateway_ip**: IP address of the Gaia gateway  
- **port**: Gateway port (default: 443)

If not explicitly provided, the server will use the most recently used gateway connection details from your session.

### Example Authentication Flow

```
User: "Show me BGP summary"
Server: "Please enter gateway IP address (and optional port): "
User: "192.168.1.1"
Server: "Please enter username: "
User: "admin"
Server: "Please enter password: "
User: [password]
Server: [Returns BGP summary data]

# Subsequent calls within 15 minutes use cached credentials
User: "Show BGP peers"
Server: [Returns BGP peers data immediately]
```
  
---

## Configuration Options

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

> **Note:** Due to the nature of network management API calls and the variety of server tools, using this server may require a paid subscription to the model provider to support token limits and context window sizes.  
> For smaller models, you can reduce token usage by limiting the number of enabled tools in the client.

### Basic Configuration

```json
{
  "mcpServers": {
    "quantum-gaia": {
      "command": "npx",
      "args": ["@chkp/quantum-gaia-mcp"]
    }
  }
}
```

### Configuring the Claude Desktop App

#### Using a Bundled MCPB (formerly DXT)
1. Download the MCPB file: **[📥 gaia.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/gaia.mcpb)**
2. Open Claude Desktop App → Settings → Extensions
3. Drag the MCPB file and configure per the instructions.

#### Or Configure Manually

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
    "quantum-gaia": {
      "command": "npx",
      "args": ["@chkp/quantum-gaia-mcp"]
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
  ...
  "mcp": {
    "inputs": [],
    "servers": {
      "quantum-gaia": {
        "command": "npx",
        "args": [
          "@chkp/quantum-gaia-mcp"
        ]
      }
    }
  },
  ...
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
node FULL_PATH_TO_SERVER/packages/gaia/dist/index.js
```

---

## ⚠️ Security Notice

1. **Authentication credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point Gaia systems and are cached locally for 15 minutes per session.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Network management data is exposed to the model.** Ensure that you only use models and providers that comply with your organization's policies for handling sensitive network configuration data.
4. **Secure your MCP client.** The interactive authentication dialog will prompt for credentials through your MCP client interface - ensure your client environment is secure.