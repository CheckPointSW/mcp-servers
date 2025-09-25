#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { 
  launchMCPServer, 
  createServerModule, 
  createApiRunner
} from '@chkp/mcp-utils';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SMPAPIManager } from './api-manager.js';
import { Settings } from './settings.js';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

// Create a new MCP server instance
const server = new McpServer({
  name: 'spark-management',
  description: 'MCP Assistant server for Spark Management',
  version: '1.0.0'
});

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  Settings,
  pkg,
  SMPAPIManager
);

// Create an API runner function
const runApi = createApiRunner(serverModule);

server.tool(
  "show_gateway",
  "Show an existing gateway object from Spark Management",
  {
    gatewayName: z.string().describe("Name of the gateway to show"),
  },
  async ({ gatewayName }, extra) => {
    try {
        const data = {
            gateway: {
                name: gatewayName
            }
        }
      const result = await runApi("POST", 'show-gateway', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway details: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error showing gateway: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "show_gateway_fields",
  "Show gateway fields for a specific gateway object from Spark Management",
  {
    gateway: z.object({
      name: z.string().describe("Name of the gateway"),
      fields: z.array(z.string()).describe("Array of required fields, each field consists of a path, delimited by '.', to an existing topic at the gateway")
    }).describe("Gateway object to show fields for"),
  },
  async ({ gateway }, extra) => {
    try {
      const data = {
        gateway: gateway
      };
      const result = await runApi("POST", 'show-gateway-fields', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway fields: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error showing gateway fields: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "show_gateway_attributes",
  "Show gateway attributes for a specific gateway object from Spark Management",
  {
    gateway: z.object({
      name: z.string().describe("Name of the gateway")
    }).describe("Gateway object to show attributes for"),
  },
  async ({ gateway }, extra) => {
    try {
      const data = {
        gateway: gateway
      };
      const result = await runApi("POST", 'show-gateway-attributes', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway attributes: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error showing gateway attributes: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "gateway_get_administrator",
  "Get administrator details for a specific gateway from Spark Management",
  {
    gatewayName: z.string().describe("Name of the gateway"),
    adminName: z.string().describe("Name of the administrator to retrieve"),
  },
  async ({ gatewayName, adminName }, extra) => {
    try {
      const result = await runApi("GET", `portal/gateways/${gatewayName}/device-settings/administrators/${adminName}`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway administrator: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting gateway administrator: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "gateway_get_administrators",
  "Get all administrators for a specific gateway from Spark Management",
  {
    gatewayName: z.string().describe("Name of the gateway"),
  },
  async ({ gatewayName }, extra) => {
    try {
      const result = await runApi("GET", `portal/gateways/${gatewayName}/device-settings/administrators`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway administrators: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting gateway administrators: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "gateway_get_user",
  "Get user details for a specific gateway from Spark Management",
  {
    gatewayName: z.string().describe("Name of the gateway"),
    username: z.string().describe("Name of the user to retrieve"),
  },
  async ({ gatewayName, username }, extra) => {
    try {
      const result = await runApi("GET", `portal/gateways/${gatewayName}/device-settings/users/${username}`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway user: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting gateway user: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "gateway_get_users",
  "Get all users for a specific gateway from Spark Management",
  {
    gatewayName: z.string().describe("Name of the gateway"),
  },
  async ({ gatewayName }, extra) => {
    try {
      const result = await runApi("GET", `portal/gateways/${gatewayName}/device-settings/users`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway users: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting gateway users: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "get_gateway_geolocation",
  "Get geolocation information for a specific gateway from Spark Management",
  {
    gateway: z.object({
      name: z.string().describe("Name of the gateway")
    }).describe("Gateway object to get geolocation for"),
  },
  async ({ gateway }, extra) => {
    try {
      const data = {
        gateway: gateway
      };
      const result = await runApi("POST", 'get-gateway-geolocation', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway geolocation: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting gateway geolocation: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "get_gateway_list",
  "Get a list of gateways from Spark Management",
  {
    startIndex: z.number().optional().describe("Page offset from which the fetch starts"),
    maxItems: z.number().optional().describe("Page size"),
    filter: z.object({
      freeTextSearch: z.object({
        value: z.string().describe("Filter by free text. Will return gateways with names matching this filter (as substring)")
      }).optional(),
      connected: z.object({
        value: z.boolean().describe("Connected to the Spark Management filter")
      }).optional(),
      disconnected: z.object({
        value: z.boolean().describe("Disconnected from the Spark Management filter")
      }).optional(),
      disabled: z.object({
        value: z.boolean().describe("Disabled gateway filter")
      }).optional(),
      macAddressList: z.object({
        value: z.array(z.string()).describe("List of mac addresses")
      }).optional(),
      vendor: z.object({
        value: z.enum(["Small Office Appliance", "Small Office HA", "Small Office HA Member"]).describe("Vendor filter")
      }).optional(),
      gatewayType: z.object({
        value: z.array(z.enum([
          "600 Appliance", "1200R Appliance", "730 Appliance", "750 Appliance", "790 Appliance",
          "1430 Appliance", "1450 Appliance", "1470 Appliance", "1490 Appliance", "1500 Appliance",
          "1530 Appliance", "1550 Appliance", "1570 Appliance", "1590 Appliance", "1570R Appliance",
          "1600 Appliance", "1800 Appliance"
        ])).describe("Gateway types filter")
      }).optional(),
      plan: z.object({
        value: z.string().describe("Plan name")
      }).optional(),
      reportedFirmware: z.object({
        value: z.array(z.string()).describe("Firmware filter")
      }).optional(),
      lastConnection: z.object({
        value: z.object({
          from: z.number().describe("Start time"),
          to: z.number().describe("End time")
        }).describe("Time filter value")
      }).optional(),
      creationDate: z.object({
        value: z.object({
          from: z.number().describe("Start time"),
          to: z.number().describe("End time")
        }).describe("Time filter value")
      }).optional(),
      modificationDate: z.object({
        value: z.object({
          from: z.number().describe("Start time"),
          to: z.number().describe("End time")
        }).describe("Time filter value")
      }).optional()
    }).optional().describe("Search filter")
  },
  async ({ startIndex, maxItems, filter }, extra) => {
    try {
      const data: any = {};
      
      if (startIndex !== undefined) data.startIndex = startIndex;
      if (maxItems !== undefined) data.maxItems = maxItems;
      if (filter !== undefined) data.filter = filter;
      
      const result = await runApi("POST", 'get-gateway-list', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Gateway list: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting gateway list: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "show_plan",
  "Show an existing plan object from Spark Management",
  {
    plan: z.object({
      name: z.string().describe("Name of the plan")
    }).describe("Plan object to show"),
  },
  async ({ plan }, extra) => {
    try {
      const data = {
        plan: plan
      };
      const result = await runApi("POST", 'show-plan', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Plan details: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error showing plan: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "get_plan_list",
  "Get a list of plans from Spark Management",
  {
    startIndex: z.number().optional().describe("Page offset from which the fetch starts"),
    maxItems: z.number().optional().describe("Page size"),
    filter: z.object({
      freeTextSearch: z.object({
        value: z.string().describe("Filter by free text. Will return plans with names matching this filter (as substring)")
      }).optional()
    }).optional().describe("Search filter")
  },
  async ({ startIndex, maxItems, filter }, extra) => {
    try {
      const data: any = {};
      
      if (startIndex !== undefined) data.startIndex = startIndex;
      if (maxItems !== undefined) data.maxItems = maxItems;
      if (filter !== undefined) data.filter = filter;
      
      const result = await runApi("POST", 'get-plan-list', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Plan list: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting plan list: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "show_plan_fields",
  "Show plan fields for a specific plan object from Spark Management",
  {
    plan: z.object({
      name: z.string().describe("Name of the plan"),
      fields: z.array(z.string()).describe("Array of required fields, each field consists of a path, delimited by '.', to an existing topic at the plan")
    }).describe("Plan object to show fields for"),
  },
  async ({ plan }, extra) => {
    try {
      const data = {
        plan: plan
      };
      const result = await runApi("POST", 'show-plan-fields', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Plan fields: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error showing plan fields: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "plan_get_administrator",
  "Get administrator details for a specific plan from Spark Management",
  {
    planName: z.string().describe("Name of the plan"),
    adminName: z.string().describe("Name of the administrator to retrieve"),
  },
  async ({ planName, adminName }, extra) => {
    try {
      const result = await runApi("GET", `portal/plans/${planName}/device-settings/administrators/${adminName}`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Plan administrator: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting plan administrator: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "plan_get_administrators",
  "Get all administrators for a specific plan from Spark Management",
  {
    planName: z.string().describe("Name of the plan"),
  },
  async ({ planName }, extra) => {
    try {
      const result = await runApi("GET", `portal/plans/${planName}/device-settings/administrators`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Plan administrators: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting plan administrators: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "plan_get_user",
  "Get user details for a specific plan from Spark Management",
  {
    planName: z.string().describe("Name of the plan"),
    username: z.string().describe("Name of the user to retrieve"),
  },
  async ({ planName, username }, extra) => {
    try {
      const result = await runApi("GET", `portal/plans/${planName}/device-settings/users/${username}`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Plan user: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting plan user: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "plan_get_users",
  "Get all users for a specific plan from Spark Management",
  {
    planName: z.string().describe("Name of the plan"),
  },
  async ({ planName }, extra) => {
    try {
      const result = await runApi("GET", `portal/plans/${planName}/device-settings/users`, {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Plan users: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting plan users: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "show_user",
  "Show an existing user object from Spark Management",
  {
    user: z.object({
      uid: z.string().describe("The unique ID of the user")
    }).describe("User object to read"),
  },
  async ({ user }, extra) => {
    try {
      const data = {
        user: user
      };
      const result = await runApi("POST", 'show-user', data, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `User details: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error showing user: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

server.tool(
  "get_settings",
  "Get portal settings from Spark Management",
  {},
  async (args, extra) => {
    try {
      const result = await runApi("GET", 'portal/settings', {}, extra);
      
      return {
        content: [
          {
            type: "text",
            text: `Portal settings: ${JSON.stringify(result, null, 2)}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting portal settings: ${(error as Error).message}`
          },
        ],
      };
    }
  }
);

export { server };

// Settings implementation - updated for multi-user support

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
