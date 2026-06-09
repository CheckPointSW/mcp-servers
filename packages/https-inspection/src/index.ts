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

const { server, pkg } = createMcpServer(import.meta.url, {
  description: 'MCP server to interact with HTTPS Inspection objects on Check Point Gateways.'
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

// HTTPS Inspection Tools

server.tool(
  'https-inspection__init',
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
  'show_https_rule',
  'Retrieve an existing HTTPS Inspection rule using either the rule number, name or the unique identifier (UID) of the rule. It also allows you to specify the level of detail for the fields in the response, ranging from just the UID value to a fully detailed representation of the rule.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    rule_number: z.string().optional(),
    layer: z.string().optional(),
    show_hits: z.boolean().optional(),
    hits_settings: z.object({
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      target: z.string().optional(),
    }).optional(),
    details_level: z.string().optional().default('standard'),
    domain: PARAM_DOMAIN,
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;
    const rule_number = typeof args.rule_number === 'string' ? args.rule_number : undefined;
    const layer = typeof args.layer === 'string' ? args.layer : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

    const params: Record<string, any> = {};
    if (uid) {
      params.uid = uid;
    } else if (name) {
      params.name = name;
    } else if (rule_number) {
      params['rule-number'] = rule_number;
    } else {
      throw new Error('Either uid, name, or rule_number must be provided');
    }
    if (layer) params.layer = layer;
    if (typeof args.show_hits === 'boolean') params['show-hits'] = args.show_hits;
    if (args.hits_settings && typeof args.hits_settings === 'object') {
      const hs = args.hits_settings as Record<string, any>;
      const hitsSettings: Record<string, any> = {};
      if (typeof hs.from_date === 'string') hitsSettings['from-date'] = hs.from_date;
      if (typeof hs.to_date === 'string') hitsSettings['to-date'] = hs.to_date;
      if (typeof hs.target === 'string') hitsSettings.target = hs.target;
      if (Object.keys(hitsSettings).length > 0) params['hits-settings'] = hitsSettings;
    }
    params['details-level'] = details_level;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-https-rule', params, domain);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

server.tool(
  'show_https_rulebase',
  'Retrieve the entire HTTPS Inspection Rules layer. It can filter the rules based on search criteria and provides a list of objects. The function allows you to set filter preferences, limit the number of results, and sort the results.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
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
    order: z.array(z.object({ ASC: z.string().optional(), DESC: z.string().optional() })).optional(),
    package: z.string().optional(),
    show_hits: z.boolean().optional(),
    hits_settings: z.object({
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      target: z.string().optional(),
    }).optional(),
    details_level: z.string().optional().default('standard'),
    use_object_dictionary: z.boolean().optional(),
    dereference_group_members: z.boolean().optional()
      .describe('When true, expands group members to their full object details instead of returning UIDs.'),
    show_membership: z.boolean().optional()
      .describe('When true, includes the groups each object belongs to. Triggers additional server-side computation; omit if not needed.'),
    domain: PARAM_DOMAIN,
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;
    const filter = typeof args.filter === 'string' ? args.filter : undefined;
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : undefined;
    const package_name = typeof args.package === 'string' ? args.package : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    const use_object_dictionary = typeof args.use_object_dictionary === 'boolean' ? args.use_object_dictionary : undefined;
    const dereference_group_members = typeof args.dereference_group_members === 'boolean' ? args.dereference_group_members : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : undefined;
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

    const params: Record<string, any> = { limit, offset };
    if (uid) params.uid = uid;
    if (name) params.name = name;
    if (filter) params.filter = filter;
    if (args.filter_settings && typeof args.filter_settings === 'object') {
      const fs = args.filter_settings as Record<string, any>;
      const filterSettings: Record<string, any> = {};
      if (typeof fs.search_mode === 'string') filterSettings['search-mode'] = fs.search_mode;
      if (fs.packet_search_settings && typeof fs.packet_search_settings === 'object') {
        const pss = fs.packet_search_settings as Record<string, any>;
        const packetSettings: Record<string, any> = {};
        if (typeof pss.expand_group_members === 'boolean') packetSettings['expand-group-members'] = pss.expand_group_members;
        if (typeof pss.expand_group_with_exclusion_members === 'boolean') packetSettings['expand-group-with-exclusion-members'] = pss.expand_group_with_exclusion_members;
        if (typeof pss.intersection_mode_dst === 'string') packetSettings['intersection-mode-dst'] = pss.intersection_mode_dst;
        if (typeof pss.intersection_mode_src === 'string') packetSettings['intersection-mode-src'] = pss.intersection_mode_src;
        if (typeof pss.match_on_any === 'boolean') packetSettings['match-on-any'] = pss.match_on_any;
        if (typeof pss.match_on_group_with_exclusion === 'boolean') packetSettings['match-on-group-with-exclusion'] = pss.match_on_group_with_exclusion;
        if (typeof pss.match_on_negate === 'boolean') packetSettings['match-on-negate'] = pss.match_on_negate;
        if (Object.keys(packetSettings).length > 0) filterSettings['packet-search-settings'] = packetSettings;
      }
      if (Object.keys(filterSettings).length > 0) params['filter-settings'] = filterSettings;
    }
    if (order) params.order = order;
    if (package_name) params.package = package_name;
    if (typeof args.show_hits === 'boolean') params['show-hits'] = args.show_hits;
    if (args.hits_settings && typeof args.hits_settings === 'object') {
      const hs = args.hits_settings as Record<string, any>;
      const hitsSettings: Record<string, any> = {};
      if (typeof hs.from_date === 'string') hitsSettings['from-date'] = hs.from_date;
      if (typeof hs.to_date === 'string') hitsSettings['to-date'] = hs.to_date;
      if (typeof hs.target === 'string') hitsSettings.target = hs.target;
      if (Object.keys(hitsSettings).length > 0) params['hits-settings'] = hitsSettings;
    }
    params['details-level'] = details_level;
    if (use_object_dictionary !== undefined) params['use-object-dictionary'] = use_object_dictionary;
    if (dereference_group_members !== undefined) params['dereference-group-members'] = dereference_group_members;
    if (show_membership !== undefined) params['show-membership'] = show_membership;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-https-rulebase', params, domain);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

server.tool(
  'show_https_section',
  'Retrieve an existing HTTPS Inspection section using either the section name or UID and the layer name. It allows you to specify the level of detail for the fields in the response.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    layer: z.string(),
    details_level: z.string().optional().default('standard'),
    domain: PARAM_DOMAIN,
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;
    const layer = args.layer as string;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    if (!uid && !name) {
      throw new Error('Either uid or name must be provided');
    }
    
    const params: Record<string, any> = { layer };
    if (uid) {
      params.uid = uid;
    } else if (name) {
      params.name = name;
    }
    params['details-level'] = details_level;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-https-section', params, domain);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

server.tool(
  'show_https_layer',
  'Retrieve an existing HTTPS Inspection layer using the layer name or unique identifier. It allows you to specify the level of detail for the fields in the response, ranging from just the UID value to a fully detailed representation of the object.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    details_level: z.string().optional().default('standard'),
    domain: PARAM_DOMAIN,
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    if (!uid && !name) {
      throw new Error('Either uid or name must be provided');
    }
    
    const params: Record<string, any> = {};
    if (uid) {
      params.uid = uid;
    } else if (name) {
      params.name = name;
    }
    params['details-level'] = details_level;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-https-layer', params, domain);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

server.tool(
  'show_https_layers',
  'Retrieve all HTTPS Inspection layers. It allows you to filter the objects by a search expression, specify the maximum number of results, skip a certain number of initial results, and sort the results.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.object({ ASC: z.string().optional(), DESC: z.string().optional() })).optional(),
    details_level: z.string().optional().default('standard'),
    domains_to_process: PARAM_DOMAINS_TO_PROCESS,
    show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
    domain: PARAM_DOMAIN,
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : undefined;
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    params['details-level'] = details_level;
    if (domains_to_process) { params['domains-to-process'] = [domains_to_process]; params['ignore-warnings'] = true; }
    if (args.show_only_local_domain) params['show-only-local-domain'] = true;
    
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-https-layers', params, domain);
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Generic object tools




server.tool(
  'https-inspection__show_gateways_and_servers',
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
  'https-inspection__show_objects',
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
      type: z.string().optional(),
      show_only_local_domain: PARAM_SHOW_ONLY_LOCAL_DOMAIN,
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
  'https-inspection__show_object',
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
