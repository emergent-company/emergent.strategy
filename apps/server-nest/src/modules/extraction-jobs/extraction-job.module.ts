import { Module } from '@nestjs/common';
import { ExtractionJobService } from './extraction-job.service';
import { ExtractionJobController } from './extraction-job.controller';
import { ExtractionWorkerService } from './extraction-worker.service';
import { RateLimiterService } from './rate-limiter.service';
import { ConfidenceScorerService } from './confidence-scorer.service';
import { EntityLinkingService } from './entity-linking.service';
import { VertexAIProvider } from './llm/vertex-ai.provider';
import { LLMProviderFactory } from './llm/llm-provider.factory';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { GraphModule } from '../graph/graph.module';
import { DocumentsModule } from '../documents/documents.module';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

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
 * - VertexAIProvider: Google Vertex AI Gemini integration
 * - LLMProviderFactory: Multi-provider abstraction for future extensibility
 */
@Module({
    imports: [
        DatabaseModule,
        AppConfigModule,
        GraphModule,
        DocumentsModule,
        TemplatePackModule,
        EmbeddingsModule,
    ],
    providers: [
        ExtractionJobService,
        ExtractionWorkerService,
        RateLimiterService,
        ConfidenceScorerService,
        EntityLinkingService,
        VertexAIProvider,
        LLMProviderFactory,
    ],
    controllers: [ExtractionJobController],
    exports: [ExtractionJobService, ExtractionWorkerService],
})
export class ExtractionJobModule { }
