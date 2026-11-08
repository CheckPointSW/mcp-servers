import { z } from 'zod';
import type { Settings } from '../settings.js';
import type { CloudFirewallAPIManager } from '../api-manager.js';

/**
 * Risk tier of a tool. Declared once per tool, enforced mechanically by
 * registerTools() so nobody re-implements gating by hand:
 *
 *   0 — read-only. Always visible. Registered with readOnlyHint.
 *   1 — low-risk reversible write. Hidden from tools/list AND refused per call
 *       unless mode is 'write'.
 *   2 — high-risk write. As tier 1, plus destructiveHint and auto-added
 *       `confirm` / `confirmToken` parameters: an unconfirmed call returns a
 *       preview carrying a token that the confirmed call must present.
 */
export type RiskTier = 0 | 1 | 2;

export interface ToolContext {
    api: CloudFirewallAPIManager;
    settings: Settings;
    /**
     * The MCP request `extra` (session id, transport metadata). The SDK and
     * SessionContext both type it as `any`, so it is opaque to us — pass it
     * through to SessionContext helpers rather than reading it directly.
     */
    extra: unknown;
}

export interface ToolResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
}

/**
 * A semantic problem found before execution. The model reads these to fix its
 * inputs and retry, so `hint` should name the fix, not restate the error.
 */
export interface Problem {
    code?: string;
    field: string;
    message: string;
    hint?: string;
}

/**
 * Arguments as the registry sees them — after zod validation, before they reach
 * a tool. Only the registry uses this shape; tool definitions get their own
 * inferred argument type via defineTool().
 */
export type ToolArgs = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A successful precheck can carry limitations that must be shown in approval. */
export interface PrecheckResult {
    problems: Problem[];
    warnings?: string[];
}

/** The two parameters registerTools adds to every tier-2 tool. */
export interface ConfirmArgs {
    confirm?: boolean;
    confirmToken?: string;
}

export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
    /** Tool name: snake_case. Prefix with the domain noun, e.g. deployment_status. */
    name: string;
    /** Model-facing description. For tier 2, state plainly that explicit user approval is required. */
    description: string;
    tier: RiskTier;
    /** zod raw shape. `confirm` is added automatically for tier 2 — do not declare it. */
    schema: Shape;
    /**
     * Semantic validation against live state, run BEFORE the confirm gate — so a
     * caller is never asked to approve something that would fail. Cheap reads
     * only; must not mutate. Return [] when valid.
     */
    precheck?: (
        args: z.infer<z.ZodObject<Shape>> & ConfirmArgs,
        ctx: ToolContext
    ) => Promise<Problem[] | PrecheckResult>;
    /** One line describing what execution would do. Shown in the tier-2 preview. Pure function of args. */
    previewSummary?: (
        args: z.infer<z.ZodObject<Shape>> & ConfirmArgs
    ) => string;
    /**
     * Every input field with the value that will apply and its source
     * (provided, default, backend-chooses, not-set). Used to render the compact
     * approvalPreview; retained as effectiveConfiguration for technical details
     * on request. Pure function of args; secret values must be hidden.
     */
    previewConfiguration?: (
        args: z.infer<z.ZodObject<Shape>> & ConfirmArgs
    ) => Array<{ path: string; value: unknown; source: string }>;
    handler: (
        args: z.infer<z.ZodObject<Shape>> & ConfirmArgs,
        ctx: ToolContext
    ) => Promise<ToolResult>;
}

/**
 * A tool of any input shape. The registry holds tools with different shapes in
 * one array, so the shape parameter is unconstrained here; each ToolDef is
 * still fully type-checked at its own definition site.
 */
export type AnyToolDef = ToolDef<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Define a tool with its argument type inferred from its own zod shape, then
 * widen it so the registry can hold different shapes in one array. Use this at
 * every definition site: annotating `AnyToolDef[]` instead erases the shape and
 * silently un-types precheck and previewSummary — and previewSummary renders
 * the text a user approves, so a typo'd field there must not compile.
 */
export function defineTool<Shape extends z.ZodRawShape>(
    def: ToolDef<Shape>
): AnyToolDef {
    return def as AnyToolDef;
}

/** Helper for uniform JSON tool results. */
export function jsonResult(payload: unknown): ToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
}

/** jsonResult with isError set — for handler-level failures with structured payloads. */
export function jsonErrorResult(payload: unknown): ToolResult {
    return { ...jsonResult(payload), isError: true };
}

export function errorResult(message: string): ToolResult {
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    };
}
