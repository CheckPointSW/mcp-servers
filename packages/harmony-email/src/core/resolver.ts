import { Resolver } from 'node:dns/promises';
import { ConfigError } from './errors.js';
import type { AuthMethod } from '../settings.js';

/**
 * Resolve a customer domain to (customer, farm, authMethod, tld).
 *
 * Mirrors the in-house `get_farm_cluster` helper: given a customer URL or
 * hostname, walk a fixed list of supported TLDs and query the CNAME chain for
 * `{customer}-host.{tld}`. One of the intermediate CNAME labels matches
 * `mta-(elb|incoming)` and contains the farm identifier (e.g. `mt-prod-cp-us-2`).
 * The TLD that resolves identifies the auth flow; both flows reach the same
 * HEC product through different gateways.
 */

const TLDS = ['avanan.net', 'checkpointcloudsec.com'] as const;

const AUTH_METHOD_BY_TLD: Record<string, AuthMethod> = {
    'avanan.net': 'avanan',
    'checkpointcloudsec.com': 'cloudinfra',
};

const MTA_RE = /mta-(elb|incoming)/;

/**
 * Farm -> gateway region key. Grows as farms are onboarded.
 *
 * The key is not always an AWS region. QA and production farms share AWS
 * regions but each environment has its own gateway, so `qa` is a region key of
 * its own - the same shape as the in-house `Region` enum. Keying on the AWS
 * region alone would route a QA tenant to the production gateway.
 *
 * This table is also the recognizer: `matchKnownFarm` scans CNAME records for
 * these keys, so a tenant on a farm missing here cannot be resolved at all and
 * needs the farm added in a package update.
 */
const FARM_TO_REGION: Record<string, string> = {
    'mt-prod-3': 'us-east-1',
    'mt-prod-cp-1': 'us-east-1',
    'mt-prod-cp-us-2': 'us-east-1',
    'mt-prod-av-1': 'eu-west-1',
    'mt-prod-cp-eu-1': 'eu-west-1',
    'mt-prod-cp-eu-2': 'eu-west-1',
    'mt-prod-av-ca-2': 'ca-central-1',
    'mt-prod-cp-ca-1': 'ca-central-1',
    'mt-prod-cp-au-4': 'ap-southeast-2',
    'mt-prod-cp-aps1-1': 'ap-south-1',
    'mt-prod-cp-apse1-1': 'ap-southeast-1',
    'mt-prod-cp-mec1-1': 'me-central-1',
    'mt-prod-cp-euw2-1': 'eu-west-2',
    // The in-house script lists `mt-qa-1` under both US and QA, where dict
    // order resolves it to us-east-1. It is QA only, so this diverges on
    // purpose: do not "correct" it back to match that script.
    'mt-stage-cp-3': 'qa',
    'mt-stage-3': 'qa',
    'mt-qa-1': 'qa',
};

const FARM_BOUNDARY = new Set(['-', '.']);
const MAX_CNAME_HOPS = 10;

export interface ResolvedDomain {
    customer: string;
    farm: string;
    authMethod: AuthMethod;
    tld: string;
}

/** Strip scheme, path and port; returns the bare hostname. */
function extractHost(value: string): string {
    let host = value.trim();
    if (!host) throw new ConfigError('domain is empty');
    if (host.includes('://')) host = host.split('://', 2)[1];
    return host.split('/', 1)[0].split(':', 1)[0];
}

/** The first hostname label of a customer URL or hostname. */
export function extractCustomer(value: string): string {
    return extractHost(value).split('.', 1)[0];
}

export function regionForFarm(farm: string): string {
    const region = FARM_TO_REGION[farm];
    if (!region) {
        throw new ConfigError(
            `unknown farm "${farm}"; it needs adding to FARM_TO_REGION in src/core/resolver.ts`
        );
    }
    return region;
}

/**
 * Longest-match wins, and the match must sit on a `-`/`.` boundary so
 * `mt-prod-cp-us-2` never matches inside `mt-prod-cp-us-22`.
 */
function matchKnownFarm(record: string): string | null {
    const farms = Object.keys(FARM_TO_REGION).sort(
        (a, b) => b.length - a.length
    );
    for (const farm of farms) {
        const idx = record.indexOf(farm);
        if (idx === -1) continue;
        const before = idx > 0 ? record[idx - 1] : '.';
        const end = idx + farm.length;
        const after = end < record.length ? record[end] : '.';
        if (FARM_BOUNDARY.has(before) && FARM_BOUNDARY.has(after)) return farm;
    }
    return null;
}

async function walkCnameChain(
    host: string,
    resolver: Resolver
): Promise<string[]> {
    const chain: string[] = [];
    let current = host;
    for (let hop = 0; hop < MAX_CNAME_HOPS; hop++) {
        let answer: string[];
        try {
            answer = await resolver.resolveCname(current);
        } catch {
            // NXDOMAIN, NoAnswer, timeouts: the chain simply ends here.
            break;
        }
        const target = (answer[0] ?? '').replace(/\.+$/, '');
        if (!target || target === current || chain.includes(target)) break;
        chain.push(target);
        current = target;
    }
    return chain;
}

async function queryFarm(
    customer: string,
    tld: string,
    resolver: Resolver
): Promise<string | null> {
    const chain = await walkCnameChain(`${customer}-host.${tld}`, resolver);
    for (const record of chain) {
        if (!MTA_RE.test(record)) continue;
        const farm = matchKnownFarm(record);
        if (farm !== null) return farm;
    }
    return null;
}

/** Resolve a customer domain to its farm and auth flow. */
export async function resolveDomain(
    domain: string,
    { dnsTimeoutMs = 5000 }: { dnsTimeoutMs?: number } = {}
): Promise<ResolvedDomain> {
    const customer = extractCustomer(domain);
    const resolver = new Resolver({ timeout: dnsTimeoutMs, tries: 1 });

    for (const tld of TLDS) {
        const farm = await queryFarm(customer, tld, resolver);
        if (farm !== null) {
            return { customer, farm, authMethod: AUTH_METHOD_BY_TLD[tld], tld };
        }
    }

    throw new ConfigError(
        `could not resolve farm/cluster for customer "${customer}" across ${TLDS.join(', ')}. ` +
            'Check the domain and your DNS connectivity. If the tenant is on a farm this ' +
            `build does not know (recognised: ${Object.keys(FARM_TO_REGION).join(', ')}), ` +
            'set region, scope and auth method explicitly to skip resolution entirely'
    );
}
