#!/usr/bin/env node

import { z } from 'zod';
import { 
  launchMCPServer, 
  createServerModule,
  SessionContext,
  createApiRunner,
  createMcpServer
} from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ArgosERMAPIManager } from './api-manager.js';
import { Settings } from './settings.js';
import { parseListParam, isValidUuid4 } from './schemas.js';
import * as Types from './types.js';

const { server, pkg } = createMcpServer(import.meta.url, {
  description: 'Check Point Argos ERM MCP Server for External Risk Management'
});

// API Base Paths
const ALERT_API_BASE = '/alert/api/v1';
const ASSET_CONFIG_API_BASE = '/asset-configuration/external/api/v1';
const IOC_API_BASE = '/ioc/api/v1';
const CVE_INTEL_API_BASE = '/cve-intel/external/api/v1';
const KNOWLEDGEBASE_API_BASE = '/knowledgebase/external/api/v1';
const EXPOSED_CREDENTIALS_API_BASE = '/exposed-credentials';

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  Settings,
  pkg,
  ArgosERMAPIManager
);

// Create an API runner function
const runApi = createApiRunner(serverModule);

// ============================================================================
// PROMPTS
// ============================================================================

server.prompt(
  'default',
  'Default prompt for Argos CLI assistant',
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are a Cyberint Argos CLI assistant. Your purpose is to help cybersecurity analysts interact with the Argos platform.

Here's a summary of the available tools and what they do:

**Alerts & Incidents**
- \`get_alert_metadata\`: Use this tool FIRST to discover available alert types, categories, and subtypes before filtering alerts. Returns the complete hierarchical classification structure (category → type → subtype). Essential for understanding what alert type values can be used in get_alerts().
- \`get_alerts\`: Use this tool to get a list of security alerts. You can filter alerts by date, severity, status, and type. Call get_alert_metadata() first to see available alert type options. This is useful for getting an overview of current or historical alerts.
- \`get_alert_details\`: Use this tool to retrieve a specific alert by its reference ID. This is useful when you need to investigate a particular alert in detail. You can also use the \`fetch_intel_items=True\` option to get detailed intelligence for any indicators associated with the alert.

**Assets & Attack Surface**
- \`get_assets\`: Use this tool to get a list of assets from your inventory. You can filter assets by type, status, and creation date. To see the technology stack for each asset, use the \`fetch_technologies=True\` option.

**Vulnerabilities (CVEs)**
- \`get_vulnerability_details\`: Use this tool to get detailed information about a specific CVE by its ID, including exploit intelligence. This is useful for understanding the impact and mitigation of a specific vulnerability.
- \`search_vulnerabilities_by_technology\`: Use this tool to find vulnerabilities (CVEs) based on a specific technology product and its version. This helps you identify potential risks in your software stack.

**Indicators of Compromise (IOCs)**
- \`enrich_iocs\`: Use this tool to enrich and gather more information about potential threats. It accepts a list of IOCs (IPs, domains, URLs, and file hashes) and returns enrichment data for each.

**Credentials Exposure**
- \`check_credential_exposure\`: Use this tool to search for exposed credentials by domain or email. This is essential for identifying and mitigating credential leaks.

**Threat Intelligence & News**
- \`get_threat_landscape_metadata\`: Use this tool to discover the available filter options (regions, sectors, and labels) for threat landscape news. You should call this tool before \`get_threat_landscape_news\` to see how you can filter the news.
- \`get_threat_landscape_news\`: Use this tool to retrieve security news and threat intelligence. You can filter the news by region, sector, and date.

**Threat Actors**
- \`get_threat_actors_metadata\`: Use this tool to discover available filter options (countries, sectors) for threat actors. Call this before using \`get_most_active_threat_actors\` to see available filters.
- \`get_most_active_threat_actors\`: Use this tool to retrieve the most active threat actors, with filtering by countries and sectors to focus on relevant threats.
- \`get_threat_actor_by_id\`: Use this tool to get comprehensive details about a specific threat actor by its ID, including targeted countries and sectors.

**Malware Analysis**
- \`get_malware_by_id\`: Use this tool to get detailed information about a specific malware by its ID. Malware IDs can be found in IOC enrichment results under related_entities.

**Security Analytics & Risk Assessment**
- \`get_security_analytics\`: Use this tool to get a high-level overview of your organization's current security posture and risk analytics.

Please use the appropriate tool based on the user's question. If you are unsure, you can always ask for clarification.`,
        },
      },
    ],
  })
);

server.prompt(
  'investigate-alert',
  { alert_id: z.string().describe('Alert ID to investigate') },
  (args, _extra) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Conduct a comprehensive investigation of alert ID ${args.alert_id}:
1. Retrieve complete alert details using get_alert_details with fetch_intel_items=True to get:
   - Alert metadata (severity, status, type, timestamps)
   - All associated IOCs (IPs, domains, URLs, file hashes)
   - Affected assets and systems
   - Any CVE references
   - Embedded threat intelligence

2. Enrich all discovered IOCs using enrich_iocs to obtain:
   - Malicious scores and reputation data
   - Related malware families and threat actors
   - Attack patterns and campaigns
   - Geographic and infrastructure context

3. For any malware or threat actor entities found in enrichment:
   - Extract malware IDs (entity_type == "Malware") and use get_malware_by_id for detailed profiles
   - Extract threat actor IDs and use get_threat_actor_by_id for complete intelligence profiles including TTPs, motivation, and targeting patterns

4. For any CVE references in the alert:
   - Use get_vulnerability_details to get CVSS scores, exploit availability, and impact analysis
   - Assess exploitability and severity

5. Investigate affected assets using get_assets with fetch_technologies=True:
   - Get complete asset profiles including technology stacks
   - Check if assets have other active alerts or vulnerabilities
   - For each technology found, search for related CVEs using search_vulnerabilities_by_technology

6. Check for exposed credentials related to affected assets using check_credential_exposure

7. Search for related alerts using get_alerts from the last 30 days:
   - Look for similar alert types affecting the same assets
   - Identify potential campaign patterns or coordinated attacks
   - Check for alerts with matching IOCs or threat actors

8. Get relevant threat intelligence context:
   - Use get_threat_landscape_news to find recent reports about related malware, threat actors, or attack campaigns
   - Correlate alert details with current threat landscape

9. Generate comprehensive investigation report including:
   - Executive summary with alert severity and business impact
   - Complete IOC analysis with threat actor/malware attribution
   - Affected asset inventory with technology stack and vulnerability profile
   - CVE analysis with exploit availability and CVSS scores
   - Exposed credential findings if applicable
   - Related alerts and campaign indicators
   - Timeline of attack progression
   - Threat intelligence context from recent news
   - Risk assessment considering all factors (severity + exploitability + asset criticality + threat actor capability)
   - Immediate containment actions (isolate systems, block IOCs, reset credentials)
   - Short-term remediation steps (patch vulnerabilities, enhance monitoring)
   - Long-term security improvements (update defenses, threat hunting recommendations)

10. Format as actionable incident report for security team with clear priorities and next steps`,
        },
      },
    ],
  })
);

server.prompt(
  'security-posture-report',
  'Generate comprehensive executive security posture report',
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a comprehensive executive security posture report:
1. Retrieve overall security analytics and risk assessment using get_security_analytics
2. Get a summary of open alerts grouped by severity (critical, high, medium, low) from the last 30 days using get_alerts
3. Identify the top 5 most critical alerts and retrieve their details using get_alert_details
4. Get asset inventory statistics including total monitored assets using get_assets
5. Analyze the data and provide:
   - Overall risk level and trends
   - Key security metrics and alert distribution
   - Critical threats requiring immediate attention
   - Asset exposure summary
   - Executive recommendations with prioritized action items
6. Format the report in clear business language suitable for executive review`,
        },
      },
    ],
  })
);

server.prompt(
  'ioc-investigation',
  { ioc: z.string().describe('Indicator of Compromise to investigate') },
  (args, _extra) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Conduct a thorough investigation of the indicator of compromise: ${args.ioc}
1. Enrich the IOC using enrich_iocs to get comprehensive threat intelligence including malicious score, related entities, and attribution
2. Analyze the enrichment results:
   - If malware entities are found (entity_type == "Malware"), extract the malware IDs from related_entities and use get_malware_by_id to retrieve detailed malware profiles
   - If threat actor entities are found, extract their IDs and use get_threat_actor_by_id for complete intelligence profiles
3. Search for this IOC in recent alerts by using get_alerts for the last 30 days, then check alert details to see if this IOC appears
4. Search threat landscape news using get_threat_landscape_news for any mentions of related campaigns, malware families, or threat actors
5. Provide a comprehensive analysis including:
   - Risk assessment (severity level based on malicious score and context)
   - Malware family details if applicable (type, behavior, first/last seen)
   - Threat actor attribution if applicable (motivation, targeting, TTPs)
   - Related alerts and incidents in our environment
   - Threat intelligence context from recent news
   - Recommended immediate actions (block, monitor, investigate)
   - Recommended longer-term actions (update defenses, hunt for related IOCs)`,
        },
      },
    ],
  })
);

server.prompt(
  'asset-risk-assessment',
  { asset_type: z.string().optional().describe('Optional asset type to filter by') },
  (args, _extra) => {
    const asset_filter = args.asset_type ? ` of type '${args.asset_type}'` : '';
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a comprehensive asset risk assessment${asset_filter}:
1. Retrieve all monitored assets${asset_filter} with their technology stacks using get_assets with fetch_technologies=True
2. For each asset with identified technologies:
   - Extract the technology names and versions
   - Use search_vulnerabilities_by_technology to find known CVEs affecting each technology
   - Focus on critical and high severity vulnerabilities (CVSS >= 7.0)
3. Check for exposed credentials using check_credential_exposure for domain-based assets
4. Get threat actor intelligence:
   - First call get_threat_actors_metadata to discover available sectors
   - Then use get_most_active_threat_actors to identify threat actors targeting our sector and region
   - Get detailed profiles for the top 3 most active threat actors using get_threat_actor_by_id
5. Correlate assets with recent security alerts using get_alerts from the last 30 days to identify which assets have active threats
6. Generate a comprehensive risk assessment report including:
   - Total asset inventory count and breakdown by type
   - High-risk assets ranked by: vulnerability severity + credential exposure + active threats + threat actor targeting
   - Detailed vulnerability analysis with CVSS scores and exploit availability
   - Exposed credential summary with breach details
   - Threat actor landscape relevant to our assets and sector
   - Overall attack surface and exposure metrics
   - Prioritized remediation roadmap with effort vs. risk reduction estimates
   - Executive summary of business impact and immediate action items`,
          },
        },
      ],
    };
  }
);

