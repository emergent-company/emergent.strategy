import { LangfuseClient, ListPromptsParams } from '../langfuse-client.js';

export const listPromptsSchema = {
  type: 'object' as const,
  properties: {
    limit: {
      type: 'number',
      description:
        'Maximum number of prompts to return (default: 20, max: 100)',
    },
    name: {
      type: 'string',
      description: 'Filter by prompt name (partial match)',
    },
    label: {
      type: 'string',
      description: 'Filter by label (e.g., "production", "staging")',
    },
    tag: {
      type: 'string',
      description: 'Filter by tag',
    },
    page: {
      type: 'number',
      description: 'Page number for pagination (default: 1)',
    },
  },
};

export interface ListPromptsInput {
  limit?: number;
  name?: string;
  label?: string;
  tag?: string;
  page?: number;
}

export async function listPrompts(
  client: LangfuseClient,
  input: ListPromptsInput
): Promise<string> {
  const params: ListPromptsParams = {
    page: input.page ?? 1,
    limit: Math.min(input.limit ?? 20, 100),
    name: input.name,
    label: input.label,
    tag: input.tag,
  };

  const response = await client.listPrompts(params);

  // Format output for readability
  const summary = {
    totalItems: response.meta.totalItems,
    page: response.meta.page,
    totalPages: response.meta.totalPages,
    prompts: response.data.map((prompt) => ({
      name: prompt.name,
      versions: prompt.versions,
      labels: prompt.labels,
      tags: prompt.tags,
      lastUpdatedAt: prompt.lastUpdatedAt,
    })),
  };

  return JSON.stringify(summary, null, 2);
}
