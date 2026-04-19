import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    ALL_SENTINEL,
    UNSET_SENTINEL,
    CUSTOMERS_API_PATH,
} from './constants.js';
import type { ArgosERMAPIManager } from './client.js';

export interface CustomerInfo {
    customer_id: string;
    display_name: string;
    region: 'US' | 'EU';
}

export interface Session {
    customer_id: string;
    display_name: string;
    region: string | null;
}

let session: Session = {
    customer_id: UNSET_SENTINEL,
    display_name: '',
    region: null,
};

let CUSTOMERS: CustomerInfo[] = [];

export function getSession(): Session {
    return session;
}

export function setSession(s: Session): void {
    session = s;
}

export function resetSession(): void {
    session = {
        customer_id: ALL_SENTINEL,
        display_name: 'All customers',
        region: null,
    };
    CUSTOMERS = [];
}

export function getCustomers(): CustomerInfo[] {
    return CUSTOMERS;
}

export async function populateCustomers(
    apiManager: ArgosERMAPIManager
): Promise<void> {
    if (CUSTOMERS.length > 0) return;
    const response = await apiManager.post(CUSTOMERS_API_PATH, {
        customer_id: [],
        only_active: true,
    });
    const responseData = (await response.json()) as Record<string, unknown>;
    const data = responseData.data as Record<string, unknown> | undefined;
    const customers = (data?.customers ?? []) as Array<{
        customer_id: string;
        customer_name: string;
        region: 'US' | 'EU';
    }>;
    CUSTOMERS = customers.map((c) => ({
        customer_id: c.customer_id,
        display_name: c.customer_name,
        region: c.region,
    }));
}

export function seedSessionFromEnv(customerId: string): void {
    if (customerId) {
        session = {
            customer_id: customerId,
            display_name: customerId,
            region: null,
        };
    }
}

export function resolveCustomerId(explicit?: string): string {
    if (explicit !== undefined && explicit !== '') return explicit;

    // Auto-select when only one customer is available and session is unresolved
    if (
        (session.customer_id === ALL_SENTINEL ||
            session.customer_id === UNSET_SENTINEL) &&
        CUSTOMERS.length === 1
    ) {
        const c = CUSTOMERS[0];
        session = {
            customer_id: c.customer_id,
            display_name: c.display_name,
            region: c.region,
        };
    }

    return session.customer_id;
}

/**
 * Ensure a session customer is set — used by get_alerts.
 *
 * - explicit provided → return it immediately, no session mutation
 * - session already ALL or specific → return it, no prompt
 * - session is UNSET → elicit a pick (includes ALL option) and persist to session
 * - no elicitation support → throw with customer list
 */
export async function ensureSessionCustomer(
    apiManager: ArgosERMAPIManager,
    mcpServer: McpServer,
    explicit?: string
): Promise<string> {
    if (explicit !== undefined && explicit !== '') return explicit;

    if (!CUSTOMERS.length) await populateCustomers(apiManager);

    const resolved = resolveCustomerId();
    if (resolved !== UNSET_SENTINEL) return resolved;

    // Session is UNSET — elicit including ALL option
    const options = [
        { customer_id: ALL_SENTINEL, display_name: 'All customers' },
        ...CUSTOMERS.map((c) => ({
            customer_id: c.customer_id,
            display_name: c.display_name,
        })),
    ];
    const ids = options.map((o) => o.customer_id);

    try {
        const result = await mcpServer.server.elicitInput({
            message:
                'Select a customer for this session (you can change later with select_customer):',
            requestedSchema: {
                type: 'object',
                properties: {
                    customer_id: {
                        type: 'string',
                        description: 'Customer to use for this session',
                        enum: ids,
                    },
                },
                required: ['customer_id'],
            },
        });

        if (result.action !== 'accept' || !result.content?.customer_id) {
            throw new Error(
                'No customer selected. Pass customer_id explicitly to any tool call.'
            );
        }

        const selected = String(result.content.customer_id);
        const display =
            options.find((o) => o.customer_id === selected)?.display_name ??
            selected;
        const region =
            selected === ALL_SENTINEL
                ? null
                : (CUSTOMERS.find((c) => c.customer_id === selected)?.region ??
                  null);
        session = { customer_id: selected, display_name: display, region };
        return selected;
    } catch (error) {
        // Re-throw known user-facing errors
        if (
            error instanceof Error &&
            error.message.startsWith('No customer selected')
        ) {
            throw error;
        }
        // Elicitation not supported by client — fall back to text list
        const list = options
            .map((o) => `  - ${o.display_name} (${o.customer_id})`)
            .join('\n');
        throw new Error(`No customer selected. Available customers:\n${list}`);
    }
}

/**
 * Resolve a specific (non-ALL, non-UNSET) customer — used by get_assets,
 * get_security_analytics, get_takedown_requests, etc.
 *
 * - explicit provided (not ALL/UNSET) → return it immediately
 * - session holds a specific customer → return it
 * - session is ALL or UNSET → elicit a one-off pick (specific only, no ALL)
 *   WITHOUT persisting to session
 */
export async function resolveSpecificCustomerId(
    apiManager: ArgosERMAPIManager,
    purpose = 'This operation',
    explicit?: string,
    mcpServer?: McpServer
): Promise<string> {
    if (
        explicit !== undefined &&
        explicit !== '' &&
        explicit !== ALL_SENTINEL &&
        explicit !== UNSET_SENTINEL
    ) {
        return explicit;
    }

    if (!CUSTOMERS.length) await populateCustomers(apiManager);

    const resolved = resolveCustomerId();
    if (resolved !== ALL_SENTINEL && resolved !== UNSET_SENTINEL)
        return resolved;

    if (mcpServer) {
        const customerIds = CUSTOMERS.map((c) => c.customer_id);
        try {
            const result = await mcpServer.server.elicitInput({
                message: `${purpose} requires a specific customer. Select one for this call (your session will remain unchanged):`,
                requestedSchema: {
                    type: 'object',
                    properties: {
                        customer_id: {
                            type: 'string',
                            description: 'Customer to use for this operation',
                            enum: customerIds,
                        },
                    },
                    required: ['customer_id'],
                },
            });

            if (result.action === 'accept' && result.content?.customer_id) {
                return String(result.content.customer_id);
            }

            throw new Error(
                `${purpose} requires a specific customer. Pass customer_id explicitly.`
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('requires a specific customer')
            ) {
                throw error;
            }
            // Elicitation not supported — fall through to text fallback
        }
    }

    const list = CUSTOMERS.map((c) => c.customer_id).join(', ');
    throw new Error(
        `${purpose} requires a specific customer. ` +
            `Pass customer_id explicitly or call select_customer first. ` +
            `Available customers: ${list}`
    );
}
