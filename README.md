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
  - **`/reputation-service`** - Reputation MCP Server 
  - **`/gw-cli-base`** - Base Infra for running Gateways scripts
  - **`/gw-cli`** - Gateway Script MCP Server for Information, Perfomance and Diagnostics
  - **`/gw-cli-connection-analysis`** - Gateway Script MCP Server to Analyze Connection Issues
  - **`/threat-emulation`** - Threat Emulation MCP server for malware analysis and file scanning
  - **`/gaia`** - GAIA OS MCP server for network management and interface configuration
  - **`/documentation-tool`** - Check Point documentation assistant MCP server for product information and technical guidance
  - **`/spark-management`** - Spark Management MCP server for Quantum Spark appliance management
  - **`/cpinfo-analysis`** - CPInfo Analysis MCP server for Check Point appliance diagnostic file analysis and troubleshooting

## Available MCP Servers

The following MCP servers are available in this repository:

| MCP Server | Package Name | Description |
|------------|--------------|-------------|
| [Management](./packages/management/) | `@chkp/quantum-management-mcp` | Query policies, rules, objects, and network topology |
| [Management Logs](./packages/management-logs/) | `@chkp/management-logs-mcp` | Make queries and gain insights from connection and audit logs |
| [Threat-Prevention](./packages/threat-prevention/) | `@chkp/threat-prevention-mcp` | Query Threat Prevention policies, profiles and indicators, view IPS updates and IOC feeds |
| [HTTPS-Inspection](./packages/https-inspection/) | `@chkp/https-inspection-mcp` | Query Https Inspection policies, rules and exceptions |
| [Harmony SASE](./packages/harmony-sase/) | `@chkp/harmony-sase-mcp` | Query and manage Harmony SASE Regions, Networks, Applications and configurations |
| [Reputation Service](./packages/reputation-service/) | `@chkp/reputation-service-mcp` | Query Url, IP and File Reputation |
| [GW CLI](./packages/gw-cli/) | `@chkp/quantum-gw-cli-mcp` | Provides comprehensive diagnostics and analysis across hardware, network configuration, high availability, performance, security, and real-time connection debugging |
| [GW CLI Connection Analysis](./packages/gw-cli-connection-analysis/) | `@chkp/quantum-gw-connection-analysis-mcp` | Provides debug logs to help analyze connection issues |
| [Threat Emulation](./packages/threat-emulation/) | `@chkp/threat-emulation-mcp` | Analyze files for malware and threats using Check Point's cloud services |
| [Gaia](./packages/gaia/) | `@chkp/quantum-gaia-mcp` | Network management and interface configuration for GAIA OS |
| [Documentation Tool](./packages/documentation-tool/) | `@chkp/documentation-mcp` | Comprehensive Check Point documentation assistant providing instant access to product information, technical specifications, configuration guidance, and feature documentation across the entire Check Point security portfolio |
| [Spark Management](./packages/spark-management/) | `@chkp/spark-management-mcp` | Manage and monitor Quantum Spark appliances for MSPs and distributed networks |
| [Cpinfo analysis](./packages/cpinfo-analysis/) | `@chkp/cpinfo-analysis-mcp` | Analyze CPInfo diagnostic files for system health, performance metrics, network configuration, and troubleshooting insights |


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

## Nx Workspace Commands

This project uses Nx for managing the monorepo. You can use Nx commands to run tasks for specific packages:

**Package Build Options:**
- **Alias:** `npm run nx:build:<folder-name>` (e.g., `management`, `harmony-sase`, `infra`)
- **Direct Nx:** `npx nx build <full-package-name>` (e.g., `@chkp/quantum-management-mcp`)

### Running Development Mode
```bash
# Run @chkp/management in development mode
npx nx run @chkp/quantum-management-mcp:dev
# or using alias
npm run nx:dev:management

# Run https-inspection in development mode
npx nx run @chkp/https-inspection-mcp:dev
# or using alias
npm run nx:dev:https-inspection
```

### Building Specific Packages
```bash
# Build https-inspection server
npx nx build @chkp/https-inspection-mcp
# or using alias
npm run nx:build:https-inspection

# Build threat-prevention server
npx nx build @chkp/threat-prevention-mcp
# or using alias
npm run nx:build:threat-prevention
```

### Running Tests
```bash
# Run tests for a specific package
npx nx run @chkp/quantum-infra:test

# Run tests for all packages
npx nx run-many --target=test
```

### Other Useful Nx Commands
```bash
# Show project graph
npx nx graph

# List all available projects
npx nx show projects

# Build all packages
npx nx run-many --target=build

# Lint all packages
npx nx run-many --target=lint
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point management system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Queried Data will be exposed to the model.** Ensure that you only use models and providers that comply with your organization’s policies for handling sensitive data and PII.
