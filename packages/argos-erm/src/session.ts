import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
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

/**
 * Per-MCP-session state: the active customer plus the cached list of
 * customers the session's integration token is entitled to.
 *
 * Stored in `SessionContext` under the session ID derived from the tool
 * callback's `extra` context, never in module globals. In HTTP transport
 * mode every session carries its own credentials, so a global would leak
 * one tenant's customer list and active selection into another tenant's
 * session. `SessionContext` drops the entry when the session closes.
 */
export interface SessionState {
    session: Session;
    customers: CustomerInfo[];
    /** True once the customer list has been fetched, even if it is empty. */
    loaded: boolean;
}

/** Key under which the state is kept in `SessionContext`. */
export const SESSION_STATE_KEY = 'argos-erm:session-state';

/**
 * Thrown when a customer ID is not among the customers the session's
 * token is entitled to.
 */
export class UnknownCustomerError extends Error {
    readonly customerId: string;

    constructor(customerId: string, customers: CustomerInfo[]) {
        super(
            `Customer '${customerId}' is not available with the current credentials. ` +
                `Available customers: ${describeCustomers(customers)}`
        );
        this.name = 'UnknownCustomerError';
        this.customerId = customerId;
    }
}

/**
 * Thrown when a call needs a customer and none could be resolved from the
 * arguments, the session, or an elicitation prompt. The message is meant
 * for the user and lists the available options.
 */
export class CustomerSelectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CustomerSelectionError';
    }
}

/**
 * Returns the customer ID a brand-new session should start with, or
 * undefined for "not selected". `index.ts` wires this to the session's
 * Settings so ARGOS_CUSTOMER_ID, `--argos-customer-id` and the per-session
 * ARGOS-CUSTOMER-ID header in HTTP mode all seed the session the same way.
 */
export type InitialCustomerIdResolver = (extra?: unknown) => string | undefined;

let resolveInitialCustomerId: InitialCustomerIdResolver = () => undefined;

export function configureInitialCustomerId(
    resolver: InitialCustomerIdResolver | null
): void {
    resolveInitialCustomerId = resolver ?? (() => undefined);
}

function unsetSession(): Session {
    return { customer_id: UNSET_SENTINEL, display_name: '', region: null };
}

function allSession(): Session {
    return {
        customer_id: ALL_SENTINEL,
        display_name: 'All customers',
        region: null,
    };
}

function newState(extra?: unknown): SessionState {
    const seeded = resolveInitialCustomerId(extra);
    const session: Session = seeded
        ? { customer_id: seeded, display_name: seeded, region: null }
        : unsetSession();
    return { session, customers: [], loaded: false };
}

function getState(extra?: unknown): SessionState {
    let state = SessionContext.getData(SESSION_STATE_KEY, extra) as
        | SessionState
        | undefined;
    if (!state) {
        state = newState(extra);
        SessionContext.setData(SESSION_STATE_KEY, state, extra);
    }
    return state;
}

function saveState(state: SessionState, extra?: unknown): void {
    SessionContext.setData(SESSION_STATE_KEY, state, extra);
}

export function getSession(extra?: unknown): Session {
    return getState(extra).session;
}

export function setSession(s: Session, extra?: unknown): void {
    const state = getState(extra);
    state.session = s;
    saveState(state, extra);
}

/**
 * Reset the session to "all customers" and drop the cached customer list.
 */
export function resetSession(extra?: unknown): void {
    saveState({ session: allSession(), customers: [], loaded: false }, extra);
}

export function getCustomers(extra?: unknown): CustomerInfo[] {
    return getState(extra).customers;
}

/**
 * Fetch the customers the session's token is entitled to. The backend
 * derives this list from the token alone, so it doubles as the allow-list
 * used by `assertKnownCustomer`. Cached per session once fetched, including
 * when the token has no customers at all.
 */
export async function populateCustomers(
    apiManager: ArgosERMAPIManager,
    extra?: unknown
): Promise<void> {
    const state = getState(extra);
    if (state.loaded) return;
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
    state.customers = customers.map((c) => ({
        customer_id: c.customer_id,
        display_name: c.customer_name,
        region: c.region,
    }));
    state.loaded = true;
    saveState(state, extra);
}

function isSentinel(id: string): boolean {
    return id === ALL_SENTINEL || id === UNSET_SENTINEL;
}

function describeCustomers(customers: CustomerInfo[]): string {
    return customers.length
        ? customers
              .map((c) => `${c.display_name} (${c.customer_id})`)
              .join(', ')
        : 'none';
}

/**
 * Throw unless `customerId` is one of the customers the current token is
 * entitled to. Sentinels (ALL / UNSET) are never checked here.
 *
 * The list must already be loaded via `populateCustomers`; an empty list
 * means the token has no customers, so every specific ID is rejected.
 *
 * This is a correctness and defense-in-depth check, not a privilege
 * boundary: the backend enforces token-to-tenant binding itself. What it
 * buys is a clear error instead of an opaque backend failure, and it stops
 * an unknown ID from silently mis-routing requests (an unknown customer has
 * no region and no display name, so alert queries would fall back to the
 * US endpoint with the raw ID and return an empty result).
 */
