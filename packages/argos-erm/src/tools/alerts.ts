import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    classifyError,
    McpErrorCode,
    McpToolError,
    SessionContext,
    toolErrorFrom,
} from '@chkp/mcp-utils';
import {
    ALERT_API_BASE,
    ALERT_API_BASE_BY_REGION,
    ALL_SENTINEL,
    UNSET_SENTINEL,
} from '../constants.js';
import { parseListParam } from '../schemas.js';
import { buildAlertFilters } from '../helpers/alert-filters.js';
import { normalizeMetadata } from '../helpers/metadata.js';
import { enrichAlertsWithIocFlag } from '../helpers/enrichment.js';
import type { ArgosERMAPIManager } from '../client.js';
import {
    hasMixedRegions,
    allRegions,
    customerRegion,
    findCustomerDisplayName,
} from '../helpers/region.js';
import { ensureSessionCustomer } from '../session.js';
import type { ServerModule } from './types.js';
import { readJson, readJsonObject } from '../helpers/response.js';
import { itemError } from '../helpers/item-error.js';
import { pathSegment } from '../helpers/path.js';

const ALERT_SUMMARY_FIELDS = [
    'ref_id',
    'title',
    'severity',
    'status',
    'type',
    'created_date',
    'environment',
    'has_iocs',
] as const;

interface AlertQueryOptions {
    severities?: string[];
    statuses?: string[];
    types?: string[];
    fromCreatedDate?: string;
    toCreatedDate?: string;
    limit?: number;
    page?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AlertResult = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trimAlerts(data: Record<string, any>): void {
    if (!Array.isArray(data.alerts)) return;
    data.alerts = data.alerts.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (alert: Record<string, any>) => {
            if (typeof alert !== 'object' || alert === null) return alert;
            return Object.fromEntries(
                ALERT_SUMMARY_FIELDS.filter((k) => k in alert).map((k) => [
                    k,
                    alert[k],
                ])
            );
        }
    );
}

/**
 * Map a customer region to its alert API base path. A missing or
 * unrecognised region falls back to US.
 */
function alertBasePath(region: string | null | undefined): string {
    if (!region) return ALERT_API_BASE;
    return ALERT_API_BASE_BY_REGION[region] ?? ALERT_API_BASE;
}

async function requestAlerts(
    apiManager: ArgosERMAPIManager,
    basePath: string,
    environments: string[] | null,
    opts: AlertQueryOptions
): Promise<AlertResult> {
    const {
        severities,
        statuses,
        types,
        fromCreatedDate,
        toCreatedDate,
        limit = 50,
        page = 1,
    } = opts;
    const filters = buildAlertFilters(
        severities,
        statuses,
        types,
        fromCreatedDate,
        toCreatedDate,
        environments
    );
    const payload = { filters, page, size: limit };

    try {
        const response = await apiManager.post(`${basePath}/alerts`, payload);
        const data = await readJsonObject(response);
        enrichAlertsWithIocFlag(data);
        trimAlerts(data);
        return data;
    } catch (err: unknown) {
        const httpErr = err as {
            response?: { status?: number };
            detail?: unknown;
        };
        if (
            httpErr.response?.status === 422 &&
            typeof httpErr.detail === 'string' &&
            httpErr.detail.includes('Datetime not in range')
        ) {
            throw new McpToolError(
                McpErrorCode.VALIDATION_ERROR,
                'Date range out of bounds: the requested date range is outside the window supported by the API. ' +
                    'Please narrow the range — try querying within the last 90 days.',
                { upstreamStatus: 422 }
            );
        }
        throw err;
    }
}

/** A region's failure in a few words: its code, and the upstream status if any. */
function describeRegionError(error: unknown): string {
    const { error_code, upstream_status } = classifyError(error);
    return upstream_status === undefined
        ? error_code
        : `${error_code} (HTTP ${upstream_status})`;
}

