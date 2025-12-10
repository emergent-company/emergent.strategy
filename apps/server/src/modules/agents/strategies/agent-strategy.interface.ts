import { Agent } from '../../../entities/agent.entity';

/**
 * Result returned from an agent strategy execution
 */
export interface AgentRunResult {
  /** Whether the run was successful */
  success: boolean;
  /** Summary data to store in agent_runs.summary */
  summary: Record<string, any>;
  /** Optional error message if success is false */
  errorMessage?: string;
  /** Optional skip reason if the agent decided to skip this run */
  skipReason?: string;
}

/**
 * Context passed to agent strategies during execution
 */
export interface AgentExecutionContext {
  /** The agent configuration */
  agent: Agent;
  /** Timestamp when the run started */
  startedAt: Date;
  /** Run ID for logging purposes */
  runId: string;
  /** Langfuse trace ID for observability (optional) */
  traceId?: string;
}

/**
 * Interface for agent strategies
 *
 * Each agent role (e.g., 'merge-suggestion') has a corresponding strategy
 * that implements the actual logic for that agent type.
 */
export interface AgentStrategy {
  /**
   * The role this strategy handles (must match Agent.role)
   */
  readonly role: string;

  /**
   * Execute the agent's logic
   *
   * @param context - Execution context with agent config and run info
   * @returns Result of the execution
   */
  execute(context: AgentExecutionContext): Promise<AgentRunResult>;

  /**
   * Optional: Check if the agent should skip this run
   * Called before execute() to allow early exit without running full logic
   *
   * @param context - Execution context
   * @returns Skip reason if should skip, undefined to continue
   */
  shouldSkip?(context: AgentExecutionContext): Promise<string | undefined>;
}
