// API client implementation for Check Point MCP servers
import axios from 'axios';
import https from 'https';
import { classifyError, classifyHttpStatus, debugLoggableKeys, debugView, errorForLog, McpErrorCode, McpToolError } from '@chkp/mcp-utils';

/**
 * Management API request parameters whose values debug output may print.
 * Anything else, including login credentials and any parameter not listed
 * here, is shown as "(hidden, N chars)".
 */
const DEBUG_LOGGABLE_REQUEST_KEYS = debugLoggableKeys([
  'details-level', 'domain', 'filter', 'layer', 'limit', 'name', 'offset',
  'order', 'package', 'show-membership', 'targets', 'task-id', 'type', 'uid',
  'use-object-dictionary',
]);

/**
 * Enum representing the types of authentication tokens
 */
export enum TokenType {
  API_KEY = "API_KEY",
  CI_TOKEN = "CI_TOKEN"
}

function getMainPackageUserAgent(): string {
  if (process.env.CP_MCP_MAIN_PKG) {
    if (process.env.CP_MCP_MAIN_PKG.includes("quantum-management-mcp")) {
      return "mgmt-mcp";
    }
  }
  return "Check Point MCP API Client";
}

/**
 * Render an API error body as a single human-readable line.
 *
 * Check Point management APIs put the useful text under varying keys, so the
 * common ones are preferred before falling back to the raw JSON.
 */
export function describeResponseBody(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['message', 'error', 'error-message', 'errors', 'warnings']) {
      const value = record[key];
      if (typeof value === 'string' && value) return value;
    }
    try {
      return JSON.stringify(body);
    } catch {
      /* fall through */
    }
  }
  return String(body ?? 'no details provided');
}

/**
 * How long a single API request may wait for an answer. Without a limit, a
 * request the server never answers hangs the tool call. Long operations run as
 * tasks and are polled, so no single request should come near this.
 */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Statuses with which a login request is rejected over its credentials. On any
 * other request a 400 means bad input and a 403 a missing permission, but the
 * only input to a login is the credentials, so here all three mean they were
 * not accepted.
 */
const LOGIN_REJECTED_STATUSES: ReadonlySet<number> = new Set([400, 401, 403]);

/**
 * The code to report for a failed login. A connectivity failure or a server
 * error keeps its own code, so the caller is pointed at the network or the
 * server rather than at the API key. A rejection of the credentials, and a
 * failure with no other signal, is AUTH_FAILED.
 */
function loginErrorCode(code: McpErrorCode, upstreamStatus: number | undefined): McpErrorCode {
  if (upstreamStatus !== undefined && LOGIN_REJECTED_STATUSES.has(upstreamStatus)) {
    return McpErrorCode.AUTH_FAILED;
  }
  return code === McpErrorCode.INTERNAL ? McpErrorCode.AUTH_FAILED : code;
}

/**
 * Response from an API client call
 */
export class ClientResponse {
  constructor(
    public status: number,
    public response: Record<string, any>
  ) {}
}

/**
 * Base class for API clients
 */
export abstract class APIClientBase {
  protected sid: string | null = null;
  protected sessionTimeout: number | null = null; // in seconds
  protected sessionStart: number | null = null;   // timestamp when session was created
  protected isMDS: boolean = false; // Whether this is an MDS environment
  protected _externalSid: boolean = false; // Whether the SID was provided externally (X-chkp-sid)
  private _debug?: boolean;

  constructor(
    protected readonly authToken: string = "",
    protected readonly tokenType: TokenType = TokenType.API_KEY, // Default
    protected readonly cloudConnected: boolean = false,
    protected readonly proxyToken?: string,
  ) {}

  /**
   * Bearer for a cloud-connected management
   */
  protected getProxyBearer(): string | undefined {
    if (!this.cloudConnected) return undefined;
    return this.tokenType === TokenType.CI_TOKEN ? this.authToken : this.proxyToken;
  }