async function fanoutAlerts(
    apiManager: ArgosERMAPIManager,
    opts: AlertQueryOptions,
    extra?: unknown
): Promise<AlertResult> {
    const regions = allRegions(extra);
    const regionCount = Math.max(regions.length, 1);
    const perRegionLimit = Math.max(
        10,
        Math.ceil((opts.limit ?? 50) / regionCount)
    );
    const regionOpts = { ...opts, limit: perRegionLimit };

    const successes: AlertResult[] = [];
    const errors: unknown[] = [];

    for (const region of regions) {
        const basePath = alertBasePath(region);
        try {
            successes.push(
                await requestAlerts(apiManager, basePath, null, regionOpts)
            );
        } catch (err: unknown) {
            // A rejected request would be rejected by every region. The status
            // is read through classifyError, which follows the retry wrapper's
            // cause to the upstream response.
            const { upstream_status } = classifyError(err);
            if (upstream_status !== undefined && upstream_status < 500)
                throw err;
            if (
                err instanceof McpToolError &&
                err.code === McpErrorCode.VALIDATION_ERROR
            )
                throw err;
            errors.push(err);
        }
    }

    if (!successes.length) {
        if (errors.length) throw errors[0];
        return { alerts: [], total: 0 };
    }

    const merged: AlertResult = {
        alerts: successes.flatMap((r) => r.alerts ?? []),
        total: successes.reduce((sum, r) => sum + (r.total ?? 0), 0),
        pagination: successes[0].pagination,
        _fanout_note:
            'Results merged across all regions. Pagination applies independently per region.',
    };

    if (errors.length) {
        merged._fanout_partial_error =
            `${errors.length} region(s) returned errors and were skipped. ` +
            `First error: ${describeRegionError(errors[0])}`;
    }

    return merged;
}

async function routeAlertQuery(
    apiManager: ArgosERMAPIManager,
    mcpServer: McpServer,
    customerId: string | undefined,
    opts: AlertQueryOptions,
    extra?: unknown
): Promise<AlertResult> {
    const resolved = await ensureSessionCustomer(
        apiManager,
        mcpServer,
        customerId,
        extra
    );

    if (resolved !== ALL_SENTINEL && resolved !== UNSET_SENTINEL) {
        const basePath = alertBasePath(customerRegion(resolved, extra));
        const envName = findCustomerDisplayName(resolved, extra);
        return requestAlerts(apiManager, basePath, [envName], opts);
    }

    if (hasMixedRegions(extra)) {
        return fanoutAlerts(apiManager, opts, extra);
    }

    const regions = allRegions(extra);
    const basePath = alertBasePath(regions[0]);
    return requestAlerts(apiManager, basePath, null, opts);
}

async function enrichAlertIndicators(
    apiManager: ArgosERMAPIManager,
    alertData: AlertResult,
    refId: string
): Promise<void> {
    if (
        !alertData.alert?.indicators ||
        !Array.isArray(alertData.alert.indicators)
    ) {
        return;
    }
    for (const indicator of alertData.alert.indicators) {
        if (!indicator.id) continue;
        try {
            const resp = await apiManager.get(
                `${ALERT_API_BASE}/alerts/${pathSegment(refId)}/indicators/${pathSegment(indicator.id)}`
            );
            indicator.intel_item = await readJson(resp);
        } catch (e) {
            // Intel is optional detail on an alert that was retrieved, so a
            // failure is recorded on the indicator rather than failing the call.
            indicator.intel_item = itemError(e);
        }
    }
}

