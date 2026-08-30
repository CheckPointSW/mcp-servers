import {
    NotFoundError,
    RateLimitError,
    SmartApiError,
    UpstreamError,
} from './core/errors.js';
import type {
    ExceptionType,
    HarmonyEmailAPIManager,
    PagedRecords,
} from './api-manager.js';

/**
 * The `--check` operator smoke.
 *
 * `--check` proves credentials, DNS resolution and the auth handshake work.
 * `--check --all` additionally exercises every read-only endpoint against the
 * real tenant and reports per-step, so a broken endpoint is attributable
 * without reading server logs.
 *
 * Action tools are deliberately never smoked: they are not idempotent.
 */

type StepStatus = 'ok' | 'degraded' | 'fail' | 'skipped';

interface Step {
    name: string;
    path: string;
    status: StepStatus;
    duration_ms?: number;
    note?: string;
    error?: string;
    reason?: string;
}

export interface CheckAllSummary {
    status: 'ok' | 'fail';
    auth_method: string;
    region: string;
    configured_scope: string;
    discovered: Record<string, string>;
    steps: Step[];
}

/** Enough of an id to correlate against the console, not enough to identify a person. */
function maskId(value: string): string {
    return value.length <= 8
        ? `${value.slice(0, 2)}…`
        : `${value.slice(0, 6)}…`;
}

function isoSeconds(date: Date): string {
    return `${date.toISOString().slice(0, 19)}Z`;
}

function firstEntityId(page: PagedRecords | null): string | null {
    const info = page?.records[0]?.entityInfo;
    if (info === null || typeof info !== 'object') return null;
    const value = (info as Record<string, unknown>).entityId;
    return typeof value === 'string' ? value : null;
}

function firstEventId(page: PagedRecords | null): string | null {
    const row = page?.records[0];
    const value = row?.eventId ?? row?.id;
    return typeof value === 'string' ? value : null;
}

function firstExceptionId(
    whitelist: Record<string, unknown>[] | null,
    blacklist: Record<string, unknown>[] | null
): [ExceptionType, string] | [null, null] {
    const candidates: [ExceptionType, Record<string, unknown>[] | null][] = [
        ['whitelist', whitelist],
        ['blacklist', blacklist],
    ];
    for (const [excType, rows] of candidates) {
        const value = rows?.[0]?.id ?? rows?.[0]?.exceptionId;
        if (typeof value === 'string') return [excType, value];
    }
    return [null, null];
}

/**
 * Runs the deep smoke and returns the summary, so the same orchestration can
 * back both the CLI and any future in-process test.
 */
export class CheckAllRunner {
    private readonly steps: Step[] = [];
    private readonly discovered: Record<string, string> = {};

    constructor(
        private readonly client: HarmonyEmailAPIManager,
        private readonly region: string,
        private readonly scope: string,
        private readonly authMethod: string
    ) {}

    async run(): Promise<CheckAllSummary> {
        await this.runStep('list_scopes', '/v1.0/scopes', () =>
            this.client.getScopes()
        );

        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        const startIso = isoSeconds(start);
        const endIso = isoSeconds(end);

        const entities = await this.runStep(
            'query_entities',
            '/v1.0/search/query',
            () =>
                this.client.queryEntities({
                    entityFilter: {
                        saas: 'office365_emails',
                        startDate: startIso,
                        endDate: endIso,
                    },
                })
        );
        const events = await this.runStep(
            'query_events',
            '/v1.0/event/query',
            () =>
                this.client.queryEvents({
                    startDate: startIso,
                    endDate: endIso,
                })
        );

        const entityId = firstEntityId(entities);
        if (entityId === null) {
            this.skip(
                'get_entity',
                '/v1.0/search/entity/{id}',
                'no entity_id from query_entities'
            );
        } else {
            this.discovered.entity_id_preview = maskId(entityId);
            await this.runStep('get_entity', '/v1.0/search/entity/{id}', () =>
                this.client.getEntity(entityId)
            );
        }

        const eventId = firstEventId(events);
        if (eventId === null) {
            this.skip(
                'get_event',
                '/v1.0/event/{id}',
                'no event_id from query_events'
            );
        } else {
            this.discovered.event_id_preview = maskId(eventId);
            await this.runStep('get_event', '/v1.0/event/{id}', () =>
                this.client.getEvent(eventId)
            );
        }

        const whitelist = await this.runStep(
            'list_ap_exceptions_whitelist',
            '/v1.0/exceptions/whitelist',
            () => this.client.listApExceptions('whitelist')
        );
        const blacklist = await this.runStep(
            'list_ap_exceptions_blacklist',
            '/v1.0/exceptions/blacklist',
            () => this.client.listApExceptions('blacklist')
        );

        const [apType, apId] = firstExceptionId(whitelist, blacklist);
        if (apType === null || apId === null) {
            this.skip(
                'get_ap_exception',
                '/v1.0/exceptions/{type}/{id}',
                'no exceptions present'
            );
        } else {
            this.discovered[`${apType}_exception_id_preview`] = maskId(apId);
            await this.runStep(
                'get_ap_exception',
                `/v1.0/exceptions/${apType}/{id}`,
                () => this.client.getApException(apType, apId)
            );
        }

        return this.summary();
    }

