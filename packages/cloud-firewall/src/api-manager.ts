import {
    ExternalTokenManager,
    ExternalUserTokenManager,
} from '@chkp/quantum-infra';
import { Settings } from './settings.js';
import { CpcfClient, CPCF_API_VERSION } from './clients/cpcf.js';

/**
 * API manager for the Cloud Firewall MCP server — a facade over one client
 * per backend service, sharing a single token manager.
 *
 * Adding another backend service:
 *   1. add src/clients/<service>.ts with its own base path
 *   2. expose it here as a readonly field
 *   3. use it from your tools via ctx.api.<service>
 * mcp-utils allows one APIManager per server; the facade is how it scales.
 */

/**
 * The infra token managers throw plain Errors with the status in the text.
 * Exported only for the infra-contract tripwire test, which runs the REAL
 * infra code against this predicate so a wording change in the shared
 * package fails CI here instead of silently disabling the fallback.
 */
export function isAuthRejection(error: unknown): boolean {
    return error instanceof Error && /\(401\)/.test(error.message);
}

/**
 * Service-key auth with a one-shot fallback to user-key auth.
 *
 * The two Infinity Portal key kinds authenticate at different endpoints
 * (/auth/external vs /auth/external/user) and the wrong one fails with a
 * misleading 401 "Client id not found". Only a 401 triggers the fallback —
 * outages and bad-gateway responses surface as-is. Once the user endpoint
 * succeeds it stays selected, so the extra probe happens at most once per
 * process, not once per token refresh.
 */
export class AutoFallbackTokenManager extends ExternalTokenManager {
    private active: ExternalTokenManager;
    private readonly user: ExternalUserTokenManager;

    constructor(settings: Settings) {
        super(settings);
        this.active = new ExternalTokenManager(settings);
        this.user = new ExternalUserTokenManager(settings);
    }

    override async getToken(): Promise<string> {
        // Snapshot the manager this request uses: a concurrent request may
        // switch `active` to the user manager while this one is in flight,
        // and this request's service-key 401 must still fall back.
        const attempted = this.active;
        try {
            return await attempted.getToken();
        } catch (error) {
            if (attempted !== this.user && isAuthRejection(error)) {
                const token = await this.user.getToken();
                this.active = this.user;
                return token;
            }
            throw error;
        }
    }
}

/**
 * Hosted-platform auth (Infinity Portal "MCP Remote Access"): the platform
 * terminates OAuth at the gateway and forwards the caller's portal token per
 * session as CLOUD-INFRA-TOKEN. Nothing to mint — the token IS the caller's
 * identity, already validated upstream, and it goes to the same fixed gateway
 * host as everything else. A stale/invalid token surfaces as the backend's
 * 401, sanitized like any other upstream error.
 */
export class PassthroughTokenManager extends ExternalTokenManager {
    private readonly token: string;

    constructor(settings: Settings, token: string) {
        super(settings);
        this.token = token;
    }

    override async getToken(): Promise<string> {
        return this.token;
    }
}

export function buildTokenManager(settings: Settings): ExternalTokenManager {
    // The forwarded token wins over configured keys — same precedence as the
    // framework (APIManagerForAPIKey checks cloudInfraToken before apiKey),
    // and the safe order: the token is THIS session's caller, while keys can
    // arrive from the process env. On a hosted process with leftover env keys,
    // keys-first would make every caller act as the operator's identity.
    // Tool calls check credential presence before constructing this manager;
    // token validity and permissions are still enforced upstream.
    if (settings.cloudInfraToken) {
        return new PassthroughTokenManager(settings, settings.cloudInfraToken);
    }
    switch (settings.authKind) {
        case 'service':
            return new ExternalTokenManager(settings);
        case 'user':
            return new ExternalUserTokenManager(settings);
        default:
            return new AutoFallbackTokenManager(settings);
    }
}

export class CloudFirewallAPIManager {
    /** Cloud Firewall (CFWaaS) deployments API. */
    readonly cpcf: CpcfClient;
    constructor(settings: Settings) {
        // One resolved host for both the token mint and the API calls — see
        // Settings, which passes any --gateway-url override through the base.
        const host = settings.getCloudInfraGateway();
        const tokenManager = buildTokenManager(settings);

        this.cpcf = new CpcfClient(
            host,
            `/app/cloud-firewall/${settings.cpcfEnv}/api/${CPCF_API_VERSION}`,
            tokenManager
        );
    }

    static create(settings: Settings): CloudFirewallAPIManager {
        return new CloudFirewallAPIManager(settings);
    }
}
