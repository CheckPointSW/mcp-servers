import { z } from 'zod';

/**
 * Interface for MCP Tool Definition (produced by scripts/generate-tools.ts).
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  method: string;
  pathTemplate: string;
  executionParameters: { name: string; in: string }[];
  requestBodyContentType?: string;
  securityRequirements: any[];
  zodValidationSchema: z.ZodTypeAny;
}

/**
 * Type definition for JSON objects
 */
export type JsonObject = Record<string, any>;
