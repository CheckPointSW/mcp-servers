/**
 * Generate src/tools/tools.g.ts and src/tools/write-tools.g.ts from the OpenAPI spec.
 *
 * Reads x-tool-name for tool names, x-tool-description for descriptions, and
 * x-access-mode to determine which tools are write tools. Uses json-schema-to-zod
 * to produce Zod validation schemas.
 *
 * Usage:
 *   tsx scripts/generate-tools.ts
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { jsonSchemaToZod } from 'json-schema-to-zod';

const SPEC_PATH = resolve(import.meta.dirname, '..', 'specs', 'openapi-mcp.json');
const OUTPUT_PATH = resolve(import.meta.dirname, '..', 'src', 'tools', 'tools.g.ts');
const WRITE_TOOLS_PATH = resolve(import.meta.dirname, '..', 'src', 'tools', 'write-tools.g.ts');
const TOOLS_MD_PATH = resolve(import.meta.dirname, '..', 'TOOLS.md');

interface ToolEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  method: string;
  pathTemplate: string;
  executionParameters: { name: string; in: string }[];
  requestBodyContentType: string | undefined;
  securityRequirements: any[];
}

/** Resolve a single $ref pointer in the spec. */
function resolveRef(spec: any, ref: string): any {
  const parts = ref.replace(/^#\//, '').split('/');
  let current: any = spec;
  for (const p of parts) {
    current = current?.[p];
  }
  return current;
}

/** Deep-resolve all $ref pointers in an object. */
function deepResolveRefs(spec: any, obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepResolveRefs(spec, item));

  if (obj.$ref) {
    const resolved = resolveRef(spec, obj.$ref);
    return deepResolveRefs(spec, resolved);
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = deepResolveRefs(spec, value);
  }
  return result;
}

function extractTools(spec: any): ToolEntry[] {
  const tools: ToolEntry[] = [];

  for (const [path, methods] of Object.entries(spec.paths as Record<string, any>)) {
    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      if (typeof operation !== 'object' || !operation) continue;

      const toolName = operation['x-tool-name'];
      if (!toolName) {
        console.warn(`Skipping ${method.toUpperCase()} ${path} — no x-tool-name`);
        continue;
      }

      const description = (operation['x-tool-description'] ?? operation.summary ?? '') as string;

      // Build inputSchema and executionParameters from OpenAPI params
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      const executionParameters: { name: string; in: string }[] = [];

      const params = (operation.parameters ?? []) as any[];
      for (const rawParam of params) {
        const param = rawParam.$ref ? resolveRef(spec, rawParam.$ref) : rawParam;
        executionParameters.push({ name: param.name, in: param.in });
        const paramSchema = { ...(param.schema || {}) } as Record<string, unknown>;
        // Resolve any refs in param schema
        const resolvedParamSchema = deepResolveRefs(spec, paramSchema);
        if (param.description) resolvedParamSchema.description = param.description;
        properties[param.name] = resolvedParamSchema;
        if (param.required) required.push(param.name);
      }

      // Handle requestBody
      let requestBodyContentType: string | undefined;
      const requestBody = operation.requestBody as any;
      if (requestBody) {
        const jsonContent = requestBody?.content?.['application/json'];
        if (jsonContent?.schema) {
          requestBodyContentType = 'application/json';
          const bodySchema = deepResolveRefs(spec, jsonContent.schema);
          // Add requestBody as a single property containing the body schema
          properties['requestBody'] = bodySchema;
          required.push('requestBody');
        }
      }

      const inputSchema: Record<string, unknown> = {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      };

      // Extract security requirements
      const securityRequirements = operation.security ?? spec.security ?? [];

      tools.push({
        name: toolName,
        description,
        inputSchema,
        method: method.toLowerCase(),
        pathTemplate: path,
        executionParameters,
        requestBodyContentType,
        securityRequirements,
      });
    }
  }

  return tools;
}

/** Access mode ('read' | 'write') for a tool, from x-access-mode in the spec. */
function accessModeOf(spec: any, tool: ToolEntry): string {
  const operation = spec.paths?.[tool.pathTemplate]?.[tool.method];
  return (operation?.['x-access-mode'] ?? 'read') as string;
}

