import type { AnyToolDef } from './types.js';
import { systemTools } from './system.js';
import { deploymentTools } from './deployments/index.js';

/** Explicit release scope; adding an API operation requires review here. */
export function allTools(version: string): AnyToolDef[] {
    return [...systemTools(version), ...deploymentTools];
}
