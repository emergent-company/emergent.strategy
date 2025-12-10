/**
 * Agents API Client
 *
 * TypeScript client for agent management endpoints
 */

/**
 * Trigger type for agent execution
 * - 'schedule': Agent runs automatically on cron schedule
 * - 'manual': Agent only runs when manually triggered
 */
export type AgentTriggerType = 'schedule' | 'manual';

/**
 * Agent configuration
 */
export interface Agent {
  id: string;
  name: string;
  role: string;
  prompt: string | null;
  cronSchedule: string;
  enabled: boolean;
  triggerType: AgentTriggerType;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Agent run history entry
 */
export interface AgentRun {
  id: string;
  agentId: string;
  status: 'running' | 'success' | 'completed' | 'error' | 'failed' | 'skipped';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  summary: Record<string, any> | null;
  errorMessage: string | null;
  skipReason: string | null;
}

/**
 * Update agent payload
 */
export interface UpdateAgentPayload {
  name?: string;
  enabled?: boolean;
  cronSchedule?: string;
  triggerType?: AgentTriggerType;
  config?: Record<string, any>;
}

/**
 * API response wrapper
 */
export interface AgentApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * API client interface
 */
export interface AgentsClient {
  /**
   * List all agents
   */
  listAgents(): Promise<Agent[]>;

  /**
   * Get agent by ID
   */
  getAgent(id: string): Promise<Agent | null>;

  /**
   * Get recent runs for an agent
   */
  getAgentRuns(id: string): Promise<AgentRun[]>;

  /**
   * Update an agent
   */
  updateAgent(id: string, payload: UpdateAgentPayload): Promise<Agent>;

  /**
   * Trigger an immediate run
   */
  triggerAgent(
    id: string
  ): Promise<{ success: boolean; message?: string; error?: string }>;
}

/**
 * Create agents API client
 *
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @returns Agents client
 */
export function createAgentsClient(
  apiBase: string,
  fetchJson: <T>(url: string, init?: any) => Promise<T>
): AgentsClient {
  const baseUrl = `${apiBase}/api/admin/agents`;

  return {
    async listAgents() {
      const response = await fetchJson<AgentApiResponse<Agent[]>>(baseUrl);
      return response.data || [];
    },

    async getAgent(id: string) {
      const response = await fetchJson<AgentApiResponse<Agent>>(
        `${baseUrl}/${id}`
      );
      return response.data || null;
    },

    async getAgentRuns(id: string) {
      const response = await fetchJson<AgentApiResponse<AgentRun[]>>(
        `${baseUrl}/${id}/runs`
      );
      return response.data || [];
    },

    async updateAgent(id: string, payload: UpdateAgentPayload) {
      const response = await fetchJson<AgentApiResponse<Agent>>(
        `${baseUrl}/${id}`,
        {
          method: 'PATCH',
          body: payload,
        }
      );
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update agent');
      }
      return response.data;
    },

    async triggerAgent(id: string) {
      return fetchJson<{ success: boolean; message?: string; error?: string }>(
        `${baseUrl}/${id}/trigger`,
        {
          method: 'POST',
        }
      );
    },
  };
}