function generateToolsFile(tools: ToolEntry[]): string {
  const mapEntries = tools
    .map((tool) => {
      let zodCode = jsonSchemaToZod(tool.inputSchema, { target: 'zod3' });
      // Fix json-schema-to-zod bug: oneOf handler emits Zod v4 syntax even with target 'zod3'
      zodCode = zodCode
        .replace(/z\.core\.\$ZodIssue/g, 'z.ZodIssue')
        // Fix oneOf: replace invalid_union (needs unionErrors in zod3) with custom
        .replace(/code: "invalid_union",/g, 'code: "custom",')
        // Remove dangling errors property not valid in zod3
        .replace(/errors: \[errors\],\n\s*/g, '');
      return `
  [
    '${tool.name}',
    {
      name: '${tool.name}',
      description: \`${tool.description.replace(/`/g, '\\`')}\`,
      inputSchema: ${JSON.stringify(tool.inputSchema, null, 6).replace(/\n/g, '\n      ')},
      method: '${tool.method}',
      pathTemplate: '${tool.pathTemplate}',
      executionParameters: ${JSON.stringify(tool.executionParameters)},
      requestBodyContentType: ${tool.requestBodyContentType ? `'${tool.requestBodyContentType}'` : 'undefined'},
      securityRequirements: ${JSON.stringify(tool.securityRequirements)},
      zodValidationSchema: ${zodCode},
    },
  ]`;
    })
    .join(',\n');

  return `/**
 * AUTO-GENERATED FILE — DO NOT EDIT
 *
 * Generated from specs/openapi-mcp.json by scripts/generate-tools.ts
 * Run: npm run generate-tools
 */

import { z } from 'zod';

import { McpToolDefinition } from '../types/types.js';

/**
 * Map of tool definitions by name
 */
export const toolDefinitionMap: Map<string, McpToolDefinition> = new Map([${mapEntries}
]);
`;
}

function generateWriteToolsFile(writeToolNames: string[]): string {
  const entries = writeToolNames.map((n) => `  '${n}',`).join('\n');
  return `/**
 * AUTO-GENERATED FILE — DO NOT EDIT
 *
 * Generated from specs/openapi-mcp.json by scripts/generate-tools.ts
 * Run: npm run generate-tools
 *
 * Set of tool names whose OpenAPI operation is marked \`x-access-mode: "write"\`.
 * The server gates these behind WRITE_MODE via the MCP tool policy
 * (see src/index.ts) — replacing the old runtime spec read in tool-filter.ts.
 */

export const WRITE_TOOLS: Set<string> = new Set([
${entries}
]);
`;
}

function generateToolRows(spec: any, tools: ToolEntry[]): string[] {
  return tools.map((tool) => {
    const accessMode = accessModeOf(spec, tool);
    // Use only the first sentence of the description to keep the table clean
    const shortDesc = tool.description.split(/\.(\s|\n)/)[0] + '.';
    return `| \`${tool.name}\` | ${shortDesc} | ${accessMode} |`;
  });
}

function generateToolsMd(rows: string[]): string {
  return `<!-- AUTO-GENERATED FILE — DO NOT EDIT. Generated by scripts/generate-tools.ts -->

# Available Tools

| Tool | Description | Mode |
|---|---|---|
${rows.join('\n')}
`;
}

async function main() {
  console.log(`Reading spec from ${SPEC_PATH}`);
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf-8'));

  const tools = extractTools(spec);
  console.log(`Extracted ${tools.length} tools (using x-tool-name)`);

  for (const t of tools) {
    console.log(`  - ${t.name} [${t.method.toUpperCase()} ${t.pathTemplate}]`);
  }

  const content = generateToolsFile(tools);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, content, 'utf-8');
  console.log(`Wrote ${OUTPUT_PATH}`);

  // Emit the write-tool set for runtime WRITE_MODE gating (no runtime spec read).
  const writeToolNames = tools.filter((t) => accessModeOf(spec, t) === 'write').map((t) => t.name);
  writeFileSync(WRITE_TOOLS_PATH, generateWriteToolsFile(writeToolNames), 'utf-8');
  console.log(`Wrote ${WRITE_TOOLS_PATH} (${writeToolNames.length} write tools)`);

  const rows = generateToolRows(spec, tools);

  const toolsMd = generateToolsMd(rows);
  writeFileSync(TOOLS_MD_PATH, toolsMd, 'utf-8');
  console.log(`Wrote ${TOOLS_MD_PATH}`);

  // Inline tools table into README.md
  const readmePath = resolve(import.meta.dirname, '..', 'README.md');
  const readme = readFileSync(readmePath, 'utf-8');
  const startMarker =
    '<!-- AUTO-GENERATED from TOOLS.md — DO NOT EDIT manually. Generated by scripts/generate-tools.ts -->';
  const endMarker = '## Configuration Options';
  const startIdx = readme.indexOf(startMarker);
  const endIdx = readme.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    const tableBlock = `${startMarker}\n\n| Tool | Description | Mode |\n|---|---|---|\n${rows.join('\n')}\n\n`;
    const updatedReadme = readme.substring(0, startIdx) + tableBlock + readme.substring(endIdx);
    writeFileSync(readmePath, updatedReadme, 'utf-8');
    console.log(`Updated tools table in README.md`);
  }
}

main().catch((err) => {
  console.error(`Tool generation failed: ${err}`);
  process.exit(1);
});
