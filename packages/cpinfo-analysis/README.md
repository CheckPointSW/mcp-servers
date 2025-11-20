# Check Point CPInfo Analysis MCP Server

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for CPInfo Analysis?
 
CPInfo files contain thousands of lines of diagnostic data from Check Point appliances, including system configurations, performance metrics, security events, network topology, and troubleshooting information. Manually parsing and analyzing these files is time-consuming and error-prone. 

This MCP server changes that: it exposes CPInfo data in a structured, semantic format ready for AI analysis. Query system health, identify performance bottlenecks, trace configuration issues, and get actionable insights—instantly.

## Use with other MCPs for Best Results

While the CPInfo Analysis server works independently, it is designed to complement other Check Point MCP servers (such as Management, Gateway, and HTTPS Inspection) for comprehensive security environment analysis and troubleshooting.

## Features

- **Semantic Analysis**: Automatically categorizes CPInfo sections by type (system, performance, security, network, etc.)
- **Intelligent Search**: Search across sections with keyword matching and content filtering
- **System Information Extraction**: Extract key system details, hardware info, and configurations
- **Performance Metrics**: Analyze CPU, memory, disk usage, and performance trends
- **Network Analysis**: Review network interfaces, routing, VPN tunnels, and connectivity
- **Security Insights**: Examine security policies, threat prevention status, and IPS configurations
- **Licensing Information**: Check license status, expiration dates, and contract details
- **Core Dump Analysis**: Identify and analyze crash dumps and system failures
- **Log File Parsing**: Search and extract relevant log entries
- **Configuration Review**: Inspect appliance configurations and settings


## Example Use Cases

### System Health Check
"Analyze this CPInfo file and provide a comprehensive overview of the system's health, including CPU usage, memory status, and any critical warnings."  
*→ Returns a structured summary of system metrics, identifies anomalies, and highlights areas requiring attention.*

### Performance Troubleshooting
"The appliance is running slow. What performance issues can you find in this CPInfo?"  
*→ Examines performance sections, identifies bottlenecks (high CPU/memory usage, disk I/O issues), and suggests optimization steps.*

### Network Connectivity Issues
"Check why VPN tunnels are dropping. Show me the network configuration and tunnel status."  
*→ Extracts network interface details, VPN configurations, tunnel states, and identifies connectivity problems.*

### Security Policy Verification
"What security policies are active? Are there any security features disabled or misconfigured?"  
*→ Reviews security policies, threat prevention blade status, IPS configurations, and highlights policy gaps.*

### License Expiration Check
"When does my license expire? Show all license information."  
*→ Extracts licensing details including expiration dates, contract information, and active features.*

### Core Dump Analysis
"Are there any recent crashes? What caused them?"  
*→ Identifies core dumps, analyzes crash patterns, and provides diagnostic information about system failures.*

### Configuration Audit
"Compare my current configuration against best practices for R81.20."  
*→ Reviews configuration files, identifies deviations from recommended settings, and suggests improvements.*

### Log Analysis
"Show me all authentication failures in the last 24 hours."  
*→ Searches log files for authentication events, extracts relevant entries, and identifies patterns.*
  
---

### ⚠️ Performance Notice
Processing large CPInfo files (>100MB) may take several seconds for initial indexing. Subsequent queries use cached data for faster response times.
---

## Configuration Options

This server operates locally and analyzes CPInfo files from your filesystem. No external API credentials are required.

### File Path Configuration

All tools accept `file_path` as an absolute path to the **uncompressed** CPInfo text export file.

> **⚠️ IMPORTANT - File Format Requirement**  
> 
> The `file_path` parameter must point to an **uncompressed text file**, NOT a compressed archive.
> 
> CPInfo files are commonly distributed as compressed archives (`.zip`, `.tgz`, `.tar.gz`).  
> **This server does NOT automatically extract or decompress files.**
> 
> ✅ **Correct**: `/path/to/cpinfo_output.txt` or `/path/to/cpinfo.info`  
> ❌ **Wrong**: `/path/to/cpinfo.zip` or `/path/to/cpinfo.tgz`

**How to extract compressed CPInfo archives:**

```bash
# For .tgz or .tar.gz files
tar -xzf cpinfo_file.tgz

# For .zip files
unzip cpinfo_file.zip

# For .gz files (single file compression)
gunzip cpinfo_file.gz
```

After extraction, use the path to the **extracted text file**, not the archive file.

Each request operates on a single file; submit additional file paths in separate calls.

### Optional Environment Variables

- `CPINFO_CACHE_TTL_MS`: Override the idle eviction window (default: 10,800,000 ms ≈ 3 hours).

Cached readers are automatically evicted after the TTL elapses with no tool activity. A background timer enforces this even when clients are idle; evictions are logged at INFO level.
  
---

## Client Configuration

### Prerequisites

