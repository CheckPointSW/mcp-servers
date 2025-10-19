#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    launchMCPServer,
    createServerModule,
    createApiRunner,
} from '@chkp/mcp-utils';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DocumentationToolAPIManager } from './documentation-api-manager.js';
import { DocumentationToolSettings } from './settings.js';

const pkg = JSON.parse(
    readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../package.json'),
        'utf-8'
    )
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

// Create a new MCP server instance
const server = new McpServer({
    name: 'checkpoint-documentation',
    description:
        'Comprehensive Check Point documentation assistant providing instant access to product information, technical specifications, configuration guidance, and feature documentation across the entire Check Point security portfolio.',
    version: '1.0.0',
});

// Create a multi-user server module
const serverModule = createServerModule(
    server,
    DocumentationToolSettings,
    pkg,
    DocumentationToolAPIManager
);

// Create an API runner function
const runApi = createApiRunner(serverModule);

server.tool(
    'ask-checkpoint-docs',
    'Ask Check Point documentation. Use this to get information about Check Point products and features.',
    {
        text: z.string().describe(
            `The question to ask Check Point, in clear text with clear concise context and instructions.
            The question should be about one of the Check Point products (e.g., Smart-1 Cloud, Harmony SASE, CloudGuard, Harmony Endpoint, etc.).
            Include relevant technical details, product names, feature names, and specific use cases for the most accurate and helpful response.`
        ),
        product: z
            .enum([
                's1c',
                'maas',
                'mobile',
                'endpoint',
                'edr',
                'xdr',
                'playblocks',
                'infinity-events',
                'cloudguard',
                'cloudguardnetwork',
                'cloudnetworksecurity',
                'rfp-copilot',
                'harmony-sase',
                'customer-support',
                'smp',
                'appsec',
                'sd-wan',
                'horizonmonitoring',
                'ndr',
            ])
            .optional()
            .describe(
                `Select the specific Check Point product to target for focused documentation queries. This parameter helps narrow down search results to the most relevant product-specific information. Defaults to 's1c' (Smart-1 Cloud) if not specified. Choose from:

                Cloud Management & Security:
                - s1c: Smart-1 Cloud - Cloud-based security management platform for centralized policy management (DEFAULT)
                - maas: Management as a Service - Cloud management platform for distributed deployments
                - cloudguard: CloudGuard - Comprehensive cloud security and compliance platform
                - cloudguardnetwork: CloudGuard Network - Cloud network security solutions
                - cloudnetworksecurity: CloudGuard Network Security - Advanced cloud network protection
                - appsec: CloudGuard WAF - Web Application Firewall and application security

                Endpoint & Device Security:
                - mobile: Harmony Mobile - Mobile device security and threat protection
                - endpoint: Harmony Endpoint - Endpoint protection and threat prevention
                - edr: Endpoint Detection and Response - Advanced endpoint threat detection and response
                - xdr: Extended Detection and Response - Cross-platform threat detection and response

                Network & Infrastructure:
                - harmony-sase: Harmony SASE - Secure Access Service Edge platform
                - sd-wan: Quantum SD-WAN - Software-defined wide area networking solutions
                - horizonmonitoring: Horizon Monitoring - AI-powered network operations and monitoring
                - ndr: Network Detection and Response - Advanced network threat detection

                Automation & Intelligence:
                - playblocks: Infinity Playblocks - Security automation and orchestration platform
                - infinity-events: Infinity Events - Centralized security event management platform
                - rfp-copilot: RFP Copilot - AI-powered request for proposal assistance

                Support & Management:
                - customer-support: Customer Support - Technical support and assistance services
                - smp: Security Management Platform - Unified security management

                Usage Guidelines:
                - Defaults to s1c (Smart-1 Cloud) for general management and security questions
                - Specify a different product when the user's question is clearly about that specific product
                - For troubleshooting or configuration questions, specify the exact product involved.`
            ),
    },
    async ({ text, product }, extra) => {
        try {
            const result = await runApi(
                'post',
                'api/v1/doc/ask_docs',
                { question: text, product },
                extra
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: result.response,
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `API Error: ${(error as Error).message}`,
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
