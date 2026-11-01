import { McpErrorCode, McpToolError } from './errors.js';

// Apply before tool-schema validation: an unbounded array can still produce an
// issue for every element in Zod 4.6.7. Also bound nesting and total input work.
export const MAX_INPUT_COLLECTION_SIZE = 10_000;
export const MAX_INPUT_VALUES = 100_000;
export const MAX_INPUT_DEPTH = 64;

export function assertInputLimits(input: unknown): void {
  let remaining = MAX_INPUT_VALUES;

  function visit(value: unknown, depth: number): void {
    if (--remaining < 0) {
      throw new McpToolError(McpErrorCode.VALIDATION_ERROR, `Input exceeds ${MAX_INPUT_VALUES} values`);
    }
    if (depth > MAX_INPUT_DEPTH) {
      throw new McpToolError(McpErrorCode.VALIDATION_ERROR, `Input exceeds ${MAX_INPUT_DEPTH} nesting levels`);
    }
    if (value === null || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      if (value.length > MAX_INPUT_COLLECTION_SIZE) {
        throw new McpToolError(McpErrorCode.VALIDATION_ERROR, `Input array exceeds ${MAX_INPUT_COLLECTION_SIZE} items`);
      }
      for (const item of value) visit(item, depth + 1);
    } else {
      let keys = 0;
      for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (++keys > MAX_INPUT_COLLECTION_SIZE) {
          throw new McpToolError(McpErrorCode.VALIDATION_ERROR, `Input object exceeds ${MAX_INPUT_COLLECTION_SIZE} properties`);
        }
        visit((value as Record<string, unknown>)[key], depth + 1);
      }
    }
  }

  visit(input, 0);
}
