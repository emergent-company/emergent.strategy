import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Agent } from './agent.entity';

/**
 * AgentRun Entity
 *
 * Records each execution of an agent for observability and debugging.
 * Stores status, duration, and any output/errors.
 */
@Entity({ schema: 'kb', name: 'agent_runs' })
@Index(['agentId'])
@Index(['startedAt'])
@Index(['status'])
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  /**
   * Status of the run: 'running', 'success', 'skipped', 'error'
   */
  @Column({ type: 'text' })
  status: 'running' | 'success' | 'skipped' | 'error';

  /**
   * When the run started
   */
  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  /**
   * When the run completed (null if still running)
   */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /**
   * Duration in milliseconds (null if still running)
   */
  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;

  /**
   * Summary of what the agent did during this run
   * e.g., { objectsScanned: 100, suggestionsCreated: 3 }
   */
  @Column({ type: 'jsonb', default: {} })
  summary: Record<string, any>;

  /**
   * Error message if status is 'error'
   */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /**
   * Skip reason if status is 'skipped'
   * e.g., 'Too many pending notifications (7 > 5)'
   */
  @Column({ name: 'skip_reason', type: 'text', nullable: true })
  skipReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;
}
