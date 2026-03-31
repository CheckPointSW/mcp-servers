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
import {
  getCurrentDateStr,
  generateDates,
  checkSessionUser,
  checkSessionInTimeFrame,
} from './helpers.js';

const { server, pkg } = createMcpServer(import.meta.url, {
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
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
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
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
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
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
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
      domains_to_process: z.enum(['ALL_DOMAINS_ON_THIS_SERVER', 'CURRENT_DOMAIN']).optional(),
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
    const domains_to_process = typeof args.domains_to_process === 'string' ? args.domains_to_process : undefined;
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
    return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
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
      return { content: [{ type: 'text', text: formatWithPaginationHint(resp) }] };
  }
);

// Tool: check_user_changes
server.tool(
  'check_user_changes',
  'Use this tool if and only if the user asks which changes were made by a specific user in the environment. ' +
  'If the question contains time frame, convert the timeframe to the parameters from_date and to_date ' +
  `based on today date: ${getCurrentDateStr()}.`,
  {
    from_date: z.string().optional().describe(
      `The date from when to check the changes. The format is YYYY-MM-DDTHH:MM:SSZ. ` +
      `Fill this parameter only if a time frame exists in the question. ` +
      `Make sure to fill this parameter based on the current date ${getCurrentDateStr()}.`
    ),
    to_date: z.string().optional().describe(
      `The date until when to check the changes. The format is YYYY-MM-DDTHH:MM:SSZ. ` +
      `Fill this parameter only if a time frame exists in the question. ` +
      `Make sure to fill this parameter based on the current date ${getCurrentDateStr()}.`
    ),
    user: z.string().describe("The name of the user. Put '' if no specific user was mentioned"),
    domain: z.string().optional().describe('Domain name for Multi-Domain environments.'),
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const domain = typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
      const [fromDate, toDate] = await generateDates(args as Record<string, any>);
      const user = args.user as string;
      let offset = 0;
      const limit = 100;
      let total = 100;
      let lastSessionInTimeFrame = true;
      const totalSessionsResponse: any[] = [];
      const totalSessionsObjects: any[] = [];

      if (!fromDate || !toDate) {
        const response = [{ message: 'No time frame is defined. Should try with log tool' }];
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, response, next_tool: 'KQL' }, null, 2)
          }]
        };
      }

      if (!user) {
        const response = [{ message: 'No specific user is defined. Should try with log tool' }];
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, response, next_tool: 'KQL' }, null, 2)
          }]
        };
      }


      // Fetch all sessions
      while (total === limit && lastSessionInTimeFrame) {
        const sessionsParams = {
          'details-level': 'full',
          'view-published-sessions': true,
          offset,
          limit,
        };

        const sessionsResponse = await apiManager.callApi('POST', 'show-sessions', sessionsParams, domain);
        totalSessionsResponse.push(sessionsResponse);

        const sessionsObjects = sessionsResponse.objects || [];
        if (sessionsObjects.length > 0) {
          totalSessionsObjects.push(...sessionsObjects);

          const lastSession = sessionsObjects[sessionsObjects.length - 1];
          if (!fromDate || !checkSessionInTimeFrame(lastSession, fromDate, null)) {
            lastSessionInTimeFrame = false;
          }
        } else {
          lastSessionInTimeFrame = false;
        }

        total = sessionsObjects.length;
        offset += total;
      }

      // Filter sessions by user and timeframe
      const filteredSessions = totalSessionsObjects
        .filter(resp => checkSessionUser(resp, user) && checkSessionInTimeFrame(resp, fromDate, toDate))
        .map(resp => resp.uid);

      if (filteredSessions.length === 0) {
        const response = [
          {
            message: 'No changes for this timeframe were found by this tool, ' +
                    'before answering to the user, call log tool to check it'
          }
        ];
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, response, next_tool: 'KQL' }, null, 2)
          }]
        };
      }

      // Get changes for each session
      const changesResponses: any[] = [];
      for (const session of filteredSessions) {
        const changesParams = { 'to-session': session };
        const changesResp = await apiManager.callApi('POST', 'show-changes', changesParams, domain);
        changesResponses.push(changesResp);
      }

      const changesTasks = changesResponses
        .filter(resp => resp['task-id'])
        .map(resp => resp['task-id']);

      // Get task results using infra function
      const tasksResponses: any[] = [];
      for (const taskId of changesTasks) {
        const taskResult = await apiManager.getManagementTaskResult(taskId, domain, 4);
        tasksResponses.push(taskResult);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ response: tasksResponses, success: true }, null, 2)
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `Error checking user changes: ${errorMessage}`
        }]
      };
    }
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
