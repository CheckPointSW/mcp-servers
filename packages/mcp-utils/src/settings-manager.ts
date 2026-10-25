import { debugLoggableKeys, debugView, sessionLogLabel } from './debug-view.js';
import {
  ConnectionSource,
  HeaderRecord,
  aliasMap,
  canonicalizeAliases,
  chooseConnectionSource,
  headersRead,
  keySet,
  operatorHeaders,
  sessionHeaders,
} from './connection-source.js';

/**
 * SettingsManager for MCP servers with multi-user support.
 * This class manages settings on a per-session basis for all MCP servers.
 */
export class SettingsManager {
  private settingsMap: Map<string, any> = new Map();
  private defaultSessionId: string = 'default';
  private settingsClass: any;
  private loggableKeys: Set<string>;
  private basicKeys: Set<string>;
  private headerAliases: Map<string, string>;
  private operatorSettingsOverHttp: boolean;
  private operatorValues: HeaderRecord = {};
  // Where each HTTP session's connection settings come from, fixed by the
  // request that created the session (see connection-source.ts).
  private sessionSources: Map<string, ConnectionSource> = new Map();
  
  // Global debug state that persists across all sessions and instances
  public static globalDebugState: string | string[] | boolean | undefined = undefined;

  /**
   * Creates a new SettingsManager
   * @param settingsClass The Settings class to use for creating settings instances
   */
  constructor(settingsClass: any) {
    this.settingsClass = settingsClass;
    // Keys whose values debug output may print; the settings class lists its
    // own (hosts, ports, regions, tuning) on top of the built-in ones.
    this.loggableKeys = debugLoggableKeys(settingsClass?.debugLoggableKeys ?? []);
    this.basicKeys = keySet(settingsClass?.basicKeys ?? []);
    this.headerAliases = aliasMap(settingsClass?.headerAliases);
    this.operatorSettingsOverHttp = settingsClass?.operatorSettingsOverHttp !== false;
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
   * @param scope 'process' when the operator set debug (CLI/env), which also
   *   updates the process-wide state; 'session' when a caller set it through a
   *   header, which affects only that session's settings
   * @private
   */
  private injectDebug(settings: any, source: Record<string, any>, scope: 'process' | 'session'): void {
    const debug = source?.debug ?? SettingsManager.globalDebugState ?? process.env.DEBUG;
    if (typeof debug !== 'undefined') {
      if (scope === 'process' && source?.debug !== undefined) {
        SettingsManager.globalDebugState = source.debug;
      }
      
      // Use the set method if available (for proper settings classes), otherwise set directly
      if (typeof settings.set === 'function') {
        settings.set('debug', debug);
      } else {
        settings.debug = debug;
      }

      if (debug) {
        console.error('Debug enabled. Source:');
        this.printDebugView(source);
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
        this.printDebugView(settings.data);
      } else {
        console.error('  Unable to enumerate settings properties - no accessible data structure');
      }
    } else {
      // For plain objects, show all enumerable properties
      console.error('Settings (plain object):');
      this.printDebugView(settings);
    }
  }

  /** Print allowlisted values; everything else as "(hidden, N chars)". */
  private printDebugView(record: Record<string, unknown>): void {
    Object.entries(debugView(record, this.loggableKeys)).forEach(([key, value]) => {
      console.error(`  ${key}: ${value}`);
    });
  }

  /**
   * Create settings from command-line arguments
   * @param args Command line arguments
   * @param sessionId Optional session ID
   * @returns Settings instance
   */
  createFromArgs(args: Record<string, any>, sessionId?: string): any {
    const settings = this.settingsClass.fromArgs(args);
    this.injectDebug(settings, args, 'process');
    this.setSettings(settings, sessionId);
    return settings;
  }
  
  /**
   * Record the operator's values (environment variables and parsed CLI
   * options, keyed by environment-variable name). HTTP sessions take basic
   * keys from them when the caller doesn't send its own, and their whole
   * connection set when the caller sends none of it.
   */
  setOperatorValues(values: Record<string, unknown>): void {
    this.operatorValues = canonicalizeAliases(operatorHeaders(values), this.headerAliases);
  }

  /**
   * Create settings from HTTP headers
   * @param headers HTTP headers
   * @param sessionId Optional session ID
   * @returns Settings instance
   */
  createFromHeaders(headers: Record<string, string | string[]>, sessionId?: string): any {
    const verbose = SettingsManager.globalDebugState;

    if (verbose) {
      console.error('[SettingsManager.createFromHeaders] Verbose: Starting with session:', sessionLogLabel(sessionId));
      console.error('[SettingsManager.createFromHeaders] Verbose: Incoming headers count:', Object.keys(headers).length);
    }

    // Print headers if debug is enabled globally (allowlisted values only)
    if (SettingsManager.globalDebugState) {
      console.error('=== createFromHeaders Debug Info ===');
      console.error('Incoming headers:');
      this.printDebugView(headers);
    }

    // Early check - if headers is empty or has no meaningful values
    if (verbose && (!headers || Object.keys(headers).length === 0)) {
      console.error('[SettingsManager.createFromHeaders] Verbose: WARNING - Headers object is empty or undefined');
    }

    // Convert headers with underscores to hyphens
    const normalizedHeaders: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(headers)) {
      const normalizedKey = key.includes('_') ? key.replace(/_/g, '-') : key;
      normalizedHeaders[normalizedKey] = value;
      if (verbose) {
        console.error(`[SettingsManager.createFromHeaders] Verbose: Header normalized: "${key}" -> "${normalizedKey}"`);
      }
    }

    if (verbose) {
      console.error('[SettingsManager.createFromHeaders] Verbose: Normalized headers count:', Object.keys(normalizedHeaders).length);
    }

    if (SettingsManager.globalDebugState) {
      console.error('Normalized header names:', Object.keys(normalizedHeaders));
    }

    const debugHeader = normalizedHeaders['debug'] || normalizedHeaders['Debug'] || normalizedHeaders['DEBUG'];
    const requestedDebug = Array.isArray(debugHeader) ? debugHeader[0] : debugHeader;

    // A debug header turns debug on or off for this session only; otherwise
    // the session follows the process-wide state.
    const debugSource = {
      debug: requestedDebug !== undefined ? requestedDebug.toLowerCase() === 'true' : SettingsManager.globalDebugState,
    };

    const callerHeaders = canonicalizeAliases(normalizedHeaders, this.headerAliases);
    const source = this.connectionSource(callerHeaders, sessionId);
    const inputHeaders = sessionHeaders(
      source,
      callerHeaders,
      this.operatorValues,
      this.basicKeys,
      this.operatorSettingsOverHttp
    );

    if (verbose) {
      console.error('[SettingsManager.createFromHeaders] Verbose: Connection settings source:', source);
      console.error('[SettingsManager.createFromHeaders] Verbose: Calling settingsClass.fromHeaders');
    }
    const settings = this.settingsClass.fromHeaders(inputHeaders);
    if (verbose) {
      console.error('[SettingsManager.createFromHeaders] Verbose: Settings object created');
    }

    this.injectDebug(settings, debugSource, 'session');

    // Print final settings if debug is enabled
    if (SettingsManager.globalDebugState) {
      console.error('Final settings object for session:', sessionLogLabel(sessionId));
      this.printSettingsDebug(settings);
      console.error('=== End createFromHeaders Debug Info ===');
    }

    if (verbose) {
      console.error('[SettingsManager.createFromHeaders] Verbose: Storing settings for session:', sessionLogLabel(sessionId));
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
      this.sessionSources.delete(sessionId);
    }
  }

  /**
   * The session's connection source: decided by the request that creates the
   * session and kept for its lifetime, so a later request cannot switch it.
   */
  private connectionSource(headers: HeaderRecord, sessionId?: string): ConnectionSource {
    const known = sessionId ? this.sessionSources.get(sessionId) : undefined;
    if (known) return known;
    const source = chooseConnectionSource(
      headersRead((h) => this.settingsClass.fromHeaders(h), headers),
      this.basicKeys
    );
    if (sessionId) this.sessionSources.set(sessionId, source);
    return source;
  }
}
