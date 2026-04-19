import { getCustomers } from '../session.js';

export function hasMixedRegions(): boolean {
    return new Set(getCustomers().map((c) => c.region)).size > 1;
}

export function allRegions(): string[] {
    const seen: string[] = [];
    for (const c of getCustomers()) {
        if (!seen.includes(c.region)) seen.push(c.region);
    }
    return seen;
}

export function customerIdsForRegion(region: string): string[] {
    return getCustomers()
        .filter((c) => c.region === region)
        .map((c) => c.display_name);
}

export function customerRegion(customerId: string): string | null {
    return (
        getCustomers().find((c) => c.customer_id === customerId)?.region ?? null
    );
}

export function findCustomerDisplayName(customerId: string): string {
    return (
        getCustomers().find((c) => c.customer_id === customerId)
            ?.display_name ?? customerId
    );
}
