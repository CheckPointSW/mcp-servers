import { Settings as InfraSettings, Region } from '@chkp/quantum-infra';
import { getHeaderValue } from '@chkp/mcp-utils';

/**
 * Workforce AI settings — CloudInfra API-key authentication.
 *
 * Extends the shared quantum-infra Settings so instances satisfy the typed
 * dependency of `ExternalTokenManager` (which needs `clientId`, `secretKey`, and
 * `getCloudInfraGateway()`), while mapping the `CP_CI_*` flag/env/header names
 * that existing Workforce AI customers already use — keeping their configuration
 * seamless across the migration.
 *
 * quantum-infra's constructor only validates S1C / on-prem inputs (neither of
 * which we set), so we enforce the three required CloudInfra credentials here on
 * the raw inputs — `gatewayUrl` alone can't be checked post-construction because
 * the base class resolves it to a region default when omitted.
 */
export class Settings extends InfraSettings {
  static fromArgs(args: Record<string, any>): Settings {
    Settings.requireCreds(args.clientId, args.accessKey, args.gateway);
    return new Settings({
      clientId: args.clientId,
      secretKey: args.accessKey,
      gatewayUrl: args.gateway,
      region:
        typeof args.region === 'string' ? (args.region.trim().toUpperCase() as Region) : undefined,
    });
  }

  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    const clientId = getHeaderValue(headers, 'CP-CI-CLIENT-ID');
    const accessKey = getHeaderValue(headers, 'CP-CI-ACCESS-KEY');
    const gateway = getHeaderValue(headers, 'CP-CI-GATEWAY');
    const region = getHeaderValue(headers, 'REGION');
    Settings.requireCreds(clientId, accessKey, gateway);
    return new Settings({
      clientId,
      secretKey: accessKey,
      gatewayUrl: gateway,
      region: region ? (region.toUpperCase() as Region) : undefined,
    });
  }

  /** Enforce the three required CloudInfra credentials on the raw inputs. */
  private static requireCreds(clientId?: string, accessKey?: string, gateway?: string): void {
    const missing: string[] = [];
    if (!clientId) missing.push('CP_CI_CLIENT_ID');
    if (!accessKey) missing.push('CP_CI_ACCESS_KEY');
    if (!gateway) missing.push('CP_CI_GATEWAY');
    if (missing.length > 0) {
      throw new Error(
        `Missing required configuration: ${missing.join(', ')} (set via CLI flags or environment variables)`,
      );
    }
  }
}
