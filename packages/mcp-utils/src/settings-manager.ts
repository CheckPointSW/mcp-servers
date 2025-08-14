/**
 * SettingsManager for MCP servers with multi-user support.
 * This class manages settings on a per-session basis for all MCP servers.
 */
export class SettingsManager {
  private settingsMap: Map<string, any> = new Map();
  private defaultSessionId: string = 'default';
  private settingsClass: any;
  
  // Global debug state that persists across all sessions and instances
  private static globalDebugState: string | string[] | boolean | undefined = undefined;

  /**
   * Creates a new SettingsManager
   * @param settingsClass The Settings class to use for creating settings instances
   */
  constructor(settingsClass: any) {
    this.settingsClass = settingsClass;
    // We don't initialize the default settings here because we need the Settings class
    // which will be specific to each infra package
  }

  /**
   * Get settings for a specific session
   * @param sessionId The session ID (defaults to 'default' for stdio mode)
   * @returns Settings instance for the session
   */
  getSettings(sessionId?: string): any {
    const sid = sessionId || this.defaultSessionId;
    
    if (!this.settingsMap.has(sid)) {
      // Create new settings instance for this session if it doesn't exist
      this.settingsMap.set(sid, new this.settingsClass());
    }
    
    return this.settingsMap.get(sid);
  }

  /**
   * Set settings for a specific session
   * @param settings The settings object to set
   * @param sessionId The session ID (defaults to 'default' for stdio mode)
   */
  setSettings(settings: any, sessionId?: string): void {
    const sid = sessionId || this.defaultSessionId;
    this.settingsMap.set(sid, settings);
  }

  /**
   * Injects debug settings from source into settings object
   * @param settings The settings object to update
   * @param source Source object containing debug information
   * @private
   */
  private injectDebug(settings: any, source: Record<string, any>): void {
    const debug = source?.debug ?? SettingsManager.globalDebugState ?? process.env.DEBUG;
    if (typeof debug !== 'undefined') {
      // Update global debug state when debug is explicitly set
      if (source?.debug !== undefined) {
        SettingsManager.globalDebugState = source.debug;
      }
      
      // Use the set method if available (for proper settings classes), otherwise set directly
      if (typeof settings.set === 'function') {
        settings.set('debug', debug);
      } else {
        settings.debug = debug;
      }

      // Print all headers/args when debug is enabled
      if (debug) {
        console.error('Debug enabled. Source object contents:');
        console.error(JSON.stringify(source, null, 2));
      }
    }
  }

  /**
   * Print settings object for debugging by dynamically discovering its properties
   * @param settings The settings object to print
   * @private
   */
  private printSettingsDebug(settings: any): void {
    if (typeof settings.get === 'function') {
      // For settings objects with get method, try to discover properties dynamically
      console.error('Settings (using get method):');
      
      // If the settings object has a data property or similar, try to iterate over it
      if (settings.data && typeof settings.data === 'object') {
        Object.entries(settings.data).forEach(([key, value]) => {
          console.error(`  ${key}: ${JSON.stringify(value)}`);
        });
      } else {
        console.error('  Unable to enumerate settings properties - no accessible data structure');
      }
    } else {
      // For plain objects, show all enumerable properties
      console.error('Settings (plain object):');
      Object.entries(settings).forEach(([key, value]) => {
        console.error(`  ${key}: ${JSON.stringify(value)}`);
      });
    }
  }

  /**
   * Create settings from command-line arguments
   * @param args Command line arguments
   * @param sessionId Optional session ID
   * @returns Settings instance
   */
  createFromArgs(args: Record<string, any>, sessionId?: string): any {
    const settings = this.settingsClass.fromArgs(args);
    this.injectDebug(settings, args);
    this.setSettings(settings, sessionId);
    return settings;
  }
  
  /**
   * Create settings from HTTP headers
   * @param headers HTTP headers
   * @param sessionId Optional session ID
   * @returns Settings instance
   */
  createFromHeaders(headers: Record<string, string | string[]>, sessionId?: string): any {
    // Print headers if debug is enabled globally
    if (SettingsManager.globalDebugState) {
      console.error('=== createFromHeaders Debug Info ===');
      console.error('Incoming headers:');
      console.error(JSON.stringify(headers, null, 2));
    }
    
    // Convert headers with underscores to hyphens
    const normalizedHeaders: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(headers)) {
      const normalizedKey = key.includes('_') ? key.replace(/_/g, '-') : key;
      normalizedHeaders[normalizedKey] = value;
    }

    if (SettingsManager.globalDebugState) {
      console.error('Normalized headers:');
      console.error(JSON.stringify(normalizedHeaders, null, 2));
    }

    const debugHeader = normalizedHeaders['debug'] || normalizedHeaders['Debug'] || normalizedHeaders['DEBUG'];
    
    // Use header debug if present, otherwise preserve global debug state
    const debugSource = { debug: debugHeader !== undefined ? debugHeader : SettingsManager.globalDebugState };

    const settings = this.settingsClass.fromHeaders(normalizedHeaders);
    this.injectDebug(settings, debugSource);
    
    // Print final settings if debug is enabled
    if (SettingsManager.globalDebugState) {
      console.error('Final settings object:');
      this.printSettingsDebug(settings);
      console.error('=== End createFromHeaders Debug Info ===');
    }
    
    this.setSettings(settings, sessionId);
    return settings;
  }

  /**
   * Clear settings for a session
   * @param sessionId The session ID to clear
   */
  clearSession(sessionId: string): void {
    if (sessionId !== this.defaultSessionId) {
      this.settingsMap.delete(sessionId);
    }
  }
}
