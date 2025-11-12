import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClickUpImportLog } from '../../entities/clickup-import-log.entity';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ClickUpImportLogOperationType =
  | 'discovery' // Discovering workspace structure
  | 'fetch_spaces' // Fetching spaces
  | 'fetch_docs' // Fetching documents
  | 'fetch_pages' // Fetching pages
  | 'store_document' // Storing document in DB
  | 'create_extraction' // Creating extraction job
  | 'api_call' // Generic API call
  | 'error'; // Error occurred

export type ClickUpImportLogStatus =
  | 'pending'
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

export interface LogClickUpImportStepParams {
  integrationId: string;
  importSessionId: string; // Unique ID for this import run
  stepIndex: number;
  operationType: ClickUpImportLogOperationType;
  operationName?: string;
  status?: ClickUpImportLogStatus;
  inputData?: any;
  outputData?: any;
  errorMessage?: string;
  errorStack?: string;
  durationMs?: number;
  itemsProcessed?: number;
  metadata?: Record<string, any>;
}

export interface ClickUpImportLogRow {
  id: string;
  integration_id: string;
  import_session_id: string;
  logged_at: Date;
  step_index: number;
  operation_type: string;
  operation_name: string | null;
  status: string;
  input_data: any;
  output_data: any;
  error_message: string | null;
  error_stack: string | null;
  duration_ms: number | null;
  items_processed: number | null;
  metadata: any;
  created_at: Date;
}

/**
 * ClickUp Import Logger Service
 * Logs detailed steps of ClickUp import operations for debugging and monitoring
 *
 * Migrated to TypeORM - uses Repository for all operations
 */
@Injectable()
export class ClickUpImportLoggerService {
  private readonly logDir = path.join(process.cwd(), 'logs', 'clickup-import');

  constructor(
    @InjectRepository(ClickUpImportLog)
    private readonly importLogRepo: Repository<ClickUpImportLog>
  ) {
    this.initFileLogging();
  }

  private async initFileLogging() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create ClickUp import log directory', error);
    }
  }

  /**
   * Log a step in the ClickUp import process - Migrated to TypeORM Repository
   */
  async logStep(params: LogClickUpImportStepParams): Promise<string> {
    const {
      integrationId,
      importSessionId,
      stepIndex,
      operationType,
      operationName,
      status = 'success',
      inputData,
      outputData,
      errorMessage,
      errorStack,
      durationMs,
      itemsProcessed,
      metadata,
    } = params;

    // Create log entry using TypeORM
    const log = this.importLogRepo.create({
      integrationId,
      importSessionId,
      stepIndex,
      operationType,
      operationName: operationName || null,
      status,
      inputData: inputData || null,
      outputData: outputData || null,
      errorMessage: errorMessage || null,
      errorStack: errorStack || null,
      durationMs: durationMs || null,
      itemsProcessed: itemsProcessed || null,
      metadata: metadata || null,
    });

    const saved = await this.importLogRepo.save(log);

    // Also write to file for easy viewing
    await this.writeToFile(params);

    return saved.id;
  }

  /**
   * Update an existing log entry - Migrated to TypeORM Repository
   */
  async updateLogStep(
    logId: string,
    updates: {
      status?: ClickUpImportLogStatus;
      outputData?: any;
      errorMessage?: string;
      errorStack?: string;
      durationMs?: number;
      itemsProcessed?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const updateData: Partial<ClickUpImportLog> = {};

    if (updates.status !== undefined) {
      updateData.status = updates.status;
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
    if (updates.itemsProcessed !== undefined) {
      updateData.itemsProcessed = updates.itemsProcessed;
    }
    if (updates.metadata !== undefined) {
      updateData.metadata = updates.metadata;
    }

    if (Object.keys(updateData).length === 0) {
      return;
    }

    await this.importLogRepo.update({ id: logId }, updateData);
  }

  /**
   * Write log entry to JSONL file for easy viewing
   */
  private async writeToFile(params: LogClickUpImportStepParams): Promise<void> {
    const logFilePath = path.join(
      this.logDir,
      `${params.importSessionId}.jsonl`
    );
    const logEntry = {
      id: `step_${params.stepIndex}`,
      timestamp: new Date().toISOString(),
      integration_id: params.integrationId,
      import_session_id: params.importSessionId,
      step_index: params.stepIndex,
      operation_type: params.operationType,
      operation_name: params.operationName || null,
      status: params.status,
      input_data: params.inputData,
      output_data: params.outputData,
      error_message: params.errorMessage || null,
      error_stack: params.errorStack || null,
      duration_ms: params.durationMs || null,
      items_processed: params.itemsProcessed || null,
      metadata: params.metadata || null,
    };

    try {
      await fs.appendFile(
        logFilePath,
        JSON.stringify(logEntry) + '\n',
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to write ClickUp import log to file', error);
    }
  }

  /**
   * Get logs for a specific import session
   */
  async getSessionLogs(
    importSessionId: string
  ): Promise<ClickUpImportLogRow[]> {
    const logs = await this.importLogRepo.find({
      where: { importSessionId },
      order: { stepIndex: 'ASC' },
    });

    return logs.map((log) => ({
      id: log.id,
      integration_id: log.integrationId,
      import_session_id: log.importSessionId,
      logged_at: log.loggedAt,
      step_index: log.stepIndex,
      operation_type: log.operationType,
      operation_name: log.operationName,
      status: log.status,
      input_data: log.inputData,
      output_data: log.outputData,
      error_message: log.errorMessage,
      error_stack: log.errorStack,
      duration_ms: log.durationMs,
      items_processed: log.itemsProcessed,
      metadata: log.metadata,
      created_at: log.createdAt,
    }));
  }

  /**
   * Get summary of import session
   */
  async getSessionSummary(importSessionId: string): Promise<{
    total_steps: number;
    successful_steps: number;
    failed_steps: number;
    total_items_processed: number;
    total_duration_ms: number;
    last_step: ClickUpImportLogRow | null;
  }> {
    const logs = await this.getSessionLogs(importSessionId);

    const summary = {
      total_steps: logs.length,
      successful_steps: logs.filter((l) => l.status === 'success').length,
      failed_steps: logs.filter((l) => l.status === 'error').length,
      total_items_processed: logs.reduce(
        (sum, l) => sum + (l.items_processed || 0),
        0
      ),
      total_duration_ms: logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0),
      last_step: logs.length > 0 ? logs[logs.length - 1] : null,
    };

    return summary;
  }
}
