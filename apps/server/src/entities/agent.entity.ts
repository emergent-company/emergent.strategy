import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Trigger type for agent execution
 * - 'schedule': Agent runs automatically on cron schedule
 * - 'manual': Agent only runs when manually triggered
 */
export type AgentTriggerType = 'schedule' | 'manual';

/**
 * Agent Entity
 *
 * Represents a configurable background agent that runs periodically.
 * Agents can be scheduled via cron expressions and have admin-tunable prompts.
 */
@Entity({ schema: 'kb', name: 'agents' })
@Index(['role'], { unique: true })
@Index(['enabled'])
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Human-readable name for the agent
   */
  @Column({ type: 'text' })
  name: string;

  /**
   * Unique role identifier used by the strategy registry
   * e.g., 'merge-suggestion', 'cleanup', 'summary'
   */
  @Column({ type: 'text', unique: true })
  role: string;

  /**
   * Admin-tunable prompt/configuration for the agent
   * Stored as text to allow for multi-line prompts
   */
  @Column({ type: 'text', nullable: true })
  prompt: string | null;

  /**
   * Cron expression for scheduling
   * Example: every 3 minutes = "* /3 * * * *" (without space)
   */
  @Column({ name: 'cron_schedule', type: 'text' })
  cronSchedule: string;

  /**
   * Whether the agent is enabled and should run on schedule
   */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /**
   * How the agent is triggered
   * - 'schedule': Runs automatically on cron schedule
   * - 'manual': Only runs when manually triggered via admin UI
   */
  @Column({ name: 'trigger_type', type: 'text', default: 'schedule' })
  triggerType: AgentTriggerType;

  /**
   * Agent-specific configuration as JSON
   * e.g., { similarityThreshold: 0.10, maxPendingNotifications: 5 }
   */
  @Column({ type: 'jsonb', default: {} })
  config: Record<string, any>;

  /**
   * Optional description of what the agent does
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Timestamp of the last successful run
   */
  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  /**
   * Status of the last run: 'success', 'skipped', 'error'
   */
  @Column({ name: 'last_run_status', type: 'text', nullable: true })
  lastRunStatus: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
