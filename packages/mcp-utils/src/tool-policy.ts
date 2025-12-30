/**
 * Tool Policy Infrastructure
 * 
 * Provides reusable infrastructure for filtering MCP tools based on custom policies.
 * Any MCP server can use this to control which tools are visible via listTools.
 */

/**
 * Callback function to determine if a tool should be visible
 * @param toolName - The name of the tool to check
 * @returns true if the tool should be visible, false otherwise
 */
export type ToolPolicyCallback = (toolName: string) => boolean;

/**
 * Default policy callback that allows all tools
 */
export const allowAllTools: ToolPolicyCallback = () => true;
