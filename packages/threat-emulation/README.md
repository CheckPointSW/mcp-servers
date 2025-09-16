# Check Point Threat Emulation MCP Server

A Model Context Protocol (MCP) server that provides seamless integration with Check Point's Threat Emulation and Anti-Virus cloud services. This server enables AI assistants to perform comprehensive malware analysis, file scanning, and threat detection through a simple, standardized interface.

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Threat Emulation?
 
Modern threat landscapes require rapid file analysis and malware detection capabilities. Analyzing suspicious files is traditionally a complex process requiring specialized tools and expertise.

MCP changes this: exposing Check Point's Threat Emulation and Anti-Virus services in a modular, context-rich format, ready for AI systems to consume. Enabling the AI to analyze files, identify threats, and provide actionable security insights—instantly.

## Features

- **File Upload & Analysis** - Submit files for threat analysis using Check Point's cloud infrastructure
- **Hash Integrity Protection** - Ensures perfect file hash preservation for reliable security analysis
- **Multi-Hash Support** - Compatible with MD5, SHA-1, and SHA-256 hashes for flexible file identification
- **Real-time Status Monitoring** - Query analysis progress and retrieve results as they become available
- **Detailed XML Reporting** - Download comprehensive XML reports for malicious files with detailed analysis results
- **Smart Caching** - Automatically checks for existing analysis before uploading duplicates
- **Quota Management** - Monitor API usage and limits
- **File Path Only Approach** - Ensures hash integrity by reading files directly from disk
- **Combined Scanning** - Single tool that uploads, waits, and returns results with intelligent timeout handling
- **Auto-Hash Calculation** - Calculates missing MD5 hashes from file paths when needed for AV analysis

## Example Use Cases

### Suspicious File Analysis
"Is this PDF file safe to open? What threats does it contain?"  
*→ Returns a detailed analysis of potential malware and risky behaviors.*

### Unknown File Assessment
"What type of threats are in this executable? Is it known malware?"  
*→ Provides classification and detection details across multiple security engines.*

### Batch File Verification
"Verify if these downloaded files are safe before installation."  
*→ Scans multiple files and highlights any security concerns.*

### Malicious Behavior Identification
"What exactly does this malware attempt to do on my system?"  
*→ Explains specific malicious behaviors and system impacts.*

### Threat Intelligence Integration
"Has this file hash been identified as malicious in the past?"  
*→ Leverages Check Point's threat intelligence for comprehensive assessment.*

## Security Design Decisions

### Why File Paths Only?

We prioritize **hash integrity** over convenience for security analysis:

#### File Upload Challenges:
- Base64 encoding/decoding changes file hashes
- Different hash = potential file corruption/tampering
- Security analysis requires perfect hash preservation

#### File Path Approach Benefits:
- **Perfect Hash Integrity** - Files read directly from disk preserve original hashes
- **Reliable Security Analysis** - No conversion artifacts affecting analysis
- **Trustworthy Results** - Hash verification works as expected

#### User Workflow:
1. Save files to disk first (preserves original hash)
2. Use file path for analysis (guaranteed integrity)
3. Get reliable security results

**Bottom Line:** We chose hash accuracy over convenience for trustworthy security scanning.

---

## Configuration Options

This server requires authentication with Check Point's Threat Emulation cloud service:

### API Key Authentication

- **How to obtain an API key:**  
  Contact your Check Point account representative or support team to obtain an API key for the Threat Emulation service.

Set the following environment variable:

- `API_KEY`: Your Check Point Threat Emulation API key  

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
    "threat-emulation": {
      "command": "npx",
      "args": ["@chkp/threat-emulation-mcp"],
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
1. Download the MCPB file: **[📥 threat-emulation.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/threat-emulation.mcpb)**
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
    "threat-emulation": {
      "command": "npx",
      "args": ["@chkp/threat-emulation-mcp"],
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
      "threat-emulation": {
        "command": "npx",
        "args": [
          "@chkp/threat-emulation-mcp"
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
node FULL_PATH_TO_SERVER/packages/threat-emulation/dist/index.js --api-key YOUR_API_KEY
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with Check Point Threat Emulation.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.
3. **File analysis data is exposed to the model.** Ensure that you only use models and providers that comply with your organization's policies for handling sensitive data.

