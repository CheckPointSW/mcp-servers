/**
 * Telemetry tracking for MCP servers
 * Collects anonymous usage statistics for tools
 */

import machineIdPkg from 'node-machine-id';
import { createHash } from 'crypto';
const { machineIdSync } = machineIdPkg;

let machineId: string | null = null;
let hashedMachineId: string | null = null;

/**
 * Check if telemetry is disabled
 * Reads process.env dynamically to respect runtime changes from CLI flags
 */
function isTelemetryDisabled(): boolean {
  return process.env.TELEMETRY_DISABLED === 'true' || process.env.TELEMETRY_DISABLED === '1';
}

/**
 * Get the configured telemetry URL
 * Reads process.env dynamically to respect runtime changes
 */
function getTelemetryUrl(): string {
  return process.env.TELEMETRY_URL || 'https://metrics.security.ai.checkpoint.com/api/v1/metrics/collect';
}

/**
 * Hash a string using SHA256 and return hex string
 */
function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Get anonymous machine ID (cached)
 */
function getMachineId(): string {
  if (!machineId) {
    try {
      machineId = machineIdSync();
    } catch (error) {
      console.warn('Failed to get machine ID for telemetry:', error);
      machineId = 'unknown';
    }
  }
  return machineId;
}

/**
 * Get hashed machine ID (cached)
 */
function getHashedMachineId(): string {
  if (!hashedMachineId) {
    hashedMachineId = hashString(getMachineId());
  }
  return hashedMachineId;
}

/**
 * Calculate a simple checksum for the telemetry payload
 */
function calculateChecksum(
  mcpName: string,
  toolName: string,
  machineId: string,
  clientVersion: string
): string {
  // Simple checksum to filter lazy scripts
  const data = mcpName + machineId.slice(0, 16) + toolName + clientVersion;
  return hashString(data);
}

/**
 * Track a tool call (fire and forget)
 * @param mcpName The name of the MCP server (from package.json)
 * @param toolName The name of the tool being called
 * @param clientVersion The version of the MCP server (from package.json)
 * @param extra Optional extra context (not currently used but kept for API compatibility)
 */
export async function trackToolCall(
  mcpName: string, 
  toolName: string,
  clientVersion: string,
  extra?: any
): Promise<void> {
  if (isTelemetryDisabled()) {
    return;
  }

  try {
    const machineId = getHashedMachineId();
    const checksum = calculateChecksum(mcpName, toolName, machineId, clientVersion);
    
    // Non-blocking fire-and-forget
    // Note: Client IP is extracted and hashed on the server side from the HTTP request
    fetch(getTelemetryUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mcp_name: mcpName,
        tool_name: toolName,
        machine_id: machineId,
        client_version: clientVersion,
        checksum: checksum
      })
    }).catch(() => {
      // Silent fail - don't break MCP functionality
    });
  } catch (error) {
    // Silent fail - telemetry should never break the application
  }
}

/**
 * Check if telemetry is enabled
 */
export function isTelemetryEnabled(): boolean {
  return !isTelemetryDisabled();
}

/**
 * Get the configured telemetry URL (exported for testing)
 */
export { getTelemetryUrl };
