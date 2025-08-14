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
    const sid = sessionId || this.defaultSessionId;
    
    if (!this.apiManagerMap.has(sid)) {
      // Get settings for this session
      const settings = this.settingsManager.getSettings(sid);
      
      // Create API manager with these settings
      const apiManager = this.createAPIManagerFromSettings(settings);
      
      // Store in map
      this.apiManagerMap.set(sid, apiManager);
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
    // Pass the entire settings object to the API manager's create method
    // Each API Manager implementation should extract what it needs from the settings
    return this.apiManagerClass.create(settings);
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
