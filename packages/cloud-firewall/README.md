# Check Point Cloud Firewall MCP

Manage Check Point Cloud Firewall through your MCP client. This release supports Cloud Firewall deployments on AWS, Azure and GCP. The Cloud Firewall backend enforces permissions and provisioning rules.

## What is MCP?

The Model Context Protocol (MCP) lets AI clients discover and call tools. This server connects them to Cloud Firewall APIs using your configured identity.

## Why MCP for Cloud Firewall?

Use natural-language requests to inspect deployments and prepare changes from your MCP client. The default advisor mode provides read access; creation and peering require write mode, a preview and your explicit approval.

## Features

- **Deployment visibility**: List deployments and inspect their status, gateways and traffic metrics.
- **Deployment creation**: Prepare AWS, Azure and GCP deployments with a preview and explicit approval.
- **Azure VNet peering**: Request peerings and inspect their backend status.
- **Setup guidance**: Retrieve the public AWS deployment guide and identify remaining setup steps.

## Example Use Cases

### Deployment Inventory
"List my Cloud Firewall deployments."

Returns the inventory available to your identity.

### Deployment Status and Traffic
"Show this deployment's status, gateways and traffic metrics."

Retrieves separate backend observations to help inspect the deployment.

### Prepare a Deployment
"Help me prepare an Azure firewall deployment."

Collects missing inputs, shows a preview and waits for approval before submission.

### Inspect Azure Peerings
"Show the VNet peerings for this deployment."

Returns backend peering records and their observed statuses.

## Configuration Options

These settings connect the MCP server to Cloud Firewall. Deployment settings, such as cloud region and capacity, are collected separately when you create a deployment.

| Setting | Environment variable | CLI flag | Default |
|---|---|---|---|
| Infinity Portal Client ID | `CFW_CLIENT_ID` | `--client-id` | Unset |
| Infinity Portal Secret Key | `CFW_ACCESS_KEY` | `--access-key` | Unset |
| Infinity Portal account region | `CFW_REGION` | `--region` | `EU` outside Check Point hosting |
| Read-only or write access | `CFW_MODE` | `--mode` | `advisor` |
| API key type | `CFW_AUTH_KIND` | `--auth-kind` | `auto` |

