import { z } from 'zod';
import { SmartApiError } from '../../core/errors.js';
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
        return {
            content: [
                { type: 'text', text: `${error.code}: ${error.message}` },
            ],
            isError: true,
        };
    }
    if (error instanceof z.ZodError) {
        const detail = error.issues
            .map(
                (issue) =>
                    `${issue.path.join('.') || 'input'}: ${issue.message}`
            )
            .join('; ');
        log('tool.invalid_input', { tool });
        return {
            content: [{ type: 'text', text: `ValidationError: ${detail}` }],
            isError: true,
        };
    }
    const message = error instanceof Error ? error.message : String(error);
    log('tool.unexpected_error', { tool });
    return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
    };
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
 * It must stay `server.tool` rather than `server.registerTool`: only the
 * former is wrapped for telemetry, and only the former is replayed onto
 * per-session server instances under HTTP transport.
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
 * As with tools, these must stay on the legacy method names: only those are
 * replayed onto per-session server instances under HTTP transport.
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
