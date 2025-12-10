import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../../entities/agent.entity';
import { AgentRun } from '../../entities/agent-run.entity';

/**
 * AgentService
 *
 * Manages agent configurations and records agent runs.
 * Used by the scheduler service and admin API.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    @InjectRepository(AgentRun)
    private readonly agentRunRepo: Repository<AgentRun>
  ) {}

  /**
   * Get all agents
   */
  async findAll(): Promise<Agent[]> {
    return this.agentRepo.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Get all enabled agents
   */
  async findEnabled(): Promise<Agent[]> {
    return this.agentRepo.find({
      where: { enabled: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Get an agent by ID
   */
  async findById(id: string): Promise<Agent | null> {
    return this.agentRepo.findOne({ where: { id } });
  }

  /**
   * Get an agent by role
   */
  async findByRole(role: string): Promise<Agent | null> {
    return this.agentRepo.findOne({ where: { role } });
  }

  /**
   * Update an agent's configuration
   */
  async update(
    id: string,
    updates: Partial<
      Pick<Agent, 'prompt' | 'cronSchedule' | 'enabled' | 'config'>
    >
  ): Promise<Agent | null> {
    await this.agentRepo.update(id, updates);
    return this.findById(id);
  }

  /**
   * Record the start of an agent run
   */
  async startRun(agentId: string): Promise<AgentRun> {
    const run = this.agentRunRepo.create({
      agentId,
      status: 'running',
      startedAt: new Date(),
      summary: {},
    });
    return this.agentRunRepo.save(run);
  }

  /**
   * Complete an agent run with success
   */
  async completeRun(
    runId: string,
    summary: Record<string, any>
  ): Promise<void> {
    const now = new Date();
    const run = await this.agentRunRepo.findOne({ where: { id: runId } });
    if (!run) {
      this.logger.warn(`Cannot complete run ${runId}: not found`);
      return;
    }

    const durationMs = now.getTime() - run.startedAt.getTime();

    await this.agentRunRepo.update(runId, {
      status: 'success',
      completedAt: now,
      durationMs,
      summary,
    });

    // Update agent's last run info
    await this.agentRepo.update(run.agentId, {
      lastRunAt: now,
      lastRunStatus: 'success',
    });
  }

  /**
   * Mark an agent run as skipped
   */
  async skipRun(runId: string, skipReason: string): Promise<void> {
    const now = new Date();
    const run = await this.agentRunRepo.findOne({ where: { id: runId } });
    if (!run) {
      this.logger.warn(`Cannot skip run ${runId}: not found`);
      return;
    }

    const durationMs = now.getTime() - run.startedAt.getTime();

    await this.agentRunRepo.update(runId, {
      status: 'skipped',
      completedAt: now,
      durationMs,
      skipReason,
    });

    // Update agent's last run info
    await this.agentRepo.update(run.agentId, {
      lastRunAt: now,
      lastRunStatus: 'skipped',
    });
  }

  /**
   * Mark an agent run as failed
   */
  async failRun(runId: string, errorMessage: string): Promise<void> {
    const now = new Date();
    const run = await this.agentRunRepo.findOne({ where: { id: runId } });
    if (!run) {
      this.logger.warn(`Cannot fail run ${runId}: not found`);
      return;
    }

    const durationMs = now.getTime() - run.startedAt.getTime();

    await this.agentRunRepo.update(runId, {
      status: 'error',
      completedAt: now,
      durationMs,
      errorMessage,
    });

    // Update agent's last run info
    await this.agentRepo.update(run.agentId, {
      lastRunAt: now,
      lastRunStatus: 'error',
    });
  }

  /**
   * Get recent runs for an agent
   */
  async getRecentRuns(agentId: string, limit = 20): Promise<AgentRun[]> {
    return this.agentRunRepo.find({
      where: { agentId },
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get run statistics for an agent
   */
  async getRunStats(agentId: string): Promise<{
    totalRuns: number;
    successRuns: number;
    skippedRuns: number;
    errorRuns: number;
    avgDurationMs: number;
  }> {
    const result = await this.agentRunRepo
      .createQueryBuilder('r')
      .select([
        'COUNT(*) as total',
        `COUNT(*) FILTER (WHERE status = 'success') as success`,
        `COUNT(*) FILTER (WHERE status = 'skipped') as skipped`,
        `COUNT(*) FILTER (WHERE status = 'error') as error`,
        `AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration`,
      ])
      .where('r.agent_id = :agentId', { agentId })
      .getRawOne();

    return {
      totalRuns: parseInt(result.total, 10) || 0,
      successRuns: parseInt(result.success, 10) || 0,
      skippedRuns: parseInt(result.skipped, 10) || 0,
      errorRuns: parseInt(result.error, 10) || 0,
      avgDurationMs: parseFloat(result.avg_duration) || 0,
    };
  }
}
