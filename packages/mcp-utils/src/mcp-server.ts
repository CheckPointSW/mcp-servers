import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolPolicyCallback, allowAllTools } from './tool-policy.js';
import { trackToolCall } from './telemetry.js';

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
   * Apply the tool policy by checking all registered tools
   * This should be called after all tools are registered but before connecting
   */
  applyToolPolicy(): void {
    if (!this.toolPolicyCallback) {
      console.error('[CPMcpServer] No tool policy callback set, allowing all tools');
      return;
    }
    
    console.error('[CPMcpServer] Applying tool policy');
    
    // Get the dictionary of registered tools
    // @ts-ignore - accessing private _registeredTools
    const registeredTools = this._registeredTools;
    
    if (!registeredTools || typeof registeredTools !== 'object') {
      console.error('[CPMcpServer] No tools registered yet');
      return;
    }
    
    const toolNames = Object.keys(registeredTools);
    console.error(`[CPMcpServer] Found ${toolNames.length} registered tools:`, toolNames);
    
    let enabledCount = 0;
    let disabledCount = 0;
    
    // Check each tool against the policy
    for (const [toolName, tool] of Object.entries(registeredTools)) {
      const isAllowed = this.toolPolicyCallback(toolName);
      
      if (!isAllowed) {
        console.error(`[CPMcpServer] Tool '${toolName}' is NOT allowed by policy - disabling`);
        if (typeof (tool as any).disable === 'function') {
          (tool as any).disable();
          disabledCount++;
        }
      } else {
        console.error(`[CPMcpServer] Tool '${toolName}' is allowed by policy`);
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
        const extra = callbackArgs[1]; // second argument is typically 'extra' context
        
        // Track the tool call (non-blocking)
        trackToolCall(this.mcpName, toolName, this.mcpVersion, extra).catch(() => {
          // Ignore telemetry errors
        });
        
        // Execute the original callback
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
