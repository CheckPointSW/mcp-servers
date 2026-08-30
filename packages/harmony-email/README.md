# Check Point Harmony Email & Collaboration MCP

## What is MCP?

Model Context Protocol (MCP) servers expose a structured, machine-readable API for your enterprise data, designed for AI-powered automation, copilots and decision engines. By delivering a clear, contextual slice of your security environment, MCP lets you query, analyze and act on complex systems without building custom SDKs or parsing raw exports.

## Why MCP for Harmony Email & Collaboration?

Harmony Email & Collaboration (HEC) protects email and the SaaS apps around it. Answering an everyday question - "did phishing go up this week?", "why was this message quarantined?", "who is waiting on a restore?" - usually means several console screens and a working knowledge of which engine produced which verdict.

This server puts that behind an MCP interface, with a SOC-analyst persona and a glossary so the assistant speaks HEC's own vocabulary. Broad questions are answered by server-side aggregators that return counts rather than message bodies, so a month-wide question stays cheap and keeps personal data out of the transcript. Remediation is available, and every remediation tool previews before it acts.

## Features

### 21 tools

**Investigate a single message**

1. **get_entity** - the structured record: per-engine verdicts, restore flags, action history, available actions
2. **read_email_headers** - key headers plus every `X-CLOUD-SEC-AV-*` the pipeline stamped on, and the verbatim block
3. **read_email_body** - decoded body, every link target with its anchor text, attachment names
4. **read_email_structure** - the MIME tree, with an optional still-encoded sample of one part
5. **download_entity** - the raw `.eml`, inline or via a short-lived presigned URL

**Search and summarize**

6. **query_events** - security events by window, type, state, severity, SaaS or free text
7. **query_entities** - emails and files by SaaS and window, with server-side predicates
8. **summarize_events** - counts grouped by type, severity, state, SaaS or day, with previous-window comparison
9. **summarize_entities** - counts grouped by verdict, restore state, remediation mode, entity type, SaaS or day
10. **get_event** - one event by id
11. **list_scopes** - which tenant this server is bound to

**Restore requests and remediation**

12. **action_quarantine** / 13. **action_quarantine_batch**
13. **action_restore** / 15. **action_restore_batch**
14. **action_deny_restore** / 17. **action_deny_restore_batch**
15. **report_misclassification** - feed back a wrong verdict, false positive or false negative
16. **get_task** - poll the background job a bulk action created

**Anti-Phishing exceptions**

20. **list_ap_exceptions** - the whitelist, blacklist or spam whitelist
21. **get_ap_exception** - one entry by id

### 4 prompts and a glossary

- **analyst_persona** - the voice, vocabulary and refusal stances the assistant should adopt
- **security_activity_summary** - "did phishing increase this week?", "recap the last 24 hours"
- **restore_request_report** - the pending queue, resolved counts, or the manual-vs-automatic trend
- **single_email_investigation** - explain one detection end to end
- **hec://glossary** - 27 canonical terms: entity vs event vs verdict, the five engines, event types, states and severities, the restore lifecycle

## Example Use Cases

### Daily activity recap

**"Summarize email security activity over the last 24 hours"**
One `summarize_events` call returns counts by type, severity and day. Nothing but numbers reaches the model.

### Trend question

**"Did phishing increase this week?"**
`summarize_events` with `compare_to_previous_window` returns both windows in a single call.

### Single-message investigation

**"Why was this email quarantined?"**
`get_entity` gives the combined verdict, which engines flagged it and what was already done. `read_email_headers` shows the SPF, DKIM and DMARC results; `read_email_body` shows where the links actually pointed.

### Restore-request triage

**"Show me all pending restore requests"**
`summarize_entities` grouped by `restore_state`, filtered to requested-but-unresolved, with a sample of rows to render.

### Remediation with a preview

**"Quarantine this message"**
The first call is a dry run: it echoes the exact payload and changes nothing. Only after explicit go-ahead does a second call with `confirm: true` submit the action and return a `task_id`.

## Configuration

Every setting can be given as a CLI flag, an environment variable, or an HTTP request header. `src/server-config.json` is the authoritative list.

