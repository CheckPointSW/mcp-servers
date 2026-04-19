export function normalizeMetadata(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === 'object' && raw !== null) {
        return Object.values(
            raw as Record<string, Record<string, unknown>>
        ).flatMap((category) => {
            if (
                typeof category === 'object' &&
                category !== null &&
                !Array.isArray(category)
            ) {
                return Object.keys(category);
            }
            return [];
        });
    }
    return [];
}
