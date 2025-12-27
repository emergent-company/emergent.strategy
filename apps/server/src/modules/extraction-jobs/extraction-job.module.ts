import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtractionJobService } from './extraction-job.service';
import { ExtractionJobController } from './extraction-job.controller';
import { ExtractionWorkerService } from './extraction-worker.service';
import { ExtractionLoggerService } from './extraction-logger.service';
import { ExtractionExperimentService } from './evaluation/extraction-experiment.service';
import { RateLimiterService } from './rate-limiter.service';
import { ConfidenceScorerService } from './confidence-scorer.service';
import { EntityLinkingService } from './entity-linking.service';
import { LangChainGeminiProvider } from './llm/langchain-gemini.provider';
import { LangGraphExtractionProvider } from './llm/langgraph-extraction.provider';
import { LLMProviderFactory } from './llm/llm-provider.factory';
import { LlmCallDumpService } from './llm/llm-call-dump.service';
import { ExtractionPromptProvider } from './llm/langgraph/prompts/prompt-provider.service';
import { ExtractionContextService } from './extraction-context.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { UtilsModule } from '../../common/utils/utils.module';
import { GraphModule } from '../graph/graph.module';
import { DocumentsModule } from '../documents/documents.module';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { LangfuseModule } from '../langfuse/langfuse.module';
import { LlmModule } from '../llm/llm.module';
import { VerificationModule } from '../verification/verification.module';
import { ObjectRefinementModule } from '../object-refinement/object-refinement.module';
import { GraphObject } from '../../entities/graph-object.entity';
import { ObjectExtractionJob } from '../../entities/object-extraction-job.entity';
import { GraphEmbeddingJob } from '../../entities/graph-embedding-job.entity';
import { ObjectExtractionLog } from '../../entities/object-extraction-log.entity';

/**
 * Extraction Job Module
 *
 * Provides extraction job tracking and management with LLM-powered entity extraction
 *
 * Phase 1: Basic CRUD operations for job lifecycle
 * Phase 2: Async extraction worker with rate limiting and LLM integration
 * Phase 3: Confidence scoring, quality control, and entity linking
 *
 * Components:
 * - ExtractionJobService: Job CRUD and lifecycle management
 * - ExtractionWorkerService: Background worker orchestrating extraction pipeline
 * - RateLimiterService: Token bucket rate limiter for API quota compliance
 * - ConfidenceScorerService: Multi-factor confidence calculation for extracted entities
 * - EntityLinkingService: Intelligent entity linking to avoid duplicates and merge information
 * - LangChainGeminiProvider: LangChain + Google Gemini (primary, consistent with chat service)
 * - LangGraphExtractionProvider: Multi-step LangGraph pipeline for improved relationship extraction
 * - LLMProviderFactory: Multi-provider abstraction with EXTRACTION_PIPELINE_MODE feature flag
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      GraphObject,
      ObjectExtractionJob,
      GraphEmbeddingJob,
      ObjectExtractionLog,
    ]),
    DatabaseModule,
    AppConfigModule,
    UtilsModule,
    GraphModule,
    DocumentsModule,
    TemplatePackModule,
    EmbeddingsModule,
    NotificationsModule,
    AuthModule,
    MonitoringModule,
    LangfuseModule,
    LlmModule,
    VerificationModule,
    ObjectRefinementModule,
  ],
  providers: [
    // LLM providers must be initialized before services that depend on them
    // Order matters: NestJS calls onModuleInit in provider registration order
    LangChainGeminiProvider,
    LangGraphExtractionProvider,
    LLMProviderFactory,
    // Services that depend on LLM providers
    ExtractionJobService,
    ExtractionWorkerService,
    ExtractionLoggerService,
    ExtractionExperimentService,
    ExtractionContextService,
    RateLimiterService,
    ConfidenceScorerService,
    EntityLinkingService,
    LlmCallDumpService,
    ExtractionPromptProvider,
  ],
  controllers: [ExtractionJobController],
  exports: [
    ExtractionJobService,
    ExtractionWorkerService,
    ExtractionLoggerService,
    LangChainGeminiProvider,
    LangGraphExtractionProvider,
    LlmCallDumpService,
  ],
})
export class ExtractionJobModule {}
