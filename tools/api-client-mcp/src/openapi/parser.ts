/**
 * OpenAPI Parser
 *
 * Parses the OpenAPI spec (openapi.yaml) and extracts endpoint information
 * for the list_endpoints and call_api tools.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EndpointInfo {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterInfo[];
  requestBody?: RequestBodyInfo;
}

export interface ParameterInfo {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface RequestBodyInfo {
  required?: boolean;
  description?: string;
  contentType?: string;
  schema?: Record<string, unknown>;
}

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, Record<string, OpenAPIOperation>>;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<
      string,
      {
        schema?: Record<string, unknown>;
      }
    >;
  };
}

interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
];

let cachedEndpoints: EndpointInfo[] | null = null;
let cachedSpecPath: string | null = null;

/**
 * Find the OpenAPI spec file
 */
function findSpecPath(): string {
  // From src/openapi/ -> src/ -> api-client-mcp/ -> tools/ -> emergent/
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const yamlPath = path.join(workspaceRoot, 'openapi.yaml');

  if (fs.existsSync(yamlPath)) {
    return yamlPath;
  }

  // Try JSON version
  const jsonPath = path.join(workspaceRoot, 'openapi.json');
  if (fs.existsSync(jsonPath)) {
    return jsonPath;
  }

  throw new Error(
    `OpenAPI spec not found. Looked in:\n  - ${yamlPath}\n  - ${jsonPath}`
  );
}

/**
 * Parse the OpenAPI spec and extract endpoints
 */
export function parseOpenAPISpec(specPath?: string): EndpointInfo[] {
  const resolvedPath = specPath || findSpecPath();

  // Return cached if same path
  if (cachedEndpoints && cachedSpecPath === resolvedPath) {
    return cachedEndpoints;
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const spec: OpenAPISpec = resolvedPath.endsWith('.json')
    ? JSON.parse(content)
    : YAML.parse(content);

  const endpoints: EndpointInfo[] = [];

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as OpenAPIOperation | undefined;
      if (!operation) continue;

      const endpoint: EndpointInfo = {
        method: method.toUpperCase(),
        path: pathTemplate,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
      };

      // Extract parameters
      if (operation.parameters && operation.parameters.length > 0) {
        endpoint.parameters = operation.parameters.map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required,
          description: p.description,
          schema: p.schema,
        }));
      }

      // Extract request body info
      if (operation.requestBody) {
        const rb = operation.requestBody;
        const jsonContent = rb.content?.['application/json'];

        endpoint.requestBody = {
          required: rb.required,
          description: rb.description,
          contentType: jsonContent ? 'application/json' : undefined,
          schema: jsonContent?.schema,
        };
      }

      endpoints.push(endpoint);
    }
  }

  // Cache results
  cachedEndpoints = endpoints;
  cachedSpecPath = resolvedPath;

  return endpoints;
}

/**
 * Search endpoints by filter string
 */
export function searchEndpoints(filter?: string): EndpointInfo[] {
  const endpoints = parseOpenAPISpec();

  if (!filter || filter.trim() === '') {
    return endpoints;
  }

  const searchTerm = filter.toLowerCase();

  return endpoints.filter((ep) => {
    return (
      ep.path.toLowerCase().includes(searchTerm) ||
      ep.operationId?.toLowerCase().includes(searchTerm) ||
      ep.summary?.toLowerCase().includes(searchTerm) ||
      ep.description?.toLowerCase().includes(searchTerm) ||
      ep.tags?.some((t) => t.toLowerCase().includes(searchTerm))
    );
  });
}

/**
 * Find a specific endpoint by method and path
 */
export function findEndpoint(
  method: string,
  path: string
): EndpointInfo | undefined {
  const endpoints = parseOpenAPISpec();
  const upperMethod = method.toUpperCase();

  return endpoints.find((ep) => ep.method === upperMethod && ep.path === path);
}

/**
 * Clear the cached spec (useful for testing)
 */
export function clearCache(): void {
  cachedEndpoints = null;
  cachedSpecPath = null;
}
