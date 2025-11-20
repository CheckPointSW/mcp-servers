# MCPB Package Builder for Check Point MCP Servers

This directory contains scripts for building MCPB packages (MCP Bundle - formerly called DXT) for Desktop Extensions from the Check Point MCP server monorepo.

## Main Script

- `build-mcpb.js`: The main script that bundles MCP server packages and creates MCPB format packages.

## Features

- **Configuration-Driven Approach**: Automatically detects and processes `server-config.json` files
- **Dynamic Package Detection**: Finds MCP server packages based on their configuration files
- **Manifest Generation**: Creates appropriate manifest.json files for MCPB format
- **Dependency Management**: Bundles and installs necessary dependencies
- **Path Compatibility**: Handles server-config.json files in both root and src directories

## Usage

```bash
# Build all available MCP server packages
npm run build:mcpb

# Build specific packages
npm run build:mcpb management https-inspection
```

## Requirements

- Node.js >= 20.0.0
- esbuild (installed automatically if needed)
- @anthropic-ai/mcpb (optional, for final packaging)

## Adding a New MCP Server

1. Create a `server-config.json` file in your package root or src directory
2. Ensure your package uses the `mcp-utils` launcher
3. Run this script to build an MCPB package
