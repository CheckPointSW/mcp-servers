import { McpErrorCode, McpToolError } from '@chkp/mcp-utils';
import { isJsonObject } from './json.js';

const INVALID_RESPONSE = 'Invalid response format from the Argos API';

/**
 * Parse a successful Argos response, requiring a JSON object or array.
 *
 * A body that is not JSON - an HTML page from a proxy in front of the API,
 * for one - or that is a bare `null` or scalar is the upstream's failure, so
 * it is reported as UPSTREAM_ERROR rather than returned as data or left to
 * fail later as a defect in this server.
 */
// Typed as `Response.json()` is, so call sites read the result as before.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(response: Response): Promise<any> {
    let data: unknown;
    try {
        data = await response.json();
    } catch (error) {
        throw new McpToolError(McpErrorCode.UPSTREAM_ERROR, INVALID_RESPONSE, {
            cause: error,
        });
    }
    if (!isJsonObject(data) && !Array.isArray(data)) {
        throw new McpToolError(McpErrorCode.UPSTREAM_ERROR, INVALID_RESPONSE);
    }
    return data;
}

/** Parse a successful Argos response, requiring a JSON object. */
// Typed as `Response.json()` is, so call sites read the result as before.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonObject(response: Response): Promise<any> {
    const data: unknown = await readJson(response);
    assertJsonObject(data);
    return data;
}

/** Parse a response body already read as text, requiring a JSON object. */
// Typed as `JSON.parse` is, for the same reason.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJsonObject(body: string): any {
    let data: unknown;
    try {
        data = JSON.parse(body);
    } catch (error) {
        throw new McpToolError(McpErrorCode.UPSTREAM_ERROR, INVALID_RESPONSE, {
            cause: error,
        });
    }
    assertJsonObject(data);
    return data;
}

/** Check that a parsed Argos response is a JSON object, as most endpoints return. */
function assertJsonObject(data: unknown): void {
    if (!isJsonObject(data)) {
        throw new McpToolError(McpErrorCode.UPSTREAM_ERROR, INVALID_RESPONSE);
    }
}
