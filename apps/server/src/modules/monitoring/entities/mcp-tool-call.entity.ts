/**
 * Entity representing an MCP tool call during a chat session
 */
export interface McpToolCall {
  id: string;
  sessionId: string;
  conversationId?: string;
  turnNumber: number;
  toolName: string;
  toolParameters?: Record<string, any>;
  toolResult?: Record<string, any>;
  executionTimeMs?: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
  finalLlmPrompt?: string;
  timestamp: Date;
}

export interface CreateMcpToolCallInput {
  sessionId: string;
  conversationId?: string;
  turnNumber: number;
  toolName: string;
  toolParameters?: Record<string, any>;
  toolResult?: Record<string, any>;
  executionTimeMs?: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
  finalLlmPrompt?: string;
  orgId?: string;
  projectId?: string;
}
