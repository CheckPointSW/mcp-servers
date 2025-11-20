# Check Point Quantum Gateway MCP Server

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Gateway CLI?
 
Gateway configurations often span hundreds of routes, middleware chains, and policy rules across diverse API endpoints. Traditional CLI tools are cryptic, verbose, and hard to interpret—making understanding, monitoring, or optimizing these environments slow and error-prone.
MCP changes this: exposing gateway management data in a modular, context-rich format, ready for AI systems to consume. No more deciphering complex command outputs or wrestling with arcane syntax. Enabling the AI to use your gateway data with precision. Ask real-world questions about traffic patterns, route configurations, and performance metrics—and get structured, actionable answers—instantly.

## Features

- Hardware & System Diagnostics: Query DMI decode information, asset details, and comprehensive system information
- Network Configuration Analysis: Retrieve and analyze interface configurations, VLAN setups, and routing tables
- High Availability Monitoring: Inspect cluster status, interface synchronization, and HA failover states
- Performance & Security Analytics: Analyze SecureXL statistics, firewall modules, and connection acceleration metrics
- Real-time Connection Debugging: Start and stop live connection analysis for traffic troubleshooting and diagnostics

## Demo

[![Watch the demo](https://img.youtube.com/vi/-DuLzDJK9Yo/0.jpg)](https://www.youtube.com/watch?v=-DuLzDJK9Yo)

## Example Use Cases

### Gateway Health Assessment
"Create an interactive executive report for my gateway cluster? Check hardware, licenses, and HA synchronization."
*→ Returns comprehensive health data across hardware diagnostics, licensing status, and cluster state.*

### Network Connectivity Troubleshooting
"Why can't traffic reach 192.168.1.10? Debug the connection path and interface status."
*→ Traces connection flows, analyzes routing tables, and identifies interface misconfigurations.*

### Performance Bottleneck Analysis
"Show SecureXL acceleration stats and identify which connections are consuming resources."
*→ Surfaces acceleration metrics, connection tables, and kernel-level performance indicators.*

### Interface Configuration Audit
"Create a toplogy schema for all interface configurations, ip routes and VLAN setups across my gateways."
*→ Delivers structured network topology data showing interface states and routing information.*

### On-the-fly Network Dashboard
"Create an iteractive visualization of currect connections according to protocol."
*→ Provides a dynamic report that shows network statistics in your perfered method on visualization.*
---

## Configuration Options

This server supports two main modes of authentication:

### 1. Smart-1 Cloud (API Key)

Authenticate to Check Point Smart-1 Cloud using an API key.

- **How to generate an API key:**  
  In your Smart-1 Cloud dashboard, go to **Settings → API & SmartConsole** and generate an API key.  
  Copy the key and the server login URL (excluding the `/login` suffix) to your client settings.  
  ![alt text](./../../resources/s1c_api_key.png)

Set the following environment variables:

- `API_KEY`: Your Smart-1 Cloud API key  
- `S1C_URL`: Your Smart-1 Cloud tenant "Web-API" URL  
  
---

### 2. On-Prem Management (API Key or Username/Password)

- **Configure your management server to allow API access:**  
  To use this server with an on-premises Check Point management server, you must first enable API access.  
  Follow the official instructions for [Managing Security through API](https://sc1.checkpoint.com/documents/R82/WebAdminGuides/EN/CP_R82_SmartProvisioning_AdminGuide/Content/Topics-SPROVG/Managing-Security-through-API.htm).

- **Authenticate to the Security Management Server** using either an API key or username/password:  
  - Follow the official instructions: [Managing Administrator Accounts (Check Point R81+)](https://sc1.checkpoint.com/documents/R81/WebAdminGuides/EN/CP_R81_SecurityManagement_AdminGuide/Topics-SECMG/Managing_Administrator_Accounts.htm)  
  - When creating the administrator, assign appropriate permissions for API access and management operations.  
  - You can authenticate using an API key (recommended for automation) or username/password credentials.

Set the following environment variables:

- `MANAGEMENT_HOST`: IP address or hostname of your management server  
- `PORT`: (Optional) Management server port (default: 443)  
- `API_KEY`: Your management API key (if using API key authentication)  
- `USERNAME`: Username for authentication (if using username/password authentication)  
- `PASSWORD`: Password for authentication (if using username/password authentication)  
  
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

> **Note:** Due to the nature of management API calls and the variety of server tools, using this server may require a paid subscription to the model provider to support token limits and context window sizes.  
> For smaller models, you can reduce token usage by limiting the number of enabled tools in the client.

### Smart-1 Cloud Example

```json
{
  "mcpServers": {
    "quantum-gw-cli": {
      "command": "npx",
      "args": ["@chkp/quantum-gw-cli-mcp"],
      "env": {
        "API_KEY": "YOUR_API_KEY",
        "S1C_URL": "YOUR_S1C_URL" // e.g., https://xxxxxxxx.maas.checkpoint.com/yyyyyyy/web_api
      }
    }
  }
}
```

### On-Prem Management Example

```json
{
  "mcpServers": {
    "quantum-gw-cli": {
      "command": "npx",
      "args": ["@chkp/quantum-gw-cli-mcp"],
      "env": {
        "MANAGEMENT_HOST": "YOUR_MANAGEMENT_IP_OR_HOST_NAME",
        "MANAGEMENT_PORT": "443", // optional, default is 443
        "API_KEY": "YOUR_API_KEY", // or use USERNAME and PASSWORD
        "USERNAME": "YOUR_USERNAME", // optional
        "PASSWORD": "YOUR_PASSWORD"  // optional
      }
    }
  }
}
```

> Set only the environment variables required for your authentication method.

### Configuring the Claude Desktop App

#### Using a Bundled MCPB (formerly DXT)
1. Download the MCPB file: **[📥 gw-cli.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/gw-cli.mcpb)**
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
    "quantum-gw-cli": {
      "command": "npx",
      "args": ["@chkp/quantum-gw-cli-mcp"],
      "env": {
        // Add the configuration from the above instructions
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
  ...
  "mcp": {
    "inputs": [],
    "servers": {
      "quantum-gw-cli": {
        "command": "npx",
        "args": [
          "@chkp/quantum-gw-cli-mcp"
        ],
        "env": {
          "MANAGEMENT_HOST": "YOUR_MANAGEMENT_IP_OR_HOST_NAME",
          "MANAGEMENT_PORT": "443",  // optional, default is 443
          "API_KEY": "YOUR_API_KEY", // or use USERNAME and PASSWORD
          "USERNAME": "YOUR_USERNAME", // optional
          "PASSWORD": "YOUR_PASSWORD" // optional
        }
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
node FULL_PATH_TO_SERVER/packages/management/dist/index.js --s1c-url|--management-host --api-key|--username|--password
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point management system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Management data is exposed to the model.** Ensure that you only use models and providers that comply with your organization’s policies for handling sensitive data and PII.
