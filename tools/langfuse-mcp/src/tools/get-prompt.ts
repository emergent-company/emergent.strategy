import { LangfuseClient, GetPromptParams } from '../langfuse-client.js';

export const getPromptSchema = {
  type: 'object' as const,
  properties: {
    name: {
      type: 'string',
      description: 'The name of the prompt to retrieve (required)',
    },
    version: {
      type: 'number',
      description:
        'Specific version number to retrieve. If omitted, returns the version with the "production" label (or specified label)',
    },
    label: {
      type: 'string',
      description:
        'Label to filter by (e.g., "production", "staging"). Default is "production" if no version specified',
    },
  },
  required: ['name'],
};

export interface GetPromptInput {
  name: string;
  version?: number;
  label?: string;
}

export async function getPrompt(
  client: LangfuseClient,
  input: GetPromptInput
): Promise<string> {
  const params: GetPromptParams = {};

  if (input.version !== undefined) {
    params.version = input.version;
  }
  if (input.label !== undefined) {
    params.label = input.label;
  }

  const prompt = await client.getPrompt(input.name, params);

  // Format output for readability
  const result = {
    name: prompt.name,
    version: prompt.version,
    type: prompt.type,
    labels: prompt.labels,
    tags: prompt.tags,
    config: prompt.config,
    prompt: prompt.prompt,
  };

  return JSON.stringify(result, null, 2);
}
