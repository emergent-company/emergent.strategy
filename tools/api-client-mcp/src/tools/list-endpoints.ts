/**
 * list_endpoints Tool
 *
 * Lists available API endpoints from the OpenAPI spec.
 */

import { searchEndpoints, EndpointInfo } from '../openapi/parser.js';

export interface ListEndpointsInput {
  filter?: string;
}

export const listEndpointsSchema = {
  type: 'object' as const,
  properties: {
    filter: {
      type: 'string',
      description:
        'Optional search filter. Matches against path, operationId, summary, description, and tags.',
    },
  },
  required: [],
};

interface EndpointSummary {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
}

function formatEndpoint(ep: EndpointInfo): EndpointSummary {
  return {
    method: ep.method,
    path: ep.path,
    operationId: ep.operationId,
    summary: ep.summary,
    tags: ep.tags,
  };
}

export async function listEndpointsTool(
  input: ListEndpointsInput
): Promise<string> {
  try {
    const endpoints = searchEndpoints(input.filter);

    if (endpoints.length === 0) {
      if (input.filter) {
        return `No endpoints found matching "${input.filter}"`;
      }
      return 'No endpoints found in the OpenAPI spec';
    }

    const summaries = endpoints.map(formatEndpoint);

    // Group by tag for better readability
    const byTag: Record<string, EndpointSummary[]> = {};
    const untagged: EndpointSummary[] = [];

    for (const ep of summaries) {
      if (ep.tags && ep.tags.length > 0) {
        const tag = ep.tags[0]; // Use first tag for grouping
        if (!byTag[tag]) {
          byTag[tag] = [];
        }
        byTag[tag].push(ep);
      } else {
        untagged.push(ep);
      }
    }

    // Build output
    const lines: string[] = [];
    lines.push(`Found ${endpoints.length} endpoints`);

    if (input.filter) {
      lines.push(`Filter: "${input.filter}"`);
    }

    lines.push('');

    // Output by tag
    const sortedTags = Object.keys(byTag).sort();
    for (const tag of sortedTags) {
      lines.push(`## ${tag}`);
      for (const ep of byTag[tag]) {
        const opId = ep.operationId ? ` (${ep.operationId})` : '';
        const summary = ep.summary ? ` - ${ep.summary}` : '';
        lines.push(`  ${ep.method.padEnd(7)} ${ep.path}${opId}${summary}`);
      }
      lines.push('');
    }

    // Output untagged
    if (untagged.length > 0) {
      lines.push('## Other');
      for (const ep of untagged) {
        const opId = ep.operationId ? ` (${ep.operationId})` : '';
        const summary = ep.summary ? ` - ${ep.summary}` : '';
        lines.push(`  ${ep.method.padEnd(7)} ${ep.path}${opId}${summary}`);
      }
    }

    return lines.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error listing endpoints: ${message}`;
  }
}
