import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { ObjectExtractionLog } from '../../entities/object-extraction-log.entity';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ExtractionLogOperationType =
  | 'llm_call'
  | 'chunk_processing'
  | 'object_creation'
  | 'relationship_creation'
  | 'suggestion_creation'
  | 'validation'
  | 'error';

export type ExtractionLogStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface LogExtractionStepParams {
  extractionJobId: string;
  stepIndex: number;
  operationType: ExtractionLogOperationType;
  operationName?: string;
  status?: ExtractionLogStatus;
  inputData?: any;
  outputData?: any;
  errorMessage?: string;
  errorStack?: string;
  durationMs?: number;
  tokensUsed?: number;
  metadata?: Record<string, any>;
}

export interface ExtractionLogRow {
  id: string;
  extraction_job_id: string;
  started_at: Date;
  completed_at: Date | null;
  step_index: number;
  operation_type: string;
  operation_name: string | null;
  status: string;
  input_data: any;
  output_data: any;
  error_message: string | null;
  error_stack: string | null;
  duration_ms: number | null;
  tokens_used: number | null;
  step: string;
  message: string | null;
  entity_count: number | null;
  relationship_count: number | null;
  error_details: any;
}

/**
 * ExtractionLoggerService
 * Logs detailed steps of object extraction operations
 * Migrated to TypeORM - uses Repository for all operations
 */
@Injectable()
export class ExtractionLoggerService {
  private readonly logDir = path.join(process.cwd(), 'logs', 'extraction');

  constructor(
    private readonly db: DatabaseService,
    @InjectRepository(ObjectExtractionLog)
    private readonly extractionLogRepo: Repository<ObjectExtractionLog>
  ) {
    this.initFileLogging();
  }

