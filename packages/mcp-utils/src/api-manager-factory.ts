import { SettingsManager } from './settings-manager.js';

/**
 * Factory class for creating and managing API managers for different sessions.
 * This handles multi-user support by providing a way to get the appropriate
 * API manager for a specific session.
 */
export class APIManagerFactory {
  private apiManagerMap: Map<string, any> = new Map();
  private defaultSessionId: string = 'default';
  private apiManagerClass: any;
  private settingsManager: any;

  /**
   * Creates a new APIManagerFactory
   * @param apiManagerClass The API Manager class to use for creating instances
   * @param settingsManager The settings manager to get settings from
   */
  constructor(apiManagerClass: any, settingsManager: any) {
    this.apiManagerClass = apiManagerClass;
    this.settingsManager = settingsManager;
  }

  /**
   * Get or create an API manager for a specific session
   * @param sessionId The session ID (defaults to 'default' for stdio mode)
   * @returns API Manager instance for the session
   */
  getAPIManager(sessionId?: string): any {
    const verbose = SettingsManager.globalDebugState;
    const sid = sessionId || this.defaultSessionId;

    if (verbose) {
      console.error('[APIManagerFactory.getAPIManager] Verbose: Getting API manager for session:', sid);
    }

    if (!this.apiManagerMap.has(sid)) {
      if (verbose) {
        console.error('[APIManagerFactory.getAPIManager] Verbose: API manager not in cache, creating new one');
      }
      // Get settings for this session
      const settings = this.settingsManager.getSettings(sid);
      if (verbose) {
        console.error('[APIManagerFactory.getAPIManager] Verbose: Retrieved settings from settings manager');

        // Create API manager with these settings
        console.error('[APIManagerFactory.getAPIManager] Verbose: Creating API manager from settings');
      }
      const apiManager = this.createAPIManagerFromSettings(settings);
      if (verbose) {
        console.error('[APIManagerFactory.getAPIManager] Verbose: API manager created successfully');
      }

      // Store in map
      this.apiManagerMap.set(sid, apiManager);
    } else if (verbose) {
      console.error('[APIManagerFactory.getAPIManager] Verbose: Using cached API manager');
    }

    // Get the API manager (either newly created or from the cache)
    const apiManager = this.apiManagerMap.get(sid);

    // Update debug settings in case they've changed since creation
    const settings = this.settingsManager.getSettings(sid);

    // Directly set the debug property if it exists in settings
    if (settings && typeof settings.debug !== 'undefined') {
      apiManager.debug = !!settings.debug;
    }

    return apiManager;
  }

  /**
   * Create an API manager from settings
   * @param settings Settings instance
   * @returns API Manager instance
   */
  private createAPIManagerFromSettings(settings: any): any {
    const verbose = SettingsManager.globalDebugState;

    if (verbose) {
      console.error('[APIManagerFactory.createAPIManagerFromSettings] Verbose: Creating API manager from settings');
      console.error('[APIManagerFactory.createAPIManagerFromSettings] Verbose: Settings type:', typeof settings);
      console.error('[APIManagerFactory.createAPIManagerFromSettings] Verbose: Settings keys:', settings ? Object.keys(settings) : 'null');
    }

    // Pass the entire settings object to the API manager's create method
    // Each API Manager implementation should extract what it needs from the settings
    const apiManager = this.apiManagerClass.create(settings);
    if (verbose) {
      console.error('[APIManagerFactory.createAPIManagerFromSettings] Verbose: API manager created');
    }
    return apiManager;
  }

  /**
   * Clear API manager for a session
   * @param sessionId The session ID to clear
   */
  clearSession(sessionId: string): void {
    if (sessionId !== this.defaultSessionId) {
      this.apiManagerMap.delete(sessionId);
    }
  }
}
