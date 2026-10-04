#!/usr/bin/env node

import {
    launchMCPServer,
    createServerModule,
    createMcpServer,
    SessionContext,
} from '@chkp/mcp-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Settings } from './config.js';
import { ArgosERMAPIManager } from './client.js';
import { configureInitialCustomerId } from './session.js';
import { registerAlertTools } from './tools/alerts.js';
import { registerAssetTools } from './tools/assets.js';
import { registerAnalyticsTools } from './tools/analytics.js';
import { registerCustomerTools } from './tools/customers.js';
import { registerIocTools } from './tools/iocs.js';
import { registerCredentialTools } from './tools/credentials.js';
import { registerVulnerabilityTools } from './tools/vulnerabilities.js';
import { registerThreatIntelTools } from './tools/threat-intel.js';
import { registerTakedownTools } from './tools/takedowns.js';
import { registerPrompts } from './prompts/index.js';

const { server, pkg } = createMcpServer(import.meta.url, {
    description:
        'Check Point Argos ERM MCP Server for External Risk Management',
});

const serverModule = createServerModule(
    server,
    Settings,
    pkg,
    ArgosERMAPIManager
);

// A new session starts on the customer configured for it: ARGOS_CUSTOMER_ID or
// --argos-customer-id for the stdio session, the ARGOS-CUSTOMER-ID header for
// an HTTP session. Absent that, the session starts unselected and prompts.
configureInitialCustomerId((extra) => {
    const settings = SessionContext.getSettings(serverModule, extra) as
        | Settings
        | undefined;
    return settings?.argosCustomerId || undefined;
});

// Register all prompts
registerPrompts(server);

// Register all tools
registerCustomerTools(server, serverModule);
registerAlertTools(server, serverModule);
registerAssetTools(server, serverModule);
registerAnalyticsTools(server, serverModule);
registerIocTools(server, serverModule);
registerCredentialTools(server, serverModule);
registerVulnerabilityTools(server, serverModule);
registerThreatIntelTools(server, serverModule);
registerTakedownTools(server, serverModule);

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
