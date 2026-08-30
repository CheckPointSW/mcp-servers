import type { AuthMethod } from '../../settings.js';
import { avananUrlForRegion, buildAvananProvider } from './avanan.js';
import {
    buildCloudinfraProvider,
    cloudinfraUrlForRegion,
} from './cloudinfra.js';
import type { Provider, ProviderCredentials } from './base.js';

export type { IssuedToken, Provider, ProviderCredentials } from './base.js';
export { isTokenExpiring } from './base.js';
export { avananSignature, formatAvananDate, jwtExp } from './avanan.js';

/**
 * Flow dispatch lives in these two tables, so no call site ever branches on
 * `authMethod`. A new flow is added by dropping a module next to these and
 * registering it here.
 */
const PROVIDER_BUILDERS: Record<
    AuthMethod,
    (creds: ProviderCredentials, baseUrl: string) => Provider
> = {
    cloudinfra: buildCloudinfraProvider,
    avanan: buildAvananProvider,
};

const REGION_URL_RESOLVERS: Record<AuthMethod, (region: string) => string> = {
    cloudinfra: cloudinfraUrlForRegion,
    avanan: avananUrlForRegion,
};

export function buildProvider(
    creds: ProviderCredentials,
    baseUrl: string
): Provider {
    return PROVIDER_BUILDERS[creds.authMethod](creds, baseUrl);
}

/** The gateway URL a flow uses for a region, when no base URL override is set. */
export function defaultBaseUrl(authMethod: AuthMethod, region: string): string {
    return REGION_URL_RESOLVERS[authMethod](region);
}
