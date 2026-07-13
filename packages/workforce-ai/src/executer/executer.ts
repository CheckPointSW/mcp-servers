import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

import { JsonObject, McpToolDefinition } from '../types/types.js';
import { formatApiError } from '../core/utils.js';

/**
 * Builds an Axios request configuration from a tool definition and arguments.
 *
 * The base URL and bearer token are supplied by the caller (the per-session
 * WorkforceApiManager) rather than a process-global session singleton — this is
 * the only behavioural change from the standalone server. Header names, the
 * `x-api-source: mcp` marker, path/query/header parameter mapping, and request
 * body handling are preserved exactly.
 */
export function buildRequest(
  definition: McpToolDefinition,
  toolArgs: JsonObject,
  baseUrl: string,
  token: string,
): AxiosRequestConfig {
  let urlPath = definition.pathTemplate;
  const queryParams: Record<string, any> = {};
  const headers: Record<string, string> = { Accept: 'application/json', 'x-api-source': 'mcp' };
  let requestBodyData: any = undefined;

  // Apply parameters to URL path, query, or headers
  definition.executionParameters.forEach((param) => {
    const value = toolArgs[param.name];
    if (typeof value !== 'undefined' && value !== null) {
      if (param.in === 'path') {
        urlPath = urlPath.replace(`{${param.name}}`, encodeURIComponent(String(value)));
      } else if (param.in === 'query') {
        queryParams[param.name] = value;
      } else if (param.in === 'header') {
        headers[param.name.toLowerCase()] = String(value);
      }
    }
  });

  // Ensure all path parameters are resolved
  if (urlPath.includes('{')) {
    throw new Error(`Failed to resolve path parameters: ${urlPath}`);
  }

  // Handle request body
  if (definition.requestBodyContentType && typeof toolArgs['requestBody'] !== 'undefined') {
    requestBodyData = toolArgs['requestBody'];
    headers['content-type'] = definition.requestBodyContentType;
  }

  const requestUrl = `${baseUrl}${urlPath}`;
  headers['Authorization'] = `Bearer ${token}`;

  return {
    method: definition.method.toUpperCase(),
    url: requestUrl,
    params: queryParams,
    headers,
    ...(requestBodyData !== undefined && { data: requestBodyData }),
  };
}

/**
 * Builds a tool result from an API response
 */
export function buildResult(response: AxiosResponse): CallToolResult {
  let responseText = '';

  if (!response.data) {
    responseText = `(Status: ${response.status} - No body content)`;
  } else {
    try {
      responseText = JSON.stringify(response.data, null, 2);
    } catch {
      responseText = '[Stringify Error]';
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `API Response (Status: ${response.status}):\n${responseText}`,
      },
    ],
  };
}

/**
 * Builds an error result from an exception
 */
export function buildErrorResult(error: unknown): CallToolResult {
  let errorMessage: string;

  if (axios.isAxiosError(error)) {
    errorMessage = formatApiError(error);
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    errorMessage = 'Unexpected error: ' + String(error);
  }

  return { content: [{ type: 'text', text: errorMessage }] };
}
