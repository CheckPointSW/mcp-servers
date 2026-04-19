import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { ALL_SENTINEL, UNSET_SENTINEL } from '../constants.js';
import {
    populateCustomers,
    getCustomers,
    getSession,
    setSession,
    resetSession,
} from '../session.js';
import type { ServerModule } from './types.js';

export function registerCustomerTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    server.registerTool(
        'list_customers',
        {
            description: `List all available customers/tenants for this integration token.

WHEN TO USE:
- User asks "what customers are available?"
- User wants to see which tenants they can query
- Before switching customers with select_customer

Returns the full list with an "ALL" option prepended.`,
        },
        async (extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                if (getCustomers().length === 0) {
                    await populateCustomers(apiManager);
                }

                const customers = [
                    {
                        customer_id: ALL_SENTINEL,
                        display_name: 'All customers',
                    },
                    ...getCustomers().map((c) => ({
                        customer_id: c.customer_id,
                        display_name: c.display_name,
                    })),
                ];

                const session = getSession();
                const activeCustomer =
                    session.customer_id === UNSET_SENTINEL
                        ? {
                              customer_id: UNSET_SENTINEL,
                              display_name: 'Not selected (will prompt on first use)',
                          }
                        : {
                              customer_id: session.customer_id,
                              display_name: session.display_name,
                          };
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    customers,
                                    active_customer: activeCustomer,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error listing customers: ${msg}`,
                        },
                    ],
                };
            }
        }
    );

    server.registerTool(
        'select_customer',
        {
            description: `Switch the active customer/tenant for this session.

WHEN TO USE:
- User says "change customer", "switch tenant", "use a different organisation"
- User wants to scope all subsequent queries to a specific customer
- User wants to go back to "ALL" mode

Pass a customer_id from list_customers. Pass "ALL" to query all customers.`,
            inputSchema: {
                customer_id: z
                    .string()
                    .describe(
                        'Customer ID to switch to. Use "ALL" for all customers.'
                    ),
            },
        },
        async ({ customer_id }, extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                if (getCustomers().length === 0) {
                    await populateCustomers(apiManager);
                }

                if (customer_id === ALL_SENTINEL) {
                    resetSession();
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Active customer set to: All customers (ALL)',
                            },
                        ],
                    };
                }

                const customer = getCustomers().find(
                    (c) => c.customer_id === customer_id
                );
                if (!customer) {
                    const available = getCustomers()
                        .map((c) => `${c.display_name} (${c.customer_id})`)
                        .join(', ');
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Customer '${customer_id}' not found. Available: ${available}`,
                            },
                        ],
                    };
                }

                setSession({
                    customer_id: customer.customer_id,
                    display_name: customer.display_name,
                    region: customer.region,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Active customer set to: ${customer.display_name} (${customer.customer_id})`,
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error selecting customer: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
