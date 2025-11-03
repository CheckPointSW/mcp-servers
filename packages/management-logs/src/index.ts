#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Settings, APIManagerForAPIKey } from '@chkp/quantum-infra';
import { 
  launchMCPServer, 
  createServerModule,
  createApiRunner,
  SessionContext
} from '@chkp/mcp-utils';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

const server = new McpServer({
  name: 'management-logs',
  version: '1.0.0',
  description: 'MCP server to interact with Management Logs objects on Check Point Products.'
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

server.tool(
  'management-logs__init',
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


// Run logs query tool - for creating new queries
server.tool(
  'run_logs_query',
  'Run a new logs query with specified filters and parameters. Returns the first page of results and a query ID for pagination. Use this to start a new logs search.',
  {
    filter: z.string().optional().describe('The filter as entered in SmartConsole/SmartView for querying specific logs. Use function build_logs_query_filter before using this field.'),
    'time-frame': z.enum(['last-7-days', 'last-hour', 'today', 'last-24-hours', 'yesterday', 'this-week', 'this-month', 'last-30-days', 'all-time', 'custom']).describe('Specify the time frame to query logs. Use "custom" with custom-start and custom-end for specific date ranges.'),
    'custom-start': z.string().optional().describe('Start date in ISO8601 format (e.g., 2023-01-01T00:00:00Z). Only applicable when time-frame is "custom".'),
    'custom-end': z.string().optional().describe('End date in ISO8601 format (e.g., 2023-01-31T23:59:59Z). Only applicable when time-frame is "custom".'),
    'max-logs-per-request': z.number().min(1).max(100).optional().describe('Limit the number of logs to be retrieved per request (1-100, default: 100).'),
    top: z.object({
      count: z.number().min(1).max(50).describe('The number of top results to retrieve (1-50, default: 10).'),
      field: z.enum(['sources', 'destinations', 'services', 'actions', 'blades', 'origins', 'users', 'applications']).describe('The field on which the top command is executed to aggregate results.')
    }).optional().describe('Top results configuration for aggregating logs by a specific field.'),
    type: z.enum(['logs', 'audit']).optional().describe('Type of logs to return: "logs" for regular logs or "audit" for audit logs (default: logs).'),
    'log-servers': z.array(z.string()).optional().describe('List of IP addresses of log servers to query (default: all servers).'),
    'ignore-warnings': z.boolean().optional().describe('Whether to ignore warnings during query execution.'),
    domain: z.string().optional().describe('Domain name for Multi-Domain environments.'),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const ignoreWarnings = typeof args['ignore-warnings'] === 'boolean' ? args['ignore-warnings'] : undefined;
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

    const params: Record<string, any> = {};
    
    if (ignoreWarnings !== undefined) {
      params['ignore-warnings'] = ignoreWarnings;
    }

    // Build new-query object from the exposed parameters
    const newQueryParams: Record<string, any> = {};
    
    if (args.filter) newQueryParams.filter = args.filter;
    
    // Set time-frame, automatically override to 'custom' if custom dates are provided
    let timeFrame = args['time-frame'] as string;
    if (args['custom-start'] || args['custom-end']) {
      timeFrame = 'custom';
    }
    newQueryParams['time-frame'] = timeFrame;
    
    if (args['custom-start']) newQueryParams['custom-start'] = args['custom-start'];
    if (args['custom-end']) newQueryParams['custom-end'] = args['custom-end'];
    if (args['max-logs-per-request']) newQueryParams['max-logs-per-request'] = args['max-logs-per-request'];
    if (args.top) newQueryParams.top = args.top;
    if (args.type) newQueryParams.type = args.type;
    if (args['log-servers']) newQueryParams['log-servers'] = args['log-servers'];

    params['new-query'] = newQueryParams;

    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-logs', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Get next query page tool - for pagination using existing query ID
server.tool(
  'get_next_query_page',
  'Get the next page of results for an existing logs query using the query ID. Use this to paginate through results from a previous run_logs_query call.',
  {
    'query-id': z.string(),
    'ignore-warnings': z.boolean().optional(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const queryId = args['query-id'] as string;
    const ignoreWarnings = typeof args['ignore-warnings'] === 'boolean' ? args['ignore-warnings'] : undefined;
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;

    const params: Record<string, any> = {
      'query-id': queryId
    };
    
    if (ignoreWarnings !== undefined) {
      params['ignore-warnings'] = ignoreWarnings;
    }

    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-logs', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Build logs query filter - for constructing filter strings
server.tool(
  'build_logs_query_filter',
  'Build a query filter string using the Check Point query language. Supports field keywords, Boolean operators (AND, OR, NOT), wildcards, grouping with parentheses, and multiple values per field. Returns a filter string to use in run_logs_query. Examples: "blade:Firewall AND action:block", "source:(192.168.1.1 OR 192.168.1.2)", "(blade:IPS OR blade:VPN) AND NOT action:drop"',
  {
    conditions: z.array(z.object({
      field: z.enum([
        'severity', 'app_risk', 'protection', 'protection_type', 'confidence_level',
        'action', 'blade', 'product', 'destination', 'dst', 'origin', 'orig',
        'service', 'source', 'src', 'user', 'rule'
      ]).optional().describe('Field name to filter on. If omitted, searches across all fields for free text.'),
      value: z.union([
        z.string(),
        z.array(z.string())
      ]).describe('Value(s) to search for. Single string for one value, or array of strings for multiple values with OR between them. Use quotes for phrases with spaces. Supports wildcards: * (matches string) and ? (matches one character).'),
      operator: z.enum(['AND', 'OR', 'NOT']).optional().describe('Boolean operator to combine with the next condition. If omitted, AND is implied. Use NOT to exclude conditions.'),
      group: z.boolean().optional().describe('If true, wraps this condition in parentheses for grouping. Useful for complex queries with multiple OR conditions.')
    })).describe('Array of filter conditions. Each condition can specify a field, value(s), operator, and grouping.')
  },
  async (args: Record<string, unknown>, extra: any) => {
    const conditions = args.conditions as Array<{
      field?: string;
      value: string | string[];
      operator?: string;
      group?: boolean;
    }>;

    if (!conditions || conditions.length === 0) {
      return { 
        content: [{ 
          type: 'text', 
          text: 'Error: At least one condition is required to build a query filter.' 
        }] 
      };
    }

    // Helper function to format a value
    const formatValue = (val: string): string => {
      // Quote if contains spaces and not already quoted or contains parentheses
      if (val.includes(' ') && !val.startsWith('"') && !val.endsWith('"') && !val.includes('(')) {
        return `"${val}"`;
      }
      return val;
    };

    // Build the query string
    const queryParts: string[] = [];
    
    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      let part = '';
      
      // Handle array of values (OR within field)
      if (Array.isArray(condition.value)) {
        const values = condition.value.map(formatValue).join(' OR ');
        if (condition.field) {
          part = `${condition.field}:(${values})`;
        } else {
          part = `(${values})`;
        }
      } else {
        // Single value
        const value = formatValue(condition.value);
        if (condition.field) {
          part = `${condition.field}:${value}`;
        } else {
          part = value;
        }
      }
      
      // Apply grouping if requested
      if (condition.group && !part.startsWith('(')) {
        part = `(${part})`;
      }
      
      queryParts.push(part);
      
      // Add operator if not the last condition
      if (i < conditions.length - 1) {
        const operator = condition.operator || 'AND';
        queryParts.push(operator);
      }
    }
    
    const filterString = queryParts.join(' ');
    
    return { 
      content: [{ 
        type: 'text', 
        text: `Filter query: ${filterString}\n\nYou can now use this filter string with the run_logs_query tool by passing it as the 'filter' parameter.\n\nExamples of what this tool can build:\n- Field with single value: blade:Firewall AND action:block\n- Multiple IPs (free text): 192.168.2.133 10.19.136.101\n- Multiple values in field: source:(192.168.2.1 OR 192.168.2.2)\n- Grouped conditions: (blade:Firewall OR blade:IPS) AND NOT action:drop` 
      }] 
    };
  }
);

// Generic object tools
server.tool(
  'management-logs__show_gateways_and_servers',
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
  'management-logs__show_objects',
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
      domain: z.string().optional(),
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
    const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
    const params: Record<string, any> = { limit, offset };
    if ( uids ) params.uids = uids;
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    if (type) params.type = type;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi('POST', 'show-objects', params, domain);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_object
server.tool(
  'management-logs__show_object',
  'Retrieve a generic object by UID.',
  {
    uid: z.string(),
    domain: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
      const uid = args.uid as string;
      const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
      const params: Record<string, any> = {}
      params.uid = uid
      params.details_level = 'full'
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const resp = await apiManager.callApi('POST', 'show-object', params, domain);
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