| Setting                   | Flag                       | Environment variable     | Required |
| ------------------------- | -------------------------- | ------------------------ | -------- |
| Tenant domain             | `--hec-domain`             | `HEC_DOMAIN`             | yes      |
| API client id             | `--hec-client-id`          | `HEC_CLIENT_ID`          | yes      |
| API secret                | `--hec-secret`             | `HEC_SECRET`             | yes      |
| Auth flow override        | `--hec-auth-method`        | `HEC_AUTH_METHOD`        | no       |
| Region override           | `--hec-region`             | `HEC_REGION`             | no       |
| Tenant scope override     | `--hec-scope`              | `HEC_SCOPE`              | no       |
| Request timeout, seconds  | `--hec-request-timeout`    | `HEC_REQUEST_TIMEOUT`    | no (30)  |
| Max retries               | `--hec-max-retries`        | `HEC_MAX_RETRIES`        | no (3)   |
| Backoff base, seconds     | `--hec-retry-base-seconds` | `HEC_RETRY_BASE_SECONDS` | no (1)   |
| Max concurrent requests   | `--hec-max-concurrency`    | `HEC_MAX_CONCURRENCY`    | no (10)  |
| Batch action cap          | `--hec-action-batch-limit` | `HEC_ACTION_BATCH_LIMIT` | no (50)  |

The equivalent `SMARTAPI_MCP_*` environment variable names are also accepted.

### Credentials

- **Check Point tenants** (`*.checkpointcloudsec.com`): the Infinity Portal API key. `HEC_CLIENT_ID` is its `clientId`, `HEC_SECRET` its `accessKey`. Create one under Global Settings, API Keys.
- **Avanan tenants** (`*.avanan.net`): the SmartAPI `appId` and `secretKey`.

Region, tenant scope and API gateway are derived from `HEC_DOMAIN` automatically, by resolving the tenant's farm over DNS. The farm selects the gateway, not the AWS region: QA and production farms share AWS regions, but each environment has its own gateway, so a region-keyed lookup would send a QA tenant to the production host.

Resolution recognises the farms listed in `FARM_TO_REGION` (`src/core/resolver.ts`). A tenant on any other farm fails with a `ConfigError` naming the farms it knows; onboarding that farm means adding it to the table and releasing. There is no gateway URL override, by design: the gateway is always one of the hosts this package ships, so no request can point the server at an arbitrary host. Setting `HEC_REGION`, `HEC_SCOPE` and `HEC_AUTH_METHOD` together skips DNS resolution, still deriving the gateway from the shipped table. `HEC_AUTH_METHOD` also forces a flow when the credentials do not match the domain type, which is the usual case when Avanan-style credentials are issued against a Check Point tenant for testing.

### Verifying the configuration

```bash
# credentials, DNS resolution and the auth handshake
npx @chkp/harmony-email-mcp --check

# additionally exercise every read-only endpoint and report per step
npx @chkp/harmony-email-mcp --check --all
```

Both write their JSON report to stderr, since stdout is reserved for the MCP stdio channel. `--check --all` reports each endpoint as `ok`, `degraded` (upstream is unhappy, but the client is fine), `fail` or `skipped`, and only `fail` sets a non-zero exit code.

## Client Configuration

### Prerequisites

