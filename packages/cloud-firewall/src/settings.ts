import { getHeaderValue, resolveTransportType } from '@chkp/mcp-utils';
import { Settings as BaseSettings, Region, REGIONS } from '@chkp/quantum-infra';

/**
 * Settings for the cloud-firewall MCP server.
 *
 * Auth exchanges a client id + access key for an Infinity Portal token
 * via ExternalTokenManager, gateway resolved from region by the base).
 * mode implements the marketplace read-only-by-default convention.
 */

/**
 * Which Infinity Portal key kind the credentials are, deciding the auth
 * endpoint: 'service' -> /auth/external, 'user' -> /auth/external/user,
 * 'auto' (default) -> service with a one-shot fallback to user on 401.
 */
const AUTH_KINDS = ['auto', 'service', 'user'] as const;
export type AuthKind = (typeof AUTH_KINDS)[number];

/**
 * Path segment of /app/cloud-firewall/<env>/api/v1. Constrained because it is
 * interpolated into every request URL: an unconstrained value could inject
 * path traversal and replay the tenant token against another app behind the
 * same gateway.
 */
const CPCF_ENV_PATTERN = /^[a-z0-9-]{1,32}$/;

/** Hosts the CI token may be sent to. The token is tenant-scoped — it must never leave Check Point. */
const GATEWAY_HOST_SUFFIX = '.checkpoint.com';

function validateGatewayUrl(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(
            `Invalid gateway URL '${url}' - expected a full origin, e.g. https://gateway.example.checkpoint.com`
        );
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(
            `Invalid gateway URL '${url}' - only https is allowed (the Infinity Portal token is sent to this host)`
        );
    }
    if (!parsed.hostname.endsWith(GATEWAY_HOST_SUFFIX)) {
        throw new Error(
            `Invalid gateway URL '${url}' - host must be under ${GATEWAY_HOST_SUFFIX}`
        );
    }
    return parsed.origin;
}

/** Local configuration failure: no upstream text or credential values. */
export class MissingCredentialsError extends Error {
    readonly safeForModel = true;
    constructor(remote: boolean) {
        super(
            remote
                ? 'Remote session has no API credentials. Reconnect authentication; if it persists, ask the operator to check credential forwarding.'
                : 'Missing API credentials. Configure CFW_CLIENT_ID and CFW_ACCESS_KEY, or CLOUD_INFRA_TOKEN, in the MCP launch environment and reconnect.'
        );
        this.name = 'MissingCredentialsError';
    }
    toModelText(toolName: string): string {
        return `${toolName} failed: ${this.message}`;
    }
}

/** Presence only; validity and permissions remain backend decisions. */
export function assertBackendCredentials(settings: Settings): void {
    if (settings.cloudInfraToken || (settings.clientId && settings.secretKey))
        return;
    throw new MissingCredentialsError(settings.isRemoteSession);
}

export class Settings extends BaseSettings {
    /** Only the region may mix with operator values in HTTP sessions. */
    static override readonly basicKeys: readonly string[] = ['CFW-REGION'];
    /** Every HTTP caller supplies its own credentials, including headerless sessions. */
    static readonly operatorSettingsOverHttp = false;

    /** Non-secret input and resolved-property names that debug output may print. */
    static override readonly debugLoggableKeys: readonly string[] = [
        ...BaseSettings.debugLoggableKeys,
        'cfw-region',
        'cfw-mode',
        'cfw-cpcf-env',
        'cfw-auth-kind',
        'cfw-gateway-url',
        'mode',
        'cpcf-env',
        'auth-kind',
        'is-remote-session',
    ];

    /**
     * Mode resolved once at startup by fromArgs (--mode flag or CFW_MODE env).
     * fromHeaders uses it as the write ceiling. --mode is a string option, so
     * mcp-utils does not mirror it into process.env (only boolean flags are).
     * Reading the env var alone would leave a `--transport http --mode write`
     * server whose per-session settings stay advisor and refuse the write
     * tools the process-wide policy listed.
     */
    private static processMode: string | undefined;
    private static processTransport: 'stdio' | 'http' | undefined;
    private static processDefaults:
        | {
              region: string;
              cpcfEnv: string;
              gatewayUrl: string;
              authKind: AuthKind;
          }
        | undefined;

