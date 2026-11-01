import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ToolPolicyCallback, allowAllTools } from './tool-policy.js';
import { trackToolCall, ToolOutcome } from './telemetry.js';
import { SettingsManager } from './settings-manager.js';
import { assertInputLimits } from './input-limits.js';
import {
  classifyError,
  looksLikeUnflaggedError,
  McpErrorCode,
  McpToolError,
  normalizeToolResult,
  toolErrorFrom,
} from './errors.js';

/**
 * One log line for a failed tool, prompt or resource call: its code and the
 * upstream status. The message is not logged, since it can carry what upstream
 * said about a customer's own objects; the caller receives it in the result.
 *
 * An unclassified thrown failure, most likely a defect in this server, also gets
 * its error name and stack frames. The frames are code locations only: the
 * stack's leading message line is left out for the same reason as the message.
 * The error itself is never passed as an object, since `util.inspect` would walk
 * its properties and cause chain, which for an HTTP client error reach the
 * request body - login credentials included.
 */
function failureLogLine(
  subject: string,
  payload: { error_code?: unknown; upstream_status?: unknown },
  error?: unknown
): string {
  const status = typeof payload.upstream_status === 'number' ? ` (HTTP ${payload.upstream_status})` : '';
  let line = `[CPMcpServer] ${subject} failed with ${String(payload.error_code)}${status}`;
  if (payload.error_code === McpErrorCode.INTERNAL && error instanceof Error) {
    const frames = (error.stack ?? '').split('\n').filter((frame) => /^\s+at /.test(frame));
    line += ` (${error.name})${frames.length ? `\n${frames.join('\n')}` : ''}`;
  }
  return line;
}

/**
 * When set, log a warning for results that are not flagged as errors but look
 * like one. Opt-in because the detection is a heuristic; it is a development aid
 * for spotting handlers that describe a failure in text without flagging it.
 */
function strictErrorsEnabled(): boolean {
  return process.env.CP_MCP_STRICT_ERRORS === 'true' || process.env.CP_MCP_STRICT_ERRORS === '1';
}

/**
 * The server instance handling each in-flight tool call, keyed by the call's
 * request context. Under HTTP transport every session is served by its own
 * instance, while a handler's closure holds only the instance its tools were
 * registered on.
 */
const requestServers = new WeakMap<object, McpServer>();

/**
 * The server handling the tool call whose request context is `extra`.
 *
 * Use it for server-to-client requests made from inside a tool: the instance
 * it returns is connected to the caller's session and knows that client's
 * capabilities. Pass the call's request id and signal as well, so the request
 * travels on the tool call's own response stream and is cancelled with it:
 *
 *     getRequestServer(extra)?.server.elicitInput(params, {
 *       relatedRequestId: extra.requestId,
 *       signal: extra.signal,
 *     });
 *
 * The instance is found by the identity of `extra`, so pass the object the
 * handler received, not a copy. Undefined outside a tool call made through
 * `CPMcpServer`.
 */
export function getRequestServer(extra: unknown): McpServer | undefined {
  return extra !== null && typeof extra === 'object' ? requestServers.get(extra) : undefined;
}

export class CPMcpServer extends McpServer {
  private mcpName: string;
  private mcpVersion: string;
  private toolPolicyCallback?: ToolPolicyCallback;
  
  constructor(serverInfo: any, options?: any) {
    super(serverInfo, options);
    this.mcpName = serverInfo.name;
    this.mcpVersion = serverInfo.version || '0.0.0';

    // Wrap the public protocol registration API, before the SDK's tool handler
    // validates arguments. Every session instance installs the same guard, for
    // both registration APIs and both stdio and HTTP transports.
    const setRequestHandler = this.server.setRequestHandler.bind(this.server);
    this.server.setRequestHandler = (schema, handler) => {
      setRequestHandler(schema, (request, extra) => {
        const toolName = request.method === 'tools/call'
          ? (request.params as { name: string }).name
          : undefined;
        if (toolName !== undefined && !this.isEnabledTool(toolName)) {
          // The SDK rejects unknown/disabled tools before parsing arguments.
          // Preserve that path without logging or reporting a client-supplied name.
          return handler(request, extra);
        }
        try {
          assertInputLimits(request.params);
        } catch (error) {
          if (toolName !== undefined) return this.toolFailure(toolName, error, extra);
          if (error instanceof McpToolError && error.code === McpErrorCode.VALIDATION_ERROR) {
            throw new McpError(ErrorCode.InvalidParams, error.message);
          }
          throw error;
        }
        return handler(request, extra);
      });
    };
  }

