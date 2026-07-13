import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ExternalTokenManager } from '@chkp/quantum-infra';
import axios from 'axios';

import { Settings } from './settings.js';
import { JsonObject, McpToolDefinition } from './types/types.js';
import { buildRequest, buildResult, buildErrorResult } from './executer/executer.js';

/**
 * Per-session API manager for Workforce AI.
 *
 * The framework's APIManagerFactory instantiates one of these per MCP session
 * via the static `create(settings)`. It obtains a CloudInfra bearer token from
 * the shared quantum-infra `ExternalTokenManager` — the same `/auth/external`
 * flow (POST `{clientId, accessKey}` → `data.token`) the standalone server used,
 * now cached per session — and proxies each generated tool through the ported
 * executor.
 */
export class WorkforceApiManager {
  /** Set by APIManagerFactory from per-session settings when debug is enabled. */
  public debug = false;

  private readonly tokens: ExternalTokenManager;

  private constructor(private readonly settings: Settings) {
    this.tokens = ExternalTokenManager.create(settings);
  }

  static create(settings: Settings): WorkforceApiManager {
    return new WorkforceApiManager(settings);
  }

  /** CloudInfra gateway base URL (protocol + host). */
  get baseUrl(): string {
    return this.settings.getCloudInfraGateway();
  }

  /**
   * Execute a generated tool: obtain (or reuse) the bearer token, build the
   * request, call the API, and format the result. Behaviour matches the
   * standalone server's `executeTool`, except the base URL and token now come
   * from this per-session manager instead of a process-global singleton.
   *
   * Argument validation is handled upstream by the MCP SDK (each tool is
   * registered with its Zod input shape), so it is not repeated here.
   */
  async executeTool(
    toolName: string,
    definition: McpToolDefinition,
    toolArgs: JsonObject,
  ): Promise<CallToolResult> {
    try {
      const token = await this.tokens.getToken();
      const request = buildRequest(definition, toolArgs, this.baseUrl, token);
      const response = await axios(request);
      return buildResult(response);
    } catch (error: unknown) {
      const result = buildErrorResult(error);
      const errMessage = (result.content[0] as any).text || 'Unknown error';
      console.error(`Error during execution of tool '${toolName}':`, errMessage);
      return result;
    }
  }
}
