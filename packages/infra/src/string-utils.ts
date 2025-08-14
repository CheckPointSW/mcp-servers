// Utility for string checks
export function nullOrEmpty(val?: string): boolean {
  return (
    val === undefined ||
    val === null ||
    (typeof val === 'string' && (val.trim() === '' || val === 'undefined' || val === 'null'))
  );
}

/**
 * Sanitize data by converting underscores to hyphens and filtering out null/empty values
 * @param kwargs - The data object to sanitize
 * @returns The sanitized data object
 */
export function sanitizeData(kwargs: Record<string, any>) {

    const data: Record<string, any> = {};

    for (const [key, value] of Object.entries(kwargs)) {
        // Skip null, undefined, empty strings, and empty arrays
        if (value === null || value === undefined || value === "" ||
            (Array.isArray(value) && value.length === 0)) {
            continue;
        }

        const safeKey = key.replace(/_/g, "-");
        data[safeKey] = value;
    }
    return data;
}