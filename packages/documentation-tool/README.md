# Check Point Documentation Tool MCP

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Check Point Documentation Tool?
 
The Check Point Documentation Tool provides seamless access to Check Point Documentation Tool services through the Model Context Protocol. It enables AI assistants to interact with Check Point Documentation Tool, making it easier to get accurate answers about Check Point products, configurations, and best practices.

## Use with other MCPs for Best Results
While the Documentation Tool works well on its own for documentation queries, it is designed to be used alongside other Check Point MCP servers (found in this repo) to provide comprehensive context about your security environment and correlate documentation with live system data.

## Features

- Access to Check Point Documentation Tool services and knowledge base
- Search functionality for finding relevant documentation through Documentation Tool
- Real-time retrieval of Check Point product information via Documentation Tool
- Integration with AI assistants for contextual help and guidance

## Example Use Cases

### Documentation Lookup
"Find documentation about Check Point firewall rule configuration."  
*→ Searches and returns relevant Check Point documentation about firewall rule setup and configuration best practices through Documentation Tool.*

### Product Information
"What are the system requirements for Check Point R81.20?"  
*→ Retrieves specific product documentation with system requirements and compatibility information.*

### Troubleshooting Guidance
"How do I troubleshoot VPN connectivity issues in Check Point?"  
*→ Returns step-by-step troubleshooting guides and diagnostic procedures from Check Point documentation.*
  
---

### ⚠️ Performance Notice
This server accesses Check Point documentation resources and may have rate limits. For best performance, use specific queries rather than broad searches.
---

## Configuration Options

This server supports configuration via command-line arguments or environment variables:

### API Configuration

The Check Point Documentation Tool MCP server requires authentication credentials for accessing Check Point Documentation Tool services.

#### Acquiring Credentials

To obtain the required API credentials:

1. **Login to Infinity Portal**: Navigate to your Check Point Infinity Portal
2. **Access API Keys**: Go to the "API Keys" menu
3. **Create New Key**: Click "New" → "New User API Key"
4. **Save Credentials**: Copy the generated `CLIENT_ID` and `SECRET_KEY`

#### Environment Variables

Set the following environment variables:

- `CLIENT_ID`: Client ID for authentication with Check Point Documentation Tool (required)
- `SECRET_KEY`: Secret Key for authentication with Check Point Documentation Tool (required)
- `REGION`: Documentation Tool region - EU, US, STG, or Local (default: EU)
  
---

### On-Prem Example Configuration

For on-premises Check Point Documentation Tool deployment:

Set the following environment variables:

- `CLIENT_ID`: Your client ID for Documentation Tool authentication
- `SECRET_KEY`: Your secret key for Documentation Tool authentication
- `REGION`: Set to "Local" for on-premises deployment
  
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
    "checkpoint-documentation-tool": {
      "command": "npx",
      "args": ["@chkp/documentation-mcp"],
      "env": {
        "CLIENT_ID": "YOUR_CLIENT_ID",
        "SECRET_KEY": "YOUR_SECRET_KEY",
        "REGION": "EU"
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
    "checkpoint-documentation-tool": {
      "command": "npx",
      "args": ["@chkp/documentation-mcp"],
      "env": {
        "CLIENT_ID": "YOUR_CLIENT_ID",
        "SECRET_KEY": "YOUR_SECRET_KEY",
        "REGION": "EU"
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
      "checkpoint-documentation-tool": {
        "command": "npx",
        "args": [
          "@chkp/documentation-mcp"
        ],
        "env": {
          "CLIENT_ID": "YOUR_CLIENT_ID",
          "SECRET_KEY": "YOUR_SECRET_KEY",
          "REGION": "EU"
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
node FULL_PATH_TO_SERVER/packages/copilot/dist/index.js --client-id "YOUR_CLIENT_ID" --secret-key "YOUR_SECRET_KEY" --region "EU"
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point management system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Management data is exposed to the model.** Ensure that you only use models and providers that comply with your organization’s policies for handling sensitive data and PII.