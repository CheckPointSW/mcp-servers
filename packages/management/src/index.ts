#!/usr/bin/env node

import { z } from 'zod';
import { Settings, APIManagerForAPIKey } from '@chkp/quantum-infra';
import { 
  launchMCPServer, 
  createServerModule,
  SessionContext,
  createApiRunner,
  createMcpServer
} from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { 
  parseRulebaseWithInlineLayers, 
  formatAsTable, 
  formatAsModelFriendly,
  ZeroHitsUtil
} from './rulebase-parser/index.js';

const { server, pkg } = createMcpServer(import.meta.url, {
  description: "MCP server to run commands on a Check Point Management. Use this to view policies and objects for Access, NAT and VPN."
});

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  Settings,
  pkg,
  APIManagerForAPIKey
);

// Create an API runner function
const runApi = createApiRunner(serverModule);

// --- PROMPT RESOURCES ---
const SHOW_INSTALLED_POLICIES = `Please show me my installed policies per gateway. In order to see which policies are installed, you need to call show-gateways-and-servers with details-level set to 'full'.\nIf you already know the gateway name or uid, you can use the show-simple-gateway or show simple-cluster function with details-level set to 'full' to get the installed policy.\n`;

const SHOW_POLICIES_AND_RULEBASES = `In order to see which policies Exist, You need to call show-packages with details-level set to 'full'.\nIf You already know the package name or uid, You can use the show-package function with details-level set to 'full' to get the policy.\nI can see the access-layers in the response. You can call show-access-layer with details-level set to 'full' to get the access-layer details.\nFinally, to get all the rules in the access-layer, You can call show-access-rulebase to see all the rules in the access-layer.\nTo show threat-prevention or NAT rules, You can call show-threat-rulebase or show-nat-rulebase respectively.\n`;

const SHOW_RULE = `Please show me details for rule {RULE_REF}. In order to get a rule You must first know the package and relevant access-layer.\nIf You already know the package and access-layer name or uid You can call show-access-rulebase and show-access-rule.\nIf not, You need to first get the relevant package and access-layer by calling show-packages and show-access-layers.\nIf there is more that one access-layer or package, You need to ask the user which one to use.\n`;

const TOPOLOGY_VISUALIZATION = `Create a visual topology diagram of the Check Point gateway "{GATEWAY_NAME}" showing:\n1. All interfaces with their IP addresses, subnet masks, and security zones\n2. Networks connected to each interface\n3. Allowed traffic flows based on policy rules \n\nFirst gather gateway information with show_simple_gateway, then examine security zones with show_security_zones, identify policy layers with show_access_layers and analyze relevant rules with show_access_rulebase. \nAdd details from specific objects as needed using show_network, show_host, etc. \n\nCreate a comprehensive SVG visualization showing both the physical topology and logical policy flows.`;

const SOURCE_TO_DESTINATION = `The user is asking to know the possible paths from {SOURCE} to {DESTINATION}. To create a source-to-destination path, You need to gather the following information:\n1. The source and destination objects (hosts, networks, etc.)\n2. The relevant access layer and rules that apply to the traffic between these objects\n3. Any NAT rules that may affect the traffic flow\n4. The gateways involved in the path\n\nI can use the show_access_rulebase, show_nat_rulebase, and show_gateways_and_servers functions to gather this information.\nOnce You have all the necessary details, You can construct the path. You will explain my decision with objects and rules references and also create a visualization of the path if needed.`;

// --- PROMPTS ---
server.prompt(
  'show_gateways_prompt',
  {},
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: SHOW_INSTALLED_POLICIES,
        },
      },
    ],
  })
);

server.prompt(
  'show_policies_prompt',
  {},
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: SHOW_POLICIES_AND_RULEBASES,
        },
      },
    ],
  })
);

server.prompt(
  'show_rule_prompt',
  {
    rule_name: z.string().optional(),
    rule_number: z.string().optional(),
  },
  (args: Record<string, unknown>, extra: any) => {
    const ruleName = typeof args.rule_name === 'string' ? args.rule_name : '';
    const ruleNumber = typeof args.rule_number === 'string' ? args.rule_number : '';
    const rule_ref = ruleName || ruleNumber ? `${ruleName}${ruleName && ruleNumber ? ' / ' : ''}${ruleNumber}` : 'the rule';
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: SHOW_RULE.replace('{RULE_REF}', rule_ref),
          },
        },
      ],
    };
  }
);