  private isEnabledTool(name: string): boolean {
    // Match the SDK's live registry, including removals and policy changes.
    // As in applyToolPolicy, this reads the SDK's private map.
    // @ts-expect-error - the SDK registry is private
    const tools = this._registeredTools;
    return Object.prototype.hasOwnProperty.call(tools, name) && tools[name].enabled === true;
  }

  private toolFailure(toolName: string, error: unknown, extra: unknown) {
    const payload = classifyError(error);
    console.error(failureLogLine(`Tool '${toolName}'`, payload, error));
    trackToolCall(this.mcpName, toolName, this.mcpVersion, extra, {
      outcome: 'error',
      errorCode: payload.error_code,
      upstreamStatus: payload.upstream_status,
    }).catch(() => {});
    const result = toolErrorFrom(error);
    return { ...result, structuredContent: { ...result.structuredContent } };
  }
  
  /**
   * Set a tool policy callback to filter which tools are available
   * This should be called after all tools are registered but before connecting
   * @param callback Function that returns true if a tool should be enabled
   */
  setToolPolicy(callback: ToolPolicyCallback): void {
    console.error('[CPMcpServer] Setting tool policy callback');
    this.toolPolicyCallback = callback;
  }

  /**
   * Get the tool policy callback, if one was set.
   *
   * Needed so the policy can be carried onto the per-session server instances
   * created for HTTP transport. A typed accessor keeps that transfer honest:
   * callers do not have to reach into the private field, where a misspelling
   * would go unnoticed by the compiler.
   */
  getToolPolicy(): ToolPolicyCallback | undefined {
    return this.toolPolicyCallback;
  }

  /**
   * Apply the tool policy by checking all registered tools
   * This should be called after all tools are registered but before connecting
   *
   * Per-tool tracing is behind the debug flag. This used to run once per process
   * on the template server, where a line per tool was a cheap startup banner.
   * It now also runs per session under HTTP transport, so unconditional tracing
   * would scale stderr with sessions x tools and bury the summary. The summary
   * line always prints — it is the fact worth having for every session.
   */
  applyToolPolicy(): void {
    const verbose = SettingsManager.globalDebugState === true
      || SettingsManager.globalDebugState === 'true';

    if (!this.toolPolicyCallback) {
      if (verbose) {
        console.error('[CPMcpServer] No tool policy callback set, allowing all tools');
      }
      return;
    }

    // Get the dictionary of registered tools
    // @ts-ignore - accessing private _registeredTools
    const registeredTools = this._registeredTools;

    if (!registeredTools || typeof registeredTools !== 'object') {
      console.error('[CPMcpServer] No tools registered yet');
      return;
    }

    const toolNames = Object.keys(registeredTools);
    if (verbose) {
      console.error(`[CPMcpServer] Applying tool policy`);
      console.error(`[CPMcpServer] Found ${toolNames.length} registered tools:`, toolNames);
    }

    let enabledCount = 0;
    let disabledCount = 0;

    // Check each tool against the policy
    for (const [toolName, tool] of Object.entries(registeredTools)) {
      const isAllowed = this.toolPolicyCallback(toolName);

      if (!isAllowed) {
        if (verbose) {
          console.error(`[CPMcpServer] Tool '${toolName}' is NOT allowed by policy - disabling`);
        }
        if (typeof (tool as any).disable === 'function') {
          (tool as any).disable();
          disabledCount++;
        }
      } else {
        if (verbose) {
          console.error(`[CPMcpServer] Tool '${toolName}' is allowed by policy`);
        }
        enabledCount++;
      }
    }

    console.error(`[CPMcpServer] Policy applied: ${enabledCount}/${toolNames.length} tools enabled, ${disabledCount} disabled`);
  }
  