    /**
     * Operator environment secrets are only usable in single-user stdio.
     * Fails closed: only a transport fromArgs recorded as stdio qualifies, so
     * a hosted process that never ran fromArgs (headers-only sessions) cannot
     * reach process-wide CFW_SIC_* values. Use the launcher's transport resolver.
     */
    static canResolveEnvironmentSecrets(): boolean {
        return Settings.processTransport === 'stdio';
    }
    /** 'advisor' (read-only, default) or 'write' — write tools are hidden unless 'write'. */
    readonly mode: string;
    /** Environment segment of the cpcf gateway path: /app/cloud-firewall/<env>/api/v1. */
    readonly cpcfEnv: string;
    /** Key kind for auth endpoint selection — see AUTH_KINDS. */
    readonly authKind: AuthKind;
    /** Used only for caller-appropriate configuration guidance, not authorization. */
    readonly isRemoteSession: boolean;

    constructor({
        clientId,
        accessKey,
        region = 'EU',
        mode,
        cpcfEnv,
        gatewayUrl,
        authKind,
        cloudInfraToken,
        isRemoteSession = false,
    }: {
        clientId?: string;
        accessKey?: string;
        region?: string;
        mode?: string;
        cpcfEnv?: string;
        gatewayUrl?: string;
        authKind?: string;
        cloudInfraToken?: string;
        isRemoteSession?: boolean;
    } = {}) {
        // The base only validates the S1C / on-prem credential paths, which this
        // server does not use — so region and the gateway override are checked
        // here, at startup, rather than surfacing as a URL parse error per call.
        const normalizedRegion = (region || 'EU').trim().toUpperCase();
        if (!REGIONS.includes(normalizedRegion as Region)) {
            throw new Error(
                `Invalid region '${region}' - expected one of ${REGIONS.join(', ')}`
            );
        }

        // gatewayUrl goes through the base so ONE resolved host serves both the
        // token mint (ExternalTokenManager reads getCloudInfraGateway()) and the
        // CPCF calls. Passing it only to the client would mint a production
        // token and send it to the override host.
        super({
            clientId,
            secretKey: accessKey,
            region: normalizedRegion as Region,
            gatewayUrl: gatewayUrl ? validateGatewayUrl(gatewayUrl) : undefined,
            // Infinity Portal "MCP Remote Access" hosting contract: the
            // platform terminates OAuth and forwards the caller's portal token
            // per session as CLOUD-INFRA-TOKEN. Stored on the base field the
            // rest of the framework already knows; buildTokenManager uses it
            // as-is instead of minting, taking precedence over any key pair —
            // the caller's identity, never a key held by this process.
            cloudInfraToken: cloudInfraToken || undefined,
        });

        this.mode = (mode || 'advisor').toLowerCase();
        if (this.mode !== 'advisor' && this.mode !== 'write') {
            throw new Error(
                `Invalid mode '${this.mode}' - expected 'advisor' or 'write'`
            );
        }

        this.cpcfEnv = cpcfEnv || 'prod';
        if (!CPCF_ENV_PATTERN.test(this.cpcfEnv)) {
            throw new Error(
                `Invalid cpcfEnv '${this.cpcfEnv}' - expected lowercase alphanumeric/dash, max 32 chars (e.g. prod)`
            );
        }

        const normalizedAuthKind = (authKind || 'auto').toLowerCase();
        if (!AUTH_KINDS.includes(normalizedAuthKind as AuthKind)) {
            throw new Error(
                `Invalid authKind '${authKind}' - expected one of ${AUTH_KINDS.join(', ')}`
            );
        }
        this.authKind = normalizedAuthKind as AuthKind;
        this.isRemoteSession = isRemoteSession;
    }

