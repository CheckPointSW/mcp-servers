import { Settings } from './settings.js';

export class CpviewHistoryAPIManager {
  constructor(private readonly settings: Settings) {}

  static create(settings: Settings): CpviewHistoryAPIManager {
    return new CpviewHistoryAPIManager(settings);
  }

  async callApi(method: string, path: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    // The cpview-history-mcp server is stateless and does not call external APIs.
    // This stub exists only to satisfy the multi-user serverModule wiring.
    return {
      success: true,
      method,
      path,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
