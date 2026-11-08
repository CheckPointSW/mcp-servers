import { z } from 'zod';
import {
    SessionContext,
    sessionLogLabel,
    toolError,
    McpErrorCode,
    classifyHttpStatus,
} from '@chkp/mcp-utils';
import type {
    CPMcpServer,
    ServerModule,
    ToolPolicyCallback,
} from '@chkp/mcp-utils';
import type { CloudFirewallAPIManager } from '../api-manager.js';
import {
    assertBackendCredentials,
    MissingCredentialsError,
} from '../settings.js';
import {
    CpcfApiError,
    CpcfAmbiguousWriteError,
    CpcfContractError,
} from '../clients/cpcf.js';
import { issueConfirmToken, redeemConfirmToken } from './confirm-token.js';
import { approvalPreview, escapeApprovalText } from './approval-preview.js';
import { callerCorrectableFailureText, modelSafeText } from './errors.js';
import {
    jsonResult,
    type AnyToolDef,
    type ToolArgs,
    type ToolContext,
    type ToolResult,
} from './types.js';

/**
 * Visibility policy for tools/list. Reads the resolved default-session
 * settings rather than process.env, so --mode and CFW_MODE agree with what
 * `ping` reports. The launcher calls createFromArgs before applyToolPolicy,
 * and mcp-utils reapplies this same callback on each HTTP session server
 * before that server is connected. Both calls use getSettings() with no
 * session id, so the policy sees the process mode, not request headers.
 *
 * This hides write tools. It does not authorize them. The policy is
 * process-wide: a session that lowers mode with CFW-MODE still sees write
 * tools when the process ceiling is write. The per-call check in
 * runTool refuses that call.
 */
export function createWriteModePolicy(
    serverModule: ServerModule,
    defs: AnyToolDef[]
): ToolPolicyCallback {
    // Derived from the definitions rather than collected as a side effect of
    // registration, so the policy cannot depend on call order or on state
    // shared with another server instance in the same process.
    const writeTools = new Set(
        defs.filter((def) => def.tier >= 1).map((def) => def.name)
    );
    return (toolName: string) =>
        !writeTools.has(toolName) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (serverModule.settingsManager as any)?.getSettings()?.mode === 'write';
}

/**
 * One structured line per call, on stderr — stdout belongs to the JSON-RPC
 * stream. Arguments are deliberately absent: they carry the SIC password.
 */
function auditLine(
    def: AnyToolDef,
    decision: string,
    started: number,
    extra: unknown
): string {
    return JSON.stringify({
        audit: 'cloud-firewall',
        tool: def.name,
        tier: def.tier,
        decision,
        ms: Date.now() - started,
        session: sessionLogLabel(SessionContext.getSessionId(extra)),
    });
}

/**
 * The tool's input schema. A tier-2 tool also takes the confirm/confirmToken
 * pair that drives the preview-then-approve flow.
 */
function schemaWithConfirmParams(
    def: AnyToolDef
): Record<string, z.ZodTypeAny> {
    const schema: Record<string, z.ZodTypeAny> = { ...def.schema };
    if (def.tier === 2) {
        // Keep omission equivalent to false for existing clients; new callers
        // should explicitly select the non-mutating preview with false.
        schema.confirm = z
            .boolean()
            .optional()
            .describe(
                'Set false to validate and preview without creating resources; no separate user approval is needed for preview. Set true only after explicit user approval of the returned preview, with its confirmToken, to start provisioning, which may incur charges. Omission remains equivalent to false.'
            );
        schema.confirmToken = z
            .string()
            .optional()
            .describe(
                'The confirmToken returned by the preview call. Required alongside confirm. Copy it verbatim; it is only valid for the exact arguments the preview described.'
            );
    }
    return schema;
}

/** MCP annotation hints for a tool's tier. */
function annotationsFor(def: AnyToolDef): Record<string, boolean> {
    // Never leave this empty. The SDK resolves its positional tool()
    // overload by guessing which argument is the schema, and
    // isZodRawShapeCompat() treats `{}` as a valid no-params shape. An
    // empty annotations object therefore fails the `!isZodRawShapeCompat`
    // test that decides whether to consume the annotations slot, so the
    // handler slides into the annotations position and every call dies with
    // "typedHandler is not a function". Tiers 0 and 2 happened to be safe
    // only because their annotations are non-empty; tier 1 was not.
    // Spelling out both hints per tier keeps every branch non-empty and is
    // the more accurate annotation anyway.
    // Reads are idempotent; writes are not, so clients must not auto-retry them.
    // openWorldHint is omitted on purpose: it defaults to true and nearly every tool calls the backend.
    return def.tier === 2
        ? {
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: false,
          }
        : def.tier === 0
          ? {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
            }
          : {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
            };
}

