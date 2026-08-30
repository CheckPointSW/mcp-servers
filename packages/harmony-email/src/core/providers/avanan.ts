import { createHash } from 'node:crypto';
import {
    AuthError,
    ConfigError,
    TransportError,
    UpstreamError,
} from '../errors.js';
import { log, responseDebugFields, shortDetail } from '../redact.js';
import type { IssuedToken, Provider, ProviderCredentials } from './base.js';

const V1_PREFIX = '/v1.0';
const AUTH_PATH = '/v1.0/auth';

/**
 * Avanan-flow customers route directly to the HEC dedicated API gateway.
 *
 * Keyed by gateway region, not by AWS region: QA and production farms both live
 * in us-east-1 but reach different gateways, so `qa` is a key of its own. See
 * FARM_TO_REGION in ../resolver.ts.
 */
const REGION_HOSTS: Record<string, string> = {
    'eu-west-1': 'https://smart-api-production-1-eu.avanan.net',
    'ca-central-1': 'https://smart-api-production-1-ca.avanan.net',
    'us-east-1': 'https://smart-api-production-1-us.avanan.net',
    qa: 'https://smart-api-qa-1-us.avanan.net',
};

export function avananUrlForRegion(region: string): string {
    const host = REGION_HOSTS[region];
    if (!host) {
        throw new ConfigError(
            `unsupported avanan region: "${region}"; known: ${Object.keys(REGION_HOSTS).sort().join(', ')}`
        );
    }
    return host;
}

/**
 * Compute the avanan request signature.
 *
 * Mirrors `generate_signature` in the in-house smartapi_sdk byte for byte:
 *
 *     signature = hex( sha256( base64( utf8(reqId + appId + date + [path] + secret) ) ) )
 *
 * Note the SHA-256 runs over the *base64 text*, not the raw bytes, and the
 * base64 is the standard alphabet, not the URL-safe one. `requestPath` is null
 * for the auth call and the full v1.0 path-with-query for every other request.
 */
export function avananSignature(
    reqId: string,
    appId: string,
    date: string,
    secret: string,
    requestPath: string | null
): string {
    const parts = [reqId, appId, date];
    if (requestPath !== null) parts.push(requestPath);
    parts.push(secret);
    const base64 = Buffer.from(parts.join(''), 'utf8').toString('base64');
    return createHash('sha256').update(base64, 'utf8').digest('hex');
}

/**
 * ASSUMPTION: the gateway accepts ISO 8601 UTC without a `Z` suffix, matching
 * the SDK's `datetime.utcnow().isoformat()`. JavaScript only has millisecond
 * resolution, so the microsecond field is zero-padded to keep the same shape.
 */
export function formatAvananDate(now: Date): string {
    return `${now.toISOString().replace('Z', '')}000`;
}

/**
 * Read the `exp` claim from a JWT without verifying its signature.
 *
 * We trust the issuing gateway - tampering would 401 on the next call. This
 * exists only to give the local token cache an absolute expiry.
 */
export function jwtExp(token: string): Date {
    const parts = token.split('.');
    if (parts.length < 2)
        throw new AuthError('malformed JWT (need at least header.payload)');

    const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
    let payload: unknown;
    try {
        payload = JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
    } catch {
        throw new AuthError('JWT payload is not valid base64-encoded JSON');
    }

    if (
        payload === null ||
        typeof payload !== 'object' ||
        Array.isArray(payload)
    ) {
        throw new AuthError('JWT payload is not a JSON object');
    }
    const exp = (payload as Record<string, unknown>).exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) {
        throw new AuthError('JWT payload has no numeric `exp` claim');
    }
    return new Date(exp * 1000);
}

async function authenticateAvanan(
    creds: ProviderCredentials,
    host: string,
    reqId: string,
    timeoutMs: number
): Promise<IssuedToken> {
    const date = formatAvananDate(new Date());
    const url = `${host}${AUTH_PATH}`;
    const headers = {
        'x-av-req-id': reqId,
        'x-av-app-id': creds.clientId,
        'x-av-date': date,
        'x-av-sig': avananSignature(
            reqId,
            creds.clientId,
            date,
            creds.secret,
            null
        ),
    };

    log('avanan_provider.authenticating', { host, req_id: reqId, date });

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        throw new TransportError(
            `auth transport error: ${error instanceof Error ? error.name : 'unknown'}`
        );
    }

    const body = await response.text();
    if (response.status === 401)
        throw new AuthError('invalid avanan credentials');
    if (response.status >= 400) {
        log(
            'avanan_provider.auth_failed',
            responseDebugFields(response, reqId)
        );
        // The detail rides on the error rather than the log line: it goes to
        // the caller who asked, not to a file the tenant never sees.
        throw new UpstreamError(
            `auth returned HTTP ${response.status}: ${shortDetail(body)}`
        );
    }

    const jwt = body.trim();
    if (!jwt) throw new AuthError('auth response empty');

    const expiresAt = jwtExp(jwt);
    log('avanan_provider.authenticated', {
        expires_at: expiresAt.toISOString(),
    });
    return { value: jwt, expiresAt };
}

/** Bind an avanan Provider to a host and a set of credentials. */
export function buildAvananProvider(
    creds: ProviderCredentials,
    baseUrl: string
): Provider {
    const host = baseUrl.replace(/\/+$/, '');

    return {
        authMethod: 'avanan',
        baseUrl: host,
        v1Prefix: V1_PREFIX,

        authenticate: (reqId, timeoutMs) =>
            authenticateAvanan(creds, host, reqId, timeoutMs),

        sign(headers, now, pathWithQuery) {
            const date = formatAvananDate(now);
            const reqId = headers.get('x-av-req-id') ?? '';
            headers.set('x-av-app-id', creds.clientId);
            headers.set('x-av-date', date);
            headers.set(
                'x-av-sig',
                avananSignature(
                    reqId,
                    creds.clientId,
                    date,
                    creds.secret,
                    pathWithQuery
                )
            );
        },

        attachToken(headers, token) {
            headers.set('x-av-token', token.value);
        },
    };
}