  /**
   * Get the host URL for the API client
   */
  abstract getHost(): string;
    /**
   * Create an API client instance - generic method for creating clients
   */
  static create<T extends APIClientBase>(this: new (...args: any[]) => T, ...args: any[]): T {
    return new this(...args);
  }

  /**
   * Get headers for the API requests
   */
  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": getMainPackageUserAgent(),
    };
    
    // Only add the X-chkp-sid header if we have a valid session ID
    if (this.sid) {
      headers["X-chkp-sid"] = this.sid;
    }

    // When cloud-connected, authenticate every request to the CloudInfra proxy
    // via Authorization Bearer (same as login). CLOUD-INFRA-TOKEN is kept for
    // any downstream services that expect it.
    const proxyBearer = this.getProxyBearer();
    if (proxyBearer) {
      headers["Authorization"] = `Bearer ${proxyBearer}`;
      headers["CLOUD-INFRA-TOKEN"] = proxyBearer;
    }

    return headers;
  }

  /**
   * Get debug mode
   */
  get debug(): boolean {
    return !!this._debug;
  }

  /**
   * Set debug mode
   */
  set debug(value: boolean) {
    this._debug = value;
  }

 /**
   * Set a pre-authenticated session ID provided externally (e.g. via X-chkp-sid header).
   * When set, the client will skip login and use this SID directly for all requests.
   */
  setExternalSid(sid: string): void {
    this.sid = sid;
    this._externalSid = true;
    this.sessionStart = Date.now();
    this.sessionTimeout = Number.MAX_SAFE_INTEGER / 1000;
  }

  /**
   * Check if this client needs to perform login before making API calls
   */
  protected needsLogin(): boolean {
    // Skip login when a pre-authenticated SID was provided externally
    if (this._externalSid) {
      return false;
    }
    return true;
  }
  
  /**
   * Check if this client is in an MDS environment
   */
  async isMDSEnvironment(): Promise<boolean> {
    if (!this.hasValidSession()) {
      try {
        await this.login();
      } catch (error: unknown) {
        throw this.loginFailure(error, 'Login');
      }
    }
    return this.isMDS;
  }

  /** Extra guidance for a login whose credentials were rejected. */
  protected rejectedLoginHint(): string {
    return '';
  }

  /**
   * Check if the client has a valid session
   */
  hasValidSession(): boolean {
    return !!this.sid && !this.isSessionExpired();
  }

  /**
   * Get the current session ID (for debugging/logging purposes)
   */
  getSessionId(): string | null {
    return this.sid;
  }

  /**
   * Create a new API client instance with a specific session ID
   * Used for domain-specific clients in MDS environments
   */
  static createWithSid<T extends APIClientBase>(
    this: new (...args: any[]) => T,
    originalClient: T,
    sid: string
  ): T {
    // Create a new instance with the same configuration as the original
    const newClient = Object.create(Object.getPrototypeOf(originalClient));
    Object.assign(newClient, originalClient);
    
    // Set the new session ID
    newClient.sid = sid;
    newClient.sessionStart = Date.now();
    
    return newClient;
  }

  /**
   * Convert any login failure into a coded error to throw.
   *
   * A failed login is thrown, never returned as a ClientResponse: returning it
   * would hand the error body to the caller as ordinary API data, leaving
   * nothing to distinguish it from a successful response.
   *
   * The underlying cause is classified rather than assumed to be bad
   * credentials. A login that fails because the host is unreachable or timed
   * out is not an auth problem, and reporting it as one sends the caller to
   * check their API key instead of their connectivity. Only a failure with no
   * other signal is treated as AUTH_FAILED.
   *
   * The original error is neither attached as `cause` nor logged as an object:
   * an HTTP client error carries the request config, and for a login request
   * its body is the credentials.
   */
  private loginFailure(error: unknown, attempt: 'Login' | 'Login retry'): McpToolError {
    if (error instanceof ClientResponse) {
      // The management server answered and refused. Its reply is safe to log.
      console.error(`${attempt} failed with status ${error.status}:`, error.response);
      const classified = classifyHttpStatus(error.status);
      const code = loginErrorCode(classified.code, error.status);
      const hint = code === McpErrorCode.AUTH_FAILED ? this.rejectedLoginHint() : '';
      return new McpToolError(
        code,
        `Authentication failed: ${describeResponseBody(error.response)}${hint}`,
        { upstreamStatus: error.status, retryable: code === McpErrorCode.AUTH_FAILED ? false : classified.retryable }
      );
    }

    console.error(`${attempt} failed: ${errorForLog(error)}`);
    const classified = classifyError(error);
    const code = loginErrorCode(classified.error_code, classified.upstream_status);
    const hint = code === McpErrorCode.AUTH_FAILED ? this.rejectedLoginHint() : '';
    return new McpToolError(code, `Login failed: ${classified.error_message}${hint}`, {
      upstreamStatus: classified.upstream_status,
      retryable: code === McpErrorCode.AUTH_FAILED ? false : classified.retryable,
    });
  }

  /**
   * Call an API endpoint
   */
  async callApi(
    method: string,
    uri: string,
    data: Record<string, any>,
    params?: Record<string, any>
  ): Promise<ClientResponse> {

    if (this.needsLogin() && (!this.sid || this.isSessionExpired())) {
      try {
        await this.login();
      }
      catch (error: unknown) {
        throw this.loginFailure(error, 'Login');
      }
    }

    let httpsAgent;
    if (this instanceof OnPremAPIClient) {
      // Allow self-signed certs for on-prem management servers
      httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    try {
      return await this.makeRequest(
          this.getHost(),
          method,
          uri,
          data,
          this.getHeaders(),
          params,
          httpsAgent
      );
    } catch (error: any) {
      // If we get a 401 error with "session" in the message, the session has expired on the server side
      // Reset the session and retry once
      const status = error instanceof McpToolError ? error.upstreamStatus : error.response?.status;
      if ((status === 401 || error.message?.includes('401')) &&
          error.message?.toLowerCase().includes('session')) {

        if (this._externalSid) {
          throw new McpToolError(
            McpErrorCode.AUTH_FAILED,
            'Pre-authenticated session (X-chkp-sid) has expired. Provide a new session ID.',
            { upstreamStatus: 401, retryable: false }
          );
        }

        console.error("Session expired (401), resetting session and retrying...");
        this.sid = null;
        this.sessionStart = null;

        // Re-login and retry the request
        try {
          await this.login();
        } catch (loginError: unknown) {
          throw this.loginFailure(loginError, 'Login retry');
        }

        // Retry the original request with the new session
        return await this.makeRequest(
            this.getHost(),
            method,
            uri,
            data,
            this.getHeaders(),
            params,
            httpsAgent
        );
      }

      // For other errors, just re-throw the original error
      throw error;
    }
  }

  /**
   * Check if the session is expired based on sessionTimeout and sessionStart
   */
  protected isSessionExpired(): boolean {
    if (!this.sid || !this.sessionTimeout || !this.sessionStart) return true;
    const now = Date.now();
    // Add a small buffer (5 seconds) to avoid edge cases
    return now > (this.sessionStart + (this.sessionTimeout - 5) * 1000);
  }

  protected getHeadersForLogin(): Record<string, string> {
    return { "Content-Type": "application/json" };
  }

  /**
   * Login to the API using the API key
   */
  async login(): Promise<string> {
    if (this._externalSid) {
      if (!this.sid) throw new Error('External SID has expired');
      return this.sid;
    }
    const apiTokenHeader = this.tokenType === TokenType.API_KEY ? "api-key" : "ci-token";
    const loginResp = await this.makeRequest(
      this.getHost(),
      "POST",
      "login",
      { [apiTokenHeader] : this.authToken },
      this.getHeadersForLogin()
    );
    if (loginResp.status !== 200 || !loginResp.response || !loginResp.response.sid) {
      throw loginResp;
    }
    this.sid = loginResp.response.sid;

    this.sessionTimeout = loginResp.response["session-timeout"] || null;
    this.sessionStart = Date.now();
    
    // Check if this is an MDS environment by calling get-session with the session UID
    if (loginResp.response.uid) {
      await this.detectMDS(loginResp.response.uid); // handleSelfSigned = false (default) for cloud
    }
    
    return loginResp.response.sid;
  }

  /**
   * Detect if this is an MDS environment by checking the session details
   */
  protected async detectMDS(sessionUid: string, handleSelfSigned: boolean = false): Promise<void> {
    try {
      let httpsAgent;
      if (handleSelfSigned) {
        httpsAgent = new https.Agent({ rejectUnauthorized: false });
      }
      
      const sessionResp = await this.makeRequest(
        this.getHost(),
        "POST", 
        "show-session",
        { uid: sessionUid },
        this.getHeaders(),
        null,
        httpsAgent
      );
      
      if (sessionResp.status === 200 &&
          sessionResp.response?.domain?.["domain-type"] === "mds") {
        this.isMDS = true;
      }
    } catch (error) {
      // If we can't determine MDS status, assume it's not MDS
      console.warn(`Could not determine MDS status: ${errorForLog(error)}`);
      this.isMDS = false;
    }
  }

  /**
   * Make a request to a Check Point API
   */
  async makeRequest(
    host: string,
    method: string,
    uri: string,
    data: Record<string, any>,
    headers: Record<string, string> = {},
    params: Record<string, any> | null = null,
    httpsAgent?: https.Agent
  ): Promise<ClientResponse> {
    // Ensure uri doesn't start with a slash
    uri = uri.replace(/^\//, "");
    const url = `${host}/${uri}`;    
    const config: any = {
      method: method.toUpperCase(),
      url,
      headers,
      params: params || undefined,
      timeout: REQUEST_TIMEOUT_MS
    };
    
    // Add httpsAgent if provided (for handling self-signed certificates)
    if (httpsAgent) {
      config.httpsAgent = httpsAgent;
    }

    // Only set data for non-GET requests
    if (method.toUpperCase() !== 'GET' && data !== undefined) {
      config.data = data;
    }

    console.error(`API Request: ${method} ${url}`);

    try {
      const response = await axios(config);
      return new ClientResponse(response.status, response.data as Record<string, any>);
    } catch (error: any) {
      if (error.response) {
        // Status and URL only. The response headers and body are not logged:
        // they can carry session cookies and customer data, and the error
        // thrown below already carries a bounded description of the body.
        console.error(`❌ API Error (${error.response.status}): ${method} ${url}`);

        // Print the request details when debug is enabled. Only allowlisted
        // values are printed: headers and bodies carry the session ID and
        // login credentials.
        if (this.debug) {
          console.error('Debug mode: Printing request details:');
          console.error('Request Method:', method);
          console.error('Request URL:', url);
          console.error('Request Headers:', debugView(config.headers));
          console.error('Request Data:', debugView(
            config.data && typeof config.data === 'object' ? config.data : { body: config.data },
            DEBUG_LOGGABLE_REQUEST_KEYS
          ));
        }
      }
      
      if (error.response) {
        // Typed so the status and a stable code survive, rather than being
        // flattened into prose that consumers have to parse back.
        const status = error.response.status;
        const { code, retryable } = classifyHttpStatus(status);
        throw new McpToolError(
          code,
          `API request failed: ${status} - ${describeResponseBody(error.response.data)}`,
          { upstreamStatus: status, retryable }
        );
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new McpToolError(
          McpErrorCode.TIMEOUT,
          `API request ${uri} got no answer within ${REQUEST_TIMEOUT_MS / 1000}s`
        );
      }
      throw error;
    }
  }
}

/**
 * API client for Smart One Cloud
 */
export class SmartOneCloudAPIClient extends APIClientBase {
  constructor(
    authToken: string,
    tokenType: TokenType,
    private readonly s1cUrl: string,
    cloudConnected: boolean = false,
    proxyToken?: string,
  ) {
    super(authToken, tokenType, cloudConnected, proxyToken);
  }

  getHost(): string {
    return this.s1cUrl;
  }

  protected getHeadersForLogin(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const proxyBearer = this.getProxyBearer();
    if (proxyBearer) {
      headers["Authorization"] = `Bearer ${proxyBearer}`;
    }
    return headers;
  }

}

/**
 * API client for Bearer token authentication
 * Does not use session management - uses Bearer token directly
 */
export class BearerTokenAPIClient extends APIClientBase {
  constructor(
    private readonly bearerToken: string,
    private readonly baseUrl: string
  ) {
    super(""); // No auth token needed for base class
  }

  getHost(): string {
    return this.baseUrl;
  }

  /**
   * Override getHeaders to use Authorization Bearer instead of X-chkp-sid
   */
  protected getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "User-Agent": getMainPackageUserAgent(),
      "Authorization": `Bearer ${this.bearerToken}`
    };
  }

  /**
   * Override needsLogin - Bearer token doesn't need session management
   */
  protected needsLogin(): boolean {
    return false;
  }
}

