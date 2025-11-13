import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LlmCallLog } from '../../entities/llm-call-log.entity';
import { SystemProcessLog } from '../../entities/system-process-log.entity';
import { ObjectExtractionJob } from '../../entities/object-extraction-job.entity';
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
  constructor(
    @InjectRepository(ObjectExtractionJob)
    private readonly extractionJobRepo: Repository<ObjectExtractionJob>,
    @InjectRepository(LlmCallLog)
    private readonly llmCallLogRepo: Repository<LlmCallLog>,
    @InjectRepository(SystemProcessLog)
    private readonly systemLogRepo: Repository<SystemProcessLog>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Get list of extraction jobs with optional filtering
   * Keep as DataSource.query - complex subquery for cost aggregation
   */
  async getExtractionJobs(
    projectId: string,
    query: ResourceQueryDto
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

    // Get total count using TypeORM
    const total = await this.extractionJobRepo.count({
      where: conditions.length === 1 ? { projectId } : undefined,
    });

    // Get paginated results with cost aggregation - keep as DataSource.query for complex subquery
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

    const result = await this.dataSource.query(sql, [...params, limit, offset]);

    const items: ExtractionJobResourceDto[] = result.map((row: any) => ({
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
   * Keep as DataSource.query - complex subquery for cost aggregation
   */
  async getExtractionJobDetail(
    projectId: string,
    jobId: string
  ): Promise<ResourceDetailResponseDto> {
    // Get job info with cost - keep as DataSource.query for subquery
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

    const jobResult = await this.dataSource.query(jobSql, [jobId, projectId]);

    if (jobResult.length === 0) {
      throw new Error(`Extraction job ${jobId} not found`);
    }

    const jobRow = jobResult[0];
    const resource: ExtractionJobResourceDto = {
      id: jobRow.id,
      documentId:
        jobRow.source_type === 'document' ? jobRow.source_id : undefined,
      status: jobRow.status,
      totalItems: jobRow.total_items,
      processedItems: jobRow.processed_items,
      successfulItems: jobRow.successful_items,
      failedItems: jobRow.failed_items,
      startedAt: jobRow.started_at.toISOString(),
      completedAt: jobRow.completed_at?.toISOString(),
      totalCostUsd: parseFloat(jobRow.total_cost_usd) || undefined,
    };

    // Get recent logs (last 100) using TypeORM QueryBuilder
    const logsResult = await this.systemLogRepo
      .createQueryBuilder('log')
      .where('log.processId = :processId', { processId: jobId })
      .andWhere('log.processType = :processType', {
        processType: 'extraction_job',
      })
      .orderBy('log.timestamp', 'DESC')
      .limit(100)
      .getMany();

    const recentLogs: LogEntryDto[] = logsResult.map((row) => ({
      id: row.id,
      processId: row.processId,
      processType: row.processType,
      level: row.level,
      message: row.message,
      metadata: row.metadata ?? undefined,
      timestamp: row.timestamp.toISOString(),
    }));

    // Get all LLM calls using TypeORM QueryBuilder
    const llmCallsResult = await this.llmCallLogRepo
      .createQueryBuilder('call')
      .where('call.processId = :processId', { processId: jobId })
      .andWhere('call.processType = :processType', {
        processType: 'extraction_job',
      })
      .orderBy('call.startedAt', 'DESC')
      .getMany();

    const llmCalls: LLMCallDto[] = llmCallsResult.map((row) => ({
      id: row.id,
      processId: row.processId,
      processType: row.processType,
      modelName: row.modelName,
      requestPayload: row.requestPayload || {},
      responsePayload: row.responsePayload ?? undefined,
      status: row.status,
      errorMessage: row.errorMessage ?? undefined,
      inputTokens: row.inputTokens ?? undefined,
      outputTokens: row.outputTokens ?? undefined,
      totalTokens: row.totalTokens ?? undefined,
      costUsd: row.costUsd ?? undefined,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      durationMs: row.durationMs ?? undefined,
    }));

    // Calculate metrics
    const totalCost = llmCalls.reduce(
      (sum, call) => sum + (call.costUsd || 0),
      0
    );
    const completedCalls = llmCalls.filter(
      (call) => call.durationMs !== undefined
    );
    const avgDuration =
      completedCalls.length > 0
        ? completedCalls.reduce(
            (sum, call) => sum + (call.durationMs || 0),
            0
          ) / completedCalls.length
        : 0;

    const metrics = {
      totalCost: parseFloat(totalCost.toFixed(6)),
      avgDuration: Math.round(avgDuration),
      totalLLMCalls: llmCalls.length,
      successfulCalls: llmCalls.filter((call) => call.status === 'success')
        .length,
      failedCalls: llmCalls.filter((call) => call.status === 'error').length,
    };

    return { resource, recentLogs, llmCalls, metrics };
  }

  /**
   * Get logs for a specific resource - Migrated to TypeORM QueryBuilder
   */
  async getLogsForResource(
    processId: string,
    processType: string,
    query: LogQueryDto
  ): Promise<LogEntryDto[]> {
    const { level, limit = 100, offset = 0 } = query;

    const queryBuilder = this.systemLogRepo
      .createQueryBuilder('log')
      .where('log.processId = :processId', { processId })
      .andWhere('log.processType = :processType', { processType });

    if (level) {
      queryBuilder.andWhere('log.level = :level', { level });
    }

    const result = await queryBuilder
      .orderBy('log.timestamp', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    return result.map((row) => ({
      id: row.id,
      processId: row.processId,
      processType: row.processType,
      level: row.level,
      message: row.message,
      metadata: row.metadata ?? undefined,
      timestamp: row.timestamp.toISOString(),
    }));
  }

  /**
   * Get LLM calls for a specific resource - Migrated to TypeORM QueryBuilder
   */
  async getLLMCallsForResource(
    processId: string,
    processType: string,
    limit = 50,
    offset = 0
  ): Promise<LLMCallDto[]> {
    const result = await this.llmCallLogRepo
      .createQueryBuilder('call')
      .where('call.processId = :processId', { processId })
      .andWhere('call.processType = :processType', { processType })
      .orderBy('call.startedAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    return result.map((row) => ({
      id: row.id,
      processId: row.processId,
      processType: row.processType,
      modelName: row.modelName,
      requestPayload: row.requestPayload || {},
      responsePayload: row.responsePayload ?? undefined,
      status: row.status,
      errorMessage: row.errorMessage ?? undefined,
      inputTokens: row.inputTokens ?? undefined,
      outputTokens: row.outputTokens ?? undefined,
      totalTokens: row.totalTokens ?? undefined,
      costUsd: row.costUsd ?? undefined,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      durationMs: row.durationMs ?? undefined,
    }));
  }
}