    private async runStep<T>(
        name: string,
        path: string,
        fn: () => Promise<T>
    ): Promise<T | null> {
        const started = Date.now();
        try {
            const result = await fn();
            this.steps.push({
                name,
                path,
                status: 'ok',
                duration_ms: Date.now() - started,
            });
            return result;
        } catch (error) {
            if (error instanceof NotFoundError) {
                // An empty list or missing record is informational, not a failure.
                this.steps.push({
                    name,
                    path,
                    status: 'ok',
                    duration_ms: Date.now() - started,
                    note: `not_found: ${error.message}`,
                });
                return null;
            }
            if (
                error instanceof UpstreamError ||
                error instanceof RateLimitError
            ) {
                // Persistent 5xx or 429-after-retries is upstream-side, not a
                // client regression. Reported, but it does not gate the smoke.
                this.steps.push({
                    name,
                    path,
                    status: 'degraded',
                    duration_ms: Date.now() - started,
                    error: `${error.name}: ${error.message}`,
                });
                return null;
            }
            if (error instanceof SmartApiError) {
                this.steps.push({
                    name,
                    path,
                    status: 'fail',
                    duration_ms: Date.now() - started,
                    error: `${error.name}: ${error.message}`,
                });
                return null;
            }
            throw error;
        }
    }

    private skip(name: string, path: string, reason: string): void {
        this.steps.push({ name, path, status: 'skipped', reason });
    }

    private summary(): CheckAllSummary {
        return {
            // `degraded` is reported but does not gate, so a client regression
            // stays distinguishable from upstream brokenness.
            status: this.steps.every((step) => step.status !== 'fail')
                ? 'ok'
                : 'fail',
            auth_method: this.authMethod,
            region: this.region,
            configured_scope: this.scope,
            discovered: this.discovered,
            steps: this.steps,
        };
    }
}

/**
 * Handle `--check` / `--check --all` before the MCP launcher takes over argv.
 * Returns the process exit code.
 */
export async function runCheck(
    client: HarmonyEmailAPIManager,
    { deep }: { deep: boolean }
): Promise<number> {
    let resolved;
    try {
        resolved = await client.resolved();
    } catch (error) {
        console.error(
            `harmony-email-mcp: configuration error: ${error instanceof Error ? error.message : String(error)}`
        );
        return 2;
    }

    if (deep) {
        const summary = await new CheckAllRunner(
            client,
            resolved.region,
            resolved.scope,
            resolved.authMethod
        ).run();
        console.error(JSON.stringify(summary, null, 2));
        return summary.status === 'ok' ? 0 : 1;
    }

    try {
        const scopes = await client.getScopes();
        console.error(
            JSON.stringify(
                {
                    status: 'ok',
                    auth_method: resolved.authMethod,
                    region: resolved.region,
                    configured_scope: resolved.scope,
                    scopes_available: scopes,
                },
                null,
                2
            )
        );
        return 0;
    } catch (error) {
        console.error(
            `harmony-email-mcp: check failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return 1;
    }
}
