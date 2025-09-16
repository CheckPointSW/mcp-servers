# Check Point Reputation Service MCP Server

## Why MCP for Reputation Service
 
Enhance your security solutions using **Check Point’s threat intelligence** to protect your business applications and websites. Through MCP, resource risk assessments and classifications become accessible to AI systems, allowing for precise data utilization. Get immediate, structured responses to real-world security questions with actionable insights.
Learn more about the [Reputation Service](https://github.com/CheckPointSW/reputation-service-api)

## Features

- Provides a threat classification for a given URL, file hash, or IP address

## Example Use Cases

### Malicious URLs Checks
“I got an email with a link to gmil.com. Is it OK?”  
*→ Returns a detailed analysis about this domain.*

### IPs check
“I have a lot of requests from 103.243.240.249 - why?”  
*→ Returns a detailed analysis about this IP.*

---

### Get your API Key  

To get started with the APIs, please [contact us](mailto:TCAPI_SUPPORT@checkpoint.com).  
We will provide you with a trial API key along with a daily quota. If you exceed your quota, the API will return a 429 (Too Many Requests) status code.

Set the following environment variables:

- `API_KEY`: Your API key  

---

## Client Configuration

### Prerequisites

Download and install the latest version of [Node.js](https://nodejs.org/en/download/) if you don't already have it installed.  
You can check your installed version by running:

```bash
node -v      # Should print "v22" or higher
nvm current  # Should print "v22" or higher
```

### Supported Clients

This server has been tested with Claude Desktop, Cursor, GitHub Copilot, and Windsurf clients.  
It is expected to work with any MCP client that supports the Model Context Protocol.

### Example

```json
{
  "mcpServers": {
    "reputation-service": {
      "command": "npx",
      "args": ["@chkp/reputation-service-mcp"],
      "env": {
        "API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

> Set only the environment variables required for your authentication method.

### Configuring the Claude Desktop App

#### Using a Bundled MCPB (formerly DXT)
1. Download the MCPB file: **[📥 reputation-service.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/reputation-service.mcpb)**
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
    "reputation-service": {
      "command": "npx",
      "args": ["@chkp/reputation-service-mcp"],
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
      "reputation-service": {
        "command": "npx",
        "args": [
          "@chkp/reputation-service-mcp"
        ],
        "env": {
          "API_KEY": "YOUR_API_KEY"
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

- Node.js 22+  
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
node FULL_PATH_TO_SERVER/packages/reputation-service/dist/index.js --api-key
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with Check Point Reputation Service.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.

