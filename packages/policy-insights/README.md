# Check Point Policy Insights MCP Server

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Security?

Security Policies often span hundreds of rules and thousands of objects across diverse enforcement points. Understanding, auditing, or optimizing these environments is slow and error-prone. 
MCP changes this: exposing security management data in a modular, context-rich format, ready for AI systems to consume. Enabling the AI to use your data with precision. Ask real-world questions, and get structured, actionable answers—instantly.

## Recommendation

For a better experience, we recommend using this MCP **along with** the [Quantum Management MCP](../management/README.md) (`@chkp/quantum-management-mcp`).

Together they give you the full picture: combine actual rule content with insights content in one place, search by layer/rule name (or other filters allowed by Quantum Management MCP) instead of IDs, view insights while seeing the object details instead of object IDs, and more.


## Features

- Provide information for the Policy Insights card in Infinity Cloud Services
- Check if Policy Insights is on and see product status and license info
- See how many insights you have per type on a layer, and when the last publish it was based on
- Find which rules have insights on a layer, including rules in inline layers
- Get insights content from specific layer / rule
- Filter insights with params like confidence, suggestion type, security impact
- Find insights you moved to decide later or declined in the past
- Get user configuration and settings for Policy Insights
- Get when new insights are planned to be generated
- Retrieve detailed information when you can't see insights


## Example Use Cases

### Finding Which Rules Have Insights
"Which rules have unused objects?" / "Which rules are too permissive and should be tightened?" / "Which disabled rules can be deleted?" / "Which rules have no hits and can be deleted?"
You can filter by specific security score, confidence

### Getting Insights Content for layer
"Show me the insights for layer ID a9182588-92dd-4e03-85b5-1dd360b63f69" / "Show me the insights for layer name (works only if you use @chkp/quantum-management-mcp)." 

### Getting Insights Content for rule
"Show me the insights for rule ID a9182588-92dd-4e03-85b5-1dd360b63f69" / "Show me the insights for rule [name/number], combine it with the actual rule content (works only if you use @chkp/quantum-management-mcp)."

### Summary
"How many insights do I have on layer id a9182588-92dd-4e03-85b5-1dd360b63f69?" / "How many insights do I have on layer [name] (works only if you use @chkp/quantum-management-mcp)?" / "Create a report of all the layers and the count of insights each in policy package [name] (works only if you use @chkp/quantum-management-mcp)"

### Getting insights with action made on them
"Show me how many (or which) insights are in decide later in layer ID a9182588-92dd-4e03-85b5-1dd360b63f69" / "Show me how many insights are in decide later for layer [name] (works only if you use @chkp/quantum-management-mcp)" / "Show many how many (or which) insights are declined in layer ID a9182588-92dd-4e03-85b5-1dd360b63f69"

### Scheduling
"When were the current insights created?" / "What publish timestamp are the current insights based on?" / "When is the next run planned to generate new insights?"

### Onboarding and Troubleshooting
"Why do I see no insights?" / "Has a Policy Insights suggestion been generated yet?" / "What if I only have low-confidence insights?"

### Licensing
"When does my Policy Insights license expire?" / "What's my policy insights status?"


---

## Configuration Options

> **📊 Anonymous Usage Statistics:** Check Point collects anonymous usage statistics to help improve this MCP server.  To opt out, set `TELEMETRY_DISABLED=true` or use `--no-telemetry` flag.

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
- `MANAGEMENT_PORT`: (Optional) Management server port (default: 443)  
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

> **Note:** Due to the nature of Policy Insights API calls and the variety of server tools, using this server may require a paid subscription to the model provider to support token limits and context window sizes.  
> For smaller models, you can reduce token usage by limiting the number of enabled tools in the client.

### Smart-1 Cloud Example

```json
{
  "mcpServers": {
    "policy-insights": {
      "command": "npx",
      "args": ["@chkp/policy-insights-mcp"],
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
    "policy-insights": {
      "command": "npx",
      "args": ["@chkp/policy-insights-mcp"],
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
1. Download the MCPB file: **[📥 policy-insights.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/policy-insights.mcpb)** (when available)
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
    "policy-insights": {
      "command": "npx",
      "args": ["@chkp/policy-insights-mcp"],
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
      "policy-insights": {
        "command": "npx",
        "args": [
          "@chkp/policy-insights-mcp"
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
node FULL_PATH_TO_SERVER/packages/policy-insights/build/index.js --s1c-url|--management-host --api-key|--username|--password
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point management system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Management data is exposed to the model.** Ensure that you only use models and providers that comply with your organization's policies for handling sensitive data and PII.

## 📊 Telemetry and Privacy

**Anonymous Usage Statistics:** Check Point collects anonymous usage statistics to improve this MCP server. Only tool usage patterns and anonymous identifiers are collected—no credentials, policies, or sensitive data.

**Opt-Out:** Set `TELEMETRY_DISABLED=true` environment variable or use the `--no-telemetry` flag to disable telemetry collection.

## Learn More

For more on onboarding and troubleshooting, see [Policy Insights - Onboarding and Troubleshooting](https://support.checkpoint.com/results/sk/sk183313).
