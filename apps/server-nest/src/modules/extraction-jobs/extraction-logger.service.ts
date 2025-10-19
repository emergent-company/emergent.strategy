import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export type ExtractionLogOperationType =
    | 'llm_call'
    | 'chunk_processing'
    | 'object_creation'
    | 'relationship_creation'
    | 'suggestion_creation'
    | 'validation'
    | 'error';

export type ExtractionLogStatus = 'success' | 'error' | 'warning';

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
    tokens_used: number | null;
    metadata: any;
    created_at: Date;
}

@Injectable()
export class ExtractionLoggerService {
    constructor(private readonly db: DatabaseService) {}

    /**
     * Log a single extraction step with input/output data
     */
    async logStep(params: LogExtractionStepParams): Promise<string> {
        const {
            extractionJobId,
            stepIndex,
            operationType,
            operationName,
            status = 'success',
            inputData,
            outputData,
            errorMessage,
            errorStack,
            durationMs,
            tokensUsed,
            metadata,
        } = params;

        const result = await this.db.query<{ id: string }>(
            `
            INSERT INTO kb.object_extraction_logs (
                extraction_job_id,
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
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
            `,
            [
                extractionJobId,
                stepIndex,
                operationType,
                operationName || null,
                status,
                inputData ? JSON.stringify(inputData) : null,
                outputData ? JSON.stringify(outputData) : null,
                errorMessage || null,
                errorStack || null,
                durationMs || null,
                tokensUsed || null,
                metadata ? JSON.stringify(metadata) : null,
            ]
        );

        return result.rows[0].id;
    }

    /**
     * Get all logs for a specific extraction job
     */
    async getJobLogs(extractionJobId: string): Promise<ExtractionLogRow[]> {
        const result = await this.db.query<ExtractionLogRow>(
            `
            SELECT 
                id,
                extraction_job_id,
                logged_at,
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
                metadata,
                created_at
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1
            ORDER BY step_index ASC, logged_at ASC
            `,
            [extractionJobId]
        );

        return result.rows;
    }

    /**
     * Get logs for a specific operation type
     */
    async getLogsByType(
        extractionJobId: string,
        operationType: ExtractionLogOperationType
    ): Promise<ExtractionLogRow[]> {
        const result = await this.db.query<ExtractionLogRow>(
            `
            SELECT 
                id,
                extraction_job_id,
                logged_at,
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
                metadata,
                created_at
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1 AND operation_type = $2
            ORDER BY step_index ASC, logged_at ASC
            `,
            [extractionJobId, operationType]
        );

        return result.rows;
    }

    /**
     * Get only error logs
     */
    async getErrorLogs(extractionJobId: string): Promise<ExtractionLogRow[]> {
        const result = await this.db.query<ExtractionLogRow>(
            `
            SELECT 
                id,
                extraction_job_id,
                logged_at,
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
                metadata,
                created_at
            FROM kb.object_extraction_logs
            WHERE extraction_job_id = $1 AND status = 'error'
            ORDER BY step_index ASC, logged_at ASC
            `,
            [extractionJobId]
        );

        return result.rows;
    }

    /**
     * Delete logs for a specific job (called when job is deleted)
     */
    async deleteJobLogs(extractionJobId: string): Promise<void> {
        await this.db.query(
            `DELETE FROM kb.object_extraction_logs WHERE extraction_job_id = $1`,
            [extractionJobId]
        );
    }

    /**
     * Get summary statistics for a job's logs
     */
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
