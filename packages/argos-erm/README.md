# Check Point Argos ERM MCP

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Argos ERM?
 
The Argos ERM MCP Server provides programmatic access to Check Point's Argos External Risk Management platform. It enables AI assistants and automation tools to query risk assessments, compliance data, and security posture information directly from your Argos deployment.

## Use with other MCPs for Best Results
While the Argos ERM MCP works well on its own, it is designed to integrate with other Check Point MCP servers for comprehensive security management workflows.

## Features

### 14 Comprehensive Tools

1. **get_alerts** - Search and retrieve security alerts with comprehensive filtering
2. **get_alert_details** - Get detailed alert information with intelligence enrichment
3. **get_assets** - Retrieve digital asset inventory with tech stack enrichment
4. **enrich_iocs** - Enrich IOCs (IPs/domains/URLs/hashes) with threat intelligence
5. **get_vulnerability_details** - Get CVE details with CVSS scores and exploit info
6. **search_vulnerabilities_by_technology** - Search CVEs by product and version
7. **check_credential_exposure** - Check for exposed credentials by domain or email
8. **get_threat_landscape_news** - Retrieve curated threat intelligence news
9. **get_threat_landscape_metadata** - Get available filter options for threat news
10. **get_threat_actors_metadata** - Get available filter options for threat actors
11. **get_most_active_threat_actors** - Retrieve active threat actors with filtering
12. **get_threat_actor_by_id** - Get detailed threat actor information
13. **get_malware_by_id** - Get detailed malware information
14. **get_security_analytics** - Get comprehensive security posture analytics

## Demo

[Demo placeholder - add your demo video link here]

## Example Use Cases

### Security Alert Analysis
**"Show me critical alerts from the last 24 hours"**  
*→ Returns filtered alerts with severity, status, and IOC enrichment.*

**"Get details for alert INT10-343 with intelligence enrichment"**  
*→ Returns comprehensive alert details including threat intelligence for all indicators.*

**"List all phishing alerts that are still open"**  
*→ Returns filtered alerts by type and status with enriched data.*

### Asset & Vulnerability Management
**"Show me all monitored domains with their technology stacks"**  
*→ Returns asset inventory with detailed technology versions, CVE counts, and risk scores.*

**"Find vulnerabilities in Apache HTTP Server version 2.4.41"**  
*→ Returns CVEs affecting specific technology versions with CVSS scores and exploit availability.*

**"What's the CVSS score for CVE-2024-30040?"**  
*→ Returns comprehensive CVE details including CVSS v2/v3 scores, affected products, and remediation.*

### Threat Intelligence
**"Get latest threat intelligence news about ransomware"**  
*→ Returns curated threat intelligence articles filtered by labels, regions, or sectors.*

**"Enrich these IOCs: 8.8.8.8, malicious-site.com"**  
*→ Returns threat intelligence for each IOC including reputation, geo-location, and related threats.*

**"Show me the most active threat actors targeting the financial sector"**  
*→ Returns threat actor profiles with motivation, targeted sectors, and attack patterns.*

**"Tell me about the LockBit threat actor"**  
*→ Returns detailed threat actor profile including aliases, targeted countries/sectors, and TTPs.*

### Credential & Risk Monitoring
**"Check if company.com has any exposed credentials"**  
*→ Returns exposed credentials found in data breaches with breach metadata.*

**"What's our current security posture?"**  
*→ Returns comprehensive analytics including risk scores, trends, and threat distribution.*

**"Show me the risk assessment dashboard"**  
*→ Returns overall risk, targeting threats, data exposure, and posture risk metrics.*
  
---

### ⚠️ Performance Notice
This server connects to your Argos ERM deployment. Ensure proper network access and authentication.
---

## Configuration Options

This server supports configuration via command-line arguments or environment variables:

### Argos ERM Configuration

The Argos ERM server requires connection details to your Argos instance.

Set the following environment variables:

- `ARGOS_HOST` (or `ARGOS_SERVER_URL`): Your Argos ERM server URL (e.g., `https://argos.example.com`)
- `ARGOS_API_KEY` (or `ARGOS_INTEGRATION_TOKEN`): Your Argos ERM API authentication token
- `ARGOS_CUSTOMER_ID`: Your Argos customer ID (required for all API calls)
  
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

### Basic Configuration Example

```json
{
  "mcpServers": {
    "argos-erm": {
      "command": "npx",
      "args": ["@chkp/argos-erm-mcp"],
      "env": {
        "ARGOS_HOST": "https://your-argos-instance.com",
        "ARGOS_API_KEY": "your-api-key-here",
        "ARGOS_CUSTOMER_ID": "your-customer-id"
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
    "argos-erm": {
      "command": "npx",
      "args": ["@chkp/argos-erm-mcp"],
      "env": {
        "ARGOS_HOST": "https://your-argos-instance.com",
        "ARGOS_API_KEY": "your-api-key-here",
        "ARGOS_CUSTOMER_ID": "your-customer-id"
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
      "argos-erm": {
        "command": "npx",
        "args": [
          "@chkp/argos-erm-mcp"
        ],
        "env": {
          "ARGOS_HOST": "https://your-argos-instance.com",
          "ARGOS_API_KEY": "your-api-key-here",
          "ARGOS_CUSTOMER_ID": "your-customer-id"
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
node FULL_PATH_TO_SERVER/packages/argos-erm/dist/index.js \
  --argos-host "https://your-argos-instance.com" \
  --argos-api-key "your-api-key" \
  --argos-customer-id "your-customer-id"
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Argos ERM system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Risk and compliance data is exposed to the model.** Ensure that you only use models and providers that comply with your organization's policies for handling sensitive data and PII.

## 📊 Telemetry and Privacy

**Anonymous Usage Statistics:** Check Point collects anonymous usage statistics to improve this MCP server. Only tool usage patterns and anonymous identifiers are collected—no credentials, policies, or sensitive data.

**Opt-Out:** Set `TELEMETRY_DISABLED=true` environment variable or use the `--no-telemetry` flag to disable telemetry collection.
