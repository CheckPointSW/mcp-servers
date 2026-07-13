/**
 * AUTO-GENERATED FILE — DO NOT EDIT
 *
 * Generated from specs/openapi-mcp.json by scripts/generate-tools.ts
 * Run: npm run generate-tools
 *
 * Set of tool names whose OpenAPI operation is marked `x-access-mode: "write"`.
 * The server gates these behind WRITE_MODE via the MCP tool policy
 * (see src/index.ts) — replacing the old runtime spec read in tool-filter.ts.
 */

export const WRITE_TOOLS: Set<string> = new Set([
  'set_rule_info',
  'set_rule_active',
  'reorder_rule',
  'delete_rule',
  'create_chats_rule',
  'create_ai_access_rule',
  'create_agents_rule',
  'create_dlp_rule',
  'create_secure_browsing_rule',
  'set_chats_policy',
  'patch_chats_policy',
  'set_access_policy',
  'patch_access_policy',
  'set_agents_policy',
  'patch_agents_policy',
  'set_secure_browsing_policy',
  'patch_secure_browsing_policy',
  'set_rule_source',
  'set_rule_objects',
  'update_file_protection_object',
  'create_file_protection_object',
  'update_domains_object',
  'create_domains_object',
  'delete_object',
]);
