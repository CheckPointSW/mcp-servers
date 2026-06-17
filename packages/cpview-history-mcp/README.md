# Check Point CPView History MCP Server

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data—designed for AI-powered automation, copilots, and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze, and optimize complex systems without building custom SDKs or parsing raw exports.

## Why MCP for CPView History?

Check Point gateways continuously record performance snapshots into a local SQLite database (`CPViewDB.dat`) — CPU, memory, connections, interfaces, ClusterXL state, and hundreds of other metrics, often spanning weeks. Investigating an incident means digging through millions of raw rows across 500+ tables.

This MCP server changes that: it exposes purpose-built analysis tools so an AI agent can investigate incidents across long time ranges by making many small, cheap calls — hotspot scans, change detection, correlation, timelines, and report generation — rather than paging through raw data.

## Use with other MCPs for Best Results

While the CPView History server works independently, it is designed to complement other Check Point MCP servers (such as CPInfo Analysis, Management, and Gateway) for comprehensive security environment analysis and troubleshooting.

## Features

- **Stateless tool interface** — every tool takes the database path as an argument
- **Read-only by construction** — SQLite opened with `immutable=1`; no writes, no locking, safe on SMB/network shares
- **Flexible time inputs** — epoch, ISO 8601, or relative (`"1h ago"`)
- **Friendly metric aliases** (`"cpu"`, `"memory"`, `"swap"`) plus raw `table.column`
- **"Did you mean" suggestions** on bad table/column names
- **Anomaly detection** — global hotspot scan, threshold/zscore/delta event detection, baseline discovery
- **Change analysis** — compare two time windows, detect metric shifts, Pearson correlation
- **HA / ClusterXL aware** — failover detection, state dwell times, cluster member comparison
- **Incident workflow** — investigate a window, build a timeline, generate a full markdown report
- **CSV export** to keep agent context small
- **Cross-platform path handling** (Windows UNC, local, Linux)

## Example Use Cases

### Incident Investigation
"The gateway had an outage around 2 AM last night. Investigate what happened."
*→ Runs `investigate_window` around the time, finds hotspots, system events (reboots, failovers), and correlated metric anomalies.*

### Performance Troubleshooting
"CPU has been high since yesterday. What changed?"
*→ Compares baseline vs. problem windows with `find_changes`, identifies top contributing processes and metrics that shifted.*

### HA Failover Analysis
"Did this cluster member fail over last week? Why?"
*→ Detects HA state transitions from the authoritative state table, reports dwell times per state, and flags discrepancies in cached CCP state.*

### Health Report
"Generate a health report for this gateway covering the last 7 days."
*→ Produces a structured markdown report: incident timeline, system events, top metrics, and anomalies.*

### Cluster Member Comparison
"Compare CPU and connections between the two cluster members."
*→ Side-by-side metric comparison across multiple `CPViewDB.dat` files with `compare_members`.*

---

### ⚠️ Performance Notice
`CPViewDB.dat` files can reach several GB. Queries are indexed and paginated, but a first full-range hotspot scan on a very large file may take a few seconds.

---

## Configuration Options

> **📊 Anonymous Usage Statistics:** Check Point collects anonymous usage statistics to help improve this MCP server. To opt out, set `TELEMETRY_DISABLED=true` or use `--no-telemetry` flag.

This server operates locally and analyzes CPView history database files from your filesystem. No external API credentials are required.

### File Path Configuration

All tools accept a `path` argument pointing to a `CPViewDB.dat` SQLite file (typically collected from `$CPDIR/database/CPViewDB.dat` on a gateway, or extracted from a cpinfo archive).

> **⚠️ IMPORTANT — File Format Requirement**
>
> The `path` parameter must point to an **uncompressed SQLite file**, NOT a compressed archive.
>
> ✅ **Correct**: `/path/to/CPViewDB.dat`
> ❌ **Wrong**: `/path/to/cpinfo.tgz` or `/path/to/CPViewDB.dat.gz`

Use the `list_cpview_files` tool to discover `*CPViewDB.dat` files under a folder.