Install Node.js 20+ from [nodejs.org](https://nodejs.org/en/download/) if required, then verify with `node -v`.

### Supported Clients

This server has been tested with Claude Desktop, Cursor, GitHub Copilot, and Windsurf clients.
It is expected to work with any MCP client that supports the Model Context Protocol.

### Configuring the Claude Desktop App

#### Using a Bundled MCPB (formerly DXT)

1. Download the MCPB file: **[📥 harmony-email.mcpb](https://github.com/CheckPointSW/mcp-servers/releases/latest/download/harmony-email.mcpb)**
2. Open Claude Desktop App → Settings → Extensions
3. Drag the MCPB file and configure per the instructions.

#### Or Configure Manually

```json
{
    "mcpServers": {
        "harmony-email": {
            "command": "npx",
            "args": ["-y", "@chkp/harmony-email-mcp"],
            "env": {
                "HEC_DOMAIN": "your-tenant.avanan.net",
                "HEC_CLIENT_ID": "your-client-id",
                "HEC_SECRET": "your-secret"
            }
        }
    }
}
```

### VS Code

```json
{
    "mcp": {
        "servers": {
            "harmony-email": {
                "command": "npx",
                "args": ["-y", "@chkp/harmony-email-mcp"],
                "env": {
                    "HEC_DOMAIN": "your-tenant.avanan.net",
                    "HEC_CLIENT_ID": "your-client-id",
                    "HEC_SECRET": "your-secret"
                }
            }
        }
    }
}
```

Cursor and Windsurf use the same shape.

## HTTP Transport

The server also speaks Streamable HTTP, which lets one process serve several tenants:

```bash
npx @chkp/harmony-email-mcp --transport http --transport-port 3010
```

The endpoint is `http://localhost:3010/mcp`; `GET /health` reports the active session count. Each session supplies its own tenant through headers:

```
Hec-Domain: your-tenant.avanan.net
Hec-Client-Id: your-client-id
Hec-Secret: your-secret
```

**Send those headers on every request, not only on `initialize`.** Session settings are rebuilt from each request's headers, and a request that omits them fails with a configuration error. There is deliberately no fallback to the server process's own `HEC_*` environment: a client must never be able to act as whichever tenant the operator configured.

VS Code:

```json
"harmony-email": {
  "url": "http://localhost:3010/mcp",
  "type": "http",
  "headers": {
    "Hec-Domain": "your-tenant.avanan.net",
    "Hec-Client-Id": "your-client-id",
    "Hec-Secret": "your-secret"
  }
}
```

## Development

```bash
npm run build        # esbuild bundle to dist/
npm run build:tsc    # plain tsc, for chasing type errors
npm test             # jest
npm run dev          # tsc --watch
```

## ⚠️ Security Notice

**Credentials.** The client id and secret authenticate as your API key against a real tenant. Supply them through environment variables, a secret manager, or per-request headers. Never hardcode them, never commit them, and never paste them into a chat. Under HTTP transport a session is built from its own request headers alone, with no fallback to the server's environment, so a header-less request fails rather than borrowing the operator's tenant.

**Gateway.** The API gateway is always one of the hosts this package ships, chosen from the tenant's farm. No flag, environment variable or header can point the server at another host.

**Least privilege.** This server can read message content and can quarantine, restore and deny-restore mail. Issue it an API key scoped to the smallest set of permissions your use case needs.

**Customer data.** `get_entity`, the `read_email_*` tools and `download_entity` return message content: subjects, addresses, headers, links and attachment metadata. Anything a tool returns is passed to your MCP client and, from there, to whichever model provider you have configured. Review that posture before pointing this at a production tenant. The two `summarize_*` tools are the counts-only path and return no message content at all: `summarize_entities` with `sample_limit` adds entity ids, timestamps, restore state and the scalar fields of the combined verdict, and still no subject, addresses, headers or attachment names.

**Destructive actions.** Quarantine, restore, deny-restore and misclassification reporting all default to a dry run that makes no upstream call. They act only when called again with `confirm: true`. Batch variants are capped (default 50) and an oversized batch is rejected outright, never silently truncated.

**No duplicated actions.** Read-only calls retry on 408, 429 and 5xx. State-changing calls retry only on 429, which upstream returns instead of running the request; a 408 or 5xx there is ambiguous, since the action may already have been enqueued, so it fails once as `AmbiguousActionError` telling you to check the task or entity state rather than silently submitting it twice.

**Logging.** Credentials, tokens and message content are never written to the log. Structured log fields pass through a redactor that scrubs known-sensitive keys and anything JWT-shaped, and upstream response diagnostics are allowlisted rather than redacted: status, request ids and a few fixed headers only. An upstream error body can quote a filter or an address, so it rides on the error returned to the caller and never reaches a log line.

## 📊 Telemetry and Privacy

**Anonymous Usage Statistics:** Check Point collects anonymous usage statistics to improve this MCP server. Only tool usage patterns and anonymous identifiers are collected (tool name, server version, machine id), no credentials, tenant data or tool arguments.

**Opt-Out:** Set `TELEMETRY_DISABLED=true` environment variable or use the `--no-telemetry` flag to disable telemetry collection.
