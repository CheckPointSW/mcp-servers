// Utility functions for MCP servers
import {
  APIManagerBase,
  APIManagerForHarmonySASE,
} from "./api-manager.js";
import { Settings } from "./settings.js";

/**
 * Get an API manager for the specified server type
 */
export async function getApiManager(): Promise<APIManagerBase> {
  const settings = Settings.getSettings();
  console.error({ settings });
  // HarmonySASE requires an API key
  if (!settings.apiKey) {
    throw new Error("API key is required for Harmony SASE");
  }

  return APIManagerForHarmonySASE.create({
    apiKey: settings.apiKey,
    managementHost: settings.managementHost!,
    origin: settings.origin!,
  });
}

/**
 * Call the management API
 */
export async function callManagementApi(
  method: string = "POST",
  uri: string = "",
  params: Record<string, any> = {}
): Promise<Record<string, any>> {
  const s1cManager = await getApiManager();
  const data: Record<string, any> = {};

  // Convert snake_case to kebab-case for API parameters
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === "") {
      continue;
    }
    const safeKey = key.replace(/_/g, "-");
    data[safeKey] = value;
  }

  return await s1cManager.callApi(method, uri, data);
}
