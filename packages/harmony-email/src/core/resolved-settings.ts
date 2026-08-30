import { ConfigError } from './errors.js';
import { regionForFarm, resolveDomain } from './resolver.js';
import {
    buildProvider,
    defaultBaseUrl,
    type Provider,
} from './providers/index.js';
import type { AuthMethod, Settings } from '../settings.js';

/**
 * What the API client actually needs: a concrete region, tenant scope and
 * gateway, plus a provider bound to the tenant's credentials.
 *
 * `Settings` is what the user supplies; this is what it resolves to. Producing
 * it may require DNS, so it is built lazily on the first upstream call.
 */
export interface ResolvedSettings {
    domain: string;
    authMethod: AuthMethod;
    region: string;
    scope: string;
    baseUrl: string;
    provider: Provider;
}

/**
 * Resolve user settings into everything the client needs.
 *
 * auth-method precedence: the explicit setting, else the TLD the domain
 * resolves to. The gateway is always derived from the flow and the region,
 * never supplied by the caller. When region, scope and auth method are all
 * known up front, DNS is skipped entirely.
 */
export async function resolveSettings(
    settings: Settings
): Promise<ResolvedSettings> {
    const { region, scope, authMethod: explicitAuth } = settings;
    // Grouped rather than tested three times: this is the one combination that
    // fully determines the gateway without DNS, and it narrows the types.
    const explicit =
        region && scope && explicitAuth
            ? { region, scope, authMethod: explicitAuth }
            : null;

    if (!settings.domain && !explicit) {
        throw new ConfigError(
            'missing tenant domain: set --hec-domain / HEC_DOMAIN, or supply region, scope and auth method explicitly'
        );
    }
    if (!settings.clientId || !settings.secret) {
        throw new ConfigError(
            'missing API credentials: set --hec-client-id / HEC_CLIENT_ID and --hec-secret / HEC_SECRET'
        );
    }

    if (explicit) {
        return finalize(
            settings,
            explicit.authMethod,
            explicit.region,
            explicit.scope,
            defaultBaseUrl(explicit.authMethod, explicit.region)
        );
    }

    const resolved = await resolveDomain(settings.domain);
    const authMethod = explicitAuth ?? resolved.authMethod;
    const resolvedRegion = region || regionForFarm(resolved.farm);
    const resolvedScope = scope || `${resolved.farm}:${resolved.customer}`;

    return finalize(
        settings,
        authMethod,
        resolvedRegion,
        resolvedScope,
        defaultBaseUrl(authMethod, resolvedRegion)
    );
}

function finalize(
    settings: Settings,
    authMethod: AuthMethod,
    region: string,
    scope: string,
    baseUrl: string
): ResolvedSettings {
    const provider = buildProvider(
        { authMethod, clientId: settings.clientId, secret: settings.secret },
        baseUrl
    );
    return {
        domain: settings.domain,
        authMethod,
        region,
        scope,
        baseUrl,
        provider,
    };
}