server.prompt(
  'source_to_destination_prompt',
  {
    source: z.string().optional(),
    destination: z.string().optional(),
  },
  (args: Record<string, unknown>, extra: any) => {
    const src = typeof args.source === 'string' ? args.source : 'All sources';
    const dst = typeof args.destination === 'string' ? args.destination : 'all destinations';
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: SOURCE_TO_DESTINATION.replace('{SOURCE}', src).replace('{DESTINATION}', dst),
          },
        },
      ],
    };
  }
);



// --- TOOLS ---

server.tool(
  'management__init',
  'Verify, login and initialize management connection. Use this tool on your first interaction with the server.',
  z.object({}).strict(),
  async (args: Record<string, unknown>, extra: any) => {
    try {
      // Get API manager for this session
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      // Check if environment is MDS
      const isMds = await apiManager.isMds();
      
      if (!isMds) {
        return { 
          content: [{ 
            type: 'text', 
            text: 'Management server is up and running. The environment is NOT part of Multi Domain system, there is no need to use domain parameters in tool calls.' 
          }] 
        };
      } else {
        // Get domains for MDS environment
        const domains = await apiManager.getDomains();
        
        // Format domain information
        const domainList = domains.map((domain: { name: string; type: string }) => `${domain.name} (${domain.type})`).join(', ');
        
        return { 
          content: [{ 
            type: 'text', 
            text: `Management server is up and running. The environment is part of Multi Domain system. You need to use the domain parameter for calling APIs, if you are not sure which to use, ask the user. The domains in the system are: ${domainList}` 
          }] 
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error initializing management connection: ${errorMessage}` 
        }] 
      };
    }
  }
);

server.tool(
  'show_access_rulebase',
  'Show the access rulebase for a given name or uid. Either name or uid is required, the other can be empty. By default, returns a formatted table with parsing capabilities. Set show_raw=true to get the raw JSON response. Set limit=0 to fetch the entire rulebase using pagination.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    package: z.string().optional(),
    filter: z.string().optional(),
    filter_settings: z.object({
      search_mode: z.enum(['general', 'packet']).optional().default('general'),
      packet_search_settings: z.object({
        expand_group_members: z.boolean().optional().default(false),
        expand_group_with_exclusion_members: z.boolean().optional().default(false),
        intersection_mode_dst: z.enum(['exact', 'containing', 'contained_in', 'any']).optional().default('any'),
        intersection_mode_src: z.enum(['exact', 'containing', 'contained_in', 'any']).optional().default('any'),
        match_on_any: z.boolean().optional().default(true),
        match_on_group_with_exclusion: z.boolean().optional().default(true),
        match_on_negate: z.boolean().optional().default(true),
      }).optional()
    }).optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    show_raw: z.boolean().optional().default(false),
    format: z.enum(['table', 'model-friendly']).optional().default('table'),
    expand_groups: z.boolean().optional().default(false),
    group_mode: z.enum(['in-rule', 'as-reference']).optional().default('as-reference'),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};

    if (typeof args.name === 'string' && args.name.trim() !== '') {
      params.name = args.name;
    }

    if (typeof args.uid === 'string' && args.uid.trim() !== '') {
      params.uid = args.uid;
    }

    if (typeof args.package === 'string' && args.package.trim() !== '') {
      params.package = args.package;
    }

    // Add filter parameter
    if (typeof args.filter === 'string' && args.filter.trim() !== '') {
      params.filter = args.filter;
    }

    // Add filter-settings parameter
    if (args.filter_settings && typeof args.filter_settings === 'object') {
      const filterSettings: Record<string, any> = {};
      const fs = args.filter_settings as Record<string, any>;

      if (typeof fs.search_mode === 'string') {
        filterSettings['search-mode'] = fs.search_mode;
      }

      if (fs.packet_search_settings && typeof fs.packet_search_settings === 'object') {
        const pss = fs.packet_search_settings as Record<string, any>;
        const packetSettings: Record<string, any> = {};

        if (typeof pss.expand_group_members === 'boolean') {
          packetSettings['expand-group-members'] = pss.expand_group_members;
        }
        if (typeof pss.expand_group_with_exclusion_members === 'boolean') {
          packetSettings['expand-group-with-exclusion-members'] = pss.expand_group_with_exclusion_members;
        }
        if (typeof pss.intersection_mode_dst === 'string') {
          packetSettings['intersection-mode-dst'] = pss.intersection_mode_dst;
        }
        if (typeof pss.intersection_mode_src === 'string') {
          packetSettings['intersection-mode-src'] = pss.intersection_mode_src;
        }
        if (typeof pss.match_on_any === 'boolean') {
          packetSettings['match-on-any'] = pss.match_on_any;
        }
        if (typeof pss.match_on_group_with_exclusion === 'boolean') {
          packetSettings['match-on-group-with-exclusion'] = pss.match_on_group_with_exclusion;
        }
        if (typeof pss.match_on_negate === 'boolean') {
          packetSettings['match-on-negate'] = pss.match_on_negate;
        }

        if (Object.keys(packetSettings).length > 0) {
          filterSettings['packet-search-settings'] = packetSettings;
        }
      }

      if (Object.keys(filterSettings).length > 0) {
        params['filter-settings'] = filterSettings;
      }
    }

    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

    // Get API manager for this session
    const apiManager = SessionContext.getAPIManager(serverModule, extra);

    // Get limit and offset
    const requestedLimit = typeof args.limit === 'number' ? args.limit : 50;
    const requestedOffset = typeof args.offset === 'number' ? args.offset : 0;

    let resp: any;

    // If limit is 0, fetch all results by pagination
    if (requestedLimit === 0) {
      const batchSize = 50;
      let currentOffset = 0;
      let allRulebases: any[] = [];
      let totalFetched = 0;
      let total = 0;

      // First call to get the total count and first batch
      const firstParams = { ...params, limit: batchSize, offset: currentOffset };
      const firstResp = await apiManager.callApi('POST', 'show-access-rulebase', firstParams, domain);

      // Store first response structure
      resp = firstResp;

      // Check if the response has rulebase array
      if (firstResp.rulebase && Array.isArray(firstResp.rulebase)) {
        allRulebases = [...firstResp.rulebase];
        totalFetched = firstResp.to || firstResp.rulebase.length;
        total = firstResp.total || firstResp.rulebase.length;
        currentOffset = totalFetched;

        // Continue fetching until we have all rules
        while (totalFetched < total) {
          const batchParams = { ...params, limit: batchSize, offset: currentOffset };
          const batchResp = await apiManager.callApi('POST', 'show-access-rulebase', batchParams, domain);

          if (batchResp.rulebase && Array.isArray(batchResp.rulebase) && batchResp.rulebase.length > 0) {
            allRulebases = [...allRulebases, ...batchResp.rulebase];
            totalFetched = batchResp.to || (currentOffset + batchResp.rulebase.length);
            currentOffset = totalFetched;
          } else {
            // No more data to fetch
            break;
          }
        }

        // Update response with all fetched rulebases
        resp.rulebase = allRulebases;
        resp.from = 1;
        resp.to = allRulebases.length;
        resp.total = total;
      }
    } else {
      // Normal case: use provided limit and offset
      params.limit = requestedLimit;
      params.offset = requestedOffset;
      resp = await apiManager.callApi('POST', 'show-access-rulebase', params, domain);
    }
    
    // Check if raw data is requested
    const showRaw = typeof args.show_raw === 'boolean' ? args.show_raw : false;
    if (showRaw) {
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    }
    
    // Otherwise, use the enhanced parser
    try {
      // Validate that either name or uid is provided
      const name = typeof args.name === 'string' && args.name.trim() !== '' ? args.name : undefined;
      const uid = typeof args.uid === 'string' && args.uid.trim() !== '' ? args.uid : undefined;
      
      if (!name && !uid) {
        return { 
          content: [{ 
            type: 'text', 
            text: 'Error: Either name or uid parameter is required to identify the rulebase.' 
          }] 
        };
      }

      const format = args.format as 'table' | 'model-friendly';
      const expandGroups = typeof args.expand_groups === 'boolean' ? args.expand_groups : false;
      const groupMode = (args.group_mode as 'in-rule' | 'as-reference') || 'as-reference';

      // Parse the rulebase with all advanced features using the already fetched data
      const parsedData = await parseRulebaseWithInlineLayers(
        resp, 
        apiManager, 
        expandGroups, 
        groupMode
      );
      
      // Format the output based on requested format
      let formattedOutput: string;
      if (format === 'model-friendly') {
        formattedOutput = formatAsModelFriendly(parsedData);
      } else {
        formattedOutput = formatAsTable(parsedData);
      }
      
      // Add summary information
      const summary = `
Rulebase Summary:
- Name: ${parsedData.name}
- Sections: ${parsedData.sections.length}
- Total Rules: ${parsedData.sections.reduce((total: number, section: any) => total + section.rules.length, 0)}
- Inline Layers: ${expandGroups ? 'Supported' : 'Not expanded'}
- Group Expansion: ${expandGroups ? `Enabled (${groupMode} mode)` : 'Disabled'}

${formattedOutput}`;

      return { 
        content: [{ 
          type: 'text', 
          text: summary
        }] 
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error parsing rulebase: ${errorMessage}` 
        }] 
      };
    }
  }
);

