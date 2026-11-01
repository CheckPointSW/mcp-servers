import { classifyError, McpErrorCode } from '@chkp/mcp-utils';

/**
 * A failure for one item of a multi-item lookup, reported beside the other
 * items' results. It carries the same code, upstream status and message a
 * tool-level failure would, so a failed request that was retried still shows
 * what upstream said.
 */
export function itemError(error: unknown): {
    error: string;
    error_code: McpErrorCode;
    upstream_status?: number;
} {
    const { error_code, error_message, upstream_status } = classifyError(error);
    return {
        error: error_message,
        error_code,
        ...(upstream_status !== undefined ? { upstream_status } : {}),
    };
}

/**
 * Whether a failure applies to the whole request rather than to one item: the
 * credentials were rejected, so every other item would fail the same way. A
 * permission failure is an item's own, since entitlements can differ per
 * endpoint (an IOC's type is part of its path).
 */
export function isRequestWide(error: unknown): boolean {
    return classifyError(error).error_code === McpErrorCode.AUTH_FAILED;
}
