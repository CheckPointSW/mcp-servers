import { randomUUID } from 'crypto';

/**
 * Check if an error is retryable (5xx server error or connection error)
 */
function isRetryableError(error: any): boolean {
  // HTTP status errors - retry on 5xx
  if (error.response && error.response.status >= 500) {
    return true;
  }
  // Connection errors - retry on network issues
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Async HTTP client with simple retry logic for Argos API.
 * 
 * Conventions:
 * - All network operations are async and awaited at call sites
 * - Exposes customerId for callers constructing request payloads
 * - Minimal side effects; caller handles response parsing/validation
 */
export class ArgosERMAPIManager {
  private readonly baseUrl: string;
  private readonly token: string;
  public readonly customerId: string;
  private readonly retries: number;
  private readonly backoffFactor: number;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly argosHost: string,
    private readonly argosApiKey: string,
    argosCustomerId: string
  ) {
    this.baseUrl = argosHost;
    this.token = argosApiKey;
    this.customerId = argosCustomerId;
    this.retries = 2;
    this.backoffFactor = 0.5;

    if (!this.baseUrl) {
      throw new Error('ARGOS_SERVER_URL environment variable not set');
    }
    if (!this.token) {
      throw new Error('ARGOS_INTEGRATION_TOKEN environment variable not set');
    }
    if (!this.customerId) {
      throw new Error('ARGOS_CUSTOMER_ID environment variable not set');
    }

    // Define headers matching Python client
    this.headers = {
      'X-Integration-Type': 'MCP',
      'X-Integration-Instance-Id': randomUUID(),
      'X-Integration-Instance-Name': this.customerId,
      'X-Integration-Customer-Name': this.customerId,
      'X-Integration-Version': '1.0.0',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a new ArgosERMAPIManager instance from settings
   * @param settings The complete settings object for this session
   * @returns A new ArgosERMAPIManager instance
   */
  static create(settings: any): ArgosERMAPIManager {
    return new ArgosERMAPIManager(
      settings.argosHost,
      settings.argosApiKey,
      settings.argosCustomerId
    );
  }

  /**
   * Make an HTTP request with retry logic (exponential backoff)
   */
  private async makeRequest(
    method: string,
    endpoint: string,
    options: {
      params?: Record<string, any>;
      json?: Record<string, any>;
    } = {}
  ): Promise<Response> {
    let lastError: Error | undefined;
    
    // Attempt request up to 3 times (initial + 2 retries)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Build URL with query parameters
        const url = new URL(endpoint, this.baseUrl);
        if (options.params) {
          Object.entries(options.params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              url.searchParams.append(key, String(value));
            }
          });
        }

        // Build request options
        const fetchOptions: RequestInit = {
          method,
          headers: {
            ...this.headers,
            'Cookie': `access_token=${this.token}`,
          },
        };

        if (options.json) {
          fetchOptions.body = JSON.stringify(options.json);
        }

        // Make the request
        const response = await fetch(url.toString(), fetchOptions);

        // Check for HTTP errors
        if (!response.ok) {
          const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.response = response;
          throw error;
        }

        return response;
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        if (!isRetryableError(error)) {
          throw error;
        }

        // If this was the last attempt, throw
        if (attempt === 2) {
          throw new Error('Request failed after all retries.');
        }

        // Calculate backoff delay: 0.5 * (2^attempt) seconds -> milliseconds
        const delayMs = this.backoffFactor * Math.pow(2, attempt) * 1000;
        await sleep(delayMs);
      }
    }

    // Should never reach here, but TypeScript requires it
    throw lastError || new Error('Request failed after all retries.');
  }

  /**
   * Perform GET request
   */
  async get(endpoint: string, params?: Record<string, any>): Promise<Response> {
    return this.makeRequest('GET', endpoint, { params });
  }

  /**
   * Perform POST request
   */
  async post(endpoint: string, json?: Record<string, any>): Promise<Response> {
    return this.makeRequest('POST', endpoint, { json });
  }

  /**
   * Call an API endpoint (legacy compatibility method)
   * @param method HTTP method
   * @param uri API URI (relative path)
   * @param data Request data
   * @returns API response
   */
  async callApi(method: string, uri: string, data: Record<string, any>): Promise<Record<string, any>> {
    const response = method === 'GET' 
      ? await this.get(uri, data)
      : await this.post(uri, data);
    
    return response.json();
  }
}
