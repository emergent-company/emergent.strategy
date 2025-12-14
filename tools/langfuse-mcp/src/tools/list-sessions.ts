import { LangfuseClient } from '../langfuse-client.js';

export const listSessionsSchema = {
  type: 'object' as const,
  properties: {
    limit: {
      type: 'number',
      description:
        'Maximum number of sessions to return (default: 20, max: 100)',
    },
  },
};

export interface ListSessionsInput {
  limit?: number;
}

export async function listSessions(
  client: LangfuseClient,
  input: ListSessionsInput
): Promise<string> {
  const response = await client.listSessions({
    page: 1,
    limit: Math.min(input.limit ?? 20, 100),
  });

  const summary = {
    totalItems: response.meta.totalItems,
    page: response.meta.page,
    totalPages: response.meta.totalPages,
    sessions: response.data.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
    })),
  };

  return JSON.stringify(summary, null, 2);
}