    // Signature fixed by the base class: the launcher hands us commander's
    // parsed options object, which the framework types as `any`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static override fromArgs(options: any): Settings {
        const settings = new Settings({
            clientId: options.clientId ?? process.env.CFW_CLIENT_ID,
            accessKey: options.accessKey ?? process.env.CFW_ACCESS_KEY,
            region:
                options.region ??
                process.env.CFW_REGION ??
                BaseSettings.hostedRegion(process.env, process.env.REGION) ??
                process.env.REGION,
            mode: options.mode ?? process.env.CFW_MODE,
            cpcfEnv: options.cpcfEnv ?? process.env.CFW_CPCF_ENV,
            gatewayUrl: options.gatewayUrl ?? process.env.CFW_GATEWAY_URL,
            authKind: options.authKind ?? process.env.CFW_AUTH_KIND,
            cloudInfraToken:
                options.cloudInfraToken ?? process.env.CLOUD_INFRA_TOKEN,
        });
        Settings.processMode = settings.mode;
        Settings.processDefaults = {
            // These deployment defaults have no caller-header equivalent
            // (gateway/auth kind), or are needed alongside caller credentials
            // (backend environment). Preserve the resolved region too: platform
            // REGION is not the CFW-REGION basic key SettingsManager forwards.
            region: settings.region,
            cpcfEnv: settings.cpcfEnv,
            // Preserve an operator override, but let a request region select
            // its own gateway when no override was configured at startup.
            gatewayUrl:
                (options.gatewayUrl ?? process.env.CFW_GATEWAY_URL)
                    ? settings.gatewayUrl
                    : '',
            authKind: settings.authKind,
        };
        Settings.processTransport = resolveTransportType(options.transport);
        return settings;
    }

    static override fromHeaders(
        headers: Record<string, string | string[]>
    ): Settings {
        // The process-level mode is a CEILING: a per-request header may lower
        // privilege (write -> advisor) but must never raise it. An operator who
        // launched the server read-only gets a read-only server for every
        // session, whatever a client sends — otherwise any caller could flip an
        // advisor server to write with one header and provision billable infra.
        // Same reasoning as the deliberately-omitted CFW-GATEWAY-URL header.
        // Enabling write for HTTP sessions is a process-level decision
        // (--mode write or CFW_MODE=write), not a per-call one. tools/list
        // follows that ceiling; this header can only lower a session.
        const ceiling = Settings.processMode ?? 'advisor';
        const requestedMode = getHeaderValue(headers, 'CFW-MODE');
        const mode =
            ceiling === 'write' ? (requestedMode ?? 'write') : 'advisor';

        return new Settings({
            isRemoteSession: true,
            clientId: getHeaderValue(headers, 'CFW-CLIENT-ID'),
            accessKey: getHeaderValue(headers, 'CFW-ACCESS-KEY'),
            region:
                getHeaderValue(headers, 'CFW-REGION') ??
                Settings.processDefaults?.region,
            mode,
            cpcfEnv:
                getHeaderValue(headers, 'CFW-CPCF-ENV') ??
                Settings.processDefaults?.cpcfEnv,
            gatewayUrl: Settings.processDefaults?.gatewayUrl,
            authKind: Settings.processDefaults?.authKind,
            // The Infinity Portal MCP hosting layer forwards the caller's
            // portal token per session under this header (same contract the
            // base Settings and the other hosted packages consume). Safe to
            // accept per-request: unlike a gateway override it cannot redirect
            // anything — it is a credential for OUR fixed gateway, and a bad
            // one just fails auth at the backend.
            cloudInfraToken: getHeaderValue(headers, 'CLOUD-INFRA-TOKEN'),
            // No CFW-GATEWAY-URL header on purpose: a per-request header must not
            // be able to redirect the tenant's token to another host. The gateway
            // override is deployment configuration (CLI flag / env), not per-call input.
        });
    }
}