server.tool(
  'show_hosts',
  'Show the hosts in the management server.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    show_membership: z.boolean().optional().default(true),
    domain: z.string().optional(),
  },
  
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.filter === 'string' && args.filter.trim() !== '') params.filter = args.filter;
    if (typeof args.limit === 'number') params.limit = args.limit;
    if (typeof args.offset === 'number') params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    if (typeof args.show_membership === 'boolean') params.show_membership = args.show_membership;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    
    // Call the API
    const resp = await apiManager.callApi('POST', 'show-hosts', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_rule',
  'Show a specific rule in the access control layer. Set requested rule by uid, name or rule-number (at least one is required). You must always specify the layer.',
  {
    name: z.string().optional(),
    layer: z.string(),
    rule_number: z.number().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    show_as_ranges: z.boolean().optional().default(false),
    show_hits: z.boolean().optional().default(false),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    
    if (typeof args.name === 'string' && args.name.trim() !== '') {
      params.name = args.name;
    }
    
    if (typeof args.layer === 'string' && args.layer.trim() !== '') {
      params.layer = args.layer;
    }
    
    if (typeof args.rule_number === 'number') {
      params.rule_number = args.rule_number;
    }
    
    if (typeof args.uid === 'string' && args.uid.trim() !== '') {
      params.uid = args.uid;
    }
    
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') {
      params.details_level = args.details_level;
    }
    
    if (typeof args.show_as_ranges === 'boolean') {
      params.show_as_ranges = args.show_as_ranges;
    }
    
    if (typeof args.show_hits === 'boolean') {
      params.show_hits = args.show_hits;
    }
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-access-rule', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_layer',
  'Show an access layer object by name or UID (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') {
      params.name = args.name;
    }
    if (typeof args.uid === 'string' && args.uid.trim() !== '') {
      params.uid = args.uid;
    }
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') {
      params.details_level = args.details_level;
    }
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-access-layer', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_layers',
  'Show all access layers, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.filter === 'string' && args.filter.trim() !== '') params.filter = args.filter;
    if (typeof args.limit === 'number') params.limit = args.limit;
    if (typeof args.offset === 'number') params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    if (typeof args.domains_to_process === 'string') params['domains-to-process'] = args.domains_to_process;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-access-layers', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_nat_rulebase',
  'Show the NAT rulebase of a given package.',
  {
    package: z.string(),
    filter: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.package === 'string' && args.package.trim() !== '') params.package = args.package;
    if (typeof args.filter === 'string' && args.filter.trim() !== '') params.filter = args.filter;
    if (typeof args.limit === 'number') params.limit = args.limit;
    if (typeof args.offset === 'number') params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    if (typeof args.dereference_group_members === 'boolean') params.dereference_group_members = args.dereference_group_members;
    if (typeof args.show_membership === 'boolean') params.show_membership = args.show_membership;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-nat-rulebase', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_section',
  'Show an access section by name, UID or layer (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    layer: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.layer === 'string' && args.layer.trim() !== '') params.layer = args.layer;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-access-section', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_nat_section',
  'Show a NAT section by name or UID and layer (at least one is required). You must always specify the package.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    layer: z.string().optional(),
    package: z.string(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.layer === 'string' && args.layer.trim() !== '') params.layer = args.layer;
    if (typeof args.package === 'string' && args.package.trim() !== '') params.package = args.package;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-nat-section', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// --- VPN Community and Gateway/Cluster/LSM Tools ---