---

## Client Configuration

### Prerequisites

Install Node.js 22.5+ from [nodejs.org](https://nodejs.org/en/download/) if required, then verify with `node -v`.

### Supported Clients

This server has been tested with Claude Desktop, Cursor, GitHub Copilot, and Windsurf clients.
It is expected to work with any MCP client that supports the Model Context Protocol.

### Basic Configuration Example

```json
{
  "mcpServers": {
    "cpview-history": {
      "command": "npx",
      "args": ["@chkp/cpview-history-mcp"],
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
    "cpview-history": {
      "command": "npx",
      "args": ["@chkp/cpview-history-mcp"],
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
      "cpview-history": {
        "command": "npx",
        "args": [
          "@chkp/cpview-history-mcp"
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

- **Windsurf / Cursor / GitHub Copilot** – All expose an "MCP Servers" settings page. Paste the same JSON block used for Claude Desktop, adjusting paths if you installed globally.

---

## Available Tools

**Discovery**
- `list_cpview_files(folder, max_depth?)` — scan a folder for `*CPViewDB.dat`
- `inspect_database(path)` — orientation: tables, time coverage, headline metrics, timezone, HA context
- `search_schema(path, keyword, limit?)` — fuzzy search tables + columns
- `find_tables(path, concept)` — semantic table discovery via natural-language concept

**Time**
- `time_convert(value, tz?)` — epoch ↔ ISO ↔ relative

**Querying**
- `query_range(path, table, start?, end?, columns?, where?, cursor?, order?)` — raw rows, cursor paginated
- `aggregate(path, table, columns, start?, end?, bucket?, agg?, group_by?)` — multi-column downsampled series
- `snapshot_at(path, timestamp, tables?, tolerance_seconds?)` — nearest-row point-in-time view

**Analysis**
- `find_events(path, table, column, ..., mode)` — peaks / threshold / zscore / delta
- `find_system_events(path, start?, end?)` — OS reboots and HA state changes / failovers
- `find_hotspots(path, start?, end?, top_n?)` — global anomaly scan across key metrics
- `find_changes(path, baseline_..., target_..., top_n?)` — metrics that shifted between two windows
- `correlate(path, metrics[], start?, end?, bucket?)` — Pearson correlation matrix
- `compare_periods(path, table, columns[], ..., agg?)` — same metric, two windows
- `compare_members(paths[], metric, ...)` — cluster member side-by-side

**Overview & export**
- `health_summary(path, start?, end?)` — deep summary for a window
- `export_csv(path, output_path, ...)` — write results to local CSV
- `sql_read(path, query, params?, ...)` — read-only escape hatch with guardrails

**Analyst workflow**
- `validate_cpview_db(path)` — structural validation
- `explain_metric(metric)` — rich metric info
- `find_baseline_periods(path, duration?, ...)` — find quiet windows for comparison
- `analyze_process(path, process_name, ...)` — per-process CPU/memory deep dive
- `top_contributors(path, metric, ...)` — top processes/disks/interfaces for a resource
- `build_timeline(path, start, end, granularity?)` — bucketed event timeline
- `investigate_window(path, center_time, before?, after?)` — one-call incident investigation
- `generate_report(path, start?, end?, focus?, format?, peer_path?)` — full markdown report

### Resources

- `cpview://glossary` — static cpview metric glossary + alias map
- `cpview://{path}/tables` — table list with row counts
- `cpview://{path}/schema` — column manifest
- `cpview://{path}/overview` — same payload as `inspect_database`

---

## HA / ClusterXL Support

When the database comes from a cluster member, several tools automatically add HA-aware output.

### Authoritative vs cached state — important distinction

| Table | Column | What it actually reflects | Use for state analysis? |
|---|---|---|---|
| `cxl_cxl_stats` | `fwha_cpv_last_state_change` | Local `fwha` state machine — what `cphaprob state` would print, including `ACTIVE(!)` degraded flag | **YES — authoritative** |
| `cxl_cxl_stats_status` | `member_state` | CCP membership cache — may show `ACTIVE` for a member that is locally `DOWN` | **NO — stale cache** |

Always use `cxl_cxl_stats.fwha_cpv_last_state_change` for state analysis.
`cxl_cxl_stats_status.member_state` is only useful for seeing what remote members reported via CCP.

### HA-aware tool output

- **`inspect_database`** — adds `ha_context` block: names the authoritative column, samples the latest local state, and warns when the two tables disagree
- **`health_summary`** — adds `ha_state_dwell`: time spent in each state (`ACTIVE`, `DOWN`, `ACTIVE(!)` …) across the requested window, plus a `status_table_warning` when `cxl_cxl_stats_status` contradicts the authoritative state
- **`find_system_events`** — reads state transitions from `cxl_cxl_stats.fwha_cpv_last_state_change` (not the status table), returns a `warnings[]` array whenever the two tables disagree within the window

---

## HTTP Transport

By default this server uses **stdio** transport — the server runs as a subprocess on the
same machine as your MCP client, which is also where your files must reside.

An **HTTP transport** (MCP Streamable HTTP) is available for shared or multi-user
deployments, but it does not change the file-access model: every tool accepts a file
**path** that must resolve on the machine running the server. There is no mechanism
to upload a file over the MCP connection.

> **When HTTP transport makes sense:** the server is running on a host that already
> has the files accessible — e.g. a shared team server with CPInfo/CPViewDB files
> mounted, or a host adjacent to the gateways you are analyzing.
>
> **When to stick with stdio:** you are analyzing files on your own workstation.
> Stdio is simpler, has no authentication exposure, and is the recommended default.

> **Security notice:** The HTTP server has no built-in authentication and no TLS.
> Any client that can reach the port can establish a session. Only use HTTP transport
> behind an authenticated reverse proxy that terminates TLS and enforces
> authentication.

### Starting in HTTP mode

```bash
MCP_TRANSPORT_TYPE=http MCP_TRANSPORT_PORT=3000 npx @chkp/cpview-history-mcp
# or
npx @chkp/cpview-history-mcp --transport http --transport-port 3000
```

---

## Development

### Prerequisites

- Node.js 22.5+
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
# Build just the cpview-history package
npx nx build @chkp/cpview-history-mcp

# Or build all packages
npm run build
```

### Running Locally

```bash
# From the repository root
node packages/cpview-history-mcp/dist/index.js

# Or use the npm script
cd packages/cpview-history-mcp
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

---

## Troubleshooting

### Database File Not Found
Ensure the path you pass into a tool is absolute and the file exists:
```bash
ls -la /absolute/path/to/CPViewDB.dat
```

### "unable to open database file" on Network Shares
The server opens databases with `immutable=1`, which avoids SQLite locking on SMB/network shares. If you still see open errors, copy the file to a local disk and retry.

### Unknown Table or Column
Table names vary across gateway versions. Use `search_schema` or `find_tables` to discover the right table — error responses also include "did you mean" suggestions.

---

## Support

For issues, questions, or contributions:
- GitHub Issues: [https://github.com/CheckPointSW/mcp-servers/issues](https://github.com/CheckPointSW/mcp-servers/issues)
- Documentation: [https://checkpointsw.github.io/mcp-servers/](https://checkpointsw.github.io/mcp-servers/)

## License

MIT License - see [LICENSE](../../LICENSE) file for details.

---

## ⚠️ Security Notice

1. **Only use client implementations you trust.** Malicious or untrusted clients could misuse access to your files or data improperly.
2. **Database content is exposed to the model.** CPView history data (process names, interface names, performance metrics) is sent to the AI model during analysis. Ensure that you only use models and providers that comply with your organization's policies for handling sensitive data.

## 📊 Telemetry and Privacy

**Anonymous Usage Statistics:** Check Point collects anonymous usage statistics to improve this MCP server. Only tool usage patterns and anonymous identifiers are collected—no file contents, paths, or sensitive data.

**Opt-Out:** Set `TELEMETRY_DISABLED=true` environment variable or use the `--no-telemetry` flag to disable telemetry collection.
