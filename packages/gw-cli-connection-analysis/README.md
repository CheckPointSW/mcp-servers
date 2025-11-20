# Check Point Quantum Gateway Connection Analysis MCP Server

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Gateway Connection Analysis?
 
Troubleshooting connection issues on Check Point gateways can be challenging and time-consuming. Traditional debugging methods require extensive CLI knowledge, manual log analysis, and complex packet captures.

This MCP server simplifies connection debugging by providing structured, context-rich data about connections flowing through your gateway. It enables AI systems to help you troubleshoot connectivity issues by starting a connection analysis session, analyzing the results, and providing actionable insights about what's happening with your traffic.

## Features

- Real-time Connection Analysis: Start and stop live connection debugging sessions
- Source and Destination Tracking: Track connections between specific IP addresses
- Comprehensive Connection Data: View packet path, security policy decisions, NAT rules applied, and more
- Interactive Troubleshooting: Start a session, reproduce an issue, then analyze the results

## How Connection Analysis Works

1. **Start the analysis**: Specify the source and destination IP addresses to monitor
2. **Reproduce the issue**: Generate the traffic that's experiencing problems
3. **Stop the analysis**: Capture the results and get a detailed report on what happened

## Demo

[![Watch the connection analysis demo](https://img.youtube.com/vi/-DuLzDJK9Yo/0.jpg)](https://www.youtube.com/watch?v=-DuLzDJK9Yo)
*Note: Update the video link above with your actual connection analysis demo video.*

## Example Use Cases

### Basic Connection Troubleshooting
"Why can't my client at 10.0.1.5 reach the server at 192.168.1.10? Let's debug the connection."
*→ Starts a connection analysis session, guides you through reproducing the issue, then explains where the traffic is being blocked or dropped.*

### NAT Verification
"Check if traffic from 10.1.1.100 to external server 203.0.113.50 is being properly NAT'ed."
*→ Analyzes the connection to show which NAT rules are applied and how the addresses are translated.*


### Connection Path Analysis
"Trace the exact path of packets from 10.0.2.15 to database server 10.0.3.25."
*→ Details each step of the packet journey through interfaces, security policies, and network functions.*
---

## ⚠️ Performance Notice
The Connection Analysis tool starts a debug session on your gateway for specific connections. It may have performance repercussions. Make sure to stop the session when you no longer need it.

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
    "quantum-gw-connection-analysis": {
      "command": "npx",
      "args": ["@chkp/quantum-gw-connection-analysis-mcp"],
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
    "quantum-gw-connection-analysis": {
      "command": "npx",
      "args": ["@chkp/quantum-gw-connection-analysis-mcp"],
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
1. Download the MCPB file: **[📥 gw-cli-connection-analysis.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/gw-cli-connection-analysis.mcpb)**
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
    "quantum-gw-connection-analysis": {
      "command": "npx",
      "args": ["@chkp/quantum-gw-connection-analysis-mcp"],
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
      "quantum-gw-connection-analysis": {
        "command": "npx",
        "args": [
          "@chkp/quantum-gw-connection-analysis-mcp"
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
