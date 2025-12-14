/**
 * call_api Tool
 *
 * Makes API requests with automatic authentication.
 */

import { callApi, ApiResponse } from '../api/client.js';

export interface CallApiInput {
  method: string;
  path: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: unknown;
}

export const callApiSchema = {
  type: 'object' as const,
  properties: {
    method: {
      type: 'string',
      description: 'HTTP method (GET, POST, PUT, PATCH, DELETE)',
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    path: {
      type: 'string',
      description:
        'API path (e.g., "/api/documents", "/api/documents/{id}"). Use {param} for path parameters.',
    },
    pathParams: {
      type: 'object',
      description:
        'Path parameters to substitute (e.g., { "id": "abc123" } for /api/documents/{id})',
      additionalProperties: { type: 'string' },
    },
    queryParams: {
      type: 'object',
      description: 'Query parameters to append to the URL',
      additionalProperties: { type: 'string' },
    },
    body: {
      type: 'object',
      description:
        'Request body for POST/PUT/PATCH requests (will be JSON serialized)',
    },
  },
  required: ['method', 'path'],
};

function formatResponse(response: ApiResponse): string {
  const lines: string[] = [];

  lines.push(`Status: ${response.status} ${response.statusText}`);
  lines.push('');

  // Show key headers
  const importantHeaders = [
    'content-type',
    'x-request-id',
    'x-ratelimit-remaining',
  ];
  const headersToShow: string[] = [];
  for (const header of importantHeaders) {
    if (response.headers[header]) {
      headersToShow.push(`${header}: ${response.headers[header]}`);
    }
  }
  if (headersToShow.length > 0) {
    lines.push('Headers:');
    for (const h of headersToShow) {
      lines.push(`  ${h}`);
    }
    lines.push('');
  }

  // Format body
  lines.push('Body:');
  if (response.body === null || response.body === undefined) {
    lines.push('  (empty)');
  } else if (typeof response.body === 'object') {
    // Pretty print JSON with indentation
    const json = JSON.stringify(response.body, null, 2);
    // Indent each line
    for (const line of json.split('\n')) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push(`  ${String(response.body)}`);
  }

  return lines.join('\n');
}

export async function callApiTool(input: CallApiInput): Promise<string> {
  try {
    // Validate method
    const method = input.method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return `Error: Invalid HTTP method "${input.method}". Use GET, POST, PUT, PATCH, or DELETE.`;
    }

    // Validate path
    if (!input.path) {
      return 'Error: path is required';
    }

    // Ensure path starts with /
    const path = input.path.startsWith('/') ? input.path : '/' + input.path;

    // Make the request
    const response = await callApi({
      method,
      path,
      pathParams: input.pathParams,
      queryParams: input.queryParams,
      body: input.body,
    });

    return formatResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check for common error types
    if (message.includes('ECONNREFUSED')) {
      return `Error: Could not connect to the API server. Is the server running?\n\nDetails: ${message}`;
    }

    if (message.includes('Failed to acquire token')) {
      return `Error: Authentication failed. Check TEST_USER_EMAIL and TEST_USER_PASSWORD.\n\nDetails: ${message}`;
    }

    return `Error: ${message}`;
  }
}
