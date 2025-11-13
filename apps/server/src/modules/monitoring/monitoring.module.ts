import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MonitoringService } from './monitoring.service';
import { MonitoringLoggerService } from './monitoring-logger.service';
import { MonitoringController } from './monitoring.controller';
import { LlmCallLog } from '../../entities/llm-call-log.entity';
import { SystemProcessLog } from '../../entities/system-process-log.entity';
import { ObjectExtractionJob } from '../../entities/object-extraction-job.entity';

/**
 * Monitoring Module
 *
 * Provides system monitoring infrastructure for tracking:
 * - Extraction job lifecycle and progress
 * - LLM API calls with token usage and cost calculation
 * - System process logs for debugging and analysis
 *
 * Architecture:
 * - MonitoringLoggerService: Injectable write service (exported for use in other modules)
 * - MonitoringService: Read/query service for retrieving monitoring data
 * - MonitoringController: REST API endpoints for frontend access
 *
 * Database:
 * - kb.system_process_logs: General event logging with metadata
 * - kb.llm_call_logs: LLM-specific logging with cost tracking
 * - Both tables use RLS policies for tenant isolation
 *
 * Usage in other modules:
 *
 * @example
 * // In extraction-jobs.module.ts:
 * import { MonitoringModule } from '../monitoring/monitoring.module';
 *
 * @Module({
 *   imports: [MonitoringModule],
 *   // ... other config
 * })
 * export class ExtractionJobsModule {}
 *
 * // In extraction-job.service.ts:
 * import { MonitoringLoggerService } from '../monitoring/monitoring-logger.service';
 *
 * @Injectable()
 * export class ExtractionJobService {
 *   constructor(
 *     private readonly monitoringLogger: MonitoringLoggerService,
 *   ) {}
 *
 *   async processJob(jobId: string) {
 *     await this.monitoringLogger.logProcessEvent({
 *       processId: jobId,
 *       processType: 'extraction_job',
 *       level: 'info',
 *       message: 'Starting job processing',
 *       projectId,
 *     });
 *   }
 * }
 *
 * @example
 * // In vertex-ai.provider.ts:
 * import { MonitoringLoggerService } from '../monitoring/monitoring-logger.service';
 *
 * @Injectable()
 * export class VertexAIProvider {
 *   constructor(
 *     private readonly monitoringLogger: MonitoringLoggerService,
 *   ) {}
 *
 *   async generateContent(request) {
 *     const callId = await this.monitoringLogger.startLLMCall({
 *       processId: jobId,
 *       processType: 'extraction_job',
 *       modelName: 'gemini-1.5-pro',
 *       requestPayload: request,
 *       projectId,
 *     });
 *
 *     const response = await this.model.generateContent(request);
 *
 *     await this.monitoringLogger.completeLLMCall(callId, {
 *       responsePayload: response,
 *       status: 'success',
 *       inputTokens: response.usageMetadata.promptTokenCount,
 *       outputTokens: response.usageMetadata.candidatesTokenCount,
 *     });
 *   }
 * }
 *
 * Authorization:
 * - Uses existing AuthGuard and ScopesGuard (no new role required)
 * - Controller endpoints protected with 'extraction:read' scope
 * - No write endpoints (logging is internal service-to-service)
 *
 * Phase 1 Scope (MVP):
 * - Extraction job monitoring only
 * - Future phases will add chat sessions and frontend logging
 */
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TypeOrmModule.forFeature([
      LlmCallLog,
      SystemProcessLog,
      ObjectExtractionJob,
    ]),
  ],
  providers: [MonitoringService, MonitoringLoggerService],
  controllers: [MonitoringController],
  exports: [MonitoringLoggerService], // Export for use in other modules
})
export class MonitoringModule {}
