import { SessionContext } from './session-context.js';

const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
/**
 * Session information object
 */
export interface SessionInfo {
  sessionId: string;
  createdAt: Date;
  lastActive: Date;
  userAgent?: string;
  origin?: string;
  [key: string]: any; // Additional session metadata
}

/**
 * Manages MCP server sessions and their lifecycle
 */
export class SessionManager {
  // Store session info by session ID
  private sessions: Map<string, SessionInfo> = new Map();
  
  /**
   * Create a new session
   * @param sessionId The session ID
   * @param metadata Optional metadata to store with the session
   * @returns Session info
   */
  createSession(sessionId: string, metadata: Record<string, any> = {}): SessionInfo {
    const now = new Date();
    const sessionInfo: SessionInfo = {
      sessionId,
      createdAt: now,
      lastActive: now,
      ...metadata
    };
    
    this.sessions.set(sessionId, sessionInfo);
    return sessionInfo;
  }
  
  /**
   * Get info for a session
   * @param sessionId The session ID
   * @returns Session info or undefined if not found
   */
  getSession(sessionId: string): SessionInfo | undefined {
    if (this.sessions.has(sessionId)) {
        // Update last active time
        this.touchSession(sessionId);
    }
    return this.sessions.get(sessionId);
  }
  
  /**
   * Update session activity timestamp
   * @param sessionId The session ID
   */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActive = new Date();
    }
  }
  
  /**
   * Remove a session
   * @param sessionId The session ID
   */
  removeSession(sessionId: string): void {
    // Clean up the session
    this.sessions.delete(sessionId);
    
    // Also clean up associated data in SessionContext
    SessionContext.clearSessionData(sessionId);
  }
  
  /**
   * Get all active sessions
   * @returns Array of session info objects
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }
  
  /**
   * Get count of active sessions
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
  
  /**
   * Clean up inactive sessions older than the specified timeout
   * @param timeoutMs Timeout in milliseconds (default: 30 minutes)
   * @returns Number of sessions removed
   */
  cleanupInactiveSessions(timeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS): number {
    const now = new Date();
    let removedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now.getTime() - session.lastActive.getTime();
      if (inactiveTime > timeoutMs) {
        this.removeSession(sessionId);
        removedCount++;
      }
    }
    
    return removedCount;
  }
}
