# Check Point MCP Servers

This repository contains a collection of Model Context Protocol (MCP) servers for Check Point security platforms, implemented in TypeScript. Each MCP server is organized as a separate package within this monorepo structure.

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Check Point Security?
 
Security policies often span hundreds of rules and thousands of objects across diverse enforcement points. Understanding, auditing, or optimizing these environments is slow and error-prone. 

MCP changes this: exposing security management data in a modular, context-rich format, ready for AI systems to consume. Enabling the AI to use your data with precision. Ask real-world questions, and get structured, actionable answers—instantly.

## Repository Structure

This monorepo is organized with each Check Point security domain as a separate MCP server:

- **`/packages`** - Contains all MCP server implementations and shared libraries
  - **`/management`** - Management API MCP server for policy and object management
  - **`/infra`** - Shared infrastructure components and utilities
  - **`/management-logs`** - Management Logs MCP server for Check Point products
  - **`/threat-prevention`** - Management API MCP Server for Threat Prevention policies
  - **`/https-inspection`** - Management API MCP Server for Https Inspection policies
  - **`/harmony-infra`** - Shared infrastructure components for Harmony products
  - **`/harmony-sase`** - Harmony SASE MCP Server for SASE policy management
  - **`/mcp-utils`** - Shared utilities for Check Point MCP servers

## Available MCP Servers

The following MCP servers are available in this repository:

| MCP Server | Package Name | Description |
|------------|--------------|-------------|
| [Management](./packages/management/) | `@chkp/quantum-management-mcp` | Query policies, rules, objects, and network topology |
| [Management-logs](./packages/management-logs/) | `@chkp/management-logs-mcp` | Make queries and gain insights from connection and audit logs |
| [Threat-Prevention](./packages/threat-prevention/) | `@chkp/threat-prevention-mcp` | Query Threat Prevention policies, profiles and indicators, view IPS updates and IOC feeds |
| [HTTPS-Inspection](./packages/https-inspection/) | `@chkp/https-inspection-mcp` | Query Https Inspection policies, rules and exceptions |
| [Harmony sase](./packages/harmony-sase/) | `@chkp/harmony-sase-mcp` | Query and manage Harmony SASE Regions, Networks, Applications and configurations |


## Example: Setting Up an MCP Server

Here's an example of how to configure the Management MCP server in your MCP client:

```json
{
  "MCP-NAME": {
    "command": "npx",
    "args": [
      "@chkp/MCP_NPM_PACKAGE"
    ],
    "env": {
        // Specific server configuration 
    }
  }
}
```

__Each MCP server has its own specific configuration requirements. Please refer to the individual package README files for detailed setup instructions.__

## Getting Started for Development (Not needed for users who just wish to use the MCPs)

To work with this repository:

```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Build all packages
npm run build
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point management system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Queried Data will be exposed to the model.** Ensure that you only use models and providers that comply with your organization’s policies for handling sensitive data and PII.
