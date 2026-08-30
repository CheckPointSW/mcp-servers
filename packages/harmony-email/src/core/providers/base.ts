import type { AuthMethod } from '../../settings.js';

/**
 * The provider seam.
 *
 * Two auth flows reach the same HEC resource layer: `cloudinfra` (Check Point
 * customers, POST /auth/external -> Bearer JWT through the Infinity Portal
 * gateway) and `avanan` (Avanan customers, GET /v1.0/auth with signed headers
 * through the HEC dedicated API gateway). A Provider packages the concerns that
 * differ - host, v1 prefix, authenticate, sign, attachToken - so the API
 * manager stays flow-agnostic.
 *
 * Each provider's callables close over their credentials at build time, so the
 * caller never passes credentials at request time.
 */

export interface ProviderCredentials {
    authMethod: AuthMethod;
    clientId: string;
    secret: string;
}

export interface IssuedToken {
    value: string;
    expiresAt: Date;
}

const DEFAULT_SKEW_SECONDS = 60;

/** True when the token has expired or is close enough that a refresh is due. */
export function isTokenExpiring(
    token: IssuedToken,
    now: Date,
    skewSeconds: number = DEFAULT_SKEW_SECONDS
): boolean {
    return (token.expiresAt.getTime() - now.getTime()) / 1000 <= skewSeconds;
}

export interface Provider {
    readonly authMethod: AuthMethod;
    /** Fully-formed `https://<host>`, no trailing slash. */
    readonly baseUrl: string;
    /** Path segment in front of every resource path, e.g. `/v1.0`. */
    readonly v1Prefix: string;

    authenticate(reqId: string, timeoutMs: number): Promise<IssuedToken>;

    /**
     * Add flow-specific auth headers to an outgoing request.
     * `pathWithQuery` is the v1 path including its encoded query string - the
     * avanan signature covers it, so it must match the request exactly.
     */
    sign(headers: Headers, now: Date, pathWithQuery: string): void;

    attachToken(headers: Headers, token: IssuedToken): void;
}
