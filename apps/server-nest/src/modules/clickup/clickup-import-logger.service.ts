import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ClickUpImportLogOperationType =
    | 'discovery'           // Discovering workspace structure
    | 'fetch_spaces'        // Fetching spaces
    | 'fetch_docs'          // Fetching documents
    | 'fetch_pages'         // Fetching pages
    | 'store_document'      // Storing document in DB
    | 'create_extraction'   // Creating extraction job
    | 'api_call'           // Generic API call
    | 'error';             // Error occurred

export type ClickUpImportLogStatus = 'pending' | 'success' | 'error' | 'warning' | 'info';

export interface LogClickUpImportStepParams {
    integrationId: string;
    importSessionId: string;  // Unique ID for this import run
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

@Injectable()
export class ClickUpImportLoggerService {
    private readonly logDir = path.join(process.cwd(), 'logs', 'clickup-import');

    constructor(private readonly db: DatabaseService) {
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
     * Log a step in the ClickUp import process
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

        const result = await this.db.query<{ id: string }>(
            `
            INSERT INTO kb.clickup_import_logs (
                integration_id,
                import_session_id,
                step_index,
                operation_type,
                operation_name,
                status,
                input_data,
                output_data,
                error_message,
                error_stack,
                duration_ms,
                items_processed,
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
            `,
            [
                integrationId,
                importSessionId,
                stepIndex,
                operationType,
                operationName || null,
                status,
                inputData ? JSON.stringify(inputData) : null,
                outputData ? JSON.stringify(outputData) : null,
                errorMessage || null,
                errorStack || null,
                durationMs || null,
                itemsProcessed || null,
                metadata ? JSON.stringify(metadata) : null,
            ]
        );

        // Also write to file for easy viewing
        await this.writeToFile(params);

        return result.rows[0].id;
    }