  private async initFileLogging() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create extraction log directory', error);
    }
  }

  /**
   * Log a step in the extraction process - Migrated to TypeORM Repository
   */
  async logStep(params: LogExtractionStepParams): Promise<string> {
    const {
      extractionJobId,
      stepIndex,
      operationType,
      operationName,
      status = 'completed',
      inputData,
      outputData,
      errorMessage,
      errorStack,
      durationMs,
      tokensUsed,
    } = params;

    // Generate step name and message
    const step = operationName || operationType;
    const message =
      errorMessage ||
      (status === 'completed'
        ? `${operationType} completed successfully`
        : `${operationType} ${status}`);

    // Create log entry using TypeORM
    const log = this.extractionLogRepo.create({
      extractionJobId,
      stepIndex,
      operationType,
      operationName: operationName || null,
      step,
      status,
      message,
      inputData: inputData || null,
      outputData: outputData || null,
      errorMessage: errorMessage || null,
      errorStack: errorStack || null,
      durationMs: durationMs || null,
      tokensUsed: tokensUsed || null,
    });

    const saved = await this.extractionLogRepo.save(log);

    await this.writeToFile(params);

    return saved.id;
  }

  /**
   * Update an existing log entry - Migrated to TypeORM Repository
   */
  async updateLogStep(
    logId: string,
    updates: {
      status?: ExtractionLogStatus;
      outputData?: any;
      errorMessage?: string;
      errorStack?: string;
      durationMs?: number;
      tokensUsed?: number;
      message?: string;
    }
  ): Promise<void> {
    const updateData: Partial<ObjectExtractionLog> = {};

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      updateData.completedAt = new Date();
    }
    if (updates.outputData !== undefined) {
      updateData.outputData = updates.outputData;
    }
    if (updates.errorMessage !== undefined) {
      updateData.errorMessage = updates.errorMessage;
    }
    if (updates.errorStack !== undefined) {
      updateData.errorStack = updates.errorStack;
    }
    if (updates.durationMs !== undefined) {
      updateData.durationMs = updates.durationMs;
    }
    if (updates.tokensUsed !== undefined) {
      updateData.tokensUsed = updates.tokensUsed;
    }
    if (updates.message !== undefined) {
      updateData.message = updates.message;
    }

    if (Object.keys(updateData).length === 0) {
      return;
    }

    await this.extractionLogRepo.update({ id: logId }, updateData);
  }

  private async writeToFile(params: LogExtractionStepParams): Promise<void> {
    const logFilePath = path.join(
      this.logDir,
      `${params.extractionJobId}.jsonl`
    );
    const logEntry = {
      id: `step_${params.stepIndex}`,
      timestamp: new Date().toISOString(),
      step_index: params.stepIndex,
      operation_type: params.operationType,
      operation_name: params.operationName || null,
      status: params.status,
      input_data: params.inputData,
      output_data: params.outputData,
      error_message: params.errorMessage || null,
      error_stack: params.errorStack || null,
      duration_ms: params.durationMs || null,
      tokens_used: params.tokensUsed || null,
      metadata: params.metadata || null,
    };

    try {
      await fs.appendFile(logFilePath, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error(
        `Failed to write to extraction log file: ${logFilePath}`,
        error
      );
    }
  }

  /**
   * Get all logs for a job - Migrated to TypeORM Repository
   */
  async getJobLogs(extractionJobId: string): Promise<ExtractionLogRow[]> {
    const logs = await this.extractionLogRepo.find({
      where: { extractionJobId },
      order: { stepIndex: 'ASC', startedAt: 'ASC' },
    });

    return logs.map((log) => ({
      id: log.id,
      extraction_job_id: log.extractionJobId,
      started_at: log.startedAt,
      completed_at: log.completedAt,
      step_index: log.stepIndex,
      operation_type: log.operationType,
      operation_name: log.operationName,
      status: log.status,
      input_data: log.inputData,
      output_data: log.outputData,
      error_message: log.errorMessage,
      error_stack: log.errorStack,
      duration_ms: log.durationMs,
      tokens_used: log.tokensUsed,
      step: log.step,
      message: log.message,
      entity_count: log.entityCount,
      relationship_count: log.relationshipCount,
      error_details: log.errorDetails,
    }));
  }

  /**
   * Get logs by operation type - Migrated to TypeORM QueryBuilder
   */
  async getLogsByType(
    extractionJobId: string,
    operationType: ExtractionLogOperationType
  ): Promise<ExtractionLogRow[]> {
    const logs = await this.extractionLogRepo.find({
      where: { extractionJobId, operationType },
      order: { stepIndex: 'ASC', startedAt: 'ASC' },
    });

    return logs.map((log) => ({
      id: log.id,
      extraction_job_id: log.extractionJobId,
      started_at: log.startedAt,
      completed_at: log.completedAt,
      step_index: log.stepIndex,
      operation_type: log.operationType,
      operation_name: log.operationName,
      status: log.status,
      input_data: log.inputData,
      output_data: log.outputData,
      error_message: log.errorMessage,
      error_stack: log.errorStack,
      duration_ms: log.durationMs,
      tokens_used: log.tokensUsed,
      step: log.step,
      message: log.message,
      entity_count: log.entityCount,
      relationship_count: log.relationshipCount,
      error_details: log.errorDetails,
    }));
  }

  /**
   * Get error logs for a job - Migrated to TypeORM QueryBuilder
   */
  async getErrorLogs(extractionJobId: string): Promise<ExtractionLogRow[]> {
    const logs = await this.extractionLogRepo.find({
      where: { extractionJobId, status: 'failed' },
      order: { stepIndex: 'ASC', startedAt: 'ASC' },
    });

    return logs.map((log) => ({
      id: log.id,
      extraction_job_id: log.extractionJobId,
      started_at: log.startedAt,
      completed_at: log.completedAt,
      step_index: log.stepIndex,
      operation_type: log.operationType,
      operation_name: log.operationName,
      status: log.status,
      input_data: log.inputData,
      output_data: log.outputData,
      error_message: log.errorMessage,
      error_stack: log.errorStack,
      duration_ms: log.durationMs,
      tokens_used: log.tokensUsed,
      step: log.step,
      message: log.message,
      entity_count: log.entityCount,
      relationship_count: log.relationshipCount,
      error_details: log.errorDetails,
    }));
  }

  /**
   * Get summary statistics for a job
   */
  async getJobSummary(extractionJobId: string): Promise<{
    total_steps: number;
    completed_steps: number;
    failed_steps: number;
    pending_steps: number;
    total_tokens_used: number;
    total_duration_ms: number;
    total_entities_created: number;
    total_relationships_created: number;
  }> {
    const logs = await this.getJobLogs(extractionJobId);

    return {
      total_steps: logs.length,
      completed_steps: logs.filter((l) => l.status === 'completed').length,
      failed_steps: logs.filter((l) => l.status === 'failed').length,
      pending_steps: logs.filter((l) => l.status === 'pending').length,
      total_tokens_used: logs.reduce((sum, l) => sum + (l.tokens_used || 0), 0),
      total_duration_ms: logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0),
      total_entities_created: logs.reduce(
        (sum, l) => sum + (l.entity_count || 0),
        0
      ),
      total_relationships_created: logs.reduce(
        (sum, l) => sum + (l.relationship_count || 0),
        0
      ),
    };
  }
}