  /**
   * Wrap a tool callback with telemetry and error handling.
   *
   * This is the single place where tool failures are turned into a
   * spec-compliant result, for every tool in every package. It covers both
   * directions:
   *
   *  - what a handler THROWS becomes an `isError` result carrying a stable
   *    `error_code`, so nothing escapes as an unflagged failure and no handler
   *    needs its own try/catch to keep the connection alive;
   *  - what a handler RETURNS is normalized, so results built by a package's
   *    own error helper reach callers on the shared shape without that package
   *    having to adopt this module directly.
   *
   * Either way the true outcome is reported to telemetry from here, which is
   * what lets failed calls be distinguished from successful ones downstream.
   */
  private wrapToolCallback(
    toolName: string,
    callback: Function,
    { legacyArguments }: { legacyArguments: boolean }
  ): Function {
    return async (...callbackArgs: any[]) => {
      // The SDK always passes the request context ("extra") last: as
      // (args, extra) for a tool with an input schema, and as (extra) alone for
      // one without.
      const extra = callbackArgs[callbackArgs.length - 1];
      if (extra !== null && typeof extra === 'object') requestServers.set(extra, this);

      // Handlers registered through the older tool() method are written as
      // (args, extra) even when the tool has no parameters, so a lone extra is
      // shifted into second place for them (originally a workaround for MCP SDK
      // v1.25.2). Handlers registered through registerTool() follow the SDK's
      // documented signature, (extra) for a tool without an input schema, and
      // receive exactly what the SDK passes.
      const normalizedArgs =
        legacyArguments && callbackArgs.length === 1 && callbackArgs[0]?.sessionId
          ? [{}, callbackArgs[0]]
          : callbackArgs;

      // One telemetry report per call, sent once the outcome is known, so a
      // single event carries both the invocation and how it ended.
      const report = (outcome: ToolOutcome) => {
        trackToolCall(this.mcpName, toolName, this.mcpVersion, extra, outcome).catch(() => {
          // Ignore telemetry errors
        });
      };

      try {
        const result = normalizeToolResult(await callback(...normalizedArgs));
        const errorPayload =
          result && typeof result === 'object' && (result as any).isError === true
            ? ((result as any).structuredContent ?? {})
            : undefined;

        if (errorPayload) {
          // Logged here as a thrown failure is below, so a failure is logged
          // once whichever way the handler reported it.
          console.error(failureLogLine(`Tool '${toolName}'`, errorPayload));
          report({
            outcome: 'error',
            errorCode: errorPayload.error_code,
            upstreamStatus: errorPayload.upstream_status,
          });
        } else {
          if (strictErrorsEnabled() && looksLikeUnflaggedError(result)) {
            console.error(
              `[CPMcpServer] Tool '${toolName}' returned an error-shaped result without ` +
                `isError. It should throw, or return toolError(), so callers and telemetry ` +
                `can tell the call failed.`
            );
          }
          report({ outcome: 'success' });
        }

        return result;
      } catch (error) {
        // A URL elicitation request is a protocol flow, not a failure: the SDK
        // returns it to the client as a JSON-RPC error so the client can start
        // the elicitation, and so does this wrapper. No outcome is reported,
        // since the call has not finished.
        if (error instanceof McpError && error.code === ErrorCode.UrlElicitationRequired) {
          trackToolCall(this.mcpName, toolName, this.mcpVersion, extra).catch(() => {});
          throw error;
        }

        return this.toolFailure(toolName, error, extra);
      }
    };
  }

