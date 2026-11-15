import { isIP } from 'net';
import { McpErrorCode, McpToolError, SessionContext } from '@chkp/mcp-utils';

// An optional trailing root dot is allowed (absolute hostname); it does not count toward the 253-character limit.
const HOSTNAME_PATTERN = /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/;

/** Blank means the default port; anything other than plain digits is left invalid for validation to reject. */
function parseDialogPort(value: string | undefined): number {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return 443;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

/**
 * The gateway address reaches the credentials dialog and the API URL, and may
 * come from a model-supplied tool argument, so only a bare IP or hostname is accepted.
 */
function validateConnectionDetails(gatewayIp: string, port: number): void {
  if (isIP(gatewayIp) === 0 && !HOSTNAME_PATTERN.test(gatewayIp)) {
    throw new McpToolError(McpErrorCode.VALIDATION_ERROR, 'gateway_ip must be an IP address or hostname');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new McpToolError(McpErrorCode.VALIDATION_ERROR, 'port must be an integer between 1 and 65535');
  }
}

export interface GaiaConnection {
  gatewayIp: string;
  port: number;
  user: string;
  password: string;
}

/**
 * Get gateway connection details (IP, port, credentials) with automatic prompting
 */
export async function getGaiaConnection(
  gatewayIp?: string, 
  port?: number, 
  extra?: any
): Promise<GaiaConnection> {
  
  // Step 1: Get gateway IP and port if not provided
  let connectionDetails: { gatewayIp: string; port: number };
  
  if (!gatewayIp) {
    // Prompt for gateway connection details
    const gatewayResult = await SessionContext.getOrPromptUserData({
      cacheKey: 'default_gateway_connection',
      dialogTitle: "GAIA Gateway Connection",
      dialogMessage: "Please provide the gateway connection details:",
      customFields: [
        {
          name: "gateway_ip",
          label: "Gateway IP Address",
          type: "text",
          placeholder: "e.g., 192.168.1.1",
          required: true
        },
        {
          name: "port", 
          label: "Port",
          type: "number",
          placeholder: "443",
          defaultValue: "443",
          required: true
        }
      ],
      expirationMinutes: 60 // Cache gateway selection for 1 hour
    }, extra);
    
    if (gatewayResult.cancelled) {
      // No gateway to connect to: required input is missing.
      throw new McpToolError(McpErrorCode.VALIDATION_ERROR, 'Gateway connection details cancelled by user');
    }
    
    connectionDetails = {
      gatewayIp: (gatewayResult.data.gateway_ip || '').trim(),
      port: parseDialogPort(gatewayResult.data.port)
    };
  } else {
    connectionDetails = {
      gatewayIp,
      port: port ?? 443
    };
  }

  validateConnectionDetails(connectionDetails.gatewayIp, connectionDetails.port);

  // Step 2: Get credentials for this specific gateway+port combination
  const connectionKey = `${connectionDetails.gatewayIp}:${connectionDetails.port}`;
  const cacheKey = `gaia_creds_${connectionKey.replace(/[:.]/g, '_')}`;
  
  const credentialsResult = await SessionContext.getOrPromptUserData({
    cacheKey,
    dialogTitle: `GAIA Authentication`,
    dialogMessage: `Please provide credentials for gateway: ${connectionKey}`,
    expirationMinutes: 15, // 15 minutes as suggested
    customFields: [
      {
        name: "user",
        label: "Username",
        type: "text",
        required: true,
        placeholder: "User"
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        placeholder: "Password"
      }
    ]
  }, extra);
  
  if (credentialsResult.cancelled) {
    throw new McpToolError(McpErrorCode.AUTH_FAILED, 'Authentication cancelled by user');
  }
  
  return {
    gatewayIp: connectionDetails.gatewayIp,
    port: connectionDetails.port,
    user: credentialsResult.data.user,
    password: credentialsResult.data.password
  };
}

/**
 * Clear cached credentials for a specific gateway+port
 */
export function clearGaiaCredentials(gatewayIp: string, port: number, extra: any) {
  const connectionKey = `${gatewayIp}:${port}`;
  const cacheKey = `gaia_creds_${connectionKey.replace(/[:.]/g, '_')}`;
  SessionContext.clearUserData(cacheKey, extra);
}

/**
 * Clear default gateway connection cache
 */
export function clearDefaultGateway(extra: any) {
  SessionContext.clearUserData('default_gateway_connection', extra);
}