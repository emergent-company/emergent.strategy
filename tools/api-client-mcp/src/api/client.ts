/**
 * API Client
 *
 * Makes HTTP requests to the Emergent API with automatic authentication.
 */

import { getAccessToken } from '../auth/token-manager.js';
import { getConfig, debug } from '../config.js';

export interface ApiRequest {
  method: string;
  path: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Substitute path parameters in URL template
 * e.g., "/api/documents/{id}" + { id: "123" } => "/api/documents/123"
 */
function substitutePathParams(
  pathTemplate: string,
  params?: Record<string, string>
): string {
  if (!params) return pathTemplate;

  let result = pathTemplate;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, encodeURIComponent(value));
  }
  return result;
}

/**
 * Build query string from params object
 */
function buildQueryString(params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return '';

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.append(key, value);
  }
  return '?' + searchParams.toString();
}

/**
 * Parse response headers into a simple object
 */
function parseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Make an API request with automatic authentication
 */
export async function callApi(request: ApiRequest): Promise<ApiResponse> {
  const config = getConfig();

  // Build URL
  const pathWithParams = substitutePathParams(request.path, request.pathParams);
  const queryString = buildQueryString(request.queryParams);
  const url = `${config.serverUrl}${pathWithParams}${queryString}`;

  debug('client', `Preparing request`, {
    method: request.method,
    url,
    path: request.path,
    pathParams: request.pathParams,
    queryParams: request.queryParams,
    hasBody: request.body !== undefined,
  });

  // Get access token
  const accessToken = await getAccessToken();

  debug('client', `Got access token`, {
    tokenPreview: accessToken.slice(0, 10) + '...' + accessToken.slice(-10),
  });

  // Build headers
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...request.headers,
  };

  // Add Content-Type for requests with body
  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  console.error(
    `[api-client] ${request.method} ${pathWithParams}${queryString}`
  );

  // Make request
  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.body !== undefined) {
    fetchOptions.body = JSON.stringify(request.body);
    debug('client', `Request body`, request.body);
  }

  debug('client', `Sending request`, {
    url,
    method: request.method,
    headers: {
      ...headers,
      Authorization: 'Bearer [REDACTED]',
    },
  });

  const response = await fetch(url, fetchOptions);

  // Parse response body
  let body: unknown;
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
  } else {
    body = await response.text();
  }

  debug('client', `Response received`, {
    status: response.status,
    statusText: response.statusText,
    contentType,
    bodyType: typeof body,
    bodyPreview:
      typeof body === 'string'
        ? body.slice(0, 200) + (body.length > 200 ? '...' : '')
        : Array.isArray(body)
        ? `Array(${body.length})`
        : typeof body === 'object' && body !== null
        ? Object.keys(body).join(', ')
        : body,
  });

  console.error(
    `[api-client] Response: ${response.status} ${response.statusText}`
  );

  return {
    status: response.status,
    statusText: response.statusText,
    headers: parseHeaders(response.headers),
    body,
  };
}

/**
 * Convenience methods for common HTTP verbs
 */
export async function get(
  path: string,
  options?: Omit<ApiRequest, 'method' | 'path'>
): Promise<ApiResponse> {
  return callApi({ method: 'GET', path, ...options });
}

export async function post(
  path: string,
  body?: unknown,
  options?: Omit<ApiRequest, 'method' | 'path' | 'body'>
): Promise<ApiResponse> {
  return callApi({ method: 'POST', path, body, ...options });
}

export async function put(
  path: string,
  body?: unknown,
  options?: Omit<ApiRequest, 'method' | 'path' | 'body'>
): Promise<ApiResponse> {
  return callApi({ method: 'PUT', path, body, ...options });
}

export async function patch(
  path: string,
  body?: unknown,
  options?: Omit<ApiRequest, 'method' | 'path' | 'body'>
): Promise<ApiResponse> {
  return callApi({ method: 'PATCH', path, body, ...options });
}

export async function del(
  path: string,
  options?: Omit<ApiRequest, 'method' | 'path'>
): Promise<ApiResponse> {
  return callApi({ method: 'DELETE', path, ...options });
}
