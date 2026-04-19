// @ts-nocheck — MCP SDK Zod3/4 compat triggers TS2589 on registerPrompt; this file is pure text templates
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPrompts(server: McpServer): void {
    server.registerPrompt(
        'default',
        { description: 'Default prompt for Argos CLI assistant' },
        () => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: `You are a Cyberint Argos CLI assistant. Your purpose is to help cybersecurity analysts interact with the Argos platform.

Here's a summary of the available tools and what they do:

**Multi-Tenant Customer Management**
- \`list_customers\`: Lists all available customers/tenants. Use this to see which organisations you can query.
- \`select_customer\`: Switches the active customer for this session. Pass "ALL" to query across all tenants.

**Alerts & Incidents**
- \`get_alert_metadata\`: Use this tool FIRST to discover available alert types and categories before filtering alerts.
- \`get_alerts\`: Search and filter security alerts by date, severity, status, and type.
- \`get_alert_details\`: Retrieve a specific alert by its reference ID with optional intelligence enrichment.

**Assets & Attack Surface**
- \`get_assets\`: Get asset inventory filtered by type, status, and creation date. Use fetch_technologies=True for tech stack.

**Vulnerabilities (CVEs)**
- \`get_vulnerability_details\`: Get detailed CVE info including exploit intelligence.
- \`search_vulnerabilities_by_technology\`: Find CVEs for a specific software product and version.

**Indicators of Compromise (IOCs)**
- \`enrich_iocs\`: Enrich IPs, domains, URLs, and file hashes with threat intelligence.

**Credentials Exposure**
- \`check_credential_exposure\`: Search for exposed credentials by domain or email.

**Threat Intelligence & News**
- \`get_threat_landscape_metadata\`: Discover filter options for threat news.
- \`get_threat_landscape_news\`: Retrieve security news filtered by region, sector, and date.

**Threat Actors**
- \`get_threat_actors_metadata\`: Discover filter options for threat actors.
- \`get_most_active_threat_actors\`: Get most active threat actors filtered by country and sector.
- \`get_threat_actor_by_id\`: Get comprehensive threat actor details.

**Malware Analysis**
- \`get_malware_by_id\`: Get detailed malware info by ID (found in IOC enrichment results).

**Security Analytics & Risk Assessment**
- \`get_security_analytics\`: Get high-level security posture and risk overview.

Please use the appropriate tool based on the user's question. If you are unsure, you can always ask for clarification.`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'investigate-alert',
        {
            argsSchema: {
                alert_id: z.string().describe('Alert ID to investigate'),
            },
        },
        (args: Record<string, string>) => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: `Conduct a comprehensive investigation of alert ID ${args.alert_id}:
1. Retrieve complete alert details using get_alert_details with fetch_intel_items=True
2. Enrich all discovered IOCs using enrich_iocs
3. For any malware or threat actor entities found, use get_malware_by_id / get_threat_actor_by_id
4. For any CVE references, use get_vulnerability_details
5. Investigate affected assets using get_assets with fetch_technologies=True
6. Check for exposed credentials using check_credential_exposure
7. Search for related alerts using get_alerts from the last 30 days
8. Get threat intelligence context using get_threat_landscape_news
9. Generate comprehensive investigation report with risk assessment and remediation steps`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'security-posture-report',
        {
            description:
                'Generate comprehensive executive security posture report',
        },
        () => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: `Generate a comprehensive executive security posture report:
1. Retrieve overall security analytics using get_security_analytics
2. Get open alerts from the last 30 days grouped by severity using get_alerts
3. Identify top 5 critical alerts and get details using get_alert_details
4. Get asset inventory statistics using get_assets
5. Provide overall risk level, key metrics, critical threats, and executive recommendations`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'ioc-investigation',
        {
            argsSchema: {
                ioc: z
                    .string()
                    .describe('Indicator of Compromise to investigate'),
            },
        },
        (args: Record<string, string>) => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: `Investigate the indicator of compromise: ${args.ioc}
1. Enrich the IOC using enrich_iocs
2. For malware/threat actor entities found, use get_malware_by_id / get_threat_actor_by_id
3. Search for related alerts using get_alerts from the last 30 days
4. Get threat landscape context using get_threat_landscape_news
5. Provide risk assessment, attribution, and recommended actions`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'asset-risk-assessment',
        {
            argsSchema: {
                asset_type: z
                    .string()
                    .optional()
                    .describe('Optional asset type to filter by'),
            },
        },
        (args: Record<string, string | undefined>) => {
            const assetFilter = args.asset_type
                ? ` of type '${args.asset_type}'`
                : '';
            return {
                messages: [
                    {
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: `Generate a comprehensive asset risk assessment${assetFilter}:
1. Retrieve all monitored assets${assetFilter} with tech stacks using get_assets with fetch_technologies=True
2. For each technology, use search_vulnerabilities_by_technology to find CVEs (CVSS >= 7.0)
3. Check for exposed credentials using check_credential_exposure for domains
4. Get threat actor intelligence using get_threat_actors_metadata then get_most_active_threat_actors
5. Correlate with recent alerts using get_alerts from the last 30 days
6. Generate prioritized risk assessment with remediation roadmap`,
                        },
                    },
                ],
            };
        }
    );

    server.registerPrompt(
        'alert-triage',
        {
            argsSchema: {
                days: z
                    .string()
                    .optional()
                    .describe('Number of days to look back (default: 7)'),
                severity: z
                    .string()
                    .optional()
                    .describe('Minimum severity level (default: very_high)'),
                status: z
                    .string()
                    .optional()
                    .describe(
                        'Alert status filter (default: open,acknowledged)'
                    ),
            },
        },
        (args: Record<string, string | undefined>) => {
            const days =
                typeof args.days === 'string'
                    ? Number.parseInt(args.days, 10)
                    : 7;
            const severity = args.severity ?? 'very_high';
            const status = args.status ?? 'open,acknowledged';

            return {
                messages: [
                    {
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: `Perform alert triage and prioritization:
1. Get all ${severity}+ severity, ${status} alerts from last ${days} days using get_alerts
2. Get details for each alert using get_alert_details with fetch_intel_items=True
3. Enrich all IOCs using enrich_iocs
4. For malware/threat actors found, use get_malware_by_id / get_threat_actor_by_id
5. Cross-reference affected assets using get_assets
6. Rank by risk score and generate prioritized triage report for SOC team`,
                        },
                    },
                ],
            };
        }
    );
}
