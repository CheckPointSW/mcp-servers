/**
 * Helper class to extract and manage session information for MCP tool callbacks.
 * This class provides utility methods to ensure tool callbacks can get the correct
 * session ID and therefore the correct settings and API clients.
 */
export class SessionContext {
  // Default session ID used for stdio mode
  static readonly DEFAULT_SESSION_ID: string = 'default';
  
  // Session data storage with cleanup metadata
  private static sessionData: Map<string, {
    data: Map<string, any>;
    lastAccessed: number;
    createdAt: number;
  }> = new Map();
  
  // Cleanup configuration
  private static readonly SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly MAX_SESSIONS = 1000;
  private static cleanupTimer: NodeJS.Timeout | null = null;
  
  // Initialize cleanup timer
  static {
    this.startCleanupTimer();
  }
  
  /**
   * Start automatic cleanup timer
   */
  private static startCleanupTimer(): void {
    if (this.cleanupTimer) return;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL_MS);
    
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  
  /**
   * Clean up expired sessions
   */
  private static cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, sessionInfo] of this.sessionData.entries()) {
      if (sessionId === this.DEFAULT_SESSION_ID) continue; // Never clean up default session
      
      if (now - sessionInfo.lastAccessed > this.SESSION_TIMEOUT_MS) {
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => {
      this.sessionData.delete(sessionId);
    });
    
    // If we still have too many sessions, remove oldest ones
    if (this.sessionData.size > this.MAX_SESSIONS) {
      const sessions = Array.from(this.sessionData.entries())
        .filter(([sessionId]) => sessionId !== this.DEFAULT_SESSION_ID)
        .sort(([,a], [,b]) => a.lastAccessed - b.lastAccessed);
      
      const toRemove = sessions.slice(0, sessions.length - this.MAX_SESSIONS + 1);
      toRemove.forEach(([sessionId]) => {
        this.sessionData.delete(sessionId);
      });
    }
  }
  
  /**
   * Get the current session ID from the MCP extra context
   * @param extra Extra context passed to MCP tool callbacks
   * @returns The session ID or DEFAULT_SESSION_ID if not available
   */
  static getSessionId(extra?: any): string {
    if (!extra) return this.DEFAULT_SESSION_ID;
    
    // Try to get session ID from the transport
    if (extra.transport && extra.transport.sessionId) {
      return extra.transport.sessionId;
    }
    
    // Check if sessionId is directly in extra
    if (extra.sessionId) {
      return extra.sessionId;
    }
    
    // Default to the default session ID (stdio mode)
    return this.DEFAULT_SESSION_ID;
  }
  
  /**
   * Get settings for the current session
   * @param serverModule ServerModule with settingsManager
   * @param extra Extra context passed to MCP tool callbacks
   * @returns Settings for the current session
   */
  static getSettings(serverModule: any, extra?: any): any {
    const sessionId = this.getSessionId(extra);
    
    if (!serverModule.settingsManager) {
      throw new Error('ServerModule does not have a settingsManager. Create it with createServerModule.');
    }
    
    return serverModule.settingsManager.getSettings(sessionId);
  }
  
  /**
   * Get API manager for the current session
   * @param serverModule ServerModule with apiManagerFactory
   * @param extra Extra context passed to MCP tool callbacks
   * @returns API manager for the current session
   */
  static getAPIManager(serverModule: any, extra?: any): any {
    const sessionId = this.getSessionId(extra);
    
    if (!serverModule.apiManagerFactory) {
      throw new Error('ServerModule does not have an apiManagerFactory. Create it with createServerModule.');
    }
    
    return serverModule.apiManagerFactory.getAPIManager(sessionId);
  }
  
  /**
   * Set session data for the current session
   * @param key The key to store the data under
   * @param value The value to store
   * @param extra Extra context with session information
   */
  static setData(key: string, value: any, extra?: any): void {
    const sessionId = this.getSessionId(extra);
    const now = Date.now();
    
    if (!this.sessionData.has(sessionId)) {
      this.sessionData.set(sessionId, {
        data: new Map(),
        lastAccessed: now,
        createdAt: now
      });
    }
    
    const sessionInfo = this.sessionData.get(sessionId)!;
    sessionInfo.lastAccessed = now;
    sessionInfo.data.set(key, value);
  }
  
  /**
   * Get session data for the current session
   * @param key The key to retrieve data for
   * @param extra Extra context with session information
   * @returns The stored data or undefined if not found
   */
  static getData(key: string, extra?: any): any {
    const sessionId = this.getSessionId(extra);
    
    if (!this.sessionData.has(sessionId)) {
      return undefined;
    }
    
    const sessionInfo = this.sessionData.get(sessionId)!;
    sessionInfo.lastAccessed = Date.now();
    return sessionInfo.data.get(key);
  }
  
  /**
   * Clear session data for a specific session
   * @param sessionId The session ID to clear
   */
  static clearSessionData(sessionId: string): void {
    this.sessionData.delete(sessionId);
  }
  
  /**
   * Get session statistics (for monitoring)
   */
  static getSessionStats(): {
    totalSessions: number;
    memoryUsage: number;
    oldestSession: number | null;
  } {
    const now = Date.now();
    let oldestAccess: number | null = null;
    
    for (const [, sessionInfo] of this.sessionData.entries()) {
      if (oldestAccess === null || sessionInfo.lastAccessed < oldestAccess) {
        oldestAccess = sessionInfo.lastAccessed;
      }
    }
    
    return {
      totalSessions: this.sessionData.size,
      memoryUsage: this.sessionData.size * 1000, // Rough estimate
      oldestSession: oldestAccess ? now - oldestAccess : null
    };
  }
  
  /**
   * Get or prompt for user interactive data with automatic caching and expiration
   * @param options Configuration for the interactive data request
   * @param extra Extra context with session information
   * @returns Promise that resolves to the user data (either from cache or fresh prompt)
   */
  static async getOrPromptUserData(options: {
    cacheKey: string;
    dialogTitle?: string;
    dialogMessage?: string;
    fieldsToShow?: string[]; // If specified, only these fields from cached data will be returned
    expirationMinutes?: number; // Default: 30 minutes
    showLoginDialog?: boolean; // If true, uses showLoginDialog, otherwise uses custom fields
    customFields?: Array<{
      name: string;
      label: string;
      type?: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'select';
      placeholder?: string;
      required?: boolean;
      options?: string[];
      defaultValue?: string;
    }>;
  }, extra?: any): Promise<{cancelled: boolean; data: Record<string, string>}> {
    const sessionId = this.getSessionId(extra);
    const now = Date.now();
    const expirationMs = (options.expirationMinutes || 30) * 60 * 1000;
    
    // Try to get cached data
    const cachedData = this.getData(options.cacheKey, extra);
    if (cachedData && cachedData.expiresAt && now < cachedData.expiresAt) {
      // Refresh expiration time on use
      const refreshedData = {
        ...cachedData,
        expiresAt: now + expirationMs,
        lastUsed: now
      };
      this.setData(options.cacheKey, refreshedData, extra);
      
      // Return only requested fields if specified
      let dataToReturn = cachedData.data;
      if (options.fieldsToShow) {
        dataToReturn = {};
        for (const field of options.fieldsToShow) {
          if (cachedData.data[field] !== undefined) {
            dataToReturn[field] = cachedData.data[field];
          }
        }
      }
      
      console.error(`Using cached user data for session: ${sessionId}, key: ${options.cacheKey}`);
      return { cancelled: false, data: dataToReturn };
    }
    
    // No valid cached data, prompt user
    console.error(`Prompting user for data for session: ${sessionId}, key: ${options.cacheKey}`);
    
    let result;
    if (options.showLoginDialog) {
      // Use the predefined login dialog
      const { showLoginDialog } = await import('./ui-dialog.js');
      result = await showLoginDialog(options.dialogTitle, options.dialogMessage);
    } else {
      // Use custom dialog with specified fields
      const { showDialog } = await import('./ui-dialog.js');
      const defaultFields = [
        {
          name: "message",
          label: "Message",
          type: "text" as const,
          placeholder: "Enter your message here...",
          required: true
        }
      ];
      
      result = await showDialog({
        title: options.dialogTitle || "Input Required",
        message: options.dialogMessage,
        fields: options.customFields || defaultFields
      });
    }
    
    if (result.cancelled) {
      return result;
    }
    
    // Cache the result with expiration
    const cachedEntry = {
      data: result.data,
      expiresAt: now + expirationMs,
      createdAt: now,
      lastUsed: now
    };
    
    this.setData(options.cacheKey, cachedEntry, extra);
    
    // Return only requested fields if specified
    let dataToReturn = result.data;
    if (options.fieldsToShow) {
      dataToReturn = {};
      for (const field of options.fieldsToShow) {
        if (result.data[field] !== undefined) {
          dataToReturn[field] = result.data[field];
        }
      }
    }
    
    return { cancelled: false, data: dataToReturn };
  }
  
  /**
   * Clear cached user data for a specific key
   * @param cacheKey The cache key to clear
   * @param extra Extra context with session information
   */
  static clearUserData(cacheKey: string, extra?: any): void {
    const sessionId = this.getSessionId(extra);
    
    if (this.sessionData.has(sessionId)) {
      const sessionInfo = this.sessionData.get(sessionId)!;
      sessionInfo.data.delete(cacheKey);
      sessionInfo.lastAccessed = Date.now();
    }
  }
  
  /**
   * Check if user data exists and is not expired
   * @param cacheKey The cache key to check
   * @param extra Extra context with session information
   * @returns true if valid cached data exists, false otherwise
   */
  static hasValidUserData(cacheKey: string, extra?: any): boolean {
    const cachedData = this.getData(cacheKey, extra);
    if (!cachedData || !cachedData.expiresAt) {
      return false;
    }
    
    return Date.now() < cachedData.expiresAt;
  }
  
}
