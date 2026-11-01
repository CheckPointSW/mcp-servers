import type { ArgosERMAPIManager } from '../client.js';
import { itemError } from './item-error.js';
import { readJsonObject } from './response.js';

export function enrichAlertsWithIocFlag(data: Record<string, unknown>): void {
    const alerts = (data.alerts ?? []) as Record<string, unknown>[];
    for (const alert of alerts) {
        if (typeof alert === 'object' && alert !== null) {
            const indicators = alert.indicators as unknown[] | undefined;
            alert.has_iocs = Boolean(indicators?.length);
        }
    }
}

export async function enrichAssetsWithTechnologies(
    assetsData: Record<string, unknown>,
    customerId: string,
    apiManager: ArgosERMAPIManager,
    apiBase: string
): Promise<void> {
    const assets = assetsData.assets as Record<string, unknown>[] | undefined;
    if (!assets?.length) return;

    const assetIds = assets
        .map((a) => a.id)
        .filter(
            (id): id is string | number =>
                typeof id === 'string' || typeof id === 'number'
        );
    if (!assetIds.length) return;

    const techPayload = {
        customer_id: customerId,
        asset_ids: assetIds,
        pagination: { page_number: 1, page_size: 100 },
        sort: [
            { sort_field: 'score', sort_order: 'desc' },
            { sort_field: 'cve_count', sort_order: 'desc' },
            {
                sort_field: 'technology_status',
                sort_order: 'asc',
            },
            {
                sort_field: 'technology_name',
                sort_order: 'asc',
            },
        ],
    };

    // Technologies are optional detail on assets that were already retrieved, so
    // a failure is recorded beside them rather than failing the call.
    let assetsTechnologies: Record<string, unknown>;
    try {
        const techResponse = await apiManager.post(
            `${apiBase}/assets/technologies`,
            techPayload
        );
        const techData = await readJsonObject(techResponse);
        assetsTechnologies = techData.assets_technologies ?? {};
    } catch (e) {
        assetsData._technologies_error = itemError(e);
        return;
    }

    for (const asset of assets) {
        const id = asset.id;
        if (
            (typeof id === 'string' || typeof id === 'number') &&
            String(id) in assetsTechnologies
        ) {
            asset.technologies = assetsTechnologies[String(id)];
        }
    }
}