export function assertKnownCustomer(
    customerId: string,
    customers: CustomerInfo[]
): void {
    if (isSentinel(customerId)) return;
    if (customers.some((c) => c.customer_id === customerId)) return;
    throw new UnknownCustomerError(customerId, customers);
}

/**
 * Validate a customer the session already holds. Session values enter via
 * select_customer or elicitation, both of which pick from the list, or via
 * the initial customer ID from Settings. Only the seeded value can be
 * stale, and only a loaded list can tell; with no list the backend remains
 * the arbiter.
 */
function assertKnownIfLoaded(customerId: string, state: SessionState): void {
    if (state.loaded) assertKnownCustomer(customerId, state.customers);
}

/**
 * Resolve the customer for a call: an explicit override (validated against
 * the loaded customer list) or the session's active customer.
 *
 * Auto-selects the only customer when the session is unresolved and the
 * token has exactly one.
 */
export function resolveCustomerId(explicit?: string, extra?: unknown): string {
    const state = getState(extra);

    if (explicit !== undefined && explicit !== '') {
        assertKnownCustomer(explicit, state.customers);
        return explicit;
    }

    if (isSentinel(state.session.customer_id) && state.customers.length === 1) {
        const c = state.customers[0];
        state.session = {
            customer_id: c.customer_id,
            display_name: c.display_name,
            region: c.region,
        };
        saveState(state, extra);
    }

    return state.session.customer_id;
}

/**
 * Ensure a session customer is set — used by get_alerts.
 *
 * - explicit provided → validate against the customer list and return it,
 *   no session mutation (ALL / UNSET pass through unchecked)
 * - session already ALL or specific → return it, no prompt
 * - session is UNSET → elicit a pick (includes ALL option) and persist to session
 * - no elicitation support → throw with customer list
 */
export async function ensureSessionCustomer(
    apiManager: ArgosERMAPIManager,
    mcpServer: McpServer,
    explicit?: string,
    extra?: unknown
): Promise<string> {
    await populateCustomers(apiManager, extra);
    const state = getState(extra);

    if (explicit !== undefined && explicit !== '') {
        assertKnownCustomer(explicit, state.customers);
        return explicit;
    }

    const resolved = resolveCustomerId(undefined, extra);
    if (resolved !== UNSET_SENTINEL) {
        assertKnownIfLoaded(resolved, state);
        return resolved;
    }

    // Session is UNSET — elicit including ALL option
    const options = [
        { customer_id: ALL_SENTINEL, display_name: 'All customers' },
        ...state.customers.map((c) => ({
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
            throw new CustomerSelectionError(
                'No customer selected. Pass customer_id explicitly to any tool call.'
            );
        }

        const selected = String(result.content.customer_id);
        assertKnownCustomer(selected, state.customers);
        const display =
            options.find((o) => o.customer_id === selected)?.display_name ??
            selected;
        const region =
            selected === ALL_SENTINEL
                ? null
                : (state.customers.find((c) => c.customer_id === selected)
                      ?.region ?? null);
        setSession(
            { customer_id: selected, display_name: display, region },
            extra
        );
        return selected;
    } catch (error) {
        // Re-throw known user-facing errors
        if (
            error instanceof CustomerSelectionError ||
            error instanceof UnknownCustomerError
        ) {
            throw error;
        }
        // Elicitation not supported by client — fall back to text list
        const list = options
            .map((o) => `  - ${o.display_name} (${o.customer_id})`)
            .join('\n');
        throw new CustomerSelectionError(
            `No customer selected. Available customers:\n${list}`
        );
    }
}

/**
 * Resolve a specific (non-ALL, non-UNSET) customer — used by get_assets,
 * get_security_analytics, get_takedown_requests, etc.
 *
 * - explicit provided (not ALL/UNSET) → validate against the customer list
 *   and return it
 * - session holds a specific customer → return it
 * - session is ALL or UNSET → elicit a one-off pick (specific only, no ALL)
 *   WITHOUT persisting to session
 */
export async function resolveSpecificCustomerId(
    apiManager: ArgosERMAPIManager,
    purpose = 'This operation',
    explicit?: string,
    mcpServer?: McpServer,
    extra?: unknown
): Promise<string> {
    await populateCustomers(apiManager, extra);
    const state = getState(extra);

    if (explicit !== undefined && explicit !== '' && !isSentinel(explicit)) {
        assertKnownCustomer(explicit, state.customers);
        return explicit;
    }

    const resolved = resolveCustomerId(undefined, extra);
    if (!isSentinel(resolved)) {
        assertKnownIfLoaded(resolved, state);
        return resolved;
    }

    if (mcpServer) {
        const customerIds = state.customers.map((c) => c.customer_id);
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
                const selected = String(result.content.customer_id);
                assertKnownCustomer(selected, state.customers);
                return selected;
            }

            throw new CustomerSelectionError(
                `${purpose} requires a specific customer. Pass customer_id explicitly.`
            );
        } catch (error) {
            if (
                error instanceof CustomerSelectionError ||
                error instanceof UnknownCustomerError
            ) {
                throw error;
            }
            // Elicitation not supported — fall through to text fallback
        }
    }

    const list = state.customers.map((c) => c.customer_id).join(', ');
    throw new CustomerSelectionError(
        `${purpose} requires a specific customer. ` +
            `Pass customer_id explicitly or call select_customer first. ` +
            `Available customers: ${list}`
    );
}
