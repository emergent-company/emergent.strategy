import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
    ResourceListResponseDto,
    ResourceDetailResponseDto,
    ExtractionJobResourceDto,
    LogEntryDto,
    LLMCallDto,
} from './dto/resource-detail.dto';
import { ResourceQueryDto, LogQueryDto } from './dto/resource-query.dto';

@Injectable()
export class MonitoringService {
    constructor(private readonly db: DatabaseService) { }

    /**
     * Get list of extraction jobs with optional filtering
     */
    async getExtractionJobs(
        projectId: string,
        query: ResourceQueryDto,
    ): Promise<ResourceListResponseDto> {
        const { status, date_from, date_to, limit = 50, offset = 0 } = query;

        // Build WHERE clause
        const conditions: string[] = ['project_id = $1'];
        const params: any[] = [projectId];
        let paramIndex = 2;

        if (status) {
            conditions.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        if (date_from) {
            conditions.push(`started_at >= $${paramIndex}`);
            params.push(date_from);
            paramIndex++;
        }

        if (date_to) {
            conditions.push(`started_at <= $${paramIndex}`);
            params.push(date_to);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countResult = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM kb.object_extraction_jobs WHERE ${whereClause}`,
            params,
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get paginated results with cost aggregation
        const sql = `
            SELECT 
                j.id,
                j.source_type,
                j.source_id,
                j.status,
                j.total_items,
                j.processed_items,
                j.successful_items,
                j.failed_items,
                j.started_at,
                j.completed_at,
                COALESCE(
                    (SELECT SUM(cost_usd) 
                     FROM kb.llm_call_logs 
                     WHERE process_id = j.id::text 
                       AND process_type = 'extraction_job'),
                    0
                ) as total_cost_usd
            FROM kb.object_extraction_jobs j
            WHERE ${whereClause}
            ORDER BY j.started_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const result = await this.db.query(sql, [...params, limit, offset]);

        const items: ExtractionJobResourceDto[] = result.rows.map((row) => ({
            id: row.id,
            documentId: row.source_type === 'document' ? row.source_id : undefined,
            status: row.status,
            totalItems: row.total_items,
            processedItems: row.processed_items,
            successfulItems: row.successful_items,
            failedItems: row.failed_items,
            startedAt: row.started_at.toISOString(),
            completedAt: row.completed_at?.toISOString(),
            totalCostUsd: parseFloat(row.total_cost_usd) || undefined,
        }));

        return { items, total, limit, offset };
    }

    /**
     * Get detailed information for a specific extraction job
     */
    async getExtractionJobDetail(
        projectId: string,
        jobId: string,
    ): Promise<ResourceDetailResponseDto> {
        // Get job info with cost
        const jobSql = `
            SELECT 
                j.id,
                j.source_type,
                j.source_id,
                j.status,
                j.total_items,
                j.processed_items,
                j.successful_items,
                j.failed_items,
                j.started_at,
                j.completed_at,
                COALESCE(
                    (SELECT SUM(cost_usd) 
                     FROM kb.llm_call_logs 
                     WHERE process_id = j.id::text 
                       AND process_type = 'extraction_job'),
                    0
                ) as total_cost_usd
            FROM kb.object_extraction_jobs j
            WHERE j.id = $1 AND j.project_id = $2
        `;

        const jobResult = await this.db.query(jobSql, [jobId, projectId]);

        if (jobResult.rows.length === 0) {
            throw new Error(`Extraction job ${jobId} not found`);
        }

        const jobRow = jobResult.rows[0];
        const resource: ExtractionJobResourceDto = {
            id: jobRow.id,
            documentId: jobRow.source_type === 'document' ? jobRow.source_id : undefined,
            status: jobRow.status,
            totalItems: jobRow.total_items,
            processedItems: jobRow.processed_items,
            successfulItems: jobRow.successful_items,
            failedItems: jobRow.failed_items,
            startedAt: jobRow.started_at.toISOString(),
            completedAt: jobRow.completed_at?.toISOString(),
            totalCostUsd: parseFloat(jobRow.total_cost_usd) || undefined,
        };

        // Get recent logs (last 100)
        const logsSql = `
            SELECT 
                id, process_id, process_type, level, message, metadata, timestamp
            FROM kb.system_process_logs
            WHERE process_id = $1 AND process_type = 'extraction_job'
            ORDER BY timestamp DESC
            LIMIT 100
        `;

        const logsResult = await this.db.query(logsSql, [jobId]);
        const recentLogs: LogEntryDto[] = logsResult.rows.map((row) => ({
            id: row.id,
            processId: row.process_id,
            processType: row.process_type,
            level: row.level,
            message: row.message,
            metadata: row.metadata,
            timestamp: row.timestamp.toISOString(),
        }));

        // Get all LLM calls
        const llmCallsSql = `
            SELECT 
                id, process_id, process_type, model_name, 
                request_payload, response_payload, status, error_message,
                input_tokens, output_tokens, total_tokens, cost_usd,
                started_at, completed_at, duration_ms
            FROM kb.llm_call_logs
            WHERE process_id = $1 AND process_type = 'extraction_job'
            ORDER BY started_at DESC
        `;

        const llmCallsResult = await this.db.query(llmCallsSql, [jobId]);
        const llmCalls: LLMCallDto[] = llmCallsResult.rows.map((row) => ({
            id: row.id,
            processId: row.process_id,
            processType: row.process_type,
            modelName: row.model_name,
            requestPayload: row.request_payload,
            responsePayload: row.response_payload,
            status: row.status,
            errorMessage: row.error_message,
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            totalTokens: row.total_tokens,
            costUsd: row.cost_usd,
            startedAt: row.started_at.toISOString(),
            completedAt: row.completed_at?.toISOString(),
            durationMs: row.duration_ms,
        }));

        // Calculate metrics
        const totalCost = llmCalls.reduce((sum, call) => sum + (call.costUsd || 0), 0);
        const completedCalls = llmCalls.filter((call) => call.durationMs !== undefined);
        const avgDuration =
            completedCalls.length > 0
                ? completedCalls.reduce((sum, call) => sum + (call.durationMs || 0), 0) /
                completedCalls.length
                : 0;

        const metrics = {
            totalCost: parseFloat(totalCost.toFixed(6)),
            avgDuration: Math.round(avgDuration),
            totalLLMCalls: llmCalls.length,
            successfulCalls: llmCalls.filter((call) => call.status === 'success').length,
            failedCalls: llmCalls.filter((call) => call.status === 'error').length,
        };

        return { resource, recentLogs, llmCalls, metrics };
    }

    /**
     * Get logs for a specific resource
     */
    async getLogsForResource(
        processId: string,
        processType: string,
        query: LogQueryDto,
    ): Promise<LogEntryDto[]> {
        const { level, limit = 100, offset = 0 } = query;

        const conditions: string[] = ['process_id = $1', 'process_type = $2'];
        const params: any[] = [processId, processType];
        let paramIndex = 3;

        if (level) {
            conditions.push(`level = $${paramIndex}`);
            params.push(level);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        const sql = `
            SELECT 
                id, process_id, process_type, level, message, metadata, timestamp
            FROM kb.system_process_logs
            WHERE ${whereClause}
            ORDER BY timestamp DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const result = await this.db.query(sql, [...params, limit, offset]);

        return result.rows.map((row) => ({
            id: row.id,
            processId: row.process_id,
            processType: row.process_type,
            level: row.level,
            message: row.message,
            metadata: row.metadata,
            timestamp: row.timestamp.toISOString(),
        }));
    }

    /**
     * Get LLM calls for a specific resource
     */
    async getLLMCallsForResource(
        processId: string,
        processType: string,
        limit = 50,
        offset = 0,
    ): Promise<LLMCallDto[]> {
        const sql = `
            SELECT 
                id, process_id, process_type, model_name, 
                request_payload, response_payload, status, error_message,
                input_tokens, output_tokens, total_tokens, cost_usd,
                started_at, completed_at, duration_ms
            FROM kb.llm_call_logs
            WHERE process_id = $1 AND process_type = $2
            ORDER BY started_at DESC
            LIMIT $3 OFFSET $4
        `;

        const result = await this.db.query(sql, [processId, processType, limit, offset]);

        return result.rows.map((row) => ({
            id: row.id,
            processId: row.process_id,
            processType: row.process_type,
            modelName: row.model_name,
            requestPayload: row.request_payload,
            responsePayload: row.response_payload,
            status: row.status,
            errorMessage: row.error_message,
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            totalTokens: row.total_tokens,
            costUsd: row.cost_usd,
            startedAt: row.started_at.toISOString(),
            completedAt: row.completed_at?.toISOString(),
            durationMs: row.duration_ms,
        }));
    }
}
