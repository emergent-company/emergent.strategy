import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { CreateSystemProcessLogInput } from './entities/system-process-log.entity';
import { CreateLLMCallLogInput, UpdateLLMCallLogInput } from './entities/llm-call-log.entity';
import { calculateLLMCost } from './config/llm-pricing.config';

/**
 * MonitoringLoggerService
 * 
 * Injectable service for writing monitoring logs to the database.
 * This service is exported by MonitoringModule and can be injected
 * into any module that needs to log monitoring data.
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

    constructor(private readonly db: DatabaseService) { }

    /**
     * Log a process event (extraction job, sync, etc.)
     * Writes to kb.system_process_logs table
     */
    async logProcessEvent(input: CreateSystemProcessLogInput): Promise<string> {
        try {
            const result = await this.db.query(
                `INSERT INTO kb.system_process_logs (
                    process_id, process_type, level, message, metadata,
                    org_id, project_id, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                RETURNING id`,
                [
                    input.processId,
                    input.processType,
                    input.level,
                    input.message,
                    input.metadata ? JSON.stringify(input.metadata) : null,
                    input.orgId || null,
                    input.projectId || null,
                ]
            );

            return result.rows[0].id;
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
     * Start logging an LLM call (before API call is made)
     * Returns the log ID which should be used to update the log when call completes
     */
    async startLLMCall(input: CreateLLMCallLogInput): Promise<string> {
        try {
            const result = await this.db.query(
                `INSERT INTO kb.llm_call_logs (
                    process_id, process_type, request_payload, model_name,
                    status, org_id, project_id, started_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                RETURNING id`,
                [
                    input.processId,
                    input.processType,
                    JSON.stringify(input.requestPayload),
                    input.modelName,
                    'pending',
                    input.orgId || null,
                    input.projectId || null,
                ]
            );

            return result.rows[0].id;
        } catch (error) {
            this.logger.error(
                `Failed to start LLM call log for ${input.processType}:${input.processId}`,
                error instanceof Error ? error.stack : String(error)
            );
            return '';
        }
    }

    /**
     * Complete an LLM call log (after API call finishes)
     * Auto-calculates cost based on token usage
     */
    async completeLLMCall(update: UpdateLLMCallLogInput): Promise<void> {
        try {
            // Calculate cost if we have token info
            let costUsd = update.costUsd;
            if (!costUsd && update.inputTokens && update.outputTokens) {
                const modelName = await this.getModelNameForLog(update.id);
                if (modelName) {
                    costUsd = calculateLLMCost(modelName, update.inputTokens, update.outputTokens);
                }
            }

            await this.db.query(
                `UPDATE kb.llm_call_logs SET
                    response_payload = COALESCE($2, response_payload),
                    status = COALESCE($3, status),
                    error_message = $4,
                    usage_metrics = COALESCE($5, usage_metrics),
                    input_tokens = COALESCE($6, input_tokens),
                    output_tokens = COALESCE($7, output_tokens),
                    total_tokens = COALESCE($8, total_tokens),
                    cost_usd = COALESCE($9, cost_usd),
                    completed_at = COALESCE($10, NOW()),
                    duration_ms = COALESCE($11, duration_ms)
                WHERE id = $1`,
                [
                    update.id,
                    update.responsePayload ? JSON.stringify(update.responsePayload) : null,
                    update.status,
                    update.errorMessage || null,
                    update.usageMetrics ? JSON.stringify(update.usageMetrics) : null,
                    update.inputTokens || null,
                    update.outputTokens || null,
                    update.totalTokens || null,
                    costUsd || null,
                    update.completedAt || null,
                    update.durationMs || null,
                ]
            );
        } catch (error) {
            this.logger.error(
                `Failed to complete LLM call log ${update.id}`,
                error instanceof Error ? error.stack : String(error)
            );
        }
    }

    /**
     * Log a complete LLM call (when you have all data upfront)
     * Useful for synchronous calls where you get response immediately
     */
    async logLLMCall(input: CreateLLMCallLogInput): Promise<string> {
        try {
            // Calculate cost if not provided
            let costUsd = input.costUsd;
            if (!costUsd && input.inputTokens && input.outputTokens) {
                costUsd = calculateLLMCost(input.modelName, input.inputTokens, input.outputTokens);
            }

            const result = await this.db.query(
                `INSERT INTO kb.llm_call_logs (
                    process_id, process_type, request_payload, model_name,
                    response_payload, status, error_message, usage_metrics,
                    input_tokens, output_tokens, total_tokens, cost_usd,
                    started_at, completed_at, duration_ms,
                    org_id, project_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING id`,
                [
                    input.processId,
                    input.processType,
                    JSON.stringify(input.requestPayload),
                    input.modelName,
                    input.responsePayload ? JSON.stringify(input.responsePayload) : null,
                    input.status,
                    input.errorMessage || null,
                    input.usageMetrics ? JSON.stringify(input.usageMetrics) : null,
                    input.inputTokens || null,
                    input.outputTokens || null,
                    input.totalTokens || null,
                    costUsd || null,
                    input.startedAt || new Date(),
                    input.completedAt || new Date(),
                    input.durationMs || null,
                    input.orgId || null,
                    input.projectId || null,
                ]
            );

            return result.rows[0].id;
        } catch (error) {
            this.logger.error(
                `Failed to log LLM call for ${input.processType}:${input.processId}`,
                error instanceof Error ? error.stack : String(error)
            );
            return '';
        }
    }

    /**
     * Helper to get model name for a log entry (used for cost calculation)
     */
    private async getModelNameForLog(logId: string): Promise<string | null> {
        try {
            const result = await this.db.query(
                `SELECT model_name FROM kb.llm_call_logs WHERE id = $1`,
                [logId]
            );
            return result.rows[0]?.model_name || null;
        } catch {
            return null;
        }
    }
}