/**
 * One tool call, end to end: advisor-mode gate, precheck, preview or confirm
 * gate, handler, error sanitization and the audit line.
 */
async function runTool(
    def: AnyToolDef,
    serverModule: ServerModule,
    args: ToolArgs,
    extra: unknown
): Promise<ToolResult> {
    const started = Date.now();

    // ctx.api is lazy: a tool that talks to no backend (bundled
    // knowledge, local computation) never constructs it, so the
    // server stays usable without CPCF credentials.
    let apiCache: CloudFirewallAPIManager | undefined;
    const ctx: ToolContext = {
        settings: SessionContext.getSettings(serverModule, extra),
        get api(): CloudFirewallAPIManager {
            if (!apiCache) {
                assertBackendCredentials(ctx.settings);
                apiCache = SessionContext.getAPIManager(
                    serverModule,
                    extra
                ) as CloudFirewallAPIManager;
            }
            return apiCache;
        },
        extra,
    };

    let result: ToolResult;
    let decision = 'executed';
    try {
        // Everything below this line works with `inputs` — args
        // minus the two parameters registerTools added. A handler
        // therefore never has to strip them before building a
        // request body, and cannot forget to.
        const { confirm, confirmToken, ...inputs } = args;

        // Authorization, not visibility. tools/list policy is
        // process-wide and is applied on HTTP session servers too,
        // but a CFW-MODE header can still lower this session to
        // advisor. Those tools stay listed, so this check refuses
        // the call against the session's own settings.
        if (def.tier >= 1 && ctx.settings.mode !== 'write') {
            decision = 'rejected_advisor_mode';
            result = toolError(
                McpErrorCode.PERMISSION_DENIED,
                `${def.name} is a write tool and this server is running in advisor (read-only) mode. Start the server with --mode write (or CFW_MODE=write) to enable write tools.`
            );
            console.error(auditLine(def, decision, started, extra));
            return result;
        }

        // Precheck runs before the confirm-token check on purpose,
        // for the confirm path too: redeeming first would consume
        // the (one-shot) token even when a confirm-time precheck
        // legitimately fails — e.g. the name got taken between
        // preview and confirm — forcing a fresh preview. The cost
        // of this ordering is a non-mutating preflight on the
        // bad-token error path, which is acceptable.
        const checked = def.precheck ? await def.precheck(inputs, ctx) : [];
        const { problems, warnings = [] } = Array.isArray(checked)
            ? { problems: checked }
            : checked;
        // Approval includes disclosed limitations: the confirm call re-runs
        // the precheck, and a change in its warnings requires a fresh
        // preview. Sorted so that order alone cannot invalidate an approval.
        const approvalInputs = {
            inputs,
            warnings: [...warnings].sort(),
            destination: {
                gateway: ctx.settings.getCloudInfraGateway(),
                environment: ctx.settings.cpcfEnv,
            },
        };

        if (problems.length > 0) {
            decision = 'rejected_precheck';
            const details = {
                ok: false,
                reason: 'precheck_failed',
                problems,
                ...(warnings.length ? { warnings } : {}),
                next: 'Fix the listed fields and call again.',
            };
            result = toolError(
                McpErrorCode.VALIDATION_ERROR,
                'Local input checks failed. Fix the listed fields and call again.',
                { details }
            );
            // Keep the existing JSON text for clients that do not consume
            // structuredContent; field problems must remain visible to them.
            result.content = jsonResult(details).content;
        } else if (def.tier === 2 && confirm !== true) {
            decision = 'preview_awaiting_confirm';
            const configuration = def.previewConfiguration?.(inputs);
            result = jsonResult({
                ok: false,
                reason: 'confirmation_required',
                // Centralized so cloud clauses and peering summaries receive
                // the same literal-text protection as the approval table.
                willDo: escapeApprovalText(
                    def.previewSummary
                        ? def.previewSummary(inputs)
                        : `Execute ${def.name} with the given inputs.`
                ),
                ...(configuration
                    ? {
                          approvalPreview: approvalPreview(configuration),
                          effectiveConfiguration: configuration,
                      }
                    : {}),
                prechecks: warnings.length ? 'passed_with_warnings' : 'passed',
                ...(warnings.length ? { warnings } : {}),
                confirmToken: issueConfirmToken(
                    def.name,
                    extra,
                    approvalInputs
                ),
                next: `Show willDo and any warnings to the user${configuration ? '. Display the server-rendered approvalPreview verbatim. Keep backend-selected settings in its single Advanced settings row; do not expand them into individual rows or ask for each default. effectiveConfiguration is technical detail: show it only on request. Offer to customize advanced settings on request; changed inputs require a fresh preview' : ''}. Ask for approval of this action only, separately from unrelated actions. Input clarification is not execution approval. If they explicitly approve, call again with the SAME arguments plus confirm: true and this confirmToken. Never set confirm without the user asking. This preview ran local input checks only; label the checks as local, not backend validation or a successful dry run. Backend validation and provisioning can still fail after acceptance. Fix returned errors and obtain a fresh approved preview before submitting changed inputs.`,
            });
        } else if (
            def.tier === 2 &&
            !redeemConfirmToken(confirmToken, def.name, extra, approvalInputs)
        ) {
            // Missing, unissued, expired, already spent, or minted
            // for different arguments: either the preview was
            // skipped or the payload changed after approval.
            decision = 'rejected_bad_confirm_token';
            result = toolError(
                McpErrorCode.VALIDATION_ERROR,
                `${def.name}: preview expired, run preview again. The confirmToken is missing, expired, already used, or does not match these arguments or preview warnings. Call again with confirm: false to get a fresh preview, show it to the user, and only then re-send with the returned confirmToken.`
            );
        } else {
            result = await def.handler(inputs, ctx);
            if (warnings.length)
                result.content.push({
                    type: 'text',
                    text: JSON.stringify({ warnings }),
                });
        }
    } catch (error) {
        decision = 'error';
        // The raw message can carry upstream internals: CpcfClient
        // sanitizes its own HTTP errors, but not every thrown error
        // is one of those. The full error goes to stderr for the
        // operator; the model sees a sanitized message only for the
        // failures it can act on (missing configuration, a CPCF
        // 4xx it can correct) — everything else stays generic.
        console.error(
            JSON.stringify({
                audit: 'cloud-firewall',
                tool: def.name,
                error: (error as Error).message,
            })
        );
        const message =
            modelSafeText(error as Error, def.name) ??
            callerCorrectableFailureText(error as Error, def.tier) ??
            `${def.name} failed: an internal error occurred. Check the server logs for details.`;
        if (error instanceof MissingCredentialsError) {
            result = toolError(McpErrorCode.AUTH_FAILED, message);
        } else if (error instanceof CpcfAmbiguousWriteError) {
            result = toolError(McpErrorCode.OPERATION_FAILED, message, {
                retryable: false,
            });
        } else if (error instanceof CpcfApiError) {
            const classified = classifyHttpStatus(error.status);
            result = toolError(classified.code, message, {
                upstreamStatus: error.status,
                retryable: def.tier === 0 && classified.retryable,
            });
        } else if (error instanceof CpcfContractError) {
            result = toolError(McpErrorCode.UPSTREAM_ERROR, message, {
                retryable: false,
            });
        } else {
            result = toolError(McpErrorCode.INTERNAL, message);
        }
    }

    console.error(auditLine(def, decision, started, extra));
    return result;
}

/**
 * Register tool definitions with the house conventions applied mechanically.
 *
 * Execution order per call — validate, preview, execute, collapsed into one
 * MCP round trip:
 *
 *   zod parse (the SDK) -> precheck (semantics) -> confirm gate -> handler
 *
 * precheck runs first so an unconfirmed tier-2 call returns a real preview
 * (what would happen + any problems) rather than a bare refusal, and a caller
 * is never asked to approve something already known to fail.
 *
 * Every call emits one structured audit line to stderr — stdout belongs to the
 * JSON-RPC stream and must never be written to.
 */
export function registerTools(
    server: CPMcpServer,
    serverModule: ServerModule,
    defs: AnyToolDef[]
): void {
    for (const def of defs) {
        server.tool(
            def.name,
            def.description,
            schemaWithConfirmParams(def),
            annotationsFor(def),
            // args is validated by the SDK against the schema before we see it;
            // extra is SDK request metadata, opaque here (see ToolContext).
            (args: ToolArgs, extra: unknown) =>
                runTool(def, serverModule, args, extra)
        );
    }
}
