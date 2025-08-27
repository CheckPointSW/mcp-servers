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

import * as Scripts from './scripts/index.js';

// Import all script classes
import { runScript } from '@chkp/quantum-gw-cli-base';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;


// Create a new MCP server instance
const server = new McpServer({
  name: 'gw-cli',
  description: 'MCP server to run CLI commands on a Check Point gateway',
  version: '0.0.1'
});

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  Settings,
  pkg,
  APIManagerForAPIKey
);

// Create an API runner function
const runApiScript = createApiRunner(serverModule);


// Register all tools

// Hardware Information Tools
server.tool(
  'dmidecode',
  `Run 'dmidecode' command on the target gateway to display hardware information.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.DmidecodeScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'show_asset_all',
  'Show all asset information on the target gateway.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.ShowAssetAllScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'cpinfo_all',
  'Run cpinfo -y all command to display comprehensive system information.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.CPInfoAllScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Routing Information Tools
server.tool(
  'show_route',
  `Run 'show route' command on the target gateway to display routing information.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.ShowRouteScript,
      target_gateway,
      {  },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'netstat_route',
  `Run 'netstat -rn' command on the target gateway to display the routing table.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.NetstatRouteScript,
      target_gateway,
      {  },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'ip_route_show',
  `Run 'ip route show' command on the target gateway to display IP routing information.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.IPRouteShowScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// HA/Cluster Status Tools
server.tool(
  'cphaprob_stat',
  'Run cphaprob stat command to display cluster status information.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.CPHAProbStatScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'cphaprob_if',
  'Run cphaprob -a if command to display interface status for cluster.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.CPHAProbIfScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'cphaprob_syncstat',
  'Run cphaprob syncstat command to display synchronization status.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.CPHAProbSyncStatScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// License Information Tools
server.tool(
  'cplic_print',
  `Run 'cplic print' command on the target gateway to display license details.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.CPLicPrintScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Network Configuration Tools
server.tool(
  'show_interface',
  `Run 'show interface' command on the target gateway to display interface configuration. Can also be used to a VLAN interface details.

  Mandatory Parameter (name):
    interface_name : The name of the interface or vlan to query (e.g., eth0, bond1, eth1.100)`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
    interface_name: z.string().optional().describe('Optional parameter for the show vlan command')
  },
  async ({ target_gateway, interface_name }, extra) => {
    const result = await runScript(server, 
      Scripts.ShowInterfaceScript,
      target_gateway,
      { interface_name },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'show_interfaces',
  `Run 'show interfaces all' command on the target gateway to display detailed interfaces configuration.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.ShowInterfacesAllScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// FW Accel Tools
server.tool(
  'fw_accel_stats',
  `Run 'fwaccel stats' command on the target gateway with an optional parameter.
  
  The fwaccel stats command shows acceleration statistics for IPv4 on the local Security Gateway or Cluster Member.
  
  Optional parameter (ipv6):
    true : Show IPv6 statistics (default is IPv4).

  Optional parameter (param):
    -c : Shows the statistics for Cluster Correction.
    -d : Shows the statistics for drops from device.
    -l : Shows the statistics in legacy mode - as one table.
    -m : Shows the statistics for multicast traffic.
    -n : Shows the statistics for Identity Awareness (NAC).
    -o : Shows the statistics for Reorder Infrastructure.
    -p : Shows the statistics for SecureXL violations (F2F packets).
    -q : Shows the statistics notifications the SecureXL sent to the Firewall.
    -s : Shows the statistics summary only.
    -x : Shows the statistics for PXL (combination of SecureXL and PSL).`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
    ipv6: z.boolean().optional().describe('Optional parameter to show IPv6 statistics'),
    param: z.string().optional().describe('Optional parameter for the fwaccel stats command')
  },
  async ({ target_gateway, ipv6, param }, extra) => {
    const result = await runScript(server, 
      Scripts.FWAccelStatsScript,
      target_gateway,
      { ipv6, param },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_accel_conns',
  `Run 'fwaccel conns' command on the target gateway with an optional parameter string.

  The fwaccel conns command shows the list of SecureXL connections on the local Security Gateway or Cluster Member.

  Optional parameter (ipv6):
    true : Show IPv6 connections (default is IPv4).

  Optional parameter (param):
    -h : Shows the applicable built-in help. Run this if you need to see the available filter flags.
    -i <SecureXL ID> : Specifies the SecureXL instance ID (for IPv4 only).
    -f <Filter> : Show the SecureXL Connections Table entries based on the specified filter flags.
    -m <Number of Entries> : Specifies the maximal number of connections to show.
    -s : Shows the summary of SecureXL Connections Table (number of connections).
  You can combine parameters as a single string, e.g. '-s -m 10'.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
    ipv6: z.boolean().optional().describe('Optional parameter to show IPv6 connections'),
    param: z.string().optional().describe('Optional parameter for the fwaccel conns command'),
  },
  async ({ target_gateway, ipv6, param }, extra) => {
    const result = await runScript(server, 
      Scripts.FWAccelConnsScript,
      target_gateway,
      { ipv6, param },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_accel_stat',
  `Run 'fwaccel stat' command on the target gateway.
  The fwaccel stat commands show this information on the Security Gateway Closed, or Cluster Member Closed:`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.FWAccelStatScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// FW Ctl Tools
server.tool(
  'fw_ctl_arp',
  `Shows the configured Proxy ARP entries based on the $FWDIR/conf/local.arp file on the Security Gateway.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlArpScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_ctl_chain',
  `Shows the list of Firewall Chain Modules.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlChainScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_ctl_conn',
  `Shows the list of Firewall Connection Modules.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlConnScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_ctl_cpasstat',
  `Generates statistics report about Check Point Active Streaming (CPAS).`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlCPASStatScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_ctl_dlpkstat',
  `Generates statistics report about Data Loss Prevention kernel module.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlDLPKStatScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_ctl_iflist',
  `Shows the list of interfaces to which the Check Point Firewall kernel attached.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlIfListScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_ctl_pstat',
  `Shows Security Gateway various internal statistics.

  Optional parameters:
    -c : Detailed CoreXL Dispatcher statistics
    -h : Additional Hash kernel memory statistics
    -k : Additional Kernel memory statistics
    -l : Handles statistics
    -m : General CoreXL Dispatcher statistics
    -o : Additional Cookies statistics
    -s : Additional System kernel memory statistics
    -v 4 / -v 6 : Show statistics for IPv4/IPv6 only`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
    param: z.string().optional().describe('Optional parameter for the fw ctl pstat command')
  },
  async ({ target_gateway, param }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlPStatScript,
      target_gateway,
      { param },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'fw_ctl_tcpstrstat',
  `Generates statistics report about TCP Streaming.

  Optional parameters:
    -p : Verbose statistics`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on'),
    param: z.string().optional().describe('Optional parameter for the fw ctl tcpstrstat command')
  },
  async ({ target_gateway, param }, extra) => {
    const result = await runScript(server, 
      Scripts.FWCtlTCPStrStatScript,
      target_gateway,
      { param },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Additional Tools
server.tool(
  'dynamic_balancing',
  'Shows the current state of the CoreXL Dynamic Balancing (enabled, disabled, started, or stopped).',
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.DynamicBalancingScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'hcp_protect_info',
  'Run Heath Tool to check Protections Impact.',
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.HCPProtectInfoScript,
      target_gateway,
      {},
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

server.tool(
  'disk_usage',
  `Run 'df -h' command on the target gateway to display disk usage information in human-readable format.`,
  {
    target_gateway: z.string().describe('The target gateway to run the command on')
  },
  async ({ target_gateway }, extra) => {
    const result = await runScript(server, 
      Scripts.DiskUsageScript,
      target_gateway,
      { },
      serverModule,
      extra
    );
    
    return {
      content: [{ type: 'text', text: result }]
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
