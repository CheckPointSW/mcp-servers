export function buildAlertFilters(
    severities?: string[],
    statuses?: string[],
    types?: string[],
    fromCreatedDate?: string,
    toCreatedDate?: string,
    environments?: string[] | null
): Record<string, unknown> {
    const filters: Record<string, unknown> = {};

    if (severities && severities.length > 0) {
        filters.severity = severities;
    }
    if (statuses && statuses.length > 0) {
        filters.status = statuses;
    }
    if (types && types.length > 0) {
        filters.type = types;
    }

    if (fromCreatedDate || toCreatedDate) {
        const created_date: Record<string, string> = {};
        if (fromCreatedDate) {
            created_date.from = fromCreatedDate;
        }
        if (toCreatedDate) {
            created_date.to = toCreatedDate;
        } else if (fromCreatedDate) {
            created_date.to = new Date().toISOString().split('T')[0];
        }
        filters.created_date = created_date;
    }

    if (environments && environments.length > 0) {
        filters.environments = environments;
    }

    return filters;
}
