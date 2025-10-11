#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Settings, APIManagerForAPIKey } from '@chkp/quantum-infra';
import {
  launchMCPServer,
  createServerModule,
  SessionContext,
  createApiTool,
} from '@chkp/mcp-utils';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { 
  parseRulebaseWithInlineLayers, 
  formatAsTable, 
  formatAsModelFriendly,
  ZeroHitsUtil
} from './rulebase-parser/index.js';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

const server = new McpServer({ name: 'Check Point Quantum Management' ,
    description:
        "MCP server to run commands on a Check Point Management. Use this to view policies and objects for Access, NAT and VPN.",
  version: '1.0.0'
});

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  Settings,
  pkg,
  APIManagerForAPIKey
);

// --- Zod Schemas for API Tools ---

const DomainSchema = z.object({
  domain: z.string().optional(),
});

const PaginationSchema = z.object({
  limit: z.number().optional().default(50),
  offset: z.number().optional().default(0),
  order: z.array(z.string()).optional(),
  details_level: z.string().optional(),
  domains_to_process: z.array(z.string()).optional(),
});

const FilterSchema = PaginationSchema.extend({
  filter: z.string().optional(),
});

const NameOrUidSchema = DomainSchema.extend({
  name: z.string().optional(),
  uid: z.string().optional(),
  details_level: z.string().optional(),
});

// --- PROMPT RESOURCES ---
const SHOW_INSTALLED_POLICIES = `Please show me my installed policies per gateway. In order to see which policies are installed, you need to call show-gateways-and-servers with details-level set to 'full'.\nIf you already know the gateway name or uid, you can use the show-simple-gateway or show simple-cluster function with details-level set to 'full' to get the installed policy.\n`;

const SHOW_POLICIES_AND_RULEBASES = `In order to see which policies Exist, You need to call show-packages with details-level set to 'full'.\nIf You already know the package name or uid, You can use the show-package function with details-level set to 'full' to get the policy.\nI can see the access-layers in the response. You can call show-access-layer with details-level set to 'full' to get the access-layer details.\nFinally, to get all the rules in the access-layer, You can call show-access-rulebase to see all the rules in the access-layer.\nTo show threat-prevention or NAT rules, You can call show-threat-rulebase or show-nat-rulebase respectively.\n`;

const SHOW_RULE = `Please show me details for rule {RULE_REF}. In order to get a rule You must first know the package and relevant access-layer.\nIf You already know the package and access-layer name or uid You can call show-access-rulebase and show-access-rule.\nIf not, You need to first get the relevant package and access-layer by calling show-packages and show-access-layers.\nIf there is more that one access-layer or package, You need to ask the user which one to use.\n`;

const TOPOLOGY_VISUALIZATION = `Create a visual topology diagram of the Check Point gateway "{GATEWAY_NAME}" showing:\n1. All interfaces with their IP addresses, subnet masks, and security zones\n2. Networks connected to each interface\n3. Allowed traffic flows based on policy rules \n\nFirst gather gateway information with show_simple_gateway, then examine security zones with show_security_zones, identify policy layers with show_access_layers and analyze relevant rules with show_access_rulebase. \nAdd details from specific objects as needed using show_network, show_host, etc. \n\nCreate a comprehensive SVG visualization showing both the physical topology and logical policy flows.`;

const SOURCE_TO_DESTINATION = `The user is asking to know the possible paths from {SOURCE} to {DESTINATION}. To create a source-to-destination path, You need to gather the following information:\n1. The source and destination objects (hosts, networks, etc.)\n2. The relevant access layer and rules that apply to the traffic between these objects\n3. Any NAT rules that may affect the traffic flow\n4. The gateways involved in the path\n\nI can use the show_access_rulebase, show_nat_rulebase, and show_gateways_and_servers functions to gather this information.\nOnce You have all the necessary details, You can construct the path. You will explain my decision with objects and rules references and also create a visualization of the path if needed.`;

const SHOW_NATS = `To see the NAT rulebase, you first need to identify the policy package it belongs to. Use the 'show-packages' command to list all available packages. Once you have the package name, you can use the 'show-nat-rulebase' command with that package name to see the full list of NAT rules.`;

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
  'show_nats_prompt',
  {},
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: SHOW_NATS,
        },
      },
    ],
  })
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
  'init',
  'Verify, login and initialize management connection. Use this tool on your first interaction with the server.',
  {},
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
  'Show the access rulebase for a given name or uid. Either name or uid is required, the other can be empty. By default, returns a formatted table with parsing capabilities. Set show_raw=true to get the raw JSON response.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    package: z.string().optional(),
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
    
    // Get domain parameter
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    // Get API manager for this session
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    
    // Call the API
    const resp = await apiManager.callApi('POST', 'show-access-rulebase', params, domain);
    
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

