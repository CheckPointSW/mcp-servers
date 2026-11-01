/** A parsed JSON value that is an object, not an array or `null`. */
export function isJsonObject(data: unknown): data is Record<string, unknown> {
    return typeof data === 'object' && data !== null && !Array.isArray(data);
}
