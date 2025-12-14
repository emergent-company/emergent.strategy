import {
  LangfuseClient,
  CreatePromptParams,
  ChatMessage,
} from '../langfuse-client.js';

export const updatePromptSchema = {
  type: 'object' as const,
  properties: {
    name: {
      type: 'string',
      description:
        'The name of the prompt. If a prompt with this name exists, creates a new version.',
    },
    type: {
      type: 'string',
      enum: ['text', 'chat'],
      description:
        'Prompt type: "text" for simple text prompts, "chat" for chat message arrays',
    },
    prompt: {
      oneOf: [
        { type: 'string' },
        {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['role', 'content'],
          },
        },
      ],
      description:
        'The prompt content. For "text" type: a string. For "chat" type: an array of {role, content} messages.',
    },
    config: {
      type: 'object',
      description:
        'Optional configuration object (e.g., model parameters, temperature)',
    },
    labels: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Labels to apply to this version (e.g., ["production", "v2"])',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags for categorization and filtering',
    },
    commitMessage: {
      type: 'string',
      description: 'Optional commit message describing the changes',
    },
  },
  required: ['name', 'type', 'prompt'],
};

export interface UpdatePromptInput {
  name: string;
  type: 'text' | 'chat';
  prompt: string | ChatMessage[];
  config?: Record<string, unknown>;
  labels?: string[];
  tags?: string[];
  commitMessage?: string;
}

export async function updatePrompt(
  client: LangfuseClient,
  input: UpdatePromptInput
): Promise<string> {
  const params: CreatePromptParams = {
    name: input.name,
    type: input.type,
    prompt: input.prompt,
  };

  if (input.config !== undefined) {
    params.config = input.config;
  }
  if (input.labels !== undefined) {
    params.labels = input.labels;
  }
  if (input.tags !== undefined) {
    params.tags = input.tags;
  }
  if (input.commitMessage !== undefined) {
    params.commitMessage = input.commitMessage;
  }

  const prompt = await client.createPrompt(params);

  // Format output for readability
  const result = {
    success: true,
    message: `Prompt "${prompt.name}" version ${prompt.version} created successfully`,
    prompt: {
      name: prompt.name,
      version: prompt.version,
      type: prompt.type,
      labels: prompt.labels,
      tags: prompt.tags,
      config: prompt.config,
    },
  };

  return JSON.stringify(result, null, 2);
}