- **Region:** Choose your Infinity Portal account region, independently of the AWS, Azure or GCP deployment region. Hosted defaults are described under [HTTP Transport](#http-transport).
- **Mode:** `advisor` provides read tools. `write` also exposes deployment creation and Azure peering requests. Keep these tools on your client's per-call approval.
- **Credentials:** API key reads require Readonly privileges; writes require Admin privileges. Backend tools require a complete API key pair or portal token. `ping` works without credentials.
- **Key type:** `auto` tries service-key authentication and falls back to user-key authentication only on a 401. Use `service` or `user` when the key type is known.

<details>
<summary>Advanced settings — use only when instructed by Check Point support</summary>

| Setting | Environment variable | CLI flag | Default |
|---|---|---|---|
| Backend environment | `CFW_CPCF_ENV` | `--cpcf-env` | `prod` |
| Gateway override | `CFW_GATEWAY_URL` | `--gateway-url` | Region gateway |

Gateway overrides must use HTTPS under `checkpoint.com`.

</details>

## Client Configuration

### Prerequisites

- Node.js 20 or later; check your installation with `node --version`.
- An MCP client. Configuration examples below cover Claude Desktop, VS Code, Cursor and Windsurf.
- An Infinity Portal API key with access to Cloud Firewall for local clients. Hosted clients can use the portal token supplied by their platform.

Replace `VERSION` in the examples with the published package version approved for your environment. Store credentials in your client configuration or credential store; keep them out of the conversation and source control.

### API credentials

For local clients, obtain an Infinity Portal API key with access to Cloud Firewall using the [Portal API Keys guide](https://sc1.checkpoint.com/documents/Infinity_Portal/WebAdminGuides/EN/Infinity-Portal-Admin-Guide/Content/Topics-Infinity-Portal/API-Keys.htm). Configure its **Client ID** as `CFW_CLIENT_ID` and **Secret Key** as `CFW_ACCESS_KEY`. Set `CFW_REGION` to your Infinity Portal account region, independently of the cloud deployment region. Hosted clients can use the portal token supplied by their platform instead.

### Claude Desktop

Open **Settings → Developer → Edit Config**, as described in the [local MCP setup guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers). The configuration file is:

| Operating system | File |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Merge the following server entry into your existing `mcpServers` object, preserving other servers. Replace the credential placeholders using your client's environment configuration or credential-store integration.

```json
{
  "mcpServers": {
    "cloud-firewall": {
      "command": "npx",
      "args": ["-y", "@chkp/cloud-firewall-mcp@VERSION"],
      "env": {
        "CFW_CLIENT_ID": "YOUR_CLIENT_ID",
        "CFW_ACCESS_KEY": "YOUR_ACCESS_KEY",
        "CFW_REGION": "EU"
      }
    }
  }
}
```

Save the file, fully quit and reopen Claude Desktop, then follow the [connection checks](#verify-the-connection). To enable creation and peering tools, add `"CFW_MODE": "write"` to `env` and reconnect. Source installations can use the [local build](#development) instead of `npx`.

### VS Code

Merge the `inputs` entries and server entry below into your workspace’s `.vscode/mcp.json`, preserving existing inputs and servers. VS Code prompts for the credentials instead of storing them in the workspace file. Use the selected package version from above:

```json
{
  "inputs": [
    { "type": "promptString", "id": "cfw-client-id", "description": "Cloud Firewall Client ID", "password": true },
    { "type": "promptString", "id": "cfw-access-key", "description": "Cloud Firewall Secret Key", "password": true }
  ],
  "servers": {
    "cloud-firewall": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chkp/cloud-firewall-mcp@VERSION"],
      "env": {
        "CFW_CLIENT_ID": "${input:cfw-client-id}",
        "CFW_ACCESS_KEY": "${input:cfw-access-key}",
        "CFW_REGION": "EU"
      }
    }
  }
}
```

Add `"CFW_MODE": "write"` to `env` when you need creation or peering tools.

### Cursor

Merge the Claude Desktop `mcpServers` entry into your personal `~/.cursor/mcp.json`, then restart Cursor. See [Cursor’s MCP setup](https://cursor.com/docs/mcp). Keep credential-bearing configuration out of project source control.

### Windsurf

Open the MCP configuration through Windsurf’s MCP settings and merge the same `mcpServers` entry, with your credentials and selected package version. Save and reconnect the server.

### Verify the connection

After saving your configuration and reconnecting:

1. Ask **"Use Cloud Firewall ping."** Expect `status: ok`, the package version and the active mode (`advisor` by default). This verifies the MCP connection, not Portal authentication.
2. Ask **"List my Cloud Firewall deployments."** A successful response, including an empty inventory, verifies authenticated read access. For errors, see [Troubleshooting](#troubleshooting).

## Available Tools

Read tools are available in both modes. Creation and peering requests require `write` mode.

| Tool | Mode | Use it to |
|---|---|---|
| `ping` | Both | Check the server version and active mode; no credentials required |
| `get_deployments` | Both | List deployments available to your identity |
| `deployment_status` | Both | Read a deployment's settings, provisioning status and error details |
| `get_deployment_gateways` | Both | Inspect gateway observations |
| `get_deployment_monitoring` | Both | Read traffic metrics; optional `from`/`to` are epoch seconds |
| `get_deployment_guide` | Both | Retrieve the public AWS setup guide, optionally with current deployment state |
| `get_azure_vnet_peerings` | Both | Read Azure peering records and statuses |
| `get_gcp_deployment_info` | Both | Read the GCP intercept deployment group ID and live gateways |
| `create_deployment_aws` | Write | Preview and create an AWS deployment |
| `create_deployment_azure` | Write | Preview and create an Azure deployment |
| `create_deployment_gcp` | Write | Preview and create a GCP deployment |
| `add_azure_vnet_peerings` | Write | Preview and request Azure VNet peerings |

Tool results contain backend observations with secret-shaped fields removed. Status, gateways and monitoring are separate reads; empty results do not establish health. Deleted deployments can remain in the inventory. A standalone status request reads current state once; for ongoing provisioning, see [Follow provisioning and complete setup](#follow-provisioning-and-complete-setup).

## Deployment workflows

### Prepare deployment inputs

Ask **"Help me deploy Cloud Firewall on AWS, Azure or GCP"**, or use `deploy_aws_firewall_prompt`, `deploy_azure_firewall_prompt` or `deploy_gcp_firewall_prompt` if your client supports MCP prompts.

Provide settings you already know; the assistant should collect only what is missing. Select a cloud below for its main inputs. The create tool's schema defines the current fields and requirements; the backend owns supported configurations, capacity, plans and defaults.

#### AWS inputs

- Deployment name, AWS region and protected account ID.
- Security plan and throughput.
- Selected availability-zone **IDs**, or explicit agreement for the backend to select zones.
- Management type and SIC one-time password (`sicPassword`); reachable management server IPv4 addresses for self-hosted management.

#### Azure inputs

- Deployment name, Azure region and customer tenant ID; confirm intended customer subscriptions when applicable.
- Security plan and throughput.
- A new security VNet CIDR and workload VNet CIDRs to protect. Check for overlaps with workload and connected networks, and identify unchecked ranges.
- Management type and SIC one-time password (`sicPassword`); reachable management server IPv4 addresses for self-hosted management.

#### GCP inputs

- Deployment name, GCP region, security plan and existing gateway runtime service-account email. GCP uses autoscaling rather than a throughput tier.
- Management object name and SIC one-time key (`sicKey`).
- Management type and, for self-hosted management, management source CIDRs. An omitted management type defaults to self-hosted.

#### Optional discovery

Supply identifiers manually, or authorize read-only discovery through a separate cloud operations MCP or CLI. Cloud Firewall MCP receives no cloud-provider credentials and runs no cloud CLIs. Reuse the selected account, subscription or project; listing alternatives is optional. AWS discovery supports SSO or explicitly chosen temporary credentials through that external connection. GCP's discovery identity can differ from the gateways' runtime service account.

A separate management MCP can help find self-hosted management addresses or source CIDRs. Confirm reachability and NAT mapping; API URLs alone do not establish connectivity. Discovery does not change management objects or initialize SIC.

### Preview and approve

1. Enable `write` mode and provide the deployment inputs.
2. Ask for a preview. It checks local input shape and shows the intended action, explicit settings, backend defaults and warnings without provisioning resources.
3. Review the preview and explicitly approve it. Changed inputs or an expired confirmation require a fresh preview and approval.
4. The client submits the approved request. Backend acceptance starts provisioning; follow it using the returned deployment ID.

A confirmation token proves that a preview occurred; your MCP client must obtain explicit approval before submitting.

Review explicit settings, warnings and **Advanced settings: backend defaults**; ask for the effective configuration if needed. A preview does not verify cloud permissions or guarantee backend acceptance. If a write times out, inspect existing resources before submitting again; never retry automatically.

<details>
<summary>Supplying the SIC secret</summary>

For local single-user stdio, set `CFW_SIC_OTP` in the server environment before startup. Supply `sicPassword` (AWS/Azure) or `sicKey` (GCP) as `$env:CFW_SIC_OTP` to avoid placing its value in the conversation. Only allowlisted `CFW_SIC_*` variables are accepted. Reconnect after changes and remove the secret after deployment.

HTTP callers supply the secret inline; it may be visible to their client or model.

</details>

### Follow provisioning and complete setup

Use `deployment_status` to inspect progress and any backend errors. **`active` alone does not establish traffic protection.** Check gateways and monitoring separately, then complete cloud connectivity, management, policy and routing through Infinity Portal and your existing procedures.

| Cloud | Next step after provisioning |
|---|---|
| AWS | Read `customerConnection` in the deployment status for the endpoint service name. Use the public AWS guide through `get_deployment_guide` for the remaining setup steps. |
| Azure | Inspect existing peerings. If needed, follow [Azure VNet peering](#azure-vnet-peering) to preview and request them. |
| GCP | Use `get_gcp_deployment_info` for the intercept deployment group ID used to connect the customer VPC and for live gateway records. |

The guide tool currently retrieves only the public AWS guide. For Azure and GCP, use **Getting Started** in Infinity Portal and your existing deployment procedures. The MCP does not create customer endpoints, change workload routes or NSGs, manage CME, or verify end-to-end protection.

<details>
<summary>Waiting, interruption and resuming status checks</summary>

Waiting is client-controlled. The server suggests checks at least 30 seconds apart for up to ten minutes, stopping on completion, failure, interruption or the deadline. Interrupting the client stops observation; submitted cloud operations continue. Resume with the same deployment ID and explicitly request further waiting if needed. There is no background monitoring or server-side stop/resume command.

</details>

### Azure VNet peering

Use `add_azure_vnet_peerings` with the deployment ID and full customer VNet resource IDs. Review the preview and permission prerequisites, then explicitly approve the request. The backend creates and reconciles the peerings asynchronously.

The deployment app (`appId` in `deployment_status`) needs peering permissions on each customer VNet. Resolve its service principal in the customer subscription's Entra tenant; hub-side and customer-tenant object IDs can differ. Prefer a peering-only role scoped to each customer VNet. IAM changes require separate authorization. See [Microsoft's peering permissions](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-peering#permissions).

Follow records with `get_azure_vnet_peerings`. An empty list or an `absent` observation alone does not identify a failure cause. If the backend returns an error, report it; otherwise investigate with the deployment/peering IDs and timestamps. A connected peering still requires separate checks of gateway health, policy, routing and traffic.

### Troubleshooting

| Symptom | What to check |
|---|---|
| Missing credentials or authentication failure | Check the Client ID, Secret Key and Portal account region, or the hosted caller's portal token. Reconnect after changing launch settings. |
| Creation or peering tools are unavailable | Check that the server starts in `write` mode and your client has reconnected. A caller cannot raise an advisor server to write mode. |
| Preview succeeds but submission fails | Read the backend error and correct the indicated inputs or permissions. Preview checks do not establish backend acceptance. |
| Provisioning fails | Read the deployment status and returned error details. Preserve the deployment ID for investigation; do not create a replacement automatically. |
| A write times out | Inspect deployments or peering records to determine whether it was accepted before considering another approved request. |
| Deployment is active but setup is incomplete | Follow the cloud-specific next steps above and verify connectivity, management, policy and routing separately. |

## HTTP Transport

### Starting the server

Stdio is the default. Shared HTTP access must use an authenticated TLS gateway/reverse proxy; the local HTTP server provides neither. Keep its port private: any client reaching it can establish a session.

From `packages/cloud-firewall` after a [source build](#development):

```bash
MCP_TRANSPORT_TYPE=http MCP_TRANSPORT_PORT=3000 node dist/index.js
# Equivalent CLI form:
node dist/index.js --transport http --transport-port 3000
```

### Caller credentials and headers

Connect clients to the authenticated proxy's `/mcp` endpoint:

| Header | Source and behavior |
|---|---|
| `CFW-CLIENT-ID` | Caller API client ID, paired with the caller's access key. Never inherited. |
| `CFW-ACCESS-KEY` | Caller access key. Never inherited. |
| `CLOUD-INFRA-TOKEN` | Caller portal token forwarded by the host; takes precedence over API keys. Never inherited. |
| `CFW-REGION` | Caller region; falls back to the operator's region, then `EU`. |
| `CFW-MODE` | Can lower write mode to `advisor`, never raise an advisor server to write. |
| `CFW-CPCF-ENV` | Caller backend environment; defaults to the server's environment. Underscores are also accepted. |

### Hosting and region selection

Each caller supplies a portal token or complete API key pair. Gateway URL and authentication kind are operator settings. Start hosted servers through the package entry point. For customer hosting, set `CFW_REGION` for each region. HTTP sessions inherit the server's resolved region unless the caller supplies `CFW-REGION`.

Region precedence is `--region` → `CFW_REGION` → in Check Point hosting, the pod's gateway (`CLOUDINFRA_HOST`) → `REGION` → `EU`. Only known Check Point HTTPS gateways are resolved, including staging and Japan. This selects the Infinity Portal gateway, independently of the cloud deployment region.

Keep credentials and routing fixed for each session; changed credentials require a new session. Multiple replicas require sticky MCP sessions for in-memory confirmations. Verify caller isolation and token forwarding before hosting.

## Development

Prerequisites: Node.js 20+ and npm. From the repository root:

```bash
npm ci
npm run build --workspace @chkp/mcp-utils
npm run build --workspace @chkp/quantum-infra
npm run build --workspace @chkp/cloud-firewall-mcp
npm run lint --workspace @chkp/cloud-firewall-mcp
npm test --workspace @chkp/cloud-firewall-mcp -- --runInBand
```

For a local client, keep its credential `env` block and replace the launch command with `"command": "node"` and `"args": ["/absolute/path/to/mcp-servers/packages/cloud-firewall/dist/index.js"]`. Rebuild and reconnect after source changes.

For published installations, update the pinned version and reconnect. Reconnection clears pending previews; obtain fresh previews and approvals.

## ⚠️ Security Notice

1. **Connection credentials stay in the server's authentication path.** API keys and portal tokens configured outside the conversation are not returned as tool results. Deployment SIC secrets supplied inline are tool arguments and may be visible to your client or model; stdio users can use the SIC environment reference described above.
2. **Use only trusted MCP clients.** Keep mutating tools on per-call approval, and do not expose the HTTP port without authenticated TLS access.
3. **Tool results are exposed to the model.** Deployment details, network configuration and traffic observations may be sensitive. Use clients and model providers approved for that data.

## 📊 Telemetry and Privacy

Telemetry is enabled by default.

**Anonymous Usage Statistics:** Check Point collects anonymous usage statistics to improve this MCP server. Only tool usage patterns and anonymous identifiers are collected—no credentials, policies, or sensitive data.

**Opt-Out:** Set `TELEMETRY_DISABLED=true` environment variable or use the `--no-telemetry` flag to disable telemetry collection.