  /**
   * Wrap a prompt or resource callback.
   *
   * `GetPromptResult` and `ReadResourceResult` have no `isError` field — that
   * mechanism is specific to tool results — so a failure here belongs at the
   * protocol level instead, as a JSON-RPC error.
   *
   * A JSON-RPC error carries only a numeric `code`, a `message` and optional
   * `data`; the SDK replaces any non-numeric code with -32603 and drops every
   * other property. So the failure is re-thrown as an SDK `McpError` whose
   * `data` is the same payload a tool failure puts in `structuredContent`, and a
   * client reads `error_code` from `error.data` exactly as it would from a tool
   * result. An `McpError` the handler threw itself is passed through unchanged.
   */
  private wrapNonToolCallback(kind: 'prompt' | 'resource', name: string, callback: Function): Function {
    return async (...callbackArgs: any[]) => {
      try {
        return await callback(...callbackArgs);
      } catch (error) {
        const payload = classifyError(error);
        console.error(failureLogLine(`${kind} '${name}'`, payload, error));

        if (error instanceof McpError) throw error;
        // The original error is not attached: the client does not need it, and
        // carrying it would let anything that logs this error print it whole.
        const message = `${payload.error_code}: ${payload.error_message}`;
        const protocolError = new McpError(
          payload.error_code === McpErrorCode.VALIDATION_ERROR
            ? ErrorCode.InvalidParams
            : ErrorCode.InternalError,
          message,
          payload
        );
        // McpError writes "MCP error <code>: " into its own message, and the SDK's
        // client adds that prefix again when it rebuilds the error. The wire
        // message is set to the same "CODE: message" text a tool failure carries,
        // so a client that shows only the message still sees the code.
        protocolError.message = message;
        throw protocolError;
      }
    };
  }

  // Registration entry points come in two flavours: the current
  // `registerTool`/`registerPrompt`/`registerResource` API, and the older
  // `tool`/`prompt`/`resource` methods the SDK now marks deprecated. Packages in
  // this repo use both, and the newer ones do not delegate to the older ones, so
  // each has to be wrapped for its handlers to get telemetry and error handling.
  // In every one of these signatures the callback is the last argument and the
  // name is the first, so the wrapping is identical across them.

  // Override the tool method to wrap callbacks with telemetry and error handling
  tool(...args: any[]): any {
    // The last argument is always the callback
    const callback = args[args.length - 1];

    if (typeof callback === 'function') {
      // Extract tool name from first argument
      const toolName = args[0];
      args[args.length - 1] = this.wrapToolCallback(toolName, callback, { legacyArguments: true });
    }

    // Call the parent tool method with wrapped callback
    // @ts-ignore - TypeScript doesn't like spread with any[], but it works at runtime
    return super.tool(...args);
  }

  // Override prompt so prompt handlers cannot fail silently either
  prompt(...args: any[]): any {
    const callback = args[args.length - 1];

    if (typeof callback === 'function') {
      args[args.length - 1] = this.wrapNonToolCallback('prompt', args[0], callback);
    }

    // @ts-ignore - TypeScript doesn't like spread with any[], but it works at runtime
    return super.prompt(...args);
  }

  // Override resource so resource reads cannot fail silently either
  resource(...args: any[]): any {
    const callback = args[args.length - 1];

    if (typeof callback === 'function') {
      args[args.length - 1] = this.wrapNonToolCallback('resource', args[0], callback);
    }

    // @ts-ignore - TypeScript doesn't like spread with any[], but it works at runtime
    return super.resource(...args);
  }

  // Override registerTool — the current equivalent of tool()
  registerTool(...args: any[]): any {
    const callback = args[args.length - 1];

    if (typeof callback === 'function') {
      args[args.length - 1] = this.wrapToolCallback(args[0], callback, { legacyArguments: false });
    }

    // @ts-ignore - TypeScript doesn't like spread with any[], but it works at runtime
    return super.registerTool(...args);
  }

  // Override registerPrompt — the current equivalent of prompt()
  registerPrompt(...args: any[]): any {
    const callback = args[args.length - 1];

    if (typeof callback === 'function') {
      args[args.length - 1] = this.wrapNonToolCallback('prompt', args[0], callback);
    }

    // @ts-ignore - TypeScript doesn't like spread with any[], but it works at runtime
    return super.registerPrompt(...args);
  }

  // Override registerResource — the current equivalent of resource()
  registerResource(...args: any[]): any {
    const callback = args[args.length - 1];

    if (typeof callback === 'function') {
      args[args.length - 1] = this.wrapNonToolCallback('resource', args[0], callback);
    }

    // @ts-ignore - TypeScript doesn't like spread with any[], but it works at runtime
    return super.registerResource(...args);
  }
}
