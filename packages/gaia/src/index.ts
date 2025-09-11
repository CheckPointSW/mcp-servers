#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { 
  launchMCPServer, 
  createServerModule, 
  SessionContext
} from '@chkp/mcp-utils';
import { sanitizeData } from '@chkp/quantum-infra';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Settings } from './settings.js';
import { GaiaAPIManager } from './api-manager.js';
import { getGaiaConnection, clearGaiaCredentials, clearDefaultGateway } from './gaia-auth.js';

/**
 * Helper to get authenticated API manager with dialog prompts (NEW STYLE)
 */
async function getApiManagerWithDialog(
  gatewayIp?: string, 
  port?: number, 
  extra?: any
): Promise<any> {
  const connection = await getGaiaConnection(gatewayIp, port, extra);
  
  // Create a simple API manager for dialog-based authentication
  return {
    async callApi(method: string, uri: string, data: Record<string, any> = {}): Promise<any> {
      // Create a one-time client for this request
      const { GaiaApiClient } = await import('./gaia-api-client.js');
      const client = new GaiaApiClient(connection);
      
      await client.login();
      return await client.callApi(method, uri, data);
    }
  };
}

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

const server = new McpServer(
  {
    name: 'quantum-gaia',
    version: '1.0.0',
    description: `Check Point GAIA MCP Server - Provides networking, network management and interface configuration tools for GAIA OS.

**Gateway Connection (all tools):**
- **gateway_ip**: Gateway IP address to connect to. If not provided, an interactive dialog will prompt for the IP address.
- **port**: Gateway port (default: 443)
- Credentials are cached per gateway for the session with independent authentication per gateway
- Interactive authentication prompts appear when credentials are needed

**Cluster & Virtual Systems (most tools):**
- **member_id**: Cluster member ID for targeting specific cluster members in clustered environments
- **virtual_system_id**: Virtual System ID for virtual system (VSNext) environments`,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  Settings,
  pkg,
  GaiaAPIManager
);

/**
 * Helper to get authenticated API manager with dialog prompts
 */
async function getApiManager(
  gatewayIp?: string, 
  port?: number, 
  extra?: any
): Promise<GaiaAPIManager> {
  const connection = await getGaiaConnection(gatewayIp, port, extra);
  return new GaiaAPIManager(connection);
}

// Updated API call function with dialog authentication
async function callGaiaApi(
  method: string = "GET", 
  uri: string = "", 
  kwargs: Record<string, any> = {},
  gatewayIp?: string,
  port?: number,
  extra?: any
): Promise<any> {
  const apiManager = await getApiManager(gatewayIp, port, extra);
  const data: Record<string, any> = sanitizeData(kwargs);
  return await apiManager.callApi(method, uri, data);
}


// --- TOOLS ---
// show-dns
server.tool(
  'show_dns',
  'Show DNS configuration including DNS servers, domain settings, and resolution status. Returns current DNS configuration and operational state. Supports virtual system environments.',
  {
    virtual_system_id: z.number().int().optional(),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-dns', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show_proxy
server.tool(
  'show_proxy',
  'Show HTTP proxy configuration. Returns proxy server settings including host, port, and connection parameters.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-proxy', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show_dhcp
server.tool(
  'show_dhcp',
  'Show DHCP (IPv4) server configuration. Returns DHCP service settings including subnets, DNS servers, and client configurations.',
  {
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
     
      const resp = await apiManager.callApi('POST', 'show-dhcp-server', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show_dhcp6
server.tool(
  'show_dhcp6',
  'Show complete DHCPv6 information including both server status and configuration details. Combines show-dhcp6-server and show-dhcp6-config in a single call.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
 
      // Call both DHCPv6 APIs in parallel for efficiency
      const [serverResponse, configResponse] = await Promise.all([
        apiManager.callApi('POST', 'show-dhcp6-server', params),
        apiManager.callApi('POST', 'show-dhcp6-config', params)
      ]);
      
      // Combine both responses into a single structured result
      const combinedResult = {
        dhcp6_server: serverResponse,
        dhcp6_config: configResponse
      };
      
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify(combinedResult, null, 2) 
        }] 
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error: ${(error as Error).message}` 
        }]
      };
    }
  }
);
// show_arp
server.tool(
  'show_arp',
  'Show ARP (Address Resolution Protocol) settings and table entries. Returns ARP configuration and learned MAC address mappings.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-arp', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// Show date and time information
server.tool(
  'show_date_time',
  'Show complete date and time information including NTP configuration, current time/date settings, and available timezones. Combines show-ntp, show-time-and-date, and show-timezones in a single comprehensive call.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      // Call all date/time related APIs in parallel for efficiency
      const [ntpResponse, timeResponse, timezonesResponse] = await Promise.all([
        apiManager.callApi('POST', 'show-ntp', params),
        apiManager.callApi('POST', 'show-time-and-date', params),
        apiManager.callApi('POST', 'show-timezones', params)
      ]);
      
      // Combine all responses into a comprehensive result
      const combinedResult = {
        ntp_configuration: ntpResponse,
        current_time_date: timeResponse,
        available_timezones: timezonesResponse
      };
      
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify(combinedResult, null, 2) 
        }] 
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error: ${(error as Error).message}` 
        }]
      };
    }
  }
);
// show static mroutes
server.tool(
  'show_static_mroutes',
  'Show configuration of all static multicast routes with optional filtering and pagination. Returns static multicast route entries including destinations, interfaces, and routing priorities for multicast traffic forwarding.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-static-mroutes', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show ipv4 pim summary
server.tool(
  'show_pim_summary',
  'Show IPv4 PIM (Protocol Independent Multicast) summary status information. Provides overview of IPv4 multicast routing configuration and operational state.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-pim-summary', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show ipv6 pim summary
server.tool(
  'show_ipv6_pim_summary',
  'Show IPv6 PIM (Protocol Independent Multicast) summary status information. Provides overview of IPv6 multicast routing configuration and operational state.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-ipv6-pim-summary', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show igmp interfaces
server.tool(
  'show_igmp_interfaces',
  'Show IGMP (Internet Group Management Protocol) state information for all interfaces with optional pagination. Returns IGMP configuration and status for multicast group management.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-igmp-interfaces', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show igmp groups
server.tool(
  'show_igmp_groups',
  'Show IGMP groups using group type or interface name as filters with optional pagination. Returns IGMP multicast group information and membership details.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    type: z.enum(['static', 'local', 'all']).optional().default('all'),
    interface: z.string().optional().default('all'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        type: args.type
      };
      
      if (typeof args.interface === 'string' && args.interface.trim() !== '') {
        params.interface = args.interface.trim();
      }
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-igmp-groups', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show static routes
server.tool(
  'show_static_routes',
  'Show configuration of all static routes with optional filtering and pagination. Returns static route entries including destinations, gateways, and routing priorities.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    virtual_system_id: z.number().int().optional(),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-static-routes', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show routes
server.tool(
  'show_routes',
  'Show active routes from the gateway routing table with optional filtering and pagination.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show routes aggregate
server.tool(
  'show_routes_aggregate',
  'Show active aggregate routes from the gateway routing table with optional filtering and pagination. Returns route aggregation information including summarized network prefixes.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes-aggregate', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show routes BGP
server.tool(
  'show_routes_bgp',
  'Show BGP routes in the routing table with optional filtering and pagination. Returns BGP learned routes with path attributes and routing information.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes-bgp', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show routes ospf
server.tool(
  'show_routes_ospf',
  'Show active OSPF routes from the gateway routing table with optional filtering and pagination. Returns OSPF learned routes with path information and routing details.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes-ospf', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show routes static
server.tool(
  'show_routes_static',
  'Show active static routes from the gateway routing table with optional filtering and pagination. Returns static route entries that are currently active in the routing table.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes-static', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show routes rip
server.tool(
  'show_routes_rip',
  'Show active RIP routes from the gateway routing table with optional filtering and pagination. Returns RIP learned routes with distance vector routing information.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes-rip', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-routes-kernel
server.tool(
  'show_routes_kernel',
  'Show active kernel routes from the gateway routing table with optional filtering and pagination. Returns kernel-level routing information and system-generated routes.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes-kernel', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-routes-direct
server.tool(
  'show_routes_direct',
  'Show active interface (direct) routes from the gateway routing table with optional filtering and pagination. Returns directly connected network routes and interface-based routing information.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    address_family: z.enum(['inet', 'inet6']).optional().default('inet'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        'address-family': args.address_family
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routes-direct', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-bgp-groups
server.tool(
  'show_bgp_groups',
  'Show BGP peer groups configuration. Returns information about BGP peer groups including AS numbers, enabled status, and group configurations.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bgp-groups', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);

// show-bgp-paths
server.tool(
  'show_bgp_paths',
  'Show BGP path information. Returns BGP path attributes and routing path details for BGP routes.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bgp-paths', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show bgp peers
server.tool(
  'show_bgp_peers',
  'Show BGP peers configuration and state information. Displays configuration and state information for all BGP peers. Only supported on GAIA versions R82+.',
  {
    filter: z.enum(['all', 'established']).optional().default('all'),
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        filter: args.filter,
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bgp-peers', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show bgp routes in
server.tool(
  'show_bgp_routes_in',
  'Show BGP routes received from peers (inbound routes). Displays routes and their path attributes received from BGP peer(s). Only supported on GAIA versions R82+.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    peer: z.string().optional().default('all'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        peer: args.peer || 'all'
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bgp-routes-in', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show bgp routes out
server.tool(
  'show_bgp_routes_out',
  'Show BGP routes sent to peers (outbound routes). Displays routes and their path attributes sent to BGP peer(s).',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    peer: z.string().optional().default('all'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        peer: args.peer || 'all'
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bgp-routes-out', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show bgp routemaps
server.tool(
  'show_bgp_routemaps',
  'Show BGP route maps configuration. Returns BGP route map policies and their configurations for route filtering and manipulation.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bgp-routemaps', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-bgp-summary
server.tool(
  'show_bgp_summary',
  'Show BGP summary information. Returns overall BGP status, peer summary, and general BGP operational information.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bgp-summary', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-configuration-bgp
server.tool(
  'show_configuration_bgp',
  'Show BGP configuration. Returns the complete BGP configuration including AS numbers, routing domains, peers, and BGP-specific settings.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-configuration-bgp', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-ospf-summary
server.tool(
  'show_ospf_summary',
  'Show OSPF summary information. Returns comprehensive OSPF operational status including areas, LSAs, timers, and router capabilities.',
  {
    protocol_instance: z.number().int().min(1).max(65535).optional().default(1),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      // Handle protocol-instance parameter
      if (typeof args.protocol_instance === 'number') {
        params['protocol-instance'] = args.protocol_instance;
      } else {
        params['protocol-instance'] = 'default';
      }
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-ospf-summary', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-pbr-rules
server.tool(
  'show_pbr_rules',
  'Show Policy Based Routing (PBR) rules configuration. Returns list of configured PBR rules with priority-based sorting.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-pbr-rules', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-pbr-tables
server.tool(
  'show_pbr_tables',
  'Show Policy Based Routing (PBR) tables configuration. Returns list of configured PBR table names with sorting options.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    virtual_system_id: z.number().int().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-pbr-tables', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// Combined IS-IS tool for hostnames, interfacesr neighbors
server.tool(
  'show_isis_info',
  'Show IS-IS information including hostnames, interfaces, or neighbors. Returns IS-IS operational data based on the specified information type.',
  {
    info_type: z.string().trim().transform(val => val.toLowerCase()).refine(val => ['hostnames', 'interfaces', 'neighbors'].includes(val), {
      message: "Info type must be 'hostnames', 'interfaces', or 'neighbors'"
    }),
    protocol_instance: z.number().int().min(1).max(65535).optional().default(1),
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      // Handle protocol-instance parameter
      if (typeof args.protocol_instance === 'number') {
        params['protocol-instance'] = args.protocol_instance;
      } else {
        params['protocol-instance'] = 'default';
      }
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Determine API endpoint based on info_type
      let apiEndpoint: string;
      switch (args.info_type) {
        case 'hostnames':
          apiEndpoint = 'show-isis-hostnames';
          break;
        case 'interfaces':
          apiEndpoint = 'show-isis-interfaces';
          break;
        case 'neighbors':
          apiEndpoint = 'show-isis-neighbors';
          break;
        default:
          throw new Error('Invalid info_type specified');
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', apiEndpoint, params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-inbound-route-filter-bgp-policy
server.tool(
  'show_inbound_route_filter_bgp_policy',
  'Show Inbound Route Filter configuration for BGP.',
  {
    policy_id: z.union([
      z.literal('all'),
      z.number().int().min(1).max(1024)
    ]).optional().default('all'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        'policy-id': args.policy_id || 'all'
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-inbound-route-filter-bgp-policy', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-inbound-route-filter-rip
server.tool(
  'show_inbound_route_filter_rip',
  'Show Inbound Route Filter configuration for RIP.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-inbound-route-filter-rip', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// Combined OSPF Inbound Route Filter (OSPF2 and OSPF3)
server.tool(
  'show_inbound_route_filter_ospf',
  'Show Inbound Route Filter configuration for OSPF (OSPFv2 or OSPFv3). Note: IPv6 state needs to be enabled to use OSPFv3.',
  {
    ospf_version: z.string().trim().transform(val => val.toLowerCase()).refine(val => ['ospf2', 'ospf3'].includes(val), {
      message: "OSPF version must be 'ospf2' or 'ospf3'"
    }),
    instance: z.union([
      z.literal('all'),
      z.literal('default'),
      z.number().int().min(1).max(65535)
    ]).optional().default('all'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        instance: args.instance || 'all'
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Determine API endpoint based on OSPF version
      let apiEndpoint: string;
      switch (args.ospf_version) {
        case 'ospf2':
          apiEndpoint = 'show-inbound-route-filter-ospf2';
          break;
        case 'ospf3':
          apiEndpoint = 'show-inbound-route-filter-ospf3';
          break;
        default:
          throw new Error('Invalid ospf_version specified');
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', apiEndpoint, params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-ipv6
server.tool(
  'show_ipv6',
  'Check IPv6 support in the machine\'s operating system. Returns IPv6 configuration status and reboot requirements.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-ipv6', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-router-id
server.tool(
  'show_router_id',
  'Show the configured router-id. Returns the current router ID configuration used by routing protocols like BGP and OSPF.',
  {
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-router-id', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-bootp-interfaces
server.tool(
  'show_bootp_interfaces',
  'Show current state of all running bootp interfaces.20+.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-bootp-interfaces', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-routemaps
server.tool(
  'show_routemaps',
  'Show the configuration of all configured Routemaps.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-routemaps', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
// show-nat-pools
server.tool(
  'show_nat_pools',
  'Shows the configuration of all configured NAT Pools.',
  {
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(65535).optional().default(0),
    order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-nat-pools', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);

// show-interfaces-by-type
server.tool(
  'show_interfaces_by_type',
  'Show network interfaces organized by their types. Returns comprehensive interface information categorized by interface types including: physical interfaces, loopback interfaces, bridge interfaces, bond interfaces, alias interfaces, VLAN interfaces, VXLAN interfaces, and GRE interfaces. Useful for network topology analysis and interface management.',
  {
    virtual_system_id: z.number().int().optional(),
    member_id: z.string().optional(),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      const params: Record<string, any> = {};
      
      if (typeof args.virtual_system_id === 'number') {
        params['virtual-system-id'] = args.virtual_system_id;
      }
      
      if (typeof args.member_id === 'string' && args.member_id.trim() !== '') {
        params['member-id'] = args.member_id.trim();
      }
      
      // Use dialog authentication
      const apiManager = await getApiManagerWithDialog(args.gateway_ip as string, args.port as number, extra);
      
      const resp = await apiManager.callApi('POST', 'show-interfaces-by-type', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }]
      };
    }
  }
);
//  MANAGEMENT TOOLS
server.tool(
  'manage_gaia_credentials',
  'Manage cached gateway credentials - clear specific gateway or default gateway cache',
  {
    action: z.enum(['clear_gateway', 'clear_default']),
    gateway_ip: z.string().optional(),
    port: z.number().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    try {
      console.error('Manage credentials called with args:', args);
      
      const action = args.action as string;
      
      if (!action) {
        throw new Error('Action is required. Must be one of: clear_gateway, clear_default');
      }
      
      if (action === 'clear_gateway') {
        if (!args.gateway_ip) {
          throw new Error('Gateway IP is required for clear_gateway action');
        }
        const gatewayPort = (args.port as number) || 443;
        clearGaiaCredentials(args.gateway_ip as string, gatewayPort, extra);
        return {
          content: [{
            type: "text",
            text: `Cleared cached credentials for gateway: ${args.gateway_ip}:${gatewayPort}`
          }]
        };
        
      } else if (action === 'clear_default') {
        clearDefaultGateway(extra);
        return {
          content: [{
            type: "text",
            text: "Cleared default gateway connection cache"
          }]
        };
        
      } else {
        return {
          content: [{
            type: "text",
            text: `Invalid action: ${action}. Must be one of: clear_gateway, clear_default`
          }]
        };
      }
    } catch (error) {
      console.error('Manage credentials error:', error);
      return {
        content: [{
          type: "text",
          text: `Error: ${(error as Error).message}`
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
