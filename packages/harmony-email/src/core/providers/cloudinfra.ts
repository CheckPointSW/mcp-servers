import {
    AuthError,
    ConfigError,
    TransportError,
    UpstreamError,
} from '../errors.js';
import { log, responseDebugFields, shortDetail } from '../redact.js';
import type { IssuedToken, Provider, ProviderCredentials } from './base.js';

const V1_PREFIX = '/app/hec-api/v1.0';
const AUTH_PATH = '/auth/external';

/**
 * Fallback TTL when the auth response omits `expiresIn`. The cloudinfra
 * swagger only documents `{success, data:{token}}`, but the in-house SDK reads
 * `data.expiresIn` and the docs put token lifetime at roughly 30 minutes.
 */
const FALLBACK_TOKEN_TTL_SECONDS = 1800;

/**
 * The cloudinfra flow routes through the Infinity Portal gateway. Keys cover
 * both the AWS-style region names the DNS resolver emits and the short codes
 * used in legacy configs, because a farm resolves to the former while a
 * hand-written config usually carries the latter.
 *
 * mt-prod-cp-apse1-1 (ap-southeast-1) is in FARM_TO_REGION but has no entry
 * here yet, so it fails with the unsupported-region error until its portal host
 * is confirmed. There is likewise no staging portal for the `qa` key, so a
 * CP-branded stage tenant needs one added rather than being sent to a
 * production portal.
 */
const REGION_HOSTS: Record<string, string> = {
    'us-east-1': 'https://cloudinfra-gw-us.portal.checkpoint.com',
    us: 'https://cloudinfra-gw-us.portal.checkpoint.com',
    'eu-west-1': 'https://cloudinfra-gw.portal.checkpoint.com',
    eu: 'https://cloudinfra-gw.portal.checkpoint.com',
    'ca-central-1': 'https://cloudinfra-gw.ca.portal.checkpoint.com',
    ca: 'https://cloudinfra-gw.ca.portal.checkpoint.com',
    'ap-southeast-2': 'https://cloudinfra-gw.ap.portal.checkpoint.com',
    au: 'https://cloudinfra-gw.ap.portal.checkpoint.com',
    'eu-west-2': 'https://cloudinfra-gw.uk.portal.checkpoint.com',
    uk: 'https://cloudinfra-gw.uk.portal.checkpoint.com',
    'me-central-1': 'https://cloudinfra-gw.me.portal.checkpoint.com',
    ae: 'https://cloudinfra-gw.me.portal.checkpoint.com',
    'ap-south-1': 'https://cloudinfra-gw.in.portal.checkpoint.com',
    in: 'https://cloudinfra-gw.in.portal.checkpoint.com',
};

export function cloudinfraUrlForRegion(region: string): string {
    const host = REGION_HOSTS[region];
    if (!host) {
        throw new ConfigError(
            `unsupported cloudinfra region: "${region}"; known: ${[...new Set(Object.keys(REGION_HOSTS))].sort().join(', ')}`
        );
    }
    return host;
}

function extractExpiresIn(data: Record<string, unknown>): number {
    const raw = data.expiresIn;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    return FALLBACK_TOKEN_TTL_SECONDS;
}

async function authenticateCloudinfra(
    creds: ProviderCredentials,
    host: string,
    timeoutMs: number
): Promise<IssuedToken> {
    const url = `${host}${AUTH_PATH}`;

    log('cloudinfra_provider.authenticating', { host });

    // Captured before the request so a slow round trip shortens the cached TTL
    // rather than pushing the expiry past the token's real lifetime.
    const sentAt = Date.now();

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: creds.clientId,
                accessKey: creds.secret,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        throw new TransportError(
            `auth transport error: ${error instanceof Error ? error.name : 'unknown'}`
        );
    }

    const body = await response.text();
    if (response.status === 401)
        throw new AuthError('invalid cloudinfra credentials');
    if (response.status >= 400) {
        log('cloudinfra_provider.auth_failed', responseDebugFields(response));
        throw new UpstreamError(
            `auth returned HTTP ${response.status}: ${shortDetail(body)}`
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new AuthError('auth response is not valid JSON');
    }
    if (parsed === null || typeof parsed !== 'object') {
        throw new AuthError('auth response is not a JSON object');
    }

    const { success, data } = parsed as { success?: unknown; data?: unknown };
    if (success === false) throw new AuthError('auth returned success=false');
    if (data === null || typeof data !== 'object')
        throw new AuthError('auth response missing data');

    const authData = data as Record<string, unknown>;
    const token = authData.token;
    if (typeof token !== 'string' || !token)
        throw new AuthError('auth response missing token');

    const expiresAt = new Date(sentAt + extractExpiresIn(authData) * 1000);
    log('cloudinfra_provider.authenticated', {
        expires_at: expiresAt.toISOString(),
    });
    return { value: token, expiresAt };
}

/** Bind a cloudinfra Provider to a host and a set of credentials. */
export function buildCloudinfraProvider(
    creds: ProviderCredentials,
    baseUrl: string
): Provider {
    const host = baseUrl.replace(/\/+$/, '');

    return {
        authMethod: 'cloudinfra',
        baseUrl: host,
        v1Prefix: V1_PREFIX,

        // Cloudinfra auth has no per-call request id, because nothing is signed.
        authenticate: (_reqId, timeoutMs) =>
            authenticateCloudinfra(creds, host, timeoutMs),

        sign() {
            // Cloudinfra does not require per-request signing.
        },

        attachToken(headers, token) {
            headers.set('Authorization', `Bearer ${token.value}`);
        },
    };
}
