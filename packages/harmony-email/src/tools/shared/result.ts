import { z } from 'zod';
import {
    classifyError,
    classifyHttpStatus,
    McpErrorCode,
    toolError,
} from '@chkp/mcp-utils';
import {
    AmbiguousActionError,
    AuthError,
    AuthorizationError,
    ConfigError,
    NotFoundError,
    RateLimitError,
    SmartApiError,
    TransportError,
    UpstreamError,
    UpstreamTimeoutError,
    ValidationError,
} from '../../core/errors.js';
import { log } from '../../core/redact.js';

/** The MCP tool-result shape this repo returns from every handler. */
export interface ToolResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
    [key: string]: unknown;
}

export function jsonResult(payload: unknown): ToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

type Classification = NonNullable<Parameters<typeof toolError>[2]> & {
    code: McpErrorCode;
};

/** Place a SmartAPI failure in the shared error taxonomy. Subclasses first. */
function classifySmartApiError(error: SmartApiError): Classification {
    if (error instanceof AuthError) return { code: McpErrorCode.AUTH_FAILED };
    if (error instanceof AuthorizationError)
        return { code: McpErrorCode.PERMISSION_DENIED };
    if (error instanceof NotFoundError) return { code: McpErrorCode.NOT_FOUND };
    // Includes ScrollExpiredError: the fix is to re-issue without scrollId.
    if (error instanceof ValidationError)
        return { code: McpErrorCode.VALIDATION_ERROR };
    // Missing or unresolvable tenant settings, reported as every package
    // reports a server it cannot run as configured.
    if (error instanceof ConfigError) return { code: McpErrorCode.INTERNAL };
    if (error instanceof RateLimitError) {
        return {
            code: McpErrorCode.RATE_LIMITED,
            ...(error.retryAfterSeconds !== null
                ? { details: { retry_after_seconds: error.retryAfterSeconds } }
                : {}),
        };
    }
    if (error instanceof UpstreamError) {
        // No status means HTTP 200 with success=false: upstream answered and
        // reported the operation itself as failed.
        if (error.status === null)
            return { code: McpErrorCode.OPERATION_FAILED };
        return {
            ...classifyHttpStatus(error.status),
            upstreamStatus: error.status,
        };
    }
    // Not retried here, so not advertised as retryable: a hanging upstream
    // call should fail once rather than multiply the timeout.
    if (error instanceof UpstreamTimeoutError)
        return { code: McpErrorCode.TIMEOUT, retryable: false };
    if (error instanceof TransportError)
        return { code: McpErrorCode.UPSTREAM_UNREACHABLE };
    // The action may already have been applied, so a blind retry is unsafe.
    if (error instanceof AmbiguousActionError)
        return { code: McpErrorCode.OPERATION_FAILED, retryable: false };
    return { code: McpErrorCode.INTERNAL };
}

/**
 * An error result whose text keeps this package's own `Name: message` form,
 * with the shared classification in `structuredContent`.
 */
function classifiedResult(
    text: string,
    message: string,
    { code, ...options }: Classification
): ToolResult {
    return {
        ...toolError(code, message, options),
        content: [{ type: 'text', text }],
    };
}

/**
 * Turn a thrown error into a tool result.
 *
 * Callers see a stable error code plus the upstream's own message, which is
 * already shape-only for payload problems. Stack traces stay server-side, and
 * nothing here interpolates a payload.
 */
export function errorResult(tool: string, error: unknown): ToolResult {
    if (error instanceof SmartApiError) {
        log('tool.error', { tool, code: error.code });
        return classifiedResult(
            `${error.code}: ${error.message}`,
            error.message,
            classifySmartApiError(error)
        );
    }
    if (error instanceof z.ZodError) {
        const detail = error.issues
            .map(
                (issue) =>
                    `${issue.path.join('.') || 'input'}: ${issue.message}`
            )
            .join('; ');
        log('tool.invalid_input', { tool });
        return classifiedResult(`ValidationError: ${detail}`, detail, {
            code: McpErrorCode.VALIDATION_ERROR,
        });
    }
    const message = error instanceof Error ? error.message : String(error);
    log('tool.unexpected_error', { tool });
    const { error_code, upstream_status, retryable } = classifyError(error);
    return classifiedResult(`Error: ${message}`, message, {
        code: error_code,
        upstreamStatus: upstream_status,
        retryable,
    });
}

/** Run a tool body, mapping any failure onto an MCP error result. */
export async function handle(
    tool: string,
    fn: () => Promise<unknown>
): Promise<ToolResult> {
    try {
        return jsonResult(await fn());
    } catch (error) {
        return errorResult(tool, error);
    }
}

/**
 * Thin wrapper over `server.tool`.
 *
 * The MCP SDK's zod generics blow TypeScript's instantiation-depth limit
 * (TS2589) as soon as a tool has more than a couple of parameters. The SDK
 * boundary is therefore crossed through `any` here, in exactly one place, so
 * every tool module keeps full type checking.
 *
 * Either `server.tool` or `server.registerTool` works: `CPMcpServer` wraps both
 * for telemetry and error handling, and both are replayed onto per-session
 * server instances under HTTP transport. This stays on `server.tool` simply
 * because that is the shape these wrappers were written against.
 */
export function registerTool<Args>(
    server: unknown,
    name: string,
    description: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shape: Record<string, any>,
    handler: (args: Args, extra: unknown) => Promise<ToolResult>,
    annotations?: Record<string, boolean>
): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyServer = server as any;
    if (annotations)
        anyServer.tool(name, description, shape, annotations, handler);
    else anyServer.tool(name, description, shape, handler);
}

/** One user message, the shape an MCP prompt handler returns. */
export function promptMessage(text: string): {
    messages: { role: 'user'; content: { type: 'text'; text: string } }[];
} {
    return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

/**
 * Thin wrappers over `server.prompt` and `server.resource`, crossing the SDK's
 * generic boundary through `any` for the same reason `registerTool` does.
 *
 * As with tools, either method name works — `CPMcpServer` wraps and replays
 * both families. These stay on the older names to match the wrappers' shape.
 */
export function registerPrompt(
    server: unknown,
    name: string,
    description: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    argsSchema: Record<string, any> | null,
    handler: (
        args: Record<string, string | undefined>
    ) => ReturnType<typeof promptMessage>
): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyServer = server as any;
    if (argsSchema) anyServer.prompt(name, description, argsSchema, handler);
    else anyServer.prompt(name, description, () => handler({}));
}

export function registerResource(
    server: unknown,
    name: string,
    uri: string,
    metadata: { description: string; mimeType: string },
    read: () => unknown
): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).resource(name, uri, metadata, (resourceUri: URL) => ({
        contents: [
            {
                uri: resourceUri.href,
                mimeType: metadata.mimeType,
                text: JSON.stringify(read()),
            },
        ],
    }));
}
