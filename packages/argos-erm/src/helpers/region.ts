import { getCustomers } from '../session.js';

export function hasMixedRegions(extra?: unknown): boolean {
    return new Set(getCustomers(extra).map((c) => c.region)).size > 1;
}

export function allRegions(extra?: unknown): string[] {
    const seen: string[] = [];
    for (const c of getCustomers(extra)) {
        if (!seen.includes(c.region)) seen.push(c.region);
    }
    return seen;
}

export function customerIdsForRegion(
    region: string,
    extra?: unknown
): string[] {
    return getCustomers(extra)
        .filter((c) => c.region === region)
        .map((c) => c.display_name);
}

export function customerRegion(
    customerId: string,
    extra?: unknown
): string | null {
    return (
        getCustomers(extra).find((c) => c.customer_id === customerId)?.region ??
        null
    );
}

export function findCustomerDisplayName(
    customerId: string,
    extra?: unknown
): string {
    return (
        getCustomers(extra).find((c) => c.customer_id === customerId)
            ?.display_name ?? customerId
    );
}
