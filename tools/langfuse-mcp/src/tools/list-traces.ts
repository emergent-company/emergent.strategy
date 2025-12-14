import { LangfuseClient, ListTracesParams } from '../langfuse-client.js';

export const listTracesSchema = {
  type: 'object' as const,
  properties: {
    limit: {
      type: 'number',
      description: 'Maximum number of traces to return (default: 20, max: 100)',
    },
    name: {
      type: 'string',
      description: 'Filter by trace name (exact match)',
    },
    userId: {
      type: 'string',
      description: 'Filter by user ID',
    },
    sessionId: {
      type: 'string',
      description: 'Filter by session ID',
    },
    fromTimestamp: {
      type: 'string',
      description:
        'Filter traces on or after this timestamp (ISO 8601, e.g., 2024-01-15T00:00:00Z)',
    },
    toTimestamp: {
      type: 'string',
      description:
        'Filter traces before this timestamp (ISO 8601, e.g., 2024-01-16T00:00:00Z)',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by tags (all must match)',
    },
    orderBy: {
      type: 'string',
      description:
        'Sort order (format: field.asc or field.desc). Fields: timestamp, name, userId. Default: timestamp.desc',
    },
  },
};

export interface ListTracesInput {
  limit?: number;
  name?: string;
  userId?: string;
  sessionId?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  tags?: string[];
  orderBy?: string;
}

export async function listTraces(
  client: LangfuseClient,
  input: ListTracesInput
): Promise<string> {
  const params: ListTracesParams = {
    page: 1,
    limit: Math.min(input.limit ?? 20, 100),
    name: input.name,
    userId: input.userId,
    sessionId: input.sessionId,
    fromTimestamp: input.fromTimestamp,
    toTimestamp: input.toTimestamp,
    tags: input.tags,
    orderBy: input.orderBy ?? 'timestamp.desc',
  };

  const response = await client.listTraces(params);

  // Format output for readability
  const summary = {
    totalItems: response.meta.totalItems,
    page: response.meta.page,
    totalPages: response.meta.totalPages,
    traces: response.data.map((trace) => ({
      id: trace.id,
      name: trace.name,
      timestamp: trace.timestamp,
      userId: trace.userId,
      sessionId: trace.sessionId,
      tags: trace.tags,
      latency: trace.latency ? `${trace.latency.toFixed(2)}s` : null,
      totalCost: trace.totalCost ? `$${trace.totalCost.toFixed(6)}` : null,
      url: trace.htmlPath,
    })),
  };

  return JSON.stringify(summary, null, 2);
}