/**
 * API client for on-premises management server
 * Allows self-signed certificates and username/password authentication
 */
export class OnPremAPIClient extends APIClientBase {
  private readonly username?: string;
  private readonly password?: string;

  constructor(
    apiKey: string | undefined,
    private readonly managementHost: string,
    private readonly managementPort: string = "443",
    username?: string,
    password?: string,
    private readonly domain?: string
  ) {
    super(apiKey || ""); // APIClientBase requires apiKey, but we'll handle empty case
    this.username = username;
    this.password = password;
  }

  protected override rejectedLoginHint(): string {
    // On a Multi-Domain Server, a login without a domain goes to the System
    // Domain, which credentials scoped to some domains cannot enter.
    return this.domain
      ? ''
      : ' If these credentials only have access to specific domains of a Multi-Domain Server, ' +
        'set MANAGEMENT_DOMAIN to one of them.';
  }

  getHost(): string {
    const managementHost =  this.managementHost;
    const port = this.managementPort;
    return `https://${managementHost}:${port}/web_api`;
  }

    /**
   * Override login() to support both api-key and username/password authentication
   * and allow self-signed certificates
   */
  async login(): Promise<string> {
    if (this._externalSid) {
      if (!this.sid) throw new Error('External SID has expired');
      return this.sid;
    }
    // Determine if we're using API key or username/password
    const isUsingApiKey = !!this.authToken;
    const isUsingCredentials = !!(this.username && this.password);
    
    if (!isUsingApiKey && !isUsingCredentials) {
      // Create and throw a ClientResponse directly for credential errors
      throw new ClientResponse(
        401, 
        { message: "Authentication failed: No API key or username/password provided" }
      );
    }

    // Allow self-signed certs for on-prem management servers
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    // Prepare login payload based on authentication method
    const loginPayload: Record<string, any> = isUsingApiKey
      ? { "api-key": this.authToken }
      : { "user": this.username, "password": this.password };

    if (this.domain) {
      loginPayload["domain"] = this.domain;
    }
    
    const loginResp = await this.makeRequest(
      this.getHost(),
      "POST",
      "login",
      loginPayload,
      { "Content-Type": "application/json" },
      null,
      httpsAgent
    );

    if (loginResp.status !== 200 || !loginResp.response || !loginResp.response.sid) {
      throw loginResp;
    }

    this.sid = loginResp.response.sid;
    this.sessionTimeout = loginResp.response["session-timeout"] || null;
    this.sessionStart = Date.now();

    // Check if this is an MDS environment by calling get-session with the session UID
    if (loginResp.response.uid) {
      await this.detectMDS(loginResp.response.uid, true); // handleSelfSigned = true for OnPrem
    }

    return loginResp.response.sid;
  }
}
