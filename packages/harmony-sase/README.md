# Check Point Harmony SASE MCP Server

## What is MCP standard?

MCP (Model Context Protocol) is an open standard that enables AI agents to interact with external tools, services, and data sources in a secure and structured way. It defines a consistent interface for AI systems to discover and use capabilities such as reading files, querying databases, or sending messages through APIs.

## Why MCP for Harmony SASE?

Harmony SASE provides a unified platform for building secure private networks and managing access to the internet, private applications, and cloud infrastructure by creating access policy rules, this data is stored in Harmony SASE storage.

Valuable information and insights are often locked within this data, insights that could drive smart decisions and fast actions if made accessible.

MCP simplifies this by exposing your Harmony SASE data in a structured, modular, and context-rich format that AI systems can understand and utilize. This enables AI to interact intelligently with your environment, delivering precise, real-time, and actionable insights based on your queries and interests.

## Features

- Query Harmony SASE networks and their configurations

- Retrieve and analyze gateway deployments across regions

- List and inspect ZTA applications

- Get all available Network regions

- Get all the deployed GWs, regions and tunnels in the Network

## Demo

[![Watch the demo](https://img.youtube.com/vi/0mLRYIwv-ME/hqdefault.jpg)](https://www.youtube.com/watch?v=0mLRYIwv-ME)

## Example Use Cases

### Network Security Assessment

Query: "Show me all active networks and their gateway configurations across regions."

\_→ Returns comprehensive network topology.

### Application Access Analysis

Query: "List all applications and identify which networks they're accessible from."

Returns: Applications details and access patterns.

### Regional Availability

Query: "List of available regions”

---

### Available Tools

This MCP server provides the following tools:

**Network Management:**

`list_networks` - List all Harmony SASE networks

`get_network` / `find_network` - Get specific network by ID

**Gateway Management:**

`get_gateway` - Get gateway details by network and gateway ID

**Region Management:**

`list_network_regions` - List all available regions

`get_region` - Get specific region details

**Application Management:**

`list_applications` - List all applications

`get_application` - Get specific application details

`get_application_status` - Check application deployment status

---

## Configuration

### Prerequisites

You need access to a Check Point Harmony SASE environment with API credentials.

**Configure a Bypass Rule for Selected AI Tools**

1. Navigate to Internet Access → Bypass Rules.
2. Click Add New Rule.
3. Enter a Name for the rule.
4. Under Applied On, if available, select Agent.
5. Set the Source (based on your policy requirements).
6. Set the Destination to the relevant application domains, for example:
    *.claude.ai
    *.anthropic.com
    *.api.anthropic.com

**How to get API credentials:**
In your Harmony SASE portal, navigate to **Settings → API support** and generate an API key.

Note your management host URL and origin domain for your tenant.

Set the following environment variables:

`API_KEY`: Your Harmony SASE API key

`MANAGEMENT_HOST`: Your Harmony SASE management API URL (e.g., `https://api.your-management-host.com/api`)

`ORIGIN`: Your tenant origin domain (e.g., `https://your.origin-domain.com`)

---

## Client Configuration

### Prerequisites

Download and install the latest version of [Node.js](Node.js — Download Node.js® ) if you don't already have it installed.

You can check your installed version by running:

```bash

node -v      # Should print "v20" or higher

nvm current  # Should print "v20" or higher

```

### Supported Clients

This server has been tested with Claude Desktop, Cursor, GitHub Copilot, and Windsurf clients.

It is expected to work with any MCP client that supports the Model Context Protocol.

> **Note:** Due to the nature of SASE API calls and the variety of server tools, using this server may require a paid subscription to the model provider to support token limits and context window sizes.

> For smaller models, you can reduce token usage by limiting the number of enabled tools in the client.

### Configuration Example

```json
{
  "mcpServers": {
    "harmony-sase": {
      "command": "npx",

      "args": ["@chkp/harmony-sase-mcp"],

      "env": {
        "API_KEY": "your-harmony-sase-api-key",

        "MANAGEMENT_HOST": "https://api.your-management-host.com/api",

        "ORIGIN": "https://your.origin-domain.com"
      }
    }
  }
}
```

### Configuring the Claude Desktop App

#### Using a Bundled MCPB (formerly DXT)
1. Download the MCPB file: **[📥 harmony-sase.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/harmony-sase.mcpb)**
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
    "harmony-sase": {
      "command": "npx",

      "args": ["@chkp/harmony-sase-mcp"],

      "env": {
        "API_KEY": "your-harmony-sase-api-key",

        "MANAGEMENT_HOST": "https://api.your-management-host.com/api",

        "ORIGIN": "https://your.origin-domain.com"
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

    "inputs": [

      {

        "type": "promptString",

        "id": "harmony_sase_api_key",

        "description": "Harmony SASE API Key",

        "password": true

      }

    ],

    "servers": {

      "harmony-sase": {

        "command": "npx",

        "args": ["@chkp/harmony-sase-mcp"],

        "env": {

          "API_KEY": "${input:harmony_sase_api_key}",

          "MANAGEMENT_HOST": "https://api.your-management-host.com/api",

          "ORIGIN": "https://your.origin-domain.com"

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

Node.js 20+

npm 10+

## Installation

### Global Installation

```bash

npm install -g @chkp/harmony-sase-mcp

```

### Setup

```bash

# Clone the repository

git clone <repository-url>

cd mcp-servers/packages/harmony-sase


# Install all dependencies

npm install

```

### Build

```bash

# Build the package

npm run build

```

### Running Locally

You can run the server locally for development using [MCP Inspector](Inspector - Model Context Protocol ) or any compatible MCP client.

```bash

node /path/to/packages/harmony-sase/dist/index.js --api-key YOUR_API_KEY --management-host https://api.your-management-host.com/api --origin https://your.origin-domain.com

```

## ⚠️ Security Requirements

API keys and credentials are never shared with the model

Only use client implementations you trust

Ensure that you only use models and providers that comply with your organization's policies for handling sensitive infrastructure data and PII.
