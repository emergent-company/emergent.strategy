import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { trace, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AgentService } from './agents.service';
import { AgentStrategyRegistry, AgentExecutionContext } from './strategies';
import { Agent } from '../../entities/agent.entity';
import { LangfuseService } from '../langfuse/langfuse.service';

/**
 * AgentSchedulerService
 *
 * Manages dynamic cron scheduling for agents.
 * Loads agent configurations from the database on startup and
 * creates/updates cron jobs as agents are modified.
 */
@Injectable()
export class AgentSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private readonly runningJobs = new Map<string, boolean>();

  // OpenTelemetry tracer for creating parent spans
  private readonly tracer: Tracer = trace.getTracer('agent-scheduler');

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly agentService: AgentService,
    private readonly strategyRegistry: AgentStrategyRegistry,
    @Optional() private readonly langfuseService?: LangfuseService
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing agent scheduler...');
    await this.loadAgents();
  }

  onModuleDestroy(): void {
    this.logger.log('Shutting down agent scheduler...');
    this.stopAllJobs();
  }

  /**
   * Load all enabled agents and schedule their cron jobs
   */
  async loadAgents(): Promise<void> {
    try {
      const agents = await this.agentService.findEnabled();
      this.logger.log(`Found ${agents.length} enabled agent(s)`);

      for (const agent of agents) {
        await this.scheduleAgent(agent);
      }
    } catch (error) {
      this.logger.error('Failed to load agents', (error as Error).stack);
    }
  }

  /**
   * Schedule a single agent's cron job
   * Only schedules agents with triggerType === 'schedule'
   */
  async scheduleAgent(agent: Agent): Promise<void> {
    const { id, name, role, cronSchedule, triggerType } = agent;

    // Only schedule agents with triggerType 'schedule'
    if (triggerType !== 'schedule') {
      this.logger.debug(
        `Agent "${name}" has triggerType "${triggerType}", skipping cron scheduling`
      );
      this.unscheduleAgent(id);
      return;
    }

    // Check if strategy exists for this role
    if (!this.strategyRegistry.has(role)) {
      this.logger.warn(
        `No strategy registered for agent role "${role}" (${name}). Skipping.`
      );
      return;
    }

    // Remove existing job if any
    this.unscheduleAgent(id);

    try {
      const job = new CronJob(cronSchedule, () => {
        this.executeAgent(agent).catch((err) => {
          this.logger.error(
            `Unhandled error in agent ${name}: ${err.message}`,
            err.stack
          );
        });
      });

      // Use type assertion to handle cron version mismatch between @nestjs/schedule and our cron package
      this.schedulerRegistry.addCronJob(`agent-${id}`, job as any);
      job.start();

      this.logger.log(
        `Scheduled agent "${name}" (${role}) with cron: ${cronSchedule}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule agent "${name}": ${(error as Error).message}`
      );
    }
  }

  /**
   * Unschedule an agent's cron job
   */
  unscheduleAgent(agentId: string): void {
    const jobName = `agent-${agentId}`;
    try {
      if (this.schedulerRegistry.doesExist('cron', jobName)) {
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.debug(`Unscheduled agent job: ${jobName}`);
      }
    } catch (error) {
      // Job doesn't exist, ignore
    }
  }

  /**
   * Stop all agent jobs
   */
  stopAllJobs(): void {
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((job, name) => {
      if (name.startsWith('agent-')) {
        job.stop();
        this.logger.debug(`Stopped job: ${name}`);
      }
    });
  }

  /**
   * Execute an agent's strategy
   */
  async executeAgent(agent: Agent): Promise<void> {
    const { id, name, role } = agent;

    // Prevent concurrent runs of the same agent
    if (this.runningJobs.get(id)) {
      this.logger.debug(`Agent "${name}" is already running, skipping`);
      return;
    }

    this.runningJobs.set(id, true);

    return this.tracer.startActiveSpan(
      'agent-scheduler.executeAgent',
      async (span) => {
        span.setAttribute('agent.id', id);
        span.setAttribute('agent.name', name);
        span.setAttribute('agent.role', role);

        const strategy = this.strategyRegistry.get(role);
        if (!strategy) {
          this.logger.error(`No strategy for role "${role}"`);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `No strategy for role "${role}"`,
          });
          span.end();
          this.runningJobs.set(id, false);
          return;
        }

        // Re-fetch agent to get latest config
        const freshAgent = await this.agentService.findById(id);
        if (!freshAgent || !freshAgent.enabled) {
          this.logger.debug(`Agent "${name}" is disabled or deleted, skipping`);
          span.setAttribute('agent.skipped', true);
          span.setAttribute('agent.skip_reason', 'disabled_or_deleted');
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          this.runningJobs.set(id, false);
          return;
        }

        // Start the run
        const run = await this.agentService.startRun(id);
        span.setAttribute('agent.run_id', run.id);

        // Create Langfuse trace for this agent run
        // Use agent role as trace type for filtering (e.g., 'merge-suggestion')
        const traceId = this.langfuseService?.createJobTrace(
          run.id,
          {
            name: `Agent: ${name}`,
            agentId: id,
            agentRole: role,
            agentName: name,
            cronSchedule: freshAgent.cronSchedule,
          },
          undefined, // environment (use default)
          `agent-${role}` // traceType for filtering (e.g., 'agent-merge-suggestion')
        );

        const context: AgentExecutionContext = {
          agent: freshAgent,
          startedAt: run.startedAt,
          runId: run.id,
          traceId: traceId ?? undefined,
        };

        try {
          // Check if should skip
          if (strategy.shouldSkip) {
            const skipSpan = traceId
              ? this.langfuseService?.createSpan(traceId, 'shouldSkip', {
                  agentId: id,
                }) ?? null
              : null;

            const skipReason = await strategy.shouldSkip(context);

            if (skipReason) {
              this.langfuseService?.endSpan(
                skipSpan,
                { skipped: true, reason: skipReason },
                'success'
              );
              if (traceId) {
                await this.langfuseService?.finalizeTrace(traceId, 'success', {
                  status: 'skipped',
                  skipReason,
                });
              }

              this.logger.debug(`Agent "${name}" skipped: ${skipReason}`);
              await this.agentService.skipRun(run.id, skipReason);
              span.setAttribute('agent.skipped', true);
              span.setAttribute('agent.skip_reason', skipReason);
              span.setStatus({ code: SpanStatusCode.OK });
              this.runningJobs.set(id, false);
              return;
            }

            this.langfuseService?.endSpan(
              skipSpan,
              { skipped: false },
              'success'
            );
          }

          // Execute the strategy
          const executeSpan = traceId
            ? this.langfuseService?.createSpan(traceId, 'execute', {
                agentId: id,
                config: freshAgent.config,
              }) ?? null
            : null;

          this.logger.debug(`Executing agent "${name}"...`);
          const result = await strategy.execute(context);

          if (result.skipReason) {
            this.langfuseService?.endSpan(
              executeSpan,
              { skipped: true, reason: result.skipReason },
              'success'
            );
            if (traceId) {
              await this.langfuseService?.finalizeTrace(traceId, 'success', {
                status: 'skipped',
                skipReason: result.skipReason,
              });
            }

            await this.agentService.skipRun(run.id, result.skipReason);
            this.logger.debug(`Agent "${name}" skipped: ${result.skipReason}`);
            span.setAttribute('agent.skipped', true);
            span.setAttribute('agent.skip_reason', result.skipReason);
            span.setStatus({ code: SpanStatusCode.OK });
          } else if (result.success) {
            this.langfuseService?.endSpan(
              executeSpan,
              { success: true, summary: result.summary },
              'success'
            );
            if (traceId) {
              await this.langfuseService?.finalizeTrace(traceId, 'success', {
                status: 'success',
                summary: result.summary,
              });
            }

            await this.agentService.completeRun(run.id, result.summary);
            this.logger.log(
              `Agent "${name}" completed successfully: ${JSON.stringify(
                result.summary
              )}`
            );
            span.setAttribute('agent.success', true);
            span.setStatus({ code: SpanStatusCode.OK });
          } else {
            this.langfuseService?.endSpan(
              executeSpan,
              { success: false, error: result.errorMessage },
              'error',
              result.errorMessage
            );
            if (traceId) {
              await this.langfuseService?.finalizeTrace(traceId, 'error', {
                status: 'error',
                error: result.errorMessage,
              });
            }

            await this.agentService.failRun(
              run.id,
              result.errorMessage || 'Unknown error'
            );
            this.logger.error(`Agent "${name}" failed: ${result.errorMessage}`);
            span.setAttribute('agent.success', false);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: result.errorMessage || 'Unknown error',
            });
          }
        } catch (error) {
          const err = error as Error;

          if (traceId) {
            await this.langfuseService?.finalizeTrace(traceId, 'error', {
              status: 'error',
              error: err.message,
              stack: err.stack,
            });
          }

          await this.agentService.failRun(run.id, err.message);
          this.logger.error(
            `Agent "${name}" threw error: ${err.message}`,
            err.stack
          );
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.recordException(err);
        } finally {
          span.end();
          this.runningJobs.set(id, false);
        }
      }
    );
  }

  /**
   * Reload a specific agent's schedule (called after admin updates)
   */
  async reloadAgent(agentId: string): Promise<void> {
    const agent = await this.agentService.findById(agentId);
    if (!agent) {
      this.unscheduleAgent(agentId);
      return;
    }

    // Only schedule if enabled AND triggerType is 'schedule'
    if (agent.enabled && agent.triggerType === 'schedule') {
      await this.scheduleAgent(agent);
    } else {
      this.unscheduleAgent(agentId);
    }
  }

  /**
   * Trigger an immediate run of an agent (for testing/admin)
   */
  async triggerAgent(agentId: string): Promise<void> {
    const agent = await this.agentService.findById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    await this.executeAgent(agent);
  }
}
