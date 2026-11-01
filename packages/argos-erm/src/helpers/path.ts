import { McpErrorCode, McpToolError } from '@chkp/mcp-utils';

/**
 * A value made safe to place in one segment of a request path.
 *
 * Encoding keeps a value from adding segments or a query of its own, and the
 * dot segments, which encoding leaves as they are, are rejected: URL
 * resolution would otherwise turn them into a different endpoint.
 */
export function pathSegment(value: string | number): string {
    const text = String(value);
    if (text === '' || text === '.' || text === '..') {
        throw new McpToolError(
            McpErrorCode.VALIDATION_ERROR,
            `Invalid identifier: '${text}'`
        );
    }
    return encodeURIComponent(text);
}
