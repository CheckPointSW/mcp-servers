#!/usr/bin/env node
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Settings, APIManagerForAPIKey } from '@chkp/quantum-infra';
import { 
  launchMCPServer, 
  createServerModule,
  createApiRunner
} from '@chkp/mcp-utils';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

const server = new McpServer({
  name: 'threat-prevention',
  version: '1.0.0',
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
    domains_to_process: z.array(z.string()).optional(),
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process }, extra) => {
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-threat-protections', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
  },
  async ({ name = '', uid = '', details_level }, extra) => {
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await runApi('POST', 'show-threat-layer', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
  },
  async ({ name = '', uid = '', details_level }, extra) => {
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await runApi('POST', 'show-threat-indicator', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_ips_status
server.tool(
  'show_ips_status',
  'Show the IPS (Intrusion Prevention System) status.',
  {
  },
  async (extra) => {
    const resp = await runApi('POST', 'show-ips-status', {}, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    domains_to_process: z.array(z.string()).optional(),
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process }, extra) => {
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-threat-ioc-feeds', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
  },
  async ({ uid, name, rule_number, layer, details_level }, extra) => {
    const body: Record<string, any> = {};
    if (uid) body.uid = uid;
    if (name) body.name = name;
    if (rule_number !== undefined) body['rule-number'] = rule_number;
    if (layer) body.layer = layer;
    if (details_level) body['details-level'] = details_level;
    const params = { body };
    const resp = await runApi('POST', 'show-threat-rule', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    domains_to_process: z.array(z.string()).optional(),
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process }, extra) => {
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-exception-groups', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_ips_update_schedule
server.tool(
  'show_ips_update_schedule',
  'Show the IPS update schedule.',
  {
  },
  async (extra) => {
    const resp = await runApi('POST', 'show-ips-update-schedule', {}, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    domains_to_process: z.array(z.string()).optional(),
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process }, extra) => {
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-threat-indicators', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    domains_to_process: z.array(z.string()).optional(),
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process }, extra) => {
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-threat-profiles', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
  },
  async ({ name = '', uid = '', details_level }, extra) => {
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await runApi('POST', 'show-ips-protection-extended-attribute', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    domains_to_process: z.array(z.string()).optional(),
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process }, extra) => {
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-ips-protection-extended-attributes', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    domains_to_process: z.array(z.string()).optional(),
  },
  async ({ filter = '', limit = 50, offset = 0, order, details_level, domains_to_process }, extra) => {
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await runApi('POST', 'show-threat-layers', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    dereference_group_members: z.boolean().optional(),
    show_membership: z.boolean().optional(),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
  },
  async ({ name, uid, filter, filter_settings, limit, offset, order, package: pkg, use_object_dictionary, dereference_group_members, show_membership, details_level }, extra) => {
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
    const params = { body };
    const resp = await runApi('POST', 'show-threat-rulebase', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
  },
  async ({ name = '', uid = '', details_level }, extra) => {
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await runApi('POST', 'show-exception-group', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_threat_protection
server.tool(
  'show_threat_protection',
  'Show a threat protection object by name or UID (one of which must be provided), with optional details and calculated fields.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    show_capture_packets_and_track: z.boolean().optional(),
    show_ips_additional_properties: z.boolean().optional(),
    show_profiles: z.boolean().optional(),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
  },
  async ({ name, uid, show_capture_packets_and_track, show_ips_additional_properties, show_profiles, details_level }, extra) => {
    const body: Record<string, any> = {};
    if (name) body.name = name;
    if (uid) body.uid = uid;
    if (show_capture_packets_and_track !== undefined) body['show-capture-packets-and-track'] = show_capture_packets_and_track;
    if (show_ips_additional_properties !== undefined) body['show-ips-additional-properties'] = show_ips_additional_properties;
    if (show_profiles !== undefined) body['show-profiles'] = show_profiles;
    if (details_level) body['details-level'] = details_level;
    const params = { body };
    const resp = await runApi('POST', 'show-threat-protection', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
    dereference_group_members: z.boolean().optional(),
    show_membership: z.boolean().optional(),
    details_level: z.enum(['uid', 'standard', 'full']).optional(),
  },
  async ({ name, uid, rule_uid, rule_name, rule_number, filter, filter_settings, limit, offset, order, package: pkg, use_object_dictionary, dereference_group_members, show_membership, details_level }, extra) => {
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
    const params = { body };
    const resp = await runApi('POST', 'show-threat-rule-exception-rulebase', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_threat_advanced_settings
server.tool(
  'show_threat_advanced_settings',
  "Show Threat Prevention's Blades' advanced settings.",
  {},
  async (extra) => {
    const params = { body: {} };
    const resp = await runApi('POST', 'show-threat-advanced-settings', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
  },
  async ({ name, uid, details_level }, extra) => {
    const body: Record<string, any> = {};
    if (name) body.name = name;
    if (uid) body.uid = uid;
    if (details_level) body['details-level'] = details_level;
    const params = { body };
    const resp = await runApi('POST', 'show-threat-profile', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
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
  },
  async ({ name = '', uid = '', details_level }, extra) => {
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await runApi('POST', 'show-threat-ioc-feed', params, extra);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_gateways_and_servers',
  'Retrieve multiple gateway and server objects with optional filtering and pagination. Use this to get the currently installed policies only gateways.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
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
  'show_objects',
  'Retrieve multiple generic objects with filtering and pagination. Can use type (e.g host, service-tcp, network, address-range...) to get objects of a certain type.',
  {
      uids: z.array(z.string()).optional(),
      filter: z.string().optional(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
      order: z.array(z.string()).optional(),
      details_level: z.string().optional(),
      domains_to_process: z.array(z.string()).optional(),
      type: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uids = Array.isArray(args.uids) ? args.uids as string[] : undefined;
      const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
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
  'show_object',
  'Retrieve a generic object by UID.',
  {
    uid: z.string()
  },
  async (args: Record<string, unknown>, extra: any) => {
      const uid = args.uid as string;
      const params: Record<string, any> = {};
      params.uid = uid;
      params.details_level = 'full';
      const resp = await runApi('POST', 'show-object', params, extra);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: check_cve_protection
server.tool(
  'check_cve_protection',
  'Check if a given CVE is protected, optionally for a specific gateway. Performs a series of API calls to determine protection status.',
  {
    cve: z.string().describe('The CVE to check for protection'),
    gateway: z.string().optional().describe('The gateway to check for protection. Leave empty to check all gateways.'),
  },
  async ({ cve, gateway }, extra) => {
    // 1. Query protections for the CVE
    const protectionsResp = await runApi('POST', 'show-threat-protections', { filter: cve, 'details-level': 'full' }, extra);
    // 2. Query all gateways and servers
    const gatewaysResp = await runApi('POST', 'show-gateways-and-servers', { 'details-level': 'full' }, extra);
    const gateways: any[] = Array.isArray(gatewaysResp.objects) ? gatewaysResp.objects.filter((gw: any) => !gateway || gw.name === gateway) : [];
    // 3. For each gateway, check IPS and threat policy
    const rulebases = new Set<string>();
    for (const gw of gateways) {
      const blades = gw['network-security-blades'] || {};
      const ipsEnabled = !!blades.ips;
      const policy = gw.policy || {};
      if (ipsEnabled && policy['threat-policy-installed'] && policy['threat-policy-name']) {
        rulebases.add(`${policy['threat-policy-name']} Threat Prevention`);
      }
    }
    // 4. For each rulebase, get rules and collect profile names
    const profileNames = new Set<string>();
    for (const rulebase of rulebases) {
      const rulebaseResp = await runApi('POST', 'show-threat-rulebase', { name: rulebase, 'details-level': 'full' }, extra);
      const rules = Array.isArray(rulebaseResp.rulebase) ? rulebaseResp.rulebase : [];
      for (const rule of rules) {
        if (rule.action) profileNames.add(rule.action);
      }
    }
    // 5. For each profile, get details
    const profiles = [];
    for (const profileName of profileNames) {
      const profileResp = await runApi('POST', 'show-threat-profile', { name: profileName, 'details-level': 'full' }, extra);
      profiles.push(profileResp);
    }
    return {
      content: [
        { type: 'text', text: JSON.stringify({ protections: protectionsResp, gateways: gateways, rulebases: Array.from(rulebases), profiles }, null, 2) }
      ]
    };
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