    /**
     * Update an existing log entry
     */
    async updateLogStep(logId: string, updates: {
        status?: ClickUpImportLogStatus;
        outputData?: any;
        errorMessage?: string;
        errorStack?: string;
        durationMs?: number;
        itemsProcessed?: number;
        metadata?: Record<string, any>;
    }): Promise<void> {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramIndex++}`);
            values.push(updates.status);
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

        if (updates.itemsProcessed !== undefined) {
            setClauses.push(`items_processed = $${paramIndex++}`);
            values.push(updates.itemsProcessed);
        }

        if (updates.metadata !== undefined) {
            setClauses.push(`metadata = $${paramIndex++}`);
            values.push(JSON.stringify(updates.metadata));
        }

        if (setClauses.length === 0) {
            return;
        }

        values.push(logId);

        await this.db.query(
            `
            UPDATE kb.clickup_import_logs 
            SET ${setClauses.join(', ')}
            WHERE id = $${paramIndex}
            `,
            values
        );
    }

    /**
     * Write log entry to JSONL file for easy viewing
     */
    private async writeToFile(params: LogClickUpImportStepParams): Promise<void> {
        const logFilePath = path.join(this.logDir, `${params.importSessionId}.jsonl`);
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
            await fs.appendFile(logFilePath, JSON.stringify(logEntry) + '\n');
        } catch (error) {
            console.error(`Failed to write to ClickUp import log file: ${logFilePath}`, error);
        }
    }

    /**
     * Get all logs for a specific import session
     */
    async getSessionLogs(importSessionId: string): Promise<ClickUpImportLogRow[]> {
        const result = await this.db.query<ClickUpImportLogRow>(
            `
            SELECT 
                id,
                integration_id,
                import_session_id,
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
                items_processed,
                metadata,
                created_at
            FROM kb.clickup_import_logs
            WHERE import_session_id = $1
            ORDER BY step_index ASC, logged_at ASC
            `,
            [importSessionId]
        );

        return result.rows;
    }

    /**
     * Get logs by operation type
     */
    async getLogsByType(
        importSessionId: string,
        operationType: ClickUpImportLogOperationType
    ): Promise<ClickUpImportLogRow[]> {
        const result = await this.db.query<ClickUpImportLogRow>(
            `
            SELECT 
                id,
                integration_id,
                import_session_id,
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
                items_processed,
                metadata,
                created_at
            FROM kb.clickup_import_logs
            WHERE import_session_id = $1 AND operation_type = $2
            ORDER BY step_index ASC, logged_at ASC
            `,
            [importSessionId, operationType]
        );

        return result.rows;
    }

    /**
     * Get error logs
     */
    async getErrorLogs(importSessionId: string): Promise<ClickUpImportLogRow[]> {
        const result = await this.db.query<ClickUpImportLogRow>(
            `
            SELECT 
                id,
                integration_id,
                import_session_id,
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
                items_processed,
                metadata,
                created_at
            FROM kb.clickup_import_logs
            WHERE import_session_id = $1 AND status = 'error'
            ORDER BY step_index ASC, logged_at ASC
            `,
            [importSessionId]
        );

        return result.rows;
    }

    /**
     * Delete logs for a specific import session
     */
    async deleteSessionLogs(importSessionId: string): Promise<void> {
        await this.db.query(
            `DELETE FROM kb.clickup_import_logs WHERE import_session_id = $1`,
            [importSessionId]
        );
    }

    /**
     * Get summary statistics for an import session
     */
    async getLogSummary(importSessionId: string): Promise<{
        totalSteps: number;
        successSteps: number;
        errorSteps: number;
        warningSteps: number;
        infoSteps: number;
        totalDurationMs: number;
        totalItemsProcessed: number;
        operationCounts: Record<string, number>;
    }> {
        const result = await this.db.query<{
            total_steps: string;
            success_steps: string;
            error_steps: string;
            warning_steps: string;
            info_steps: string;
            total_duration_ms: string;
            total_items_processed: string;
        }>(
            `
            SELECT 
                COUNT(*)::text as total_steps,
                COUNT(*) FILTER (WHERE status = 'success')::text as success_steps,
                COUNT(*) FILTER (WHERE status = 'error')::text as error_steps,
                COUNT(*) FILTER (WHERE status = 'warning')::text as warning_steps,
                COUNT(*) FILTER (WHERE status = 'info')::text as info_steps,
                COALESCE(SUM(duration_ms), 0)::text as total_duration_ms,
                COALESCE(SUM(items_processed), 0)::text as total_items_processed
            FROM kb.clickup_import_logs
            WHERE import_session_id = $1
            `,
            [importSessionId]
        );

        const operationsResult = await this.db.query<{
            operation_type: string;
            count: string;
        }>(
            `
            SELECT 
                operation_type,
                COUNT(*)::text as count
            FROM kb.clickup_import_logs
            WHERE import_session_id = $1
            GROUP BY operation_type
            `,
            [importSessionId]
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
            infoSteps: parseInt(summary.info_steps, 10),
            totalDurationMs: parseInt(summary.total_duration_ms, 10),
            totalItemsProcessed: parseInt(summary.total_items_processed, 10),
            operationCounts,
        };
    }

    /**
     * Get all import sessions for an integration
     */
    async getIntegrationSessions(integrationId: string, limit: number = 10): Promise<{
        import_session_id: string;
        started_at: Date;
        total_steps: number;
        error_count: number;
        items_processed: number;
    }[]> {
        const result = await this.db.query<{
            import_session_id: string;
            started_at: Date;
            total_steps: string;
            error_count: string;
            items_processed: string;
        }>(
            `
            SELECT 
                import_session_id,
                MIN(logged_at) as started_at,
                COUNT(*)::text as total_steps,
                COUNT(*) FILTER (WHERE status = 'error')::text as error_count,
                COALESCE(SUM(items_processed), 0)::text as items_processed
            FROM kb.clickup_import_logs
            WHERE integration_id = $1
            GROUP BY import_session_id
            ORDER BY MIN(logged_at) DESC
            LIMIT $2
            `,
            [integrationId, limit]
        );

        return result.rows.map(row => ({
            import_session_id: row.import_session_id,
            started_at: row.started_at,
            total_steps: parseInt(row.total_steps, 10),
            error_count: parseInt(row.error_count, 10),
            items_processed: parseInt(row.items_processed, 10),
        }));
    }
}
