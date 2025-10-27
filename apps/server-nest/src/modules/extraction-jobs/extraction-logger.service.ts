import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
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

export type ExtractionLogStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

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

@Injectable()
export class ExtractionLoggerService {
    private readonly logDir = path.join(process.cwd(), 'logs', 'extraction');

    constructor(private readonly db: DatabaseService) {
        this.initFileLogging();
    }

    private async initFileLogging() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create extraction log directory', error);
        }
    }

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
            metadata,
        } = params;

        // Generate step name and message based on operation
        const step = operationName || operationType;
        const message = errorMessage || (status === 'completed' ? `${operationType} completed successfully` : `${operationType} ${status}`);

        const result = await this.db.query<{ id: string }>(
            `
            INSERT INTO kb.object_extraction_logs (
                extraction_job_id,
                step_index,
                operation_type,
                operation_name,
                step,
                status,
                message,
                input_data,
                output_data,
                error_message,
                error_stack,
                duration_ms,
                tokens_used
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
            `,
            [
                extractionJobId,
                stepIndex,
                operationType,
                operationName || null,
                step,
                status,
                message,
                inputData ? JSON.stringify(inputData) : null,
                outputData ? JSON.stringify(outputData) : null,
                errorMessage || null,
                errorStack || null,
                durationMs || null,
                tokensUsed || null,
            ]
        );

        await this.writeToFile(params);

        return result.rows[0].id;
    }

    /**
     * Update an existing log entry (e.g., change pending to success/error)
     */
    async updateLogStep(logId: string, updates: {
        status?: ExtractionLogStatus;
        outputData?: any;
        errorMessage?: string;
        errorStack?: string;
        durationMs?: number;
        tokensUsed?: number;
        message?: string;
    }): Promise<void> {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramIndex++}`);
            values.push(updates.status);

            // Update completed_at when status changes
            setClauses.push(`completed_at = NOW()`);
        }

        if (updates.outputData !== undefined) {
            setClauses.push(`output_data = $${paramIndex++}`);
            values.push(JSON.stringify(updates.outputData));
        }

        if (updates.errorMessage !== undefined) {
            setClauses.push(`error_message = $${paramIndex++}`);
            values.push(updates.errorMessage);
        }

        if (updates.errorStack !== undefined) {
            setClauses.push(`error_stack = $${paramIndex++}`);
            values.push(updates.errorStack);
        }

        if (updates.durationMs !== undefined) {
            setClauses.push(`duration_ms = $${paramIndex++}`);
            values.push(updates.durationMs);
        }

        if (updates.tokensUsed !== undefined) {
            setClauses.push(`tokens_used = $${paramIndex++}`);
            values.push(updates.tokensUsed);
        }

        if (updates.message !== undefined) {
            setClauses.push(`message = $${paramIndex++}`);
            values.push(updates.message);
        }

        if (setClauses.length === 0) {
            return; // Nothing to update
        }

        values.push(logId);

        await this.db.query(
            `
            UPDATE kb.object_extraction_logs 
            SET ${setClauses.join(', ')}
            WHERE id = $${paramIndex}
            `,
            values
        );
    }

    private async writeToFile(params: LogExtractionStepParams): Promise<void> {
        const logFilePath = path.join(this.logDir, `${params.extractionJobId}.jsonl`);
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
            console.error(`Failed to write to extraction log file: ${logFilePath}`, error);
        }
    }

    async getJobLogs(extractionJobId: string): Promise<ExtractionLogRow[]> {
        const result = await this.db.query<ExtractionLogRow>(
            `
            SELECT 
                id,
                extraction_job_id,
                started_at,
                completed_at,
                step_index,
                operation_type,
                operation_name,
                status,
                input_data,
                output_data,
                error_message,
                error_stack,
                duration_ms,
                tokens_used,
                step,
                message,
                entity_count,
                relationship_count,
                error_details
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1
            ORDER BY step_index ASC, started_at ASC
            `,
            [extractionJobId]
        );

        return result.rows;
    }

    async getLogsByType(
        extractionJobId: string,
        operationType: ExtractionLogOperationType
    ): Promise<ExtractionLogRow[]> {
        const result = await this.db.query<ExtractionLogRow>(
            `
            SELECT 
                id,
                extraction_job_id,
                started_at,
                completed_at,
                step_index,
                operation_type,
                operation_name,
                status,
                input_data,
                output_data,
                error_message,
                error_stack,
                duration_ms,
                tokens_used,
                step,
                message,
                entity_count,
                relationship_count,
                error_details
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1 AND operation_type = $2
            ORDER BY step_index ASC, started_at ASC
            `,
            [extractionJobId, operationType]
        );

        return result.rows;
    }

    async getErrorLogs(extractionJobId: string): Promise<ExtractionLogRow[]> {
        const result = await this.db.query<ExtractionLogRow>(
            `
            SELECT 
                id,
                extraction_job_id,
                started_at,
                completed_at,
                step_index,
                operation_type,
                operation_name,
                status,
                input_data,
                output_data,
                error_message,
                error_stack,
                duration_ms,
                tokens_used,
                step,
                message,
                entity_count,
                relationship_count,
                error_details
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1 AND status = 'failed'
            ORDER BY step_index ASC, started_at ASC
            `,
            [extractionJobId]
        );

        return result.rows;
    }

    async deleteJobLogs(extractionJobId: string): Promise<void> {
        await this.db.query(
            `DELETE FROM kb.object_extraction_logs WHERE extraction_job_id = $1`,
            [extractionJobId]
        );
    }

    async getLogSummary(extractionJobId: string): Promise<{
        totalSteps: number;
        successSteps: number;
        errorSteps: number;
        warningSteps: number;
        totalDurationMs: number;
        totalTokensUsed: number;
        operationCounts: Record<string, number>;
    }> {
        const result = await this.db.query<{
            total_steps: string;
            success_steps: string;
            error_steps: string;
            warning_steps: string;
            total_duration_ms: string;
            total_tokens_used: string;
        }>(
            `
            SELECT 
                COUNT(*)::text as total_steps,
                COUNT(*) FILTER (WHERE status = 'success')::text as success_steps,
                COUNT(*) FILTER (WHERE status = 'error')::text as error_steps,
                COUNT(*) FILTER (WHERE status = 'warning')::text as warning_steps,
                COALESCE(SUM(duration_ms), 0)::text as total_duration_ms,
                COALESCE(SUM(tokens_used), 0)::text as total_tokens_used
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1
            `,
            [extractionJobId]
        );

        const operationsResult = await this.db.query<{
            operation_type: string;
            count: string;
        }>(
            `
            SELECT 
                operation_type,
                COUNT(*)::text as count
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1
            GROUP BY operation_type
            `,
            [extractionJobId]
        );

        const operationCounts: Record<string, number> = {};
        for (const row of operationsResult.rows) {
            operationCounts[row.operation_type] = parseInt(row.count, 10);
        }

        const summary = result.rows[0];
        return {
            totalSteps: parseInt(summary.total_steps, 10),
            successSteps: parseInt(summary.success_steps, 10),
            errorSteps: parseInt(summary.error_steps, 10),
            warningSteps: parseInt(summary.warning_steps, 10),
            totalDurationMs: parseInt(summary.total_duration_ms, 10),
            totalTokensUsed: parseInt(summary.total_tokens_used, 10),
            operationCounts,
        };
    }
}
