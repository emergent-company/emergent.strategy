import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemProcessLog } from '../../entities/system-process-log.entity';
import { LlmCallLog } from '../../entities/llm-call-log.entity';
import { CreateSystemProcessLogInput } from './entities/system-process-log.entity';
import {
  CreateLLMCallLogInput,
  UpdateLLMCallLogInput,
} from './entities/llm-call-log.entity';
import { calculateLLMCost } from './config/llm-pricing.config';

/**
 * MonitoringLoggerService
 *
 * Injectable service for writing monitoring logs to the database.
 * This service is exported by MonitoringModule and can be injected
 * into any module that needs to log monitoring data.
 *
 * Migrated to TypeORM - uses Repository for all operations
 *
 * Usage:
 * ```typescript
 * constructor(private readonly monitoringLogger: MonitoringLoggerService) {}
 *
 * await this.monitoringLogger.logProcessEvent({
 *   processId: jobId,
 *   processType: 'extraction_job',
 *   level: 'info',
 *   message: 'Job started',
 *   orgId, projectId
 * });
 * ```
 */
@Injectable()
export class MonitoringLoggerService {
  private readonly logger = new Logger(MonitoringLoggerService.name);

  constructor(
    @InjectRepository(SystemProcessLog)
    private readonly systemLogRepo: Repository<SystemProcessLog>,
    @InjectRepository(LlmCallLog)
    private readonly llmCallLogRepo: Repository<LlmCallLog>
  ) {}

  /**
   * Log a process event (extraction job, sync, etc.)
   * Writes to kb.system_process_logs table - Migrated to TypeORM Repository
   */
  async logProcessEvent(input: CreateSystemProcessLogInput): Promise<string> {
    try {
      const log = this.systemLogRepo.create({
        processId: input.processId,
        processType: input.processType,
        level: input.level,
        message: input.message,
        metadata: input.metadata || null,
        timestamp: new Date(),
        langfuseTraceId: input.langfuseTraceId || null,
      });

      const saved = await this.systemLogRepo.save(log);
      return saved.id;
    } catch (error) {
      // Don't let logging failures break the main flow
      this.logger.error(
        `Failed to log process event for ${input.processType}:${input.processId}`,
        error instanceof Error ? error.stack : String(error)
      );
      return '';
    }
  }

  /**
   * Start logging an LLM call (before API call is made) - Migrated to TypeORM Repository
   * Returns the log ID which should be used to update the log when call completes
   */
  async startLLMCall(input: CreateLLMCallLogInput): Promise<string> {
    try {
      const log = this.llmCallLogRepo.create({
        processId: input.processId,
        processType: input.processType,
        requestPayload: input.requestPayload,
        modelName: input.modelName,
        status: 'pending',
        startedAt: new Date(),
      });

      const saved = await this.llmCallLogRepo.save(log);
      return saved.id;
    } catch (error) {
      this.logger.error(
        `Failed to start LLM call log for ${input.processType}:${input.processId}`,
        error instanceof Error ? error.stack : String(error)
      );
      return '';
    }
  }

  /**
   * Complete an LLM call log (after API call finishes) - Migrated to TypeORM Repository
   * Auto-calculates cost based on token usage
   */
  async completeLLMCall(update: UpdateLLMCallLogInput): Promise<void> {
    try {
      // Calculate cost if we have token info
      let costUsd = update.costUsd;
      if (!costUsd && update.inputTokens && update.outputTokens) {
        const modelName = await this.getModelNameForLog(update.id);
        if (modelName) {
          costUsd = calculateLLMCost(
            modelName,
            update.inputTokens,
            update.outputTokens
          );
        }
      }

      // Build update object with only provided fields
      const updateData: Partial<LlmCallLog> = {
        completedAt: update.completedAt || new Date(),
      };

      if (update.responsePayload !== undefined) {
        updateData.responsePayload = update.responsePayload;
      }
      if (update.status) {
        updateData.status = update.status;
      }
      if (update.errorMessage !== undefined) {
        updateData.errorMessage = update.errorMessage;
      }
      if (update.inputTokens !== undefined) {
        updateData.inputTokens = update.inputTokens;
      }
      if (update.outputTokens !== undefined) {
        updateData.outputTokens = update.outputTokens;
      }
      if (update.totalTokens !== undefined) {
        updateData.totalTokens = update.totalTokens;
      }
      if (costUsd !== undefined) {
        updateData.costUsd = costUsd;
      }
      if (update.durationMs !== undefined) {
        updateData.durationMs = update.durationMs;
      }

      await this.llmCallLogRepo.update({ id: update.id }, updateData);
    } catch (error) {
      this.logger.error(
        `Failed to complete LLM call log ${update.id}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  /**
   * Log a complete LLM call (when you have all data upfront) - Migrated to TypeORM Repository
   * Useful for synchronous calls where you get response immediately
   */
  async logLLMCall(input: CreateLLMCallLogInput): Promise<string> {
    try {
      // Calculate cost if not provided
      let costUsd = input.costUsd;
      if (!costUsd && input.inputTokens && input.outputTokens) {
        costUsd = calculateLLMCost(
          input.modelName,
          input.inputTokens,
          input.outputTokens
        );
      }

      const log = this.llmCallLogRepo.create({
        processId: input.processId,
        processType: input.processType,
        requestPayload: input.requestPayload,
        modelName: input.modelName,
        responsePayload: input.responsePayload || null,
        status: input.status,
        errorMessage: input.errorMessage || null,
        inputTokens: input.inputTokens || null,
        outputTokens: input.outputTokens || null,
        totalTokens: input.totalTokens || null,
        costUsd: costUsd || null,
        startedAt: input.startedAt || new Date(),
        completedAt: input.completedAt || new Date(),
        durationMs: input.durationMs || null,
        langfuseObservationId: input.langfuseObservationId || null,
      });

      const saved = await this.llmCallLogRepo.save(log);
      return saved.id;
    } catch (error) {
      this.logger.error(
        `Failed to log LLM call for ${input.processType}:${input.processId}`,
        error instanceof Error ? error.stack : String(error)
      );
      return '';
    }
  }

  /**
   * Helper to get model name for a log entry (used for cost calculation) - Migrated to TypeORM Repository
   */
  private async getModelNameForLog(logId: string): Promise<string | null> {
    try {
      const result = await this.llmCallLogRepo.findOne({
        where: { id: logId },
        select: ['modelName'],
      });
      return result?.modelName || null;
    } catch {
      return null;
    }
  }
}