// Refactored tools using the new createApiTool factory

createApiTool(server, serverModule,
  'show_hosts',
  'Show the hosts in the management server.',
  'show-hosts',
  FilterSchema.extend({
    show_membership: z.boolean().optional().default(true),
  })
);

createApiTool(server, serverModule,
  'add_address_range',
  'Create a new address range object.',
  'add-address-range',
  DomainSchema.extend({
    name: z.string(),
    ip_address_first: z.string(),
    ip_address_last: z.string(),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_simple_gateway',
  'Create a new simple gateway object.',
  'add-simple-gateway',
  DomainSchema.extend({
    name: z.string(),
    ip_address: z.string(),
    'os-name': z.string().optional(),
    'version': z.string().optional(),
    'one-time-password': z.string().optional(),
    'hardware-model': z.string().optional(),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_simple_cluster',
  'Create a new simple cluster object.',
  'add-simple-cluster',
  DomainSchema.extend({
    name: z.string(),
    ip_address: z.string(),
    'os-name': z.string().optional(),
    'version': z.string().optional(),
    'one-time-password': z.string().optional(),
    'hardware-model': z.string().optional(),
    members: z.array(z.string()),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_dynamic_object',
  'Create a new dynamic object.',
  'add-dynamic-object',
  DomainSchema.extend({
    name: z.string(),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_wildcard',
  'Create a new wildcard object.',
  'add-wildcard',
  DomainSchema.extend({
    name: z.string(),
    'ipv4-address': z.string(),
    'ipv4-mask-wildcard': z.string(),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_security_zone',
  'Create a new security zone object.',
  'add-security-zone',
  DomainSchema.extend({
    name: z.string(),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_dns_domain',
  'Create a new DNS domain object.',
  'add-dns-domain',
  DomainSchema.extend({
    name: z.string(),
    is_sub_domain: z.boolean().optional(),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_service_icmp',
  'Create a new ICMP service.',
  'add-service-icmp',
  DomainSchema.extend({
    name: z.string(),
    icmp_type: z.number(),
    icmp_code: z.number().optional(),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'add_service_group',
  'Create a new service group.',
  'add-service-group',
  DomainSchema.extend({
    name: z.string(),
    members: z.array(z.string()),
    color: z.string().optional(),
    comments: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'show_access_rule',
  'Show a specific rule in the access control layer. Set requested rule by uid, name or rule-number (at least one is required). You must always specify the layer.',
  'show-access-rule',
  NameOrUidSchema.extend({
    layer: z.string(),
    rule_number: z.number().optional(),
    show_as_ranges: z.boolean().optional().default(false),
    show_hits: z.boolean().optional().default(false),
  })
);

createApiTool(server, serverModule,
  'show_access_layer',
  'Show an access layer object by name or UID (at least one is required).',
  'show-access-layer',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_access_layers',
  'Show all access layers, with optional filtering and detail level.',
  'show-access-layers',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_nat_rulebase',
  'Show the NAT rulebase of a given package.',
  'show-nat-rulebase',
  FilterSchema.extend({
    package: z.string(),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
  })
);

createApiTool(server, serverModule,
  'show_access_section',
  'Show an access section by name, UID or layer (at least one is required).',
  'show-access-section',
  NameOrUidSchema.extend({
    layer: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'show_nat_section',
  'Show a NAT section by name or UID and layer (at least one is required). You must always specify the package.',
  'show-nat-section',
  NameOrUidSchema.extend({
    package: z.string(),
    layer: z.string().optional(),
  })
);

// --- VPN Community and Gateway/Cluster/LSM Tools ---

createApiTool(server, serverModule,
  'show_vpn_community_star',
  'Show a VPN Community Star object by name or UID (at least one is required).',
  'show-vpn-community-star',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_vpn_communities_star',
  'Show all VPN Community Star objects, with optional filtering and detail level.',
  'show-vpn-communities-star',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_vpn_community_meshed',
  'Show a VPN Community Meshed object by name or UID (at least one is required).',
  'show-vpn-community-meshed',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_vpn_communities_meshed',
  'Show all VPN Community Meshed objects, with optional filtering and detail level.',
  'show-vpn-communities-meshed',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_vpn_community_remote_access',
  'Show a VPN Community Remote Access object by name or UID (at least one is required).',
  'show-vpn-community-remote-access',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_vpn_communities_remote_access',
  'Show all VPN Community Remote Access objects, with optional filtering and detail level.',
  'show-vpn-communities-remote-access',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_domains',
  'Retrieve all domains available in the management server.',
  'show-domains',
  z.object({})
);

createApiTool(server, serverModule,
  'show_mdss',
  'Retrieve all Multi-Domain Servers (MDS) in the management server. Use this to discover available domains in an MDS environment.',
  'show-mdss',
  FilterSchema.omit({ domains_to_process: true })
);

createApiTool(server, serverModule,
  'show_gateways_and_servers',
  'Retrieve multiple gateway and server objects with optional filtering and pagination. Use this to get the currently installed policies only gateways.',
  'show-gateways-and-servers',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_simple_gateway',
  'Retrieve a simple gateway object by name or UID. (at least one is required).',
  'show-simple-gateway',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_simple_gateways',
  'Retrieve multiple simple gateway objects with optional filtering and pagination.',
  'show-simple-gateways',
  FilterSchema.extend({
    show_membership: z.boolean().optional().default(false),
  })
);

createApiTool(server, serverModule,
  'show_lsm_clusters',
  'Retrieve multiple LSM cluster objects with optional filtering and pagination.',
  'show-lsm-clusters',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_cluster_member',
  'Retrieve a cluster member object by or UID',
  'show-cluster-member',
  DomainSchema.extend({
    uid: z.string().optional(),
    details_level: z.string().optional(),
  })
);

createApiTool(server, serverModule,
  'show_cluster_members',
  'Retrieve multiple cluster member objects with optional filtering and pagination.',
  'show-cluster-members',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_lsm_gateway',
  'Retrieve an LSM gateway object by name or UID. (at least one is required).',
  'show-lsm-gateway',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_simple_clusters',
  'Retrieve multiple simple cluster objects with optional filtering and pagination.',
  'show-simple-clusters',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_simple_cluster',
  'Retrieve a simple cluster object by name or UID (at least one is required).',
  'show-simple-cluster',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_lsm_gateways',
  'Retrieve multiple LSM gateway objects with optional filtering and pagination.',
  'show-lsm-gateways',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_lsm_cluster',
  'Retrieve an LSM cluster object by name or UID (at least one is required).',
  'show-lsm-cluster',
  NameOrUidSchema
);

createApiTool(server, serverModule,
  'show_groups',
  'Retrieve multiple group objects with optional filtering and pagination.',
  'show-groups',
  FilterSchema.extend({
    show_as_ranges: z.boolean().optional().default(false),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
  })
);

createApiTool(server, serverModule,
  'show_services_tcp',
  'Retrieve multiple TCP service objects with optional filtering and pagination.',
  'show-services-tcp',
  FilterSchema.extend({
    show_membership: z.boolean().optional().default(false),
  })
);

createApiTool(server, serverModule,
  'show_application_sites',
  'Retrieve multiple application site objects with optional filtering and pagination.',
  'show-application-sites',
  FilterSchema.extend({
    show_membership: z.boolean().optional().default(false),
  }).omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_application_site_groups',
  'Retrieve multiple application site group objects with optional filtering and pagination.',
  'show-application-site-groups',
  FilterSchema.extend({
    dereference_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
  })
);

createApiTool(server, serverModule,
  'show_services_udp',
  'Retrieve multiple UDP service objects with optional filtering and pagination.',
  'show-services-udp',
  FilterSchema.extend({
    show_membership: z.boolean().optional().default(false),
  })
);

createApiTool(server, serverModule,
  'show_wildcards',
  'Retrieve multiple wildcard objects with optional filtering and pagination.',
  'show-wildcards',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_security_zones',
  'Retrieve multiple security zone objects with optional filtering and pagination.',
  'show-security-zones',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_tags',
  'Retrieve multiple tag objects with optional filtering and pagination.',
  'show-tags',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_address_ranges',
  'Retrieve multiple address range objects with optional filtering and pagination.',
  'show-address-ranges',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_application_site_categories',
  'Retrieve multiple application site category objects with optional filtering and pagination.',
  'show-application-site-categories',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_dynamic_objects',
  'Retrieve multiple dynamic objects with optional filtering and pagination.',
  'show-dynamic-objects',
  FilterSchema.omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_services_icmp6',
  'Retrieve multiple ICMPv6 service objects with optional filtering and pagination.',
  'show-services-icmp6',
  FilterSchema.extend({
    show_membership: z.boolean().optional().default(false),
  }).omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_services_icmp',
  'Retrieve multiple ICMP service objects with optional filtering and pagination.',
  'show-services-icmp',
  FilterSchema.extend({
    show_membership: z.boolean().optional().default(false),
  }).omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_service_groups',
  'Retrieve multiple service group objects with optional filtering and pagination.',
  'show-service-groups',
  FilterSchema.extend({
    show_as_ranges: z.boolean().optional().default(false),
    dereference_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
  }).omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_multicast_address_ranges',
  'Retrieve multiple multicast address range objects with optional filtering and pagination.',
  'show-multicast-address-ranges',
  FilterSchema.omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_dns_domains',
  'Retrieve multiple DNS domain objects with optional filtering and pagination.',
  'show-dns-domains',
  FilterSchema
);

createApiTool(server, serverModule,
  'show_time_groups',
  'Retrieve multiple time group objects with optional filtering and pagination.',
  'show-time-groups',
  FilterSchema.omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_access_point_names',
  'Retrieve multiple access point name objects with optional filtering and pagination.',
  'show-access-point-names',
  FilterSchema.omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_objects',
  'Retrieve multiple generic objects with filtering and pagination. Can use type (e.g host, service-tcp, network, address-range...) to get objects of a certain type.',
  'show-objects',
  FilterSchema.extend({
    uids: z.array(z.string()).optional(),
    type: z.string().optional(),
  }).omit({ domain: true })
);

createApiTool(server, serverModule,
  'show_object',
  'Retrieve a generic object by UID.',
  'show-object',
  z.object({
    uid: z.string(),
  })
);

// --- Creation Tools ---

// Network Objects
createApiTool(server, serverModule, 'add_host', 'Create a new host object.', 'add-host', DomainSchema.extend({ name: z.string(), ip_address: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_network', 'Create a new network object.', 'add-network', DomainSchema.extend({ name: z.string(), subnet: z.string(), mask_length: z.number(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_group', 'Create a new group object.', 'add-group', DomainSchema.extend({ name: z.string(), members: z.array(z.string()), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_address_range', 'Create a new address range object.', 'add-address-range', DomainSchema.extend({ name: z.string(), ip_address_first: z.string(), ip_address_last: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_dynamic_object', 'Create a new dynamic object.', 'add-dynamic-object', DomainSchema.extend({ name: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_wildcard', 'Create a new wildcard object.', 'add-wildcard', DomainSchema.extend({ name: z.string(), 'ipv4-address': z.string(), 'ipv4-mask-wildcard': z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_security_zone', 'Create a new security zone object.', 'add-security-zone', DomainSchema.extend({ name: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_dns_domain', 'Create a new DNS domain object.', 'add-dns-domain', DomainSchema.extend({ name: z.string(), is_sub_domain: z.boolean().optional(), color: z.string().optional(), comments: z.string().optional() }));

// Service Objects
createApiTool(server, serverModule, 'add_service_tcp', 'Create a new TCP service.', 'add-service-tcp', DomainSchema.extend({ name: z.string(), port: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_service_udp', 'Create a new UDP service.', 'add-service-udp', DomainSchema.extend({ name: z.string(), port: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_service_icmp', 'Create a new ICMP service.', 'add-service-icmp', DomainSchema.extend({ name: z.string(), icmp_type: z.number(), icmp_code: z.number().optional(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_service_sctp', 'Create a new SCTP service.', 'add-service-sctp', DomainSchema.extend({ name: z.string(), port: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_service_dce_rpc', 'Create a new DCE-RPC service.', 'add-service-dce-rpc', DomainSchema.extend({ name: z.string(), interface_uuid: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_service_other', 'Create a new service with a custom IP protocol.', 'add-service-other', DomainSchema.extend({ name: z.string(), ip_protocol: z.string(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_service_group', 'Create a new service group.', 'add-service-group', DomainSchema.extend({ name: z.string(), members: z.array(z.string()), color: z.string().optional(), comments: z.string().optional() }));

// Gateways and Servers
createApiTool(server, serverModule, 'add_simple_gateway', 'Create a new simple gateway object.', 'add-simple-gateway', DomainSchema.extend({ name: z.string(), ip_address: z.string(), 'os-name': z.string().optional(), version: z.string().optional(), 'one-time-password': z.string().optional(), 'hardware-model': z.string().optional(), color: z.string().optional(), comments: z.string().optional() }));
createApiTool(server, serverModule, 'add_simple_cluster', 'Create a new simple cluster object.', 'add-simple-cluster', DomainSchema.extend({ name: z.string(), ip_address: z.string(), 'os-name': z.string().optional(), version: z.string().optional(), 'one-time-password': z.string().optional(), 'hardware-model': z.string().optional(), members: z.array(z.string()), color: z.string().optional(), comments: z.string().optional() }));

// Rules
const RuleObjectSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    type: z.enum(['host', 'network', 'group', 'address-range', 'dynamic-object', 'wildcard', 'security-zone', 'dns-domain', 'service-tcp', 'service-udp', 'service-icmp', 'service-sctp', 'service-dce-rpc', 'service-other', 'service-group']),
    ip_address: z.string().optional(),
    subnet: z.string().optional(),
    mask_length: z.number().optional(),
    members: z.array(z.string()).optional(),
    ip_address_first: z.string().optional(),
    ip_address_last: z.string().optional(),
    'ipv4-address': z.string().optional(),
    'ipv4-mask-wildcard': z.string().optional(),
    is_sub_domain: z.boolean().optional(),
    port: z.string().optional(),
    icmp_type: z.number().optional(),
    icmp_code: z.number().optional(),
    interface_uuid: z.string().optional(),
    ip_protocol: z.string().optional(),
  }),
]);

server.tool(
  'add_access_rule',
  'Create a new access rule. If source, destination, or service objects do not exist, they will be created.',
  DomainSchema.extend({
    layer: z.string(),
    position: z.union([z.number(), z.string()]),
    name: z.string().optional(),
    action: z.string(),
    destination: z.array(RuleObjectSchema),
    source: z.array(RuleObjectSchema),
    service: z.array(RuleObjectSchema),
    track: z.string().optional(),
    enabled: z.boolean().optional(),
  }),
  async (args: any, extra: any) => {
    const { layer, position, name, action, destination, source, service, track, enabled, domain } = args;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);

    const upsertObject = async (obj: any) => {
      if (typeof obj === 'string') {
        return obj; // Assume existing object by name
      }

      try {
        await apiManager.callApi('POST', `show-${obj.type}`, { name: obj.name }, domain);
        return obj.name; // Object exists
      } catch (error: any) {
        if (error.response && error.response.data && error.response.data.code === 'generic_err_object_not_found') {
          // Object not found, proceed to create
          const createParams: { [key: string]: any } = { ...obj };
          delete createParams.type; // Remove 'type' before sending to API
          await apiManager.callApi('POST', `add-${obj.type}`, createParams, domain);
          return obj.name;
        }
        // Re-throw other errors
        throw error;
      }
    };

    try {
      const [sourceNames, destinationNames, serviceNames] = await Promise.all([
        Promise.all(source.map(upsertObject)),
        Promise.all(destination.map(upsertObject)),
        Promise.all(service.map(upsertObject)),
      ]);

      const ruleParams = {
        layer,
        position,
        name,
        action,
        destination: destinationNames,
        source: sourceNames,
        service: serviceNames,
        track,
        enabled,
      };

      const resp = await apiManager.callApi('POST', 'add-access-rule', ruleParams, domain);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: `Error creating access rule: ${errorMessage}` }] };
    }
  }
);
createApiTool(server, serverModule, 'add_nat_rule', 'Create a new NAT rule.', 'add-nat-rule', DomainSchema.extend({ package: z.string(), position: z.union([z.number(), z.string()]), original_destination: z.string(), original_service: z.string(), original_source: z.string(), translated_destination: z.string(), translated_service: z.string(), translated_source: z.string(), enabled: z.boolean().optional(), method: z.string().optional() }));

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
          summary = 'Zero Hits Summary by Policy Package:\n\n';
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

createApiTool(server, serverModule,
  'show_networks',
  'Show all networks, with optional filtering and detail level.',
  'show-networks',
  FilterSchema.extend({
    domains_to_process: z.array(z.string()).optional(),
  })
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
