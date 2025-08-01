# Check Point Threat Prevent

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Security?
 
Security Policies often span hundreds of rules and thousands of objects across diverse enforcement points. Understanding, auditing, or optimizing these environments is slow and error-prone. 
MCP changes this: exposing security management data in a modular, context-rich format, ready for AI systems to consume. Enabling the AI to use your data with precision. Ask real-world questions, and get structured, actionable answers—instantly.

## Features

- **Threat Protection Management**: Query and analyze threat protections, profiles, and indicators
- **IPS (Intrusion Prevention System) Monitoring**: Check IPS status, update schedules, and protection attributes  
- **IOC Feed Management**: View and analyze threat intelligence feeds and indicators of compromise

## Demo

[![Watch the demo](https://img.youtube.com/vi/QKBcD_99W3s/0.jpg)](https://www.youtube.com/watch?v=QKBcD_99W3s)

## Example Use Cases

### Threat Protection Analysis
"Show me all high-severity threat protections currently active on my network"  
*→ Analyzes threat protection configurations and provides detailed security coverage insights.*

### CVE Vulnerability Assessment
"Check if CVE-2024-1234 is protected across all my gateways"  
*→ Performs comprehensive CVE protection analysis across gateway policies and threat profiles.*

### IPS Health Monitoring
"What's the current IPS status and when was the last signature update scheduled?"  
*→ Provides real-time IPS blade status, update schedules, and protection database information.*

### Threat Intelligence Review
"List all active IOC feeds and show indicators for ransomware threats"  
*→ Displays threat intelligence feeds, indicators of compromise, and their operational status.*

### Exception Analysis & Security Gaps
"Show all threat rule exceptions and identify potential bypass vulnerabilities"  
*→ Reviews exception groups and rules to highlight areas where threats might evade protection.*

### Gateway Security Posture Assessment
"Which gateways have threat prevention enabled and what protection profiles are active?"  
*→ Comprehensive view of gateway threat prevention configurations and policy assignments.*

### Threat Rulebase Optimization
"Analyze my threat prevention rules and suggest improvements for better coverage"  
*→ Examines threat layers, rules, and profiles to recommend security enhancements.*
  
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
node -v      # Should print "v18" or higher
nvm current  # Should print "v18" or higher
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
    "threat-prevention": {
      "command": "npx",
      "args": ["@chkp/threat-prevention-mcp"],
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
    "threat-prevention": {
      "command": "npx",
      "args": ["@chkp/threat-prevention-mcp"],
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
    "threat-prevention": {
      "command": "npx",
      "args": ["@chkp/threat-prevention-mcp"],
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
      "threat-prevention": {
        "command": "npx",
        "args": [
          "@chkp/threat-prevention-mcp"
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

- Node.js 18+  
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
node FULL_PATH_TO_SERVER/packages/threat-prevention/dist/index.js --s1c-url|--management-host --api-key|--username|--password
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point management system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Management data is exposed to the model.** Ensure that you only use models and providers that comply with your organization’s policies for handling sensitive data and PII.