server.prompt(
  'alert-triage',
  {
    days: z.string().optional().describe('Number of days to look back (default: 7)'),
    severity: z.string().optional().describe('Minimum severity level (default: very_high)'),
    status: z.string().optional().describe('Alert status filter (default: open,acknowledged)')
  },
  (args: Record<string, unknown>, _extra: any) => {
    const days = typeof args.days === 'string' ? parseInt(args.days, 10) : 7;
    const severity = typeof args.severity === 'string' ? args.severity : 'very_high';
    const status = typeof args.status === 'string' ? args.status : 'open,acknowledged';
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Perform comprehensive alert triage and prioritization:
1. Retrieve all alerts with '${severity}' severity AND HIGHER (e.g., if severity is 'high', include both 'high' and 'very_high') and '${status}' status from the last ${days} days using get_alerts with appropriate filters. Severity hierarchy: very_high > high > medium > low
2. For each alert found:
   - Get comprehensive alert details using get_alert_details with fetch_intel_items=True to include full threat intelligence
   - Extract all IOCs (indicators of compromise) from the alert
   - Extract affected assets and systems
3. Enrich all discovered IOCs using enrich_iocs to get threat intelligence, malicious scores, and related entities
4. For any malware or threat actors found in IOC enrichment:
   - Use get_malware_by_id for detailed malware analysis
   - Use get_threat_actor_by_id for comprehensive threat actor profiles
5. Cross-reference affected assets using get_assets to understand:
   - Asset criticality and business function
   - Technology stack and potential vulnerabilities
   - Monitoring status and security posture
6. Analyze and rank all alerts by comprehensive risk score considering:
   - Alert severity level
   - Asset criticality (production > development)
   - IOC malicious scores and threat actor attribution
   - Exploitability (known exploits available)
   - Current status (new vs. acknowledged)
7. Generate prioritized triage report including:
   - Ranked list of alerts (highest risk first)
   - For top 5 alerts provide:
     * Alert summary and severity
     * Affected assets and business impact
     * IOC analysis with threat actor/malware attribution
     * Exploitability assessment
     * Current containment status
   - Immediate action plan with specific steps for each top alert
   - Resource allocation recommendations
   - Estimated time to remediate each priority item
8. Format as actionable incident response plan for SOC team`,
          },
        },
      ],
    };
  }
);

// ============================================================================
// TOOLS START HERE
// ============================================================================

// Tool #1: get_alert_metadata
server.tool(
  'get_alert_metadata',
  `Get all available alert categories, types, and subtypes for alert filtering.

WHEN TO USE:
- ALWAYS call this BEFORE using get_alerts() for first time
- User asks "what alert types/categories are available?"
- User wants to see filtering options for alerts
- Need to validate alert type values before searching alerts
- User asks about the structure of alert classifications

PURPOSE:
- Discovers all valid alert categories, types, and subtypes
- Reveals the hierarchical relationship: Category → Type → SubType
- Prevents errors from using invalid alert type terms
- Helps users understand available alert classifications
- Essential for building effective alert search queries

WORKFLOW:
1. Call this function first
2. Show user available options
3. Use returned type values in get_alerts()

COMMON USER REQUESTS:
- "What alert types can I filter by?"
- "Show me available alert categories"
- "What kinds of alerts exist?"
- "What filters are available for alerts?"
- "What are the different alert classifications?"`,
  z.object({}).strict(),
  async (_params, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const response = await apiManager.get(`${ALERT_API_BASE}/alerts/metadata`);
      const data = await response.json();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving alert metadata: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #2: get_alerts
server.tool(
  'get_alerts',
  `Search and retrieve security alerts with comprehensive filtering options.

WHEN TO USE:
- User wants to see current or recent security alerts
- User asks for alerts by severity (critical, high, etc.)
- User wants to filter alerts by status or type
- User needs alerts from a specific time period

DEFAULT BEHAVIOR:
- If no dates provided: Returns last 24 hours of alerts
- Minimum limit enforced: 10 alerts (API constraint)
- Results include enrichment like 'has_iocs' field for quick IOC identification

COMMON USER REQUESTS:
- "Show me critical alerts from today"
- "Get all phishing alerts that are still open"
- "List high severity alerts from last week"
- "Find malware alerts affecting our infrastructure"`,
  {
    from_created_date: z.string().optional().describe('Start date for alert search (format: YYYY-MM-DD). If only this is provided, \'to\' defaults to today.'),
    to_created_date: z.string().optional().describe('End date for alert search (format: YYYY-MM-DD).'),
    severities: z.union([z.string(), z.array(z.string())]).optional().describe('Alert severity levels to include. Options: \'low\', \'medium\', \'high\', \'very_high\'. Can be single string or list: [\'high\', \'very_high\']'),
    statuses: z.union([z.string(), z.array(z.string())]).optional().describe('Alert status to filter by. Options: \'open\', \'closed\', \'acknowledged\'. Can be single string or list: [\'open\', \'acknowledged\']'),
    types: z.union([z.string(), z.array(z.string())]).optional().describe('Alert types to include. Get available options from get_alert_metadata(). The metadata shows the hierarchical structure of categories, types, and subtypes. Can be single string or list of type values. Examples: \'refund_fraud\', [\'phishing_email\', \'phishing_kit\'], \'ransomware\', [\'compromised_employee_credentials\']'),
    limit: z.number().default(10).describe('Number of alerts to return (minimum 10, default 10).'),
    offset: z.number().default(0).describe('Skip this many alerts for pagination (default 0).')
  },
  async ({ from_created_date, to_created_date, severities, statuses, types, limit = 10, offset = 0 }, extra) => {
    try {
      // Get API manager for this session
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      // Ensure customer_id is available
      if (!apiManager.customerId) {
        throw new Error('ARGOS_CUSTOMER_ID is not set in the environment.');
      }

      // Enforce API constraint: limit must be >= 10
      if (limit < 10) {
        limit = 10;
      }

      // Parse list parameters
      const severities_list = parseListParam(severities);
      const statuses_list = parseListParam(statuses);
      const types_list = parseListParam(types);

      // Build filters dict
      const filters_dict: Record<string, any> = {};
      if (severities_list) {
        filters_dict.severity = severities_list;
      }
      if (statuses_list) {
        filters_dict.status = statuses_list;
      }
      if (types_list) {
        filters_dict.type = types_list;
      }

      // Handle date filters
      if (from_created_date || to_created_date) {
        const created_date_filter: Record<string, string> = {};
        if (from_created_date) {
          created_date_filter.from = from_created_date;
        }
        if (to_created_date) {
          created_date_filter.to = to_created_date;
        } else if (from_created_date && !to_created_date) {
          // If only 'from' is provided, automatically set 'to' to today
          const today = new Date().toISOString().split('T')[0];
          created_date_filter.to = today;
        }
        if (Object.keys(created_date_filter).length > 0) {
          filters_dict.created_date = created_date_filter;
        }
      }

      // Automatically inject customer_id into environments
      filters_dict.environments = [apiManager.customerId];

      // Calculate page from offset and limit
      const page = limit > 0 ? Math.floor(offset / limit) + 1 : 1;

      // Build request payload
      const request_payload = {
        filters: filters_dict,
        page,
        size: limit
      };

      // Make API call
      const response = await apiManager.post(`${ALERT_API_BASE}/alerts`, request_payload);
      const data = await response.json();

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Invalid response format', raw: data })
          }]
        };
      }

      // Add simple enrichment (e.g., has_iocs) for usability
      if (data.alerts && Array.isArray(data.alerts)) {
        for (const alert of data.alerts) {
          if (typeof alert === 'object' && alert !== null) {
            const indicators = alert.indicators || [];
            alert.has_iocs = Array.isArray(indicators) && indicators.length > 0;
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving alerts: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #2: get_alert_details
server.tool(
  'get_alert_details',
  `Retrieve comprehensive details for a specific security alert by its ID.

WHEN TO USE:
- User mentions a specific alert ID/reference and wants details
- User wants to investigate or analyze a particular alert
- User needs full context about an alert including indicators
- Following up on alerts found in search results

INTELLIGENCE ENHANCEMENT:
- Set fetch_intel_items=True to get detailed threat intelligence for all IOCs
- This enriches each indicator with additional context and attribution
- Useful for threat hunting and incident response

COMMON USER REQUESTS:
- "Tell me about alert ABC-123"
- "Get full details for alert 456789"
- "Show me alert XYZ-999 with all intelligence data"
- "What are the indicators in alert DEF-555?"`,
  {
    ref_id: z.string().describe('The unique alert reference ID (e.g., "ALT-123456", "PHISH-789"). This is typically found in alert lists or notifications.'),
    severities: z.union([z.string(), z.array(z.string())]).optional().describe('Optional severity filter - only return the alert if it matches these severity levels: \'low\', \'medium\', \'high\', \'very_high\'. Returns empty dict if alert doesn\'t match severity filter.'),
    fetch_intel_items: z.boolean().default(false).describe('If True, enriches each indicator with detailed threat intelligence including malware families, campaigns, and attribution. Adds \'intel_item\' field to each indicator in the response.')
  },
  async ({ ref_id, severities, fetch_intel_items = false }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      // Parse severities parameter
      const severities_list = parseListParam(severities);
      
      // Get alert details
      const response = await apiManager.get(`${ALERT_API_BASE}/alerts/${ref_id}`);
      const alert_data = await response.json();

      // Validate response structure
      if (typeof alert_data !== 'object' || alert_data === null) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Invalid response format', raw: alert_data })
          }]
        };
      }

      // Apply severity filter if specified
      if (severities_list) {
        const alert_severity = alert_data.alert?.severity;
        if (!alert_severity || !severities_list.includes(alert_severity)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({})
            }]
          };
        }
      }

      // Fetch intelligence items for each indicator if requested
      if (fetch_intel_items && alert_data.alert?.indicators && Array.isArray(alert_data.alert.indicators)) {
        const indicators = alert_data.alert.indicators;
        
        for (const indicator of indicators) {
          const indicator_id = indicator.id;
          if (indicator_id) {
            try {
              const intel_response = await apiManager.get(
                `${ALERT_API_BASE}/alerts/${ref_id}/indicators/${indicator_id}`
              );
              indicator.intel_item = await intel_response.json();
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : String(e);
              indicator.intel_item = { error: errorMessage };
            }
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(alert_data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving alert details: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #3: get_assets
server.tool(
  'get_assets',
  `Retrieve and explore the organization's digital asset inventory with comprehensive filtering.

WHEN TO USE:
- User wants to see what assets are being monitored
- User asks about specific types of assets (domains, IPs, cloud resources)
- User needs to understand technology stack or attack surface
- Following up on assets mentioned in security alerts

TECHNOLOGY ENRICHMENT:
- Set fetch_technologies=True to get detailed tech stack for each asset
- Includes version information, vulnerability counts, and risk scores
- Essential for vulnerability management and tech stack analysis

DEFAULT BEHAVIOR:
- If no status specified: Returns only monitored assets (monitored_asm_and_ti, monitored_asm)
- Results are paginated - use page_number to navigate large inventories

COMMON USER REQUESTS:
- "Show me all our monitored domains"
- "List cloud assets with their technologies"
- "Find assets created in the last month"
- "Get all IP addresses we're tracking"`,
  {
    page_number: z.number().default(1).describe('Page number for pagination (starts at 1, default: 1).'),
    asset_type: z.union([z.string(), z.array(z.string())]).optional().describe('Types of assets to include. Options: Infrastructure: "domain", "subdomain", "ip", "url"; Cloud: "s3_bucket", "google_cloud_storage", "azure_storage_blob", "azure_data_lake", "aws_account", "gcp_project", "azure_subscription"; Identity: "email", "phone"; Business: "organization", "cloudflare_account"; Files: "file"'),
    status: z.union([z.string(), z.array(z.string())]).optional().describe('Monitoring status filter. Options: "monitored_asm_and_ti" - Full monitoring with threat intelligence; "monitored_asm" - Attack surface monitoring only; "pending_decision" - Awaiting classification; "not_monitored" - Discovered but not monitored; "unvalidated" - Needs validation; "irrelevant" - Marked as irrelevant; "inactive" - No longer active. Default: ["monitored_asm_and_ti", "monitored_asm"]'),
    created_from: z.string().optional().describe('Show only assets discovered after this date (format: YYYY-MM-DD).'),
    asset_name: z.string().optional().describe('Filter by specific asset name (partial matching supported).'),
    discovery_precision: z.number().default(0).describe('Minimum discovery confidence level (0-100, default: 0).'),
    fetch_technologies: z.boolean().default(false).describe('If True, includes detailed technology stack information with versions, CVE counts, and risk scores for each asset.')
  },
  async ({ page_number = 1, asset_type, status, created_from, asset_name, discovery_precision = 0, fetch_technologies = false }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      if (!apiManager.customerId) {
        throw new Error('ARGOS_CUSTOMER_ID is not set in the environment.');
      }

      // Parse list parameters
      const asset_type_list = parseListParam(asset_type);
      const status_list = parseListParam(status);

      // Build request payload
      const request_payload: Record<string, any> = {
        customer_id: apiManager.customerId,
        page_number,
        discovery_precision
      };

      if (asset_type_list) {
        request_payload.type = asset_type_list;
      }

      // Default status if not provided
      request_payload.status = status_list || ['monitored_asm_and_ti', 'monitored_asm'];

      if (created_from) {
        request_payload.created_from = created_from;
      }

      if (asset_name) {
        request_payload.asset_name = asset_name;
      }

      // Get assets
      const response = await apiManager.post(`${ASSET_CONFIG_API_BASE}/assets/`, request_payload);
      const assets_data = await response.json();

      // Validate response structure
      if (typeof assets_data !== 'object' || assets_data === null) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Invalid response format', raw: assets_data })
          }]
        };
      }

      // Fetch technologies if requested
      if (fetch_technologies && assets_data.assets && Array.isArray(assets_data.assets)) {
        const asset_ids = assets_data.assets
          .filter((asset: any) => asset && asset.id)
          .map((asset: any) => asset.id);

        if (asset_ids.length > 0) {
          const tech_payload = {
            customer_id: apiManager.customerId,
            asset_ids,
            pagination: { page_number: 1, page_size: 100 },
            sort: [
              { sort_field: 'score', sort_order: 'desc' },
              { sort_field: 'cve_count', sort_order: 'desc' },
              { sort_field: 'technology_status', sort_order: 'asc' },
              { sort_field: 'technology_name', sort_order: 'asc' }
            ]
          };

          const tech_response = await apiManager.post(
            `${ASSET_CONFIG_API_BASE}/assets/technologies`,
            tech_payload
          );
          const tech_response_data = await tech_response.json();

          const assets_technologies = tech_response_data.assets_technologies || {};

          // Enrich assets with technology data
          for (const asset of assets_data.assets) {
            const asset_id = asset.id;
            if (asset_id && assets_technologies[String(asset_id)]) {
              asset.technologies = assets_technologies[String(asset_id)];
            }
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(assets_data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving assets: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #4: enrich_iocs
server.tool(
  'enrich_iocs',
  `Enrich Indicators of Compromise (IOCs) with threat intelligence and reputation data.

WHEN TO USE:
- User provides suspicious IP addresses, domains, URLs, or file hashes
- User wants to analyze IOCs found in alerts or logs
- User needs threat intelligence about specific indicators
- Investigating potential threats or malware samples

SUPPORTED IOC TYPES:
- IPv4 addresses (e.g., "192.168.1.1")
- Domains (e.g., "malicious-site.com")
- URLs (e.g., "http://bad-site.com/malware.exe")
- SHA256 file hashes (64-character hex strings)

AUTO-DETECTION:
- Tool automatically detects IOC type based on format
- No need to specify the IOC type - it's determined by pattern matching
- Invalid or unsupported IOCs return error messages

COMMON USER REQUESTS:
- "Check if this IP is malicious: 192.168.1.100"
- "Analyze these suspicious domains: evil.com, bad-site.org"
- "Get threat intel for hash: a1b2c3d4e5f6..."
- "Enrich these IOCs from the alert"`,
  {
    iocs: z.union([z.string(), z.array(z.string())]).describe('Single IOC string or list of IOCs to analyze. Supported formats: IPv4: "1.2.3.4"; Domain: "example.com"; URL: "http://example.com/path"; SHA256: "a1b2c3d4e5f6789..." (64 hex characters). Can be provided as: "1.2.3.4" or ["1.2.3.4", "evil.com"]')
  },
  async ({ iocs }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const iocs_list = parseListParam(iocs);
      if (!iocs_list || iocs_list.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify([])
          }]
        };
      }

      const results: any[] = [];
      
      for (const ioc of iocs_list) {
        let ioc_type: string | null = null;

        // Detect IOC type
        if (/^[a-f0-9]{64}$/.test(ioc)) {
          ioc_type = 'file/sha256';
        } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ioc)) {
          ioc_type = 'ipv4';
        } else if (/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}$/.test(ioc)) {
          ioc_type = 'domain';
        } else if (ioc.startsWith('http')) {
          ioc_type = 'url';
        }

        if (ioc_type) {
          try {
            const response = await apiManager.get(`${IOC_API_BASE}/${ioc_type}?value=${encodeURIComponent(ioc)}`);
            const responseData = await response.json();
            const ioc_data = responseData.data || {};
            results.push(ioc_data);
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            results.push({ ioc, error: errorMessage });
          }
        } else {
          results.push({ ioc, error: 'Unknown IOC type' });
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error enriching IOCs: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #5: get_vulnerability_details
server.tool(
  'get_vulnerability_details',
  `Get comprehensive details about a specific CVE including exploitability and organizational exposure.

WHEN TO USE:
- User mentions a specific CVE ID and wants detailed information
- User needs CVSS scores, descriptions, and impact assessment
- User wants to understand exploit availability and risk level
- Following up on CVEs found in vulnerability scans or alerts

CVE FORMAT:
- Must be valid CVE identifier (e.g., "CVE-2021-44228", "CVE-2024-1234")
- Case-insensitive input accepted

INCLUDED INTELLIGENCE:
- CVSS v2/v3 scores and vector strings
- Detailed vulnerability description and impact
- Exploit availability and maturity information
- Affected products and version ranges
- References and advisories
- Organizational exposure assessment

COMMON USER REQUESTS:
- "Tell me about CVE-2021-44228"
- "What's the CVSS score for CVE-2024-5678?"
- "Show me exploit details for CVE-2023-1234"
- "How does CVE-2022-9999 affect our environment?"`,
  {
    cve_id: z.string().describe('The CVE identifier to lookup (e.g., "CVE-2021-44228"). Format: CVE-YYYY-NNNN where YYYY is year and NNNN is sequence number.')
  },
  async ({ cve_id }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const response = await apiManager.get(`${CVE_INTEL_API_BASE}/vulnerability/${cve_id}`);
      const data = await response.json();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving vulnerability details: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #6: search_vulnerabilities_by_technology
server.tool(
  'search_vulnerabilities_by_technology',
  `Search for vulnerabilities affecting specific technology products and versions.

WHEN TO USE:
- User asks about vulnerabilities in specific software (Apache, Windows, etc.)
- User wants to assess risk for particular technology versions
- User needs CVEs for vulnerability management or patching priorities
- User wants to filter by severity (CVSS scores) or time periods

TECHNOLOGY MATCHING:
- Product names should match common software names (case-insensitive)
- Version strings should match exactly as they appear in CVE databases
- Multiple versions can be specified to cover version ranges

COMMON USER REQUESTS:
- "Find CVEs for Apache HTTP Server version 2.4.41"
- "Show critical Windows 10 vulnerabilities from last month"
- "Get recent MySQL 8.0 CVEs with CVSS > 7.0"
- "List all vulnerabilities for Ubuntu 20.04 modified this year"`,
  {
    technology_name: z.string().describe('Software product name to search for vulnerabilities. Examples: "Apache HTTP Server", "Windows 10", "MySQL", "Ubuntu Linux", "Nginx", "OpenSSL", "Docker"'),
    technology_versions: z.union([z.string(), z.array(z.string())]).describe('Specific version(s) to search. Can be: Single version: "2.4.41" or ["8.0.28"]; Multiple versions: ["20.04", "22.04"]; Version ranges often need separate calls per version'),
    cvss_min: z.union([z.number(), z.string()]).optional().describe('Minimum CVSS score threshold (0.0-10.0). Use 7.0+ for high severity, 9.0+ for critical only.'),
    modified_days_back: z.number().default(365).describe('Search CVEs modified in the last N days (default: 365). This filters by the CVE\'s last modification date. Use smaller values for recently updated vulnerability information.'),
    page_size: z.number().default(50).describe('Results per page (default: 50, range: 1-100).'),
    page_number: z.number().default(1).describe('Page number for pagination (starts at 1).')
  },
  async ({ technology_name, technology_versions, cvss_min, modified_days_back = 365, page_size = 50, page_number = 1 }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const tech_versions_list = parseListParam(technology_versions);
      if (!tech_versions_list || tech_versions_list.length === 0) {
        throw new Error('At least one technology version is required.');
      }

      // Build filters
      const filters: Record<string, any> = {
        technology_name,
        technology_versions: tech_versions_list
      };

      if (cvss_min !== undefined) {
        filters.cvss_min = cvss_min;
      }

      // Calculate last_updated_from date
      const modified_from_datetime = new Date();
      modified_from_datetime.setDate(modified_from_datetime.getDate() - modified_days_back);
      filters.last_updated_from = modified_from_datetime.toISOString();

      // Build request payload
      const request_payload = {
        filters,
        pagination: {
          page_size,
          page_number
        },
        sort: [{}] // Default sort
      };

      const response = await apiManager.post(
        `${CVE_INTEL_API_BASE}/vulnerabilities`,
        request_payload
      );
      const data = await response.json();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error searching vulnerabilities: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #7: check_credential_exposure
server.tool(
  'check_credential_exposure',
  `Check for exposed credentials in data breaches by domain or email address.

WHEN TO USE:
- User wants to check if company credentials have been compromised
- User asks about specific email addresses in data breaches
- User needs to assess credential exposure risk for domains
- Following up on credential-related security alerts

INPUT TYPES:
- Domains: "company.com", "example.org" (without @ symbol)
- Email addresses: "user@company.com", "admin@example.org" (with @ symbol)
- Mixed lists: ["company.com", "ceo@company.com", "example.org"]

AUTO-DETECTION:
- Tool automatically separates domains from emails based on @ presence
- Processes both types in parallel for efficiency
- Returns structured results grouped by input type

PRIVACY PROTECTION:
- Passwords masked by default for security (mask_password=True)
- Set mask_password=False only when full details needed for investigation
- Results include breach metadata without exposing full credentials

COMMON USER REQUESTS:
- "Check if our company domain has exposed credentials"
- "Are there breaches affecting admin@company.com?"
- "Show credential exposures for company.com and subsidiary.com"
- "Check these executive email addresses for breaches"`,
  {
    inputs: z.union([z.string(), z.array(z.string())]).describe('Single input or list of domains/emails to check: Domains: "company.com" (finds all emails from that domain in breaches); Emails: "user@company.com" (finds specific email in breaches); Mixed: ["company.com", "ceo@company.com"] (processes both types)'),
    mask_password: z.boolean().default(true).describe('If True (default), passwords are masked in results (e.g., "p***d"). If False, shows full passwords - use only when necessary for investigation.')
  },
  async ({ inputs, mask_password = true }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const inputs_list = parseListParam(inputs);
      if (!inputs_list || inputs_list.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({})
          }]
        };
      }

      // Separate domains from emails
      const domains = inputs_list.filter(item => !item.includes('@'));
      const emails = inputs_list.filter(item => item.includes('@'));
      
      const results: Record<string, any> = {};

      // Process domains
      if (domains.length > 0) {
        const domain_results = [];
        for (const domain of domains) {
          try {
            const request = { domain };
            const response = await apiManager.post(
              `${EXPOSED_CREDENTIALS_API_BASE}/by_domain/`,
              request
            );
            const data = await response.json();
            domain_results.push(data);
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            domain_results.push({ domain, error: errorMessage });
          }
        }
        results.domains = domain_results;
      }

      // Process emails
      if (emails.length > 0) {
        try {
          const email_request = {
            email: emails,
            mask_password
          };
          const response = await apiManager.post(
            `${EXPOSED_CREDENTIALS_API_BASE}/by_email/bulk`,
            email_request
          );
          const data = await response.json();
          results.emails = data;
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          results.emails = { error: errorMessage };
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error checking credential exposure: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #8: get_threat_landscape_news
server.tool(
  'get_threat_landscape_news',
  `Retrieve curated threat intelligence news and security reports with advanced filtering.

WHEN TO USE:
- User wants latest threat intelligence or security news
- User asks about threats affecting specific industries or regions
- User needs context about current threat campaigns or trends
- User wants threat landscape updates for briefings or reports

FILTERING STRATEGY:
- Use get_threat_landscape_metadata() FIRST to discover available filter options
- Combine multiple filters (regions + sectors + labels) for targeted results
- Leave filters empty for broader threat landscape overview

FILTER DISCOVERY:
- Call get_threat_landscape_metadata() to see all available:
  * Regions: "North America", "Europe", "Asia Pacific", etc.
  * Sectors: "Financial", "Healthcare", "Government", "Technology", etc.
  * Labels: "Ransomware", "APT", "Supply Chain", "Zero-day", etc.

COMMON USER REQUESTS:
- "Get latest threat intelligence news"
- "Show ransomware reports from the last month"
- "Find threats affecting the financial sector in North America"
- "Get APT campaign updates from this week"`,
  {
    regions: z.union([z.string(), z.array(z.string())]).optional().describe('Geographic regions to filter by. Get options from get_threat_landscape_metadata(). Examples: ["North America", "Europe"], "Asia Pacific"'),
    sectors: z.union([z.string(), z.array(z.string())]).optional().describe('Industry sectors to filter by. Examples: ["Financial", "Healthcare"], "Government"'),
    labels: z.union([z.string(), z.array(z.string())]).optional().describe('Threat categories/tags to filter by. Examples: ["Ransomware", "APT"], "Zero-day"'),
    filter_mode: z.string().default('or').describe('The logical operator for combining filters. Can be "or" (default) or "and". "or": Returns articles matching ANY filter criteria. "and": Returns articles matching ALL filter criteria.'),
    from_date: z.string().optional().describe('Start date for news articles (format: YYYY-MM-DD). Example: "2024-01-01" for news from January 1st onwards'),
    to_date: z.string().optional().describe('End date for news articles (format: YYYY-MM-DD). Example: "2024-01-31" for news until January 31st'),
    page: z.number().default(1).describe('Page number for pagination (starts at 1, default: 1).'),
    limit: z.number().default(100).describe('Maximum articles per page (default: 100, recommended: 25-100).')
  },
  async ({ regions, sectors, labels, filter_mode = 'or', from_date, to_date, page = 1, limit = 100 }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const regions_list = parseListParam(regions);
      const sectors_list = parseListParam(sectors);
      const labels_list = parseListParam(labels);

      // Build date range if provided
      let date_range: Record<string, string> | undefined = undefined;
      if (from_date && to_date) {
        date_range = { from: from_date, to: to_date };
      }

      // Build filters
      const fields: Record<string, any> = {};
      if (regions_list) fields.regions = regions_list;
      if (sectors_list) fields.sectors = sectors_list;
      if (labels_list) fields.labels = labels_list;
      if (date_range) fields.date_range = date_range;

      const filters = {
        fields,
        mode: filter_mode
      };

      const pagination = {
        page_number: page,
        page_size: limit
      };

      const request_payload = {
        pagination,
        filters
      };

      const response = await apiManager.post(
        `${KNOWLEDGEBASE_API_BASE}/news`,
        request_payload
      );
      const data = await response.json();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving threat landscape news: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #9: get_threat_landscape_metadata
server.tool(
  'get_threat_landscape_metadata',
  `Get all available filter options for threat intelligence news search.

WHEN TO USE:
- ALWAYS call this BEFORE using get_threat_landscape_news for first time
- User asks "what regions/sectors/labels are available?"
- User wants to see filtering options for threat intelligence
- Need to validate filter values before searching news

PURPOSE:
- Discovers all valid filter values for threat landscape news
- Prevents errors from using invalid filter terms
- Helps users understand available threat intelligence categories
- Essential for building effective news search queries

WORKFLOW:
1. Call this function first
2. Show user available options
3. Use returned values in get_threat_landscape_news()

COMMON USER REQUESTS:
- "What regions can I filter threat news by?"
- "Show me available industry sectors"
- "What threat labels/categories exist?"
- "What filters are available for threat intelligence?"`,
  z.object({}).strict(),
  async (_params, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const response = await apiManager.post(`${KNOWLEDGEBASE_API_BASE}/news/metadata`);
      const responseData = await response.json();
      const data = responseData.data || {};

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving threat landscape metadata: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #10: get_threat_actors_metadata
server.tool(
  'get_threat_actors_metadata',
  `Get all available filter options for most active threat actors search.

WHEN TO USE:
- ALWAYS call this BEFORE using get_most_active_threat_actors for first time
- User asks "what countries/sectors are available?"
- User wants to see filtering options for threat actors
- Need to validate filter values before searching threat actors

PURPOSE:
- Discovers all valid filter values for threat actors
- Prevents errors from using invalid filter terms
- Helps users understand available threat actors categories
- Essential for building effective threat actors search queries

WORKFLOW:
1. Call this function first
2. Show user available options
3. Use returned values in get_most_active_threat_actors()

COMMON USER REQUESTS:
- "What countries can I filter threat actors by?"
- "Show me available industry sectors"
- "Which threat actors  sectors/countries exist?"
- "What filters are available for threat actors search?"
- "What filters are available for most active threat actors search?"`,
  z.object({}).strict(),
  async (_params, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const response = await apiManager.post(`${KNOWLEDGEBASE_API_BASE}/threat_actors/metadata`);
      const responseData = await response.json();
      const data = responseData.data || {};

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving threat actors metadata: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #11: get_most_active_threat_actors
server.tool(
  'get_most_active_threat_actors',
  `Retrieve most active threat actors with advanced filtering.

WHEN TO USE:
- User wants to know which threat actors targeting his country and/or sector
- Need to perform sector & geography risk monitoring

FILTERING STRATEGY:
- Use get_threat_actors_metadata() FIRST to discover available filter options
- Combine multiple filters (countries + sectors) for targeted results
- Leave filters empty for broader threat actors overview

FILTER DISCOVERY:
- Call get_threat_actors_metadata() to see all available:
  * Countries: "United States", "Albania", "Israel", etc.
  * Sectors: "Financial", "Healthcare", "Government", "Technology", etc.

COMMON USER REQUESTS:
- "Get most active threat actors"
- "Find threats actors affecting the financial sector in the United States"
- "Which actors targeting Healthcare sector in the last 30 days?"`,
  {
    countries: z.union([z.string(), z.array(z.string())]).optional().describe('Geographic regions to filter by. Get options from get_threat_actors_metadata(). Examples: ["United States", "Israel"]'),
    sectors: z.union([z.string(), z.array(z.string())]).optional().describe('Industry sectors to filter by. Examples: ["Financial", "Healthcare", "Government"]'),
    filter_mode: z.string().default('or').describe('The logical operator for combining filters. Can be "or" (default) or "and". "or": Returns articles matching ANY filter criteria. "and": Returns articles matching ALL filter criteria.')
  },
  async ({ countries, sectors, filter_mode = 'or' }, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const countries_list = parseListParam(countries) || [];
      const sectors_list = parseListParam(sectors) || [];

      const fields: Record<string, any> = {};
      if (countries_list.length > 0) fields.countries = countries_list;
      if (sectors_list.length > 0) fields.sectors = sectors_list;

      const filters = {
        fields,
        mode: filter_mode
      };

      const response = await apiManager.post(
        `${KNOWLEDGEBASE_API_BASE}/threat_actors/most_active`,
        { filters }
      );
      const responseData = await response.json();
      const data = responseData.data || {};

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving most active threat actors: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #12: get_threat_actor_by_id
server.tool(
  'get_threat_actor_by_id',
  `Retrieve comprehensive details for a specific threat actor by its ID.

WHEN TO USE:
- User mentions a specific threat actor ID and wants details
- User wants to investigate or analyze a particular threat actor
- User needs full context about specific threat actor including targeted countries and/or sectors
- Following up on threat actors found in search results, from most active threat actors

COMMON USER REQUESTS:
- "Tell me about threat actor 80f40e4b-71bb-437b-9c69-eef8b32ae1f6"
- "Get full details threat actor 80f40e4b-71bb-437b-9c69-eef8b32ae1f6"
- "Show me threat actor 80f40e4b-71bb-437b-9c69-eef8b32ae1f6 with all intelligence data"
- "What are the countries targeted by threat actor with ID 80f40e4b-71bb-437b-9c69-eef8b32ae1f6?"
- "What are the sectors targeted by threat actor with ID 80f40e4b-71bb-437b-9c69-eef8b32ae1f6?"`,
  {
    threat_actor_id: z.string().describe('The unique threat actor ID in uuid4 format (e.g., "80f40e4b-71bb-437b-9c69-eef8b32ae1f6",). This is typically found in list of most active threat actors.')
  },
  async ({ threat_actor_id }, extra) => {
    try {
      if (!isValidUuid4(threat_actor_id)) {
        throw new Error(`Threat actor ID '${threat_actor_id}' is invalid, should be in uuid4 format.`);
      }

      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const response = await apiManager.post(`${KNOWLEDGEBASE_API_BASE}/threat_actors/${threat_actor_id}`);
      const responseData = await response.json();
      const data = responseData.data || {};

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving threat actor details: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #13: get_malware_by_id
server.tool(
  'get_malware_by_id',
  `Retrieve comprehensive details for a specific malware by its ID.

WHEN TO USE:
- User mentions a specific malware ID and wants details
- User wants to investigate or analyze a particular malware strain
- Following up on malware found in IOC enrichment results (related_entities field)

HOW TO FIND MALWARE ID:
The malware ID can be found in the enrich_iocs API response under the path:
result[].enrichment.related_entities[].entity_id

Example enrich_iocs response structure:
{
  "result": [
    {
      "enrichment": {
        "related_entities": [
          {
            "entity_id": "fac6f19d-7816-42ba-89ab-f6094421c5d1",  # This is the malware ID
            "entity_type": "Malware",
            "entity_name": "LummaStealer"
          }
        ]
      }
    }
  ]
}

Look for entities where entity_type == "Malware" and use the corresponding entity_id.

COMMON USER REQUESTS:
- "Tell me about malware 12345678-1234-1234-1234-123456789abc"
- "Get full details for malware ID abc12345-def6-7890-abcd-ef1234567890"
- "Get details for the LummaStealer malware found in the IOC enrichment"`,
  {
    malware_id: z.string().describe('The unique malware ID in uuid4 format (e.g., "12345678-1234-1234-1234-123456789abc"). This is typically found in IOC enrichment results under: result[].enrichment.related_entities[].entity_id (where entity_type == "Malware")')
  },
  async ({ malware_id }, extra) => {
    try {
      if (!isValidUuid4(malware_id)) {
        throw new Error(`Malware ID '${malware_id}' is invalid, should be in uuid4 format.`);
      }

      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const response = await apiManager.post(`${KNOWLEDGEBASE_API_BASE}/malwares/${malware_id}`);
      const responseData = await response.json();
      const data = responseData.data || {};

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ data }, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving malware details: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool #14: get_security_analytics
server.tool(
  'get_security_analytics',
  `Get comprehensive security posture analytics and risk assessment overview for the customer.

WHEN TO USE:
- User wants overall security health summary for his organization
- User asks for risk assessment or security metrics
- User needs high-level security overview for reporting
- User wants to understand current threat exposure levels

EXECUTIVE SUMMARY:
- Provides key security metrics and risk indicators
- Includes trend analysis and comparative risk levels
- Suitable for executive briefings and board reports
- Aggregates data across all security domains

RISK CATEGORIES:
- Overall risk score and trend direction
- Alert severity distribution and trends
- Asset exposure and vulnerability metrics
- Threat landscape impact assessment
- Compliance and security control effectiveness

COMMON USER REQUESTS:
- "What's our current security posture?"
- "Show me the risk assessment dashboard"
- "Generate security metrics for executive review"
- "How has our security risk changed recently?"`,
  z.object({}).strict(),
  async (_params, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      const customer_id = apiManager.customerId;
      if (!customer_id) {
        throw new Error('ARGOS_CUSTOMER_ID is not set in the environment.');
      }

      const response = await apiManager.get(`${ALERT_API_BASE}/analytics/${customer_id}/risks/current`);
      const data = await response.json();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving security analytics: ${errorMessage}`
        }]
      };
    }
  }
);

// ============================================================================
// TOOLS END HERE
// ============================================================================

export { server };

const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    serverModule
  );
};

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