Install Node.js 20+ from [nodejs.org](https://nodejs.org/en/download/) if required, then verify with `node -v`.

### Supported Clients

This server has been tested with Claude Desktop, Cursor, GitHub Copilot, and Windsurf clients.  
It is expected to work with any MCP client that supports the Model Context Protocol.

### Basic Configuration Example

```json
{
  "mcpServers": {
    "cpinfo-analysis": {
      "command": "npx",
      "args": ["@chkp/cpinfo-analysis-mcp"],
      "env": {
        "LOG_LEVEL": "info"
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
    "cpinfo-analysis": {
      "command": "npx",
      "args": ["@chkp/cpinfo-analysis-mcp"],
      "env": {
        "LOG_LEVEL": "info"
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
      "cpinfo-analysis": {
        "command": "npx",
        "args": [
          "@chkp/cpinfo-analysis-mcp"
        ],
        "env": {
          "LOG_LEVEL": "info"
        }
      }
    }
  },
  ...
}
```

### Other Clients

- **Windsurf / Cursor / GitHub Copilot** – All expose an “MCP Servers” settings page. Paste the same JSON block used for Claude Desktop, adjusting paths if you installed globally.
  
---

## Available Tools

This MCP server provides the following analysis tools:

### Initialization & Overview
- `check_initialization_status` – Check initialization status of a cpinfo file. By default, ensures the file is initialized (builds caches if needed). Use `initialize=false` to poll status without triggering processing.
- `analyze_cpinfo_overview` – Produce a high-level semantic overview once the file is ready.

### Section Browsing
- `browse_sections_by_category` – List sections for a specific semantic category with pagination.

### System Information
- `extract_system_details` – Surface key system and hardware metadata captured in the CPInfo file.

### Performance Analysis
- `analyze_performance_metrics` – Summarize CPU, memory, disk, and related performance signals.

### Network Analysis
- `extract_network_config` – Inspect network interfaces, routing tables, VPN context, and related sections.

### Security & Compliance
- `audit_security_settings` – Summarize security configuration, user data, and blade status.

### Licensing
- `extract_license_information` – Report license inventory, expirations, and blade coverage.

### Diagnostics & Crash Analysis
- `detect_system_crashes` – Highlight core dumps and crash-related evidence.

### Content Retrieval & Search
- `read_section_content` – Page through raw section content with line-based pagination instructions.
- `smart_content_search` – Keyword search across section names and (optionally) content. Returns line numbers for matching content.
- `manage_unknown_sections` – List, suggest, or reclassify sections that remain uncategorized. Available only when the
    `CPINFO_ENABLE_DEBUG_TOOLS` environment variable is set to `true`. Supports actions `list`, `suggest`,
    `reclassify`, and `bulk_reclassify` (the last one applies pattern-based mappings to re-type many sections at once).
- `comprehensive_health_analysis` – Combine multiple caches into a focused health summary (system/performance/licensing/security).

#### Search Result Format & Navigation

**Important**: The `smart_content_search` tool returns **line numbers only** (e.g., `[line 1951]`) without page numbers. This ensures accuracy regardless of the `page_size` you specify when reading content.

**To navigate to search results:**

1. Note the line number from search results (e.g., `[line 1951]`)
2. Choose your preferred `page_size` (default is 30 lines per page)
3. Calculate the page number: `page = Math.floor((line - 1) / page_size) + 1`
4. Use `read_section_content` with the calculated page and your chosen `page_size`

**Example:**
```
Search finds: [line 1951] FULLSYNC Running
Your page_size: 50

Calculate page: Math.floor((1951 - 1) / 50) + 1 = 40

Read content:
  file_path: "cpinfo.txt"
  section_name: "log_section"
  page: 40
  page_size: 50
```

This approach gives you full control over page size while ensuring accurate navigation to search results.

---

## Development

### Prerequisites

- Node.js 20+  
- npm 10+  

### Setup

```bash
# Clone the repository
git clone [repository-url]
cd mcp-servers-internal

# Install all dependencies
npm install

# Build all packages
npm run build
```

### Build

```bash
# Build just the cpinfo-analysis package
npx nx build @chkp/cpinfo-analysis-mcp

# Or build all packages
npm run build
```

### Running Locally

```bash
# From the repository root
node packages/cpinfo-analysis/dist/index.js

# Or use the npm script
cd packages/cpinfo-analysis
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

The test suite includes:
- **50 comprehensive tests** validating file parsing, indexing, caching, and search functionality
- **Small test fixtures** included in the repository for portable testing
- **Pagination bug tests** ensuring accurate line number reporting in search results
- Tests run successfully on any machine without requiring large external CPInfo files

For more details, see [TESTING.md](./TESTING.md) and [tests/README.md](./tests/README.md).

---

## Troubleshooting

### CPInfo File Not Found
Ensure the CPInfo file path you pass into a tool is absolute and the file exists:
```bash
ls -la /absolute/path/to/cpinfo.info
```

### Initialization Takes Too Long
Large CPInfo files (>100 MB) may take several seconds to index the first time. Subsequent tool calls reuse the cached data. If you need to force a rebuild, delete the process-level cache by restarting the MCP server.

### Memory Issues
For extremely large CPInfo archives you can raise Node.js memory limits by wrapping the command:
```json
{
  "mcpServers": {
    "cpinfo-analysis": {
      "command": "node",
      "args": [
        "--max-old-space-size=4096",
        "node_modules/@chkp/cpinfo-analysis-mcp/dist/index.js"
      ]
    }
  }
}
```

### Cache Timeout
Idle caches are evicted automatically after the configured TTL (`CPINFO_CACHE_TTL_MS`). Eviction events are logged, so check the log file if a file unexpectedly re-initializes on the next request.

---

## Support

For issues, questions, or contributions:
- GitHub Issues: [https://github.com/CheckPointSW/mcp-servers/issues](https://github.com/CheckPointSW/mcp-servers/issues)
- Documentation: [https://checkpointsw.github.io/mcp-servers/](https://checkpointsw.github.io/mcp-servers/)

## License

MIT License - see [LICENSE](../../LICENSE) file for details.
