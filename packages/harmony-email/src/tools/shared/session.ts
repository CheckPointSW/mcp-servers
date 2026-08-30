import { SessionContext } from '@chkp/mcp-utils';
import type { HarmonyEmailAPIManager } from '../../api-manager.js';
import type { ServerModule } from '../types.js';

/**
 * The per-session upstream client for the request currently being handled.
 *
 * Under HTTP transport each session carries its own credentials, so a tool must
 * never read settings from the environment - it goes through here.
 */
export function apiFor(
    serverModule: ServerModule,
    extra: unknown
): HarmonyEmailAPIManager {
    return SessionContext.getAPIManager(
        serverModule,
        extra
    ) as HarmonyEmailAPIManager;
}