server.tool(
  'show_vpn_community_star',
  'Show a VPN Community Star object by name or UID (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-vpn-community-star', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_communities_star',
  'Show all VPN Community Star objects, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-vpn-communities-star', {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process,
    }, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_community_meshed',
  'Show a VPN Community Meshed object by name or UID (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-vpn-community-meshed', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_communities_meshed',
  'Show all VPN Community Meshed objects, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-vpn-communities-meshed', {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process,
    }, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_community_remote_access',
  'Show a VPN Community Remote Access object by name or UID (at least one is required).',
  {
      uid: z.string().optional(),
      name: z.string().optional(),
      details_level: z.string().optional(),
      domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params.details_level = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-vpn-community-remote-access', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_communities_remote_access',
  'Show all VPN Community Remote Access objects, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-vpn-communities-remote-access', {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process,
    }, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_domains',
  'Retrieve all domains available in the management server.',
  z.object({}).strict(),
  async (args: Record<string, unknown>, extra: any) => {
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-domains', {});
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_mdss',
  'Retrieve all Multi-Domain Servers (MDS) in the management server. Use this to discover available domains in an MDS environment.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    const resp = await runApi('POST', 'show-mdss', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'management__show_gateways_and_servers',
  'Retrieve multiple gateway and server objects with optional filtering and pagination. Use this to get the currently installed policies only gateways.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-gateways-and-servers', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_simple_gateway',
  'Retrieve a simple gateway object by name or UID. (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params['details-level'] = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-simple-gateway', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_simple_gateways',
  'Retrieve multiple simple gateway objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-simple-gateways', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_clusters',
  'Retrieve multiple LSM cluster objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-lsm-clusters', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_cluster_member',
  'Retrieve a cluster member object by or UID',
  {
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = {};
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-cluster-member', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_cluster_members',
  'Retrieve multiple cluster member objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-cluster-members', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_gateway',
  'Retrieve an LSM gateway object by name or UID. (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params['details-level'] = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-lsm-gateway', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_simple_clusters',
  'Retrieve multiple simple cluster objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-simple-clusters', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_simple_cluster',
  'Retrieve a simple cluster object by name or UID (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params['details-level'] = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-simple-cluster', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_gateways',
  'Retrieve multiple LSM gateway objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-lsm-gateways', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_cluster',
  'Retrieve an LSM cluster object by name or UID (at least one is required).',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.name === 'string' && args.name.trim() !== '') params.name = args.name;
    if (typeof args.uid === 'string' && args.uid.trim() !== '') params.uid = args.uid;
    if (typeof args.details_level === 'string' && args.details_level.trim() !== '') params['details-level'] = args.details_level;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-lsm-cluster', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_groups',
  'Retrieve multiple group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_as_ranges: z.boolean().optional().default(false),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_as_ranges = typeof args.show_as_ranges === 'boolean' ? args.show_as_ranges : false;
    const dereference_group_members = typeof args.dereference_group_members === 'boolean' ? args.dereference_group_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = {
      limit, offset, 'show-as-ranges': show_as_ranges, 'dereference-group-members': dereference_group_members, 'show-membership': show_membership
    };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-groups', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_unused_objects',
  'Retrieve all unused objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    show_only_local_domain: z.boolean().optional().default(false),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const dereference_group_members = typeof args.dereference_group_members === 'boolean' ? args.dereference_group_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const show_only_local_domain = typeof args.show_only_local_domain === 'boolean' ? args.show_only_local_domain : false;

    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

    const params: Record<string, any> = {
      limit,
      offset,
      'dereference-group-members': dereference_group_members,
      'show-membership': show_membership,
      'show-only-local-domain': show_only_local_domain
    };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;

    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-unused-objects', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'where_used',
  'Search for usage of the target object in other objects and rules. Requires either uid or name parameter.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    async_response: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    indirect: z.boolean().optional().default(false),
    indirect_max_depth: z.number().optional().default(5),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    // At least one of uid or name must be provided
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;

    if (!uid && !name) {
      throw new Error('Either uid or name parameter must be provided');
    }

    const dereference_group_members = typeof args.dereference_group_members === 'boolean' ? args.dereference_group_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const async_response = typeof args.async_response === 'boolean' ? args.async_response : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const indirect = typeof args.indirect === 'boolean' ? args.indirect : false;
    const indirect_max_depth = typeof args.indirect_max_depth === 'number' ? args.indirect_max_depth : 5;

    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

    const params: Record<string, any> = {
      'dereference-group-members': dereference_group_members,
      'show-membership': show_membership,
      'async-response': async_response,
      indirect,
      'indirect-max-depth': indirect_max_depth
    };

    if (uid) params.uid = uid;
    if (name) params.name = name;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;

    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'where-used', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_services_tcp',
  'Retrieve multiple TCP service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-services-tcp', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_application_sites',
  'Retrieve multiple application site objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-application-sites', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_application_site_groups',
  'Retrieve multiple application site group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    dereference_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const dereference_members = typeof args.dereference_members === 'boolean' ? args.dereference_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset, 'dereference-members': dereference_members, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-application-site-groups', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_services_udp',
  'Retrieve multiple UDP service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-services-udp', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_wildcards',
  'Retrieve multiple wildcard objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-wildcards', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_security_zones
server.tool(
  'show_security_zones',
  'Retrieve multiple security zone objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-security-zones', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_tags
server.tool(
  'show_tags',
  'Retrieve multiple tag objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-tags', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_address_ranges
server.tool(
  'show_address_ranges',
  'Retrieve multiple address range objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-address-ranges', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_application_site_categories
server.tool(
  'show_application_site_categories',
  'Retrieve multiple application site category objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-application-site-categories', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_dynamic_objects',
  'Retrieve multiple dynamic objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-dynamic-objects', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_services_icmp6
server.tool(
  'show_services_icmp6',
  'Retrieve multiple ICMPv6 service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-services-icmp6', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_services_icmp',
  'Retrieve multiple ICMP service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-services-icmp', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_service_groups
server.tool(
  'show_service_groups',
  'Retrieve multiple service group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    show_as_ranges: z.boolean().optional().default(false),
    dereference_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const show_as_ranges = typeof args.show_as_ranges === 'boolean' ? args.show_as_ranges : false;
    const dereference_members = typeof args.dereference_members === 'boolean' ? args.dereference_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = {
      limit, offset, 'show-as-ranges': show_as_ranges, 'dereference-members': dereference_members, 'show-membership': show_membership
    };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-service-groups', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_multicast_address_ranges',
  'Retrieve multiple multicast address range objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-multicast-address-ranges', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_dns_domains
server.tool(
  'show_dns_domains',
  'Retrieve multiple DNS domain objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-dns-domains', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_time_groups
server.tool(
  'show_time_groups',
  'Retrieve multiple time group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-time-groups', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_access_point_names
server.tool(
  'show_access_point_names',
  'Retrieve multiple access point name objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-access-point-names', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'management__show_objects',
  'Retrieve multiple generic objects with filtering and pagination. Can use type (e.g host, service-tcp, network, address-range...) to get objects of a certain type.',
  {
      uids: z.array(z.string()).optional(),
      filter: z.string().optional(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
      order: z.array(z.string()).optional(),
      details_level: z.string().optional(),
      domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
      type: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uids = Array.isArray(args.uids) ? args.uids as string[] : undefined;
      const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const type = typeof args.type === 'string' ? args.type : undefined;
    const params: Record<string, any> = { limit, offset };
    if ( uids ) params.uids = uids;
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    if (type) params.type = type;
    const resp = await runApi('POST', 'show-objects', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_object
server.tool(
  'management__show_object',
  'Retrieve a generic object by UID.',
  {
    uid: z.string()
  },
  async (args: Record<string, unknown>, extra: any) => {
      const uid = args.uid as string;
      const params: Record<string, any> = {}
      params.uid = uid
      params.details_level = 'full'
      const resp = await runApi('POST', 'show-object', params, extra);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: find_zero_hits_rules
server.tool(
  'find_zero_hits_rules',
  'Find rules with zero hits (unused rules) in access rulebases. Can analyze specific rulebases, policy packages, or all installed policies. Useful for identifying unused security rules that may be candidates for removal.',
  {
    rulebase_name: z.string().optional(),
    rulebase_uid: z.string().optional(),
    policy_package: z.string().optional(),
    gateway: z.string().optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    format: z.enum(['detailed', 'summary']).optional().default('detailed'),
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      // Get API manager for this session
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      
      // Create API call wrapper function
      const apiCallWrapper = async (functionCall: { name: string; arguments: Record<string, any> }) => {
        const response = await apiManager.callApi('POST', functionCall.name, functionCall.arguments, extra);
        return [200, response] as [number, any];
      };

      // Extract parameters
      const gateway = typeof args.gateway === 'string' ? args.gateway : undefined;
      const fromDate = typeof args.from_date === 'string' ? args.from_date : undefined;
      const toDate = typeof args.to_date === 'string' ? args.to_date : undefined;
      const format = (args.format as 'detailed' | 'summary') || 'detailed';

      // Create ZeroHitsUtil instance
      const zeroHitsUtil = new ZeroHitsUtil(apiCallWrapper, gateway, fromDate, toDate);

      let results: any;

      // Determine what to analyze
      if (args.rulebase_name || args.rulebase_uid) {
        // Analyze specific rulebase
        const rulebaseIdentifier = (args.rulebase_name as string) || (args.rulebase_uid as string);
        results = await zeroHitsUtil.getZeroHitsRules(rulebaseIdentifier);
      } else if (args.policy_package) {
        // Analyze specific policy package
        results = await zeroHitsUtil.getRulesFromPackages(args.policy_package as string);
      } else {
        // Analyze all policy packages
        results = await zeroHitsUtil.getRulesFromPackages();
      }

      // Format the output
      if (format === 'summary') {
        // Provide a summary view
        let totalZeroHitRules = 0;
        let summary = '';

        if (Array.isArray(results) && results.length > 0 && 'policy' in results[0]) {
          // Policy-based results
          summary = 'Zero Hits Rules Summary by Policy Package:\n\n';
          for (const policyResult of results) {
            summary += `Policy: ${policyResult.policy} (${policyResult.status})\n`;
            if (policyResult.layers) {
              for (const layer of policyResult.layers) {
                summary += `  Layer: ${layer.name || 'Unknown'} - ${layer.rules.length} zero-hit rules\n`;
                totalZeroHitRules += layer.rules.length;
              }
            }
            summary += '\n';
          }
        } else {
          // Rulebase-based results
          summary = 'Zero Hits Rules Summary:\n\n';
          for (const rulebase of results) {
            summary += `Rulebase: ${rulebase.name || 'Unknown'} - ${rulebase.rules.length} zero-hit rules\n`;
            totalZeroHitRules += rulebase.rules.length;
          }
        }

        summary += `\nTotal zero-hit rules found: ${totalZeroHitRules}`;
        
        return { 
          content: [{ 
            type: 'text', 
            text: summary
          }] 
        };
      } else {
        // Detailed view
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(results, null, 2)
          }] 
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error finding zero hits rules: ${errorMessage}` 
        }] 
      };
    }
  }
);

// Tool: simulate_packet
server.tool(
  'simulate_packet',
  'Simulate a packet flow through a gateway\'s firewall policy to check if it would be accepted or dropped. Returns detailed policy matching information including access rules, NAT rules, and any errors. Useful for troubleshooting firewall rules and understanding traffic flow.',
  {
    gateway: z.string().describe('The target gateway name to simulate the packet on'),
    source_ip: z.string().describe('Source IP address (IPv4 or IPv6 based on ip_version)'),
    destination_ip: z.string().describe('Destination IP address (IPv4 or IPv6 based on ip_version)'),
    ip_protocol: z.union([
      z.string().describe('Protocol name: UDP, TCP, or ICMP'),
      z.number().int().min(0).max(255).describe('IANA protocol number')
    ]).describe('IP protocol either as string (UDP/TCP/ICMP) or IANA protocol number'),
    protocol_options: z.record(z.any()).describe('Protocol-specific options (e.g., for TCP/UDP: source-port, destination-port; for ICMP: type, code)'),
    incoming_interface: z.string().describe('Incoming interface name for the packet. Use "localhost" to simulate local outgoing connection'),
    ip_version: z.enum(['4', '6']).optional().default('4').describe('IP version: 4 for IPv4, 6 for IPv6'),
    application: z.union([
      z.string(),
      z.array(z.string())
    ]).optional().describe('Application or Category name(s) as defined in SmartConsole'),
    protocol: z.string().optional().describe('Protocol to match for services with "Protocol Signature" enabled'),
    check_access_rule_uid: z.string().optional().describe('Specific rule UID to check why packet didn\'t match this rule'),
    domain: z.string().optional().describe('Domain name for Multi-Domain Server environments'),
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      // Extract and validate parameters
      const gateway = args.gateway as string;
      const sourceIp = args.source_ip as string;
      const destinationIp = args.destination_ip as string;
      const ipProtocol = args.ip_protocol as string | number;
      const protocolOptions = args.protocol_options as Record<string, any>;
      const incomingInterface = args.incoming_interface as string;
      const ipVersion = (args.ip_version as string) || '4';
      const application = args.application as string | string[] | undefined;
      const protocol = args.protocol as string | undefined;
      const checkAccessRuleUid = args.check_access_rule_uid as string | undefined;
      const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

      // Build API parameters
      const params: Record<string, any> = {
        'ip-version': ipVersion,
        'source-ip': sourceIp,
        'destination-ip': destinationIp,
        'ip-protocol': ipProtocol,
        'protocol-options': protocolOptions,
        'incoming-interface': incomingInterface,
      };

      // Add optional parameters
      if (application !== undefined) {
        params.application = application;
      }
      if (protocol !== undefined) {
        params.protocol = protocol;
      }
      if (checkAccessRuleUid !== undefined) {
        params['check-access-rule-uid'] = checkAccessRuleUid;
      }

      // Get API manager
      const apiManager = SessionContext.getAPIManager(serverModule, extra);

      // First, we need to determine the domain for this gateway (if in MDS environment)
      let targetDomain = domain;

      // If no domain specified but we're in MDS, try to find the gateway's domain
      if (!targetDomain) {
        const isMds = await apiManager.isMds();
        if (isMds) {
          // Get gateway info to determine its domain
          const gatewayResp = await apiManager.callApi('POST', 'show-gateways-and-servers', {
            filter: gateway,
            'details-level': 'standard'
          });

          if (gatewayResp.objects && gatewayResp.objects.length > 0) {
            const gatewayObj = gatewayResp.objects.find((obj: any) => obj.name === gateway);
            if (gatewayObj && gatewayObj.domain && gatewayObj.domain.name) {
              targetDomain = gatewayObj.domain.name;
            }
          }
        }
      }

      // Call the simulate-packet API
      const resp = await apiManager.callApi('POST', 'gaia-api/simulate-packet', params, targetDomain);

      // Check if we got a task-id (async operation)
      if (resp['task-id']) {
        const taskId = resp['task-id'];

        // Poll for task completion using getManagementTaskResult
        const taskResult = await apiManager.getManagementTaskResult(taskId, targetDomain, 10);

        // Extract task details from the response
        if (taskResult.response && taskResult.response.tasks && taskResult.response.tasks.length > 0) {
          const task = taskResult.response.tasks[0];

          if (task.status === 'failed') {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  status: 'failed',
                  message: 'Packet simulation failed',
                  task: task
                }, null, 2)
              }]
            };
          }

          // Return the task details which contain the simulation results
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                status: task.status,
                gateway: gateway,
                simulation_results: task['task-details'] || task,
                full_response: taskResult.response
              }, null, 2)
            }]
          };
        }

        // If we couldn't parse the task result properly, return it as-is
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              task_id: taskId,
              result: taskResult
            }, null, 2)
          }]
        };
      }

      // If no task-id, return the direct response
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(resp, null, 2)
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error simulating packet: ${errorMessage}`
        }]
      };
    }
  }
);

server.tool(
  'show_networks',
  'Show all networks, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const params: Record<string, any> = {};
    if (typeof args.filter === 'string' && args.filter.trim() !== '') params.filter = args.filter;
    if (typeof args.limit === 'number') params.limit = args.limit;
    if (typeof args.offset === 'number') params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    const resp = await runApi('POST', 'show-networks', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);


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
