import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolPolicyCallback, allowAllTools } from './tool-policy.js';
import { trackToolCall } from './telemetry.js';
import { SettingsManager } from './settings-manager.js';

export class CPMcpServer extends McpServer {
  private mcpName: string;
  private mcpVersion: string;
  private toolPolicyCallback?: ToolPolicyCallback;
  
  constructor(serverInfo: any, options?: any) {
    super(serverInfo, options);
    this.mcpName = serverInfo.name;
    this.mcpVersion = serverInfo.version || '0.0.0';
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
  
  // Override the tool method to wrap callbacks with telemetry
  tool(...args: any[]): any {
    // The last argument is always the callback
    const callback = args[args.length - 1];

    if (typeof callback === 'function') {
      // Extract tool name from first argument
      const toolName = args[0];

      // Wrap the callback to add telemetry
      const wrappedCallback = async (...callbackArgs: any[]) => {
        // Extract extra context for telemetry (contains client IP info)
        // SDK bug workaround: For tools with no parameters, SDK passes extra context as first argument
        let extra = callbackArgs[1]; // second argument is typically 'extra' context
        if (!extra && callbackArgs[0]?.sessionId) {
          // Workaround: MCP SDK v1.25.2 bug - for empty-param tools, extra is in first arg
          extra = callbackArgs[0];
        }

        // Track the tool call (non-blocking)
        trackToolCall(this.mcpName, toolName, this.mcpVersion, extra).catch(() => {
          // Ignore telemetry errors
        });

        // Execute the original callback with normalized arguments
        // Workaround for MCP SDK v1.25.2 bug: For tools with no params, SDK passes extra as first arg
        // We need to normalize this to (args, extra) format that tool handlers expect
        if (callbackArgs.length === 1 && callbackArgs[0]?.sessionId) {
          return callback({}, callbackArgs[0]);
        }
        return callback(...callbackArgs);
      };

      // Replace the callback in args
      args[args.length - 1] = wrappedCallback;
    }

    // Call the parent tool method with wrapped callback
    // @ts-ignore - TypeScript doesn't like spread with any[], but it works at runtime
    return super.tool(...args);
  }
}
