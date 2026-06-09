#!/usr/bin/env node
import { z } from 'zod';
import { Settings, APIManagerForAPIKey, formatWithPaginationHint } from '@chkp/quantum-infra';
import {
  launchMCPServer,
  createServerModule,
  createApiRunner,
  SessionContext,
  createMcpServer
} from '@chkp/mcp-utils';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { slimProtection, slimGateway, slimRule, slimProfile, matchOverridesForCve, collectThreatRulebases } from './cve-protection.js';

const { server, pkg } = createMcpServer(import.meta.url, {
  description: 'MCP server to interact with Threat Prevention objects on Check Point Gateways.'
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

// Management API version: v2.1 (R82.10+)
// --- SHARED PARAM SCHEMAS ---
const PARAM_DOMAINS_TO_PROCESS = z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional()
  .describe('Scope query to all domains on this server or current domain only. Use standard (not full) for details-level. Must be called from the System Domain.');
const PARAM_SHOW_ONLY_LOCAL_DOMAIN = z.boolean().optional().default(false)
  .describe('When true, returns only objects belonging to the current domain; excludes objects inherited from a Global Policy domain.');
const PARAM_DOMAIN = z.string().optional()
  .describe('MDS domain name for routing this API call. Required in multi-domain (MDS) environments; omit for single-domain setups.');


server.tool(
  'threat-prevention__init',
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


// Tool: show_threat_protections
server.tool(
  'show_threat_protections',
  'Show all threat protections objects, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    show_capture_packets_and_track: z.boolean().optional().default(true)
      .describe('Include capture packets and track settings in the response.'),
    show_ips_additional_properties: z.boolean().optional().default(false)
      .describe('Include IPS-specific additional properties. Only applies when details-level is full.'),
    show_profiles: z.boolean().optional().default(false)
      .describe('Include profile associations for each protection. Only applies when details-level is full.'),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, show_capture_packets_and_track = true, show_ips_additional_properties = false, show_profiles = false, domains_to_process, show_only_local_domain = false, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    params['show-capture-packets-and-track'] = show_capture_packets_and_track;
    if (show_ips_additional_properties) params['show-ips-additional-properties'] = true;
    if (show_profiles) params['show-profiles'] = true;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (show_only_local_domain) params['show-only-local-domain'] = true;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-protections', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_layer
server.tool(
  'show_threat_layer',
  'Show a threat layer object by name or UID, one of them must be provided, the other should be empty.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name = '', uid = '', details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-layer', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_indicator
server.tool(
  'show_threat_indicator',
  'Show a threat indicator object by name or UID, one of them must be provided, the other should be empty.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name = '', uid = '', details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-indicator', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_ips_status
server.tool(
  'show_ips_status',
  'Show the IPS (Intrusion Prevention System) status.',
  {
    domain: PARAM_DOMAIN,
  },
  async ({ domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-ips-status', {}, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_ioc_feeds
server.tool(
  'show_threat_ioc_feeds',
  'Show all threat IOC feeds, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process, show_only_local_domain = false, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (show_only_local_domain) params['show-only-local-domain'] = true;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-ioc-feeds', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_rule
server.tool(
  'show_threat_rule',
  'Show a threat rule object by UID, name, or rule number (at least one of them). Layer is also mandatory!',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    rule_number: z.number().optional(),
    layer: z.string(),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ uid, name, rule_number, layer, details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const body: Record<string, any> = {};
    if (uid) body.uid = uid;
    if (name) body.name = name;
    if (rule_number !== undefined) body['rule-number'] = rule_number;
    if (layer) body.layer = layer;
    if (details_level) body['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-rule', body, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_exception_groups
server.tool(
  'show_exception_groups',
  'Show all exception groups, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process, show_only_local_domain = false, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (show_only_local_domain) params['show-only-local-domain'] = true;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-exception-groups', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_ips_update_schedule
server.tool(
  'show_ips_update_schedule',
  'Show the IPS update schedule.',
  {
    domain: PARAM_DOMAIN,
  },
  async ({ domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-ips-update-schedule', {}, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_indicators
server.tool(
  'show_threat_indicators',
  'Show all threat indicators, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process, show_only_local_domain = false, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (show_only_local_domain) params['show-only-local-domain'] = true;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-indicators', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_profiles
server.tool(
  'show_threat_profiles',
  'Show all threat profiles, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process, show_only_local_domain = false, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (show_only_local_domain) params['show-only-local-domain'] = true;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-profiles', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_ips_protection_extended_attribute
server.tool(
  'show_ips_protection_extended_attribute',
  'Show an IPS protection extended attribute by name or UID, one of them must be provided, the other should be empty.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name = '', uid = '', details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-ips-protection-extended-attribute', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_ips_protection_extended_attributes
server.tool(
  'show_ips_protection_extended_attributes',
  'Show all IPS protection extended attributes, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-ips-protection-extended-attributes', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_layers
server.tool(
  'show_threat_layers',
  'Show all threat layers, with optional filtering and detail level.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process, show_only_local_domain = false, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (show_only_local_domain) params['show-only-local-domain'] = true;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-layers', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_rulebase
server.tool(
  'show_threat_rulebase',
  'Show the entire Threat Prevention Rules layer, with advanced filtering and options. Either name or UID must be provided, but not both.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    filter: z.string().optional(),
    filter_settings: z.object({
      search_mode: z.enum(['general', 'packet']).optional(),
      packet_search_settings: z.object({
        expand_group_members: z.boolean().optional(),
        expand_group_with_exclusion_members: z.boolean().optional(),
        match_on_any: z.boolean().optional(),
        match_on_group_with_exclusion: z.boolean().optional(),
        match_on_negate: z.boolean().optional(),
      }).optional(),
    }).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    package: z.string().optional(),
    use_object_dictionary: z.boolean().optional(),
    dereference_group_members: z.boolean().optional()
      .describe('When true, expands group members to their full object details instead of returning UIDs.'),
    show_membership: z.boolean().optional()
      .describe('When true, includes the groups each object belongs to. Triggers additional server-side computation; omit if not needed.'),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name, uid, filter, filter_settings, limit, offset, order, package: pkg, use_object_dictionary, dereference_group_members, show_membership, details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const body: Record<string, any> = {};
    if (name) body.name = name;
    if (uid) body.uid = uid;
    if (filter) body.filter = filter;
    if (filter_settings) {
      body['filter-settings'] = {};
      if (filter_settings.search_mode) body['filter-settings']['search-mode'] = filter_settings.search_mode;
      if (filter_settings.packet_search_settings) {
        body['filter-settings']['packet-search-settings'] = {};
        const p = filter_settings.packet_search_settings;
        if (p.expand_group_members !== undefined) body['filter-settings']['packet-search-settings']['expand-group-members'] = p.expand_group_members;
        if (p.expand_group_with_exclusion_members !== undefined) body['filter-settings']['packet-search-settings']['expand-group-with-exclusion-members'] = p.expand_group_with_exclusion_members;
        if (p.match_on_any !== undefined) body['filter-settings']['packet-search-settings']['match-on-any'] = p.match_on_any;
        if (p.match_on_group_with_exclusion !== undefined) body['filter-settings']['packet-search-settings']['match-on-group-with-exclusion'] = p.match_on_group_with_exclusion;
        if (p.match_on_negate !== undefined) body['filter-settings']['packet-search-settings']['match-on-negate'] = p.match_on_negate;
      }
    }
    if (limit !== undefined) body.limit = limit;
    if (offset !== undefined) body.offset = offset;
    if (order) body.order = order;
    if (pkg) body.package = pkg;
    if (use_object_dictionary !== undefined) body['use-object-dictionary'] = use_object_dictionary;
    if (dereference_group_members !== undefined) body['dereference-group-members'] = dereference_group_members;
    if (show_membership !== undefined) body['show-membership'] = show_membership;
    if (details_level) body['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-rulebase', body, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_exception_group
server.tool(
  'show_exception_group',
  'Show an exception group object by name or UID, one of them must be provided the other should be blank.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name = '', uid = '', details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-exception-group', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_protection
server.tool(
  'show_threat_protection',
  'Show a threat protection object by name or UID (one of which must be provided), with optional details and calculated fields.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    show_capture_packets_and_track: z.boolean().optional()
      .describe('Include capture packets and track settings in the response.'),
    show_ips_additional_properties: z.boolean().optional()
      .describe('Include IPS-specific additional properties. Only applies when details-level is full.'),
    show_profiles: z.boolean().optional()
      .describe('Include profile associations for each protection. Only applies when details-level is full.'),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name, uid, show_capture_packets_and_track, show_ips_additional_properties, show_profiles, details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const body: Record<string, any> = {};
    if (name) body.name = name;
    if (uid) body.uid = uid;
    if (show_capture_packets_and_track !== undefined) body['show-capture-packets-and-track'] = show_capture_packets_and_track;
    if (show_ips_additional_properties !== undefined) body['show-ips-additional-properties'] = show_ips_additional_properties;
    if (show_profiles !== undefined) body['show-profiles'] = show_profiles;
    if (details_level) body['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-protection', body, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_rule_exception_rulebase
server.tool(
  'show_threat_rule_exception_rulebase',
  'Show the entire Threat Exceptions layer for a given threat rule, with advanced filtering and options. Name and UID refer to the layer, one of them must be provided, but not both. In addition one of rule_uid, rule_name or rule_number must be provided to specify the rule for which exceptions are shown.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    rule_uid: z.string().optional(),
    rule_name: z.string().optional(),
    rule_number: z.number().optional(),
    filter: z.string().optional(),
    filter_settings: z.object({
      search_mode: z.enum(['general', 'packet']).optional(),
      packet_search_settings: z.object({
        expand_group_members: z.boolean().optional(),
        expand_group_with_exclusion_members: z.boolean().optional(),
        match_on_any: z.boolean().optional(),
        match_on_group_with_exclusion: z.boolean().optional(),
        match_on_negate: z.boolean().optional(),
      }).optional(),
    }).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    package: z.string().optional(),
    use_object_dictionary: z.boolean().optional(),
    dereference_group_members: z.boolean().optional()
      .describe('When true, expands group members to their full object details instead of returning UIDs.'),
    show_membership: z.boolean().optional()
      .describe('When true, includes the groups each object belongs to. Triggers additional server-side computation; omit if not needed.'),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name, uid, rule_uid, rule_name, rule_number, filter, filter_settings, limit, offset, order, package: pkg, use_object_dictionary, dereference_group_members, show_membership, details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const body: Record<string, any> = {};
    if (name) body.name = name;
    if (uid) body.uid = uid;
    if (rule_uid) body['rule-uid'] = rule_uid;
    if (rule_name) body['rule-name'] = rule_name;
    if (rule_number !== undefined) body['rule-number'] = rule_number;
    if (filter) body.filter = filter;
    if (filter_settings) {
      body['filter-settings'] = {};
      if (filter_settings.search_mode) body['filter-settings']['search-mode'] = filter_settings.search_mode;
      if (filter_settings.packet_search_settings) {
        body['filter-settings']['packet-search-settings'] = {};
        const p = filter_settings.packet_search_settings;
        if (p.expand_group_members !== undefined) body['filter-settings']['packet-search-settings']['expand-group-members'] = p.expand_group_members;
        if (p.expand_group_with_exclusion_members !== undefined) body['filter-settings']['packet-search-settings']['expand-group-with-exclusion-members'] = p.expand_group_with_exclusion_members;
        if (p.match_on_any !== undefined) body['filter-settings']['packet-search-settings']['match-on-any'] = p.match_on_any;
        if (p.match_on_group_with_exclusion !== undefined) body['filter-settings']['packet-search-settings']['match-on-group-with-exclusion'] = p.match_on_group_with_exclusion;
        if (p.match_on_negate !== undefined) body['filter-settings']['packet-search-settings']['match-on-negate'] = p.match_on_negate;
      }
    }
    if (limit !== undefined) body.limit = limit;
    if (offset !== undefined) body.offset = offset;
    if (order) body.order = order;
    if (pkg) body.package = pkg;
    if (use_object_dictionary !== undefined) body['use-object-dictionary'] = use_object_dictionary;
    if (dereference_group_members !== undefined) body['dereference-group-members'] = dereference_group_members;
    if (show_membership !== undefined) body['show-membership'] = show_membership;
    if (details_level) body['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-rule-exception-rulebase', body, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_advanced_settings
server.tool(
  'show_threat_advanced_settings',
  "Show Threat Prevention's Blades' advanced settings.",
  {
    domain: PARAM_DOMAIN,
  },
  async ({ domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-advanced-settings', {}, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_profile
server.tool(
  'show_threat_profile',
  'Show a threat profile object by name or UID (one of which must be provided), with optional details-level.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name, uid, details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const body: Record<string, any> = {};
    if (name) body.name = name;
    if (uid) body.uid = uid;
    if (details_level) body['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-profile', body, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_threat_ioc_feed
server.tool(
  'show_threat_ioc_feed',
  'Show a threat IOC feed object by name or UID.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    domain: PARAM_DOMAIN,
  },
  async ({ name = '', uid = '', details_level, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-threat-ioc-feed', params, domainParam);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

server.tool(
  'threat-prevention__show_gateways_and_servers',
  'Retrieve multiple gateway and server objects with optional filtering and pagination. Use this to get the currently installed policies only gateways.',
  {
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async (args: Record<string, unknown>, extra: any) => {
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (args.show_only_local_domain) params['show-only-local-domain'] = true;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-gateways-and-servers', params, domain);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

server.tool(
  'threat-prevention__show_objects',
  'Retrieve multiple generic objects with filtering and pagination. Can use type (e.g host, service-tcp, network, address-range...) to get objects of a certain type.',
  {
      uids: z.array(z.string()).optional(),
      filter: z.string().optional(),
      ip_only: z.boolean().optional()
        .describe('When true, returns only objects that have an IP address (hosts, networks, ranges). Excludes services, groups, etc.'),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
      order: z.array(z.string()).optional(),
      details_level: z.string().optional(),
      domains_to_process: PARAM_DOMAINS_TO_PROCESS,
      show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
      type: z.string().optional(),
      domain: PARAM_DOMAIN,
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
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if ( uids ) params.uids = uids;
    if (filter) params.filter = filter;
    if (typeof args.ip_only === 'boolean') params['ip-only'] = args.ip_only;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (args.show_only_local_domain) params['show-only-local-domain'] = true;
    if (type) params.type = type;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-objects', params, domain);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: show_object
server.tool(
  'threat-prevention__show_object',
  'Retrieve a generic object by UID.',
  {
    uid: z.string(),
    domain: PARAM_DOMAIN,
  },
  async (args: Record<string, unknown>, extra: any) => {
      const uid = args.uid as string;
      const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
      const params: Record<string, any> = {};
      params.uid = uid;
      params['details-level'] = 'full';
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const resp = await apiManager.callApi('POST', 'show-object', params, domain);
      return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: check_cve_protection
// Mirrors the legacy console-one-backend cve_function_tool.py: the four
// API calls with field-filtered responses, returned as a list. Adds multi-CVE
// input, profile activation thresholds, and per-CVE override matching.
server.tool(
  'check_cve_protection',
  'Check whether one or more CVEs are protected. Returns filtered responses for show-threat-protections (per CVE), show-gateways-and-servers, show-threat-rulebase (per relevant rulebase), and show-threat-profile (per referenced profile). Pass an array to `cve` to batch CVEs (gateway/rulebase/profile fetches are shared). A gateway protects a CVE when: (1) network-security-blades.ips=true AND policy.threat-policy-installed=true; (2) a rulebase rule includes the gateway in install-on; (3) the rule\'s profile activates the protection (severity / performance-impact thresholds gated by ips-settings.exclude-* toggles, then extended-attributes filtering, then action = profile["confidence-level-<protection.confidence-level>"]); (4) no entry in overrides-by-cve forces the protection\'s final.action to Inactive.',
  {
    cve: z.union([z.string(), z.array(z.string())]).describe('CVE string or array of CVE strings (e.g. "CVE-2025-24054" or ["CVE-2025-24054", "CVE-2024-1234"]).'),
    gateway: z.string().optional().describe('Restrict to this gateway name. Empty = all gateways except management hosts.'),
    domain: PARAM_DOMAIN,
  },
  async ({ cve, gateway, domain }: any, extra: any) => {
    const domainParam = typeof domain === 'string' && domain.trim() !== '' ? domain : undefined;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const cves = Array.from(new Set(
      (Array.isArray(cve) ? cve : [cve]).filter((c) => typeof c === 'string').map((c: string) => c.trim()).filter(Boolean)
    ));
    if (cves.length === 0) {
      return { content: [{ type: 'text', text: 'Error: `cve` must be a CVE string or a non-empty array of CVE strings.' }] };
    }

    const responses: any[] = [];

    const protectionsByCve: Record<string, any[]> = {};
    for (const c of cves) {
      const resp = await apiManager.callApi('POST', 'show-threat-protections', { filter: c, 'details-level': 'full' }, domainParam);
      const slim = (resp?.protections ?? []).map(slimProtection);
      protectionsByCve[c] = slim;
      responses.push({ name: 'show-threat-protections', arguments: { filter: c }, response: { protections: slim } });
    }

    const gwsResp = await apiManager.callApi('POST', 'show-gateways-and-servers', { 'details-level': 'full' }, domainParam);
    const gateways = (gwsResp?.objects ?? [])
      .filter((gw: any) => gateway ? gw?.name === gateway : gw?.type !== 'checkpoint-host')
      .map(slimGateway);
    responses.push({ name: 'show-gateways-and-servers', response: { objects: gateways } });

    const profileNames = new Set<string>();
    for (const name of collectThreatRulebases(gateways)) {
      const rb = await apiManager.callApi('POST', 'show-threat-rulebase', { name, 'details-level': 'full' }, domainParam);
      const rules = (rb?.rulebase ?? []).map(slimRule);
      for (const rule of rules) if (typeof rule.action === 'string') profileNames.add(rule.action);
      responses.push({ name: 'show-threat-rulebase', arguments: { name }, response: { rulebase: rules } });
    }

    for (const name of profileNames) {
      const resp = await apiManager.callApi('POST', 'show-threat-profile', { name, 'details-level': 'full' }, domainParam);
      const overrides: any[] = Array.isArray(resp?.overrides) ? resp.overrides : [];
      const overridesByCve: Record<string, any[]> = {};
      for (const c of cves) {
        const m = matchOverridesForCve(overrides, c, protectionsByCve[c] ?? []);
        if (m.length > 0) overridesByCve[c] = m;
      }
      responses.push({ name: 'show-threat-profile', arguments: { name }, response: slimProfile(resp, overridesByCve) });
    }

    return { content: [{ type: 'text', text: JSON.stringify({ cves, responses }, null, 2) }] };
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
