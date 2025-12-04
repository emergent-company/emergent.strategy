/**
 * Entity representing an LLM API call log
 */
export interface LLMCallLog {
  id: string;
  processId: string;
  processType: string;
  requestPayload: Record<string, any>;
  modelName: string;
  responsePayload?: Record<string, any>;
  status: 'success' | 'error' | 'timeout' | 'pending';
  errorMessage?: string;
  usageMetrics?: Record<string, any>;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  orgId?: string;
  projectId?: string;
  langfuseObservationId?: string;
}

/**
 * Input for creating an LLM call log
 */
export interface CreateLLMCallLogInput {
  processId: string;
  processType: string;
  requestPayload: Record<string, any>;
  modelName: string;
  responsePayload?: Record<string, any>;
  status: 'success' | 'error' | 'timeout' | 'pending';
  errorMessage?: string;
  usageMetrics?: Record<string, any>;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  orgId?: string;
  projectId?: string;
  langfuseObservationId?: string;
}

/**
 * Update for an existing LLM call log (when call completes)
 */
export interface UpdateLLMCallLogInput {
  id: string;
  responsePayload?: Record<string, any>;
  status?: 'success' | 'error' | 'timeout';
  errorMessage?: string;
  usageMetrics?: Record<string, any>;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  completedAt?: Date;
  durationMs?: number;
}