export function registerAlertTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    // get_alert_metadata
    server.registerTool(
        'get_alert_metadata',
        {
            description: `Get all available alert categories, types, and subtypes for alert filtering.

WHEN TO USE:
- ALWAYS call this BEFORE using get_alerts() for first time
- User asks "what alert types/categories are available?"
- User wants to see filtering options for alerts

PURPOSE:
- Discovers all valid alert types extracted from the hierarchical classification structure
- Returns only the type-level strings valid for use as filter values in get_alerts()
- Essential for building effective alert search queries`,
        },
        async (extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const response = await apiManager.get(
                    `${ALERT_API_BASE}/alerts/metadata`
                );
                const data = await readJson(response);
                const types = normalizeMetadata(data);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(types, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return toolErrorFrom(error, 'Error retrieving alert metadata');
            }
        }
    );

    // get_alerts
    server.registerTool(
        'get_alerts',
        {
            description: `Search and retrieve security alerts with comprehensive filtering options.

WHEN TO USE:
- User wants to see current or recent security alerts
- User asks for alerts by severity, status, or type
- User needs alerts from a specific time period

DEFAULT BEHAVIOR:
- If no dates provided: Returns last 24 hours of alerts
- Minimum limit enforced: 10 alerts (API constraint)
- Returns trimmed alert summaries (ref_id, title, severity, status, type,
  created_date, environment, has_iocs). Call get_alert_details(ref_id) for full objects.
- If total > returned, a _note field gives the next-page instruction.

MULTI-TENANT:
- If no customer is selected, will prompt to pick one for the session.
- Pass customer_id to override for a single call without changing the session.`,
            inputSchema: {
                from_created_date: z
                    .string()
                    .optional()
                    .describe(
                        "Start date for alert search (format: YYYY-MM-DD). If only this is provided, 'to' defaults to today."
                    ),
                to_created_date: z
                    .string()
                    .optional()
                    .describe(
                        'End date for alert search (format: YYYY-MM-DD).'
                    ),
                severities: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe(
                        "Alert severity levels: 'low', 'medium', 'high', 'very_high'. Can be single string or list."
                    ),
                statuses: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe(
                        "Alert status: 'open', 'closed', 'acknowledged'. Can be single string or list."
                    ),
                types: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe(
                        'Alert types to include. Get available options from get_alert_metadata(). Returns valid type strings extracted from the category → type hierarchy.'
                    ),
                limit: z
                    .number()
                    .default(50)
                    .describe(
                        'Number of alerts to return (minimum 10, default 50). Do NOT pass this unless the user explicitly asks for a specific number of results.'
                    ),
                page: z
                    .number()
                    .default(1)
                    .describe(
                        'Page number for pagination (default 1). Increment by 1 per call to page through results. Do NOT pass this unless paginating.'
                    ),
                customer_id: z
                    .string()
                    .optional()
                    .describe(
                        'One-off customer override. Does not change the active session.'
                    ),
            },
        },
        async (
            {
                from_created_date,
                to_created_date,
                severities,
                statuses,
                types,
                limit = 50,
                page = 1,
                customer_id,
            },
            extra
        ) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                if (limit < 10) limit = 10;

                const data = await routeAlertQuery(
                    apiManager,
                    server,
                    customer_id,
                    {
                        severities: parseListParam(severities),
                        statuses: parseListParam(statuses),
                        types: parseListParam(types),
                        fromCreatedDate: from_created_date,
                        toCreatedDate: to_created_date,
                        limit,
                        page,
                    },
                    extra
                );

                if (
                    Array.isArray(data.alerts) &&
                    typeof data.total === 'number' &&
                    data.total > data.alerts.length
                ) {
                    data._note =
                        `Showing ${data.alerts.length} of ${data.total} total matching alerts. ` +
                        `Re-call with page=${page + 1} to retrieve the next page.`;
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(data, null, 2),
                        },
                    ],
                };
            } catch (error: unknown) {
                return toolErrorFrom(error, 'Error retrieving alerts');
            }
        }
    );

    // get_alert_details
    server.registerTool(
        'get_alert_details',
        {
            description: `Retrieve comprehensive details for a specific security alert by its ID.

WHEN TO USE:
- User mentions a specific alert ID/reference and wants details
- User wants to investigate or analyze a particular alert
- Set fetch_intel_items=True to get detailed threat intelligence for all IOCs`,
            inputSchema: {
                ref_id: z
                    .string()
                    .describe(
                        'The unique alert reference ID (e.g., "ALT-123456").'
                    ),
                severities: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe(
                        "Optional severity filter. Returns empty dict if alert doesn't match."
                    ),
                fetch_intel_items: z
                    .boolean()
                    .default(false)
                    .describe(
                        'If True, enriches each indicator with detailed threat intelligence.'
                    ),
            },
        },
        async ({ ref_id, severities, fetch_intel_items = false }, extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const severitiesList = parseListParam(severities);

                const response = await apiManager.get(
                    `${ALERT_API_BASE}/alerts/${pathSegment(ref_id)}`
                );
                const alertData = await readJsonObject(response);

                if (severitiesList) {
                    const alertSeverity = alertData.alert?.severity;
                    if (
                        !alertSeverity ||
                        !severitiesList.includes(alertSeverity)
                    ) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify({}),
                                },
                            ],
                        };
                    }
                }

                if (fetch_intel_items) {
                    await enrichAlertIndicators(apiManager, alertData, ref_id);
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(alertData, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const httpErr = error as { response?: { status?: number } };
                // A missing alert is an expected outcome, not an error: honor
                // the documented contract and return an empty object instead of
                // surfacing a raw 404 to the caller.
                if (httpErr.response?.status === 404) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({}),
                            },
                        ],
                    };
                }
                return toolErrorFrom(error, 'Error retrieving alert details');
            }
        }
    );
}
