# @chkp/mcp-utils

Shared utilities for Check Point MCP servers.

## Features

### Configuration-Driven MCP Server Launcher

The `launchMCPServer` function provides a configuration-driven approach to launching MCP servers, eliminating boilerplate code and making CLI options maintainable through JSON configuration files.

## Usage

### 1. Create a Server Configuration File

Create a `server-config.json` file in your server package:

```json
{
  "name": "My MCP Server",
  "description": "Description of my MCP server",
  "options": [
    {
      "flag": "--api-key <key>",
      "description": "API key for authentication",
      "env": "API_KEY",
      "type": "string"
    },
    {
      "flag": "--host <host>",
      "description": "Server host",
      "env": "SERVER_HOST",
      "default": "localhost",
      "type": "string"
    },
    {
      "flag": "--verbose",
      "description": "Enable verbose output",
      "env": "VERBOSE",
      "type": "boolean"
    }
  ]
}
```

### 2. Update Your Server's Main Function

Replace your manual CLI setup with the launcher:

```typescript
import { launchMCPServer } from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Your existing server, Settings, and pkg imports...

const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    { server, Settings, pkg }
  );
};

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
```

### 3. Add Dependency

Add `@chkp/mcp-utils` to your package.json:

```json
{
  "dependencies": {
    "@chkp/mcp-utils": "*"
  }
}
```

## Configuration Schema

### ServerConfig

- `name` (string): Display name for the server
- `description` (string, optional): Description shown in help text
- `options` (CliOption[]): Array of CLI options

### CliOption

- `flag` (string): Commander.js-style flag definition (e.g., `--api-key <key>`, `--verbose`)
- `description` (string): Help text for the option
- `env` (string, optional): Environment variable name to read default from
- `default` (string, optional): Default value if not provided via CLI or env
- `type` ('string' | 'boolean', optional): Option type (defaults to 'string')

## Benefits

- **Zero Boilerplate**: Reduces main function from ~15 lines to ~5 lines
- **Configuration-Driven**: All CLI options in maintainable JSON files  
- **Environment Variable Support**: Automatic mapping of env vars to options
- **Type Safety**: TypeScript interfaces for all configuration
- **Consistent Help**: Automatic help text generation
- **Easy Maintenance**: Change options without touching code

## Migration Example

**Before:**
```typescript
const main = async () => {
  const program = new Command();
  program
    .option('--api-key <key>', 'API key')
    .option('--host <host>', 'Server host', process.env.SERVER_HOST || 'localhost')
    .option('--verbose', 'Enable verbose output', process.env.VERBOSE === 'true');
  program.parse(process.argv);
  const options = program.opts();
  Settings.setSettings(Settings.fromArgs(options));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Server running...');
};
```

**After:**
```typescript
const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    { server, Settings, pkg }
  );
};
```
