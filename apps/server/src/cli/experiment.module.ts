/**
 * ExperimentModule - Minimal module for running extraction experiments via CLI
 *
 * This module loads only the components needed for extraction experiments,
 * bypassing authentication and other heavy dependencies that aren't needed
 * for CLI-based experiment runs.
 *
 * Dependencies loaded:
 * - AppConfigModule: Environment configuration (global, exports AppConfigService)
 * - LangfuseModule: Observability and experiment tracking (global, exports LangfuseService)
 * - LangGraphExtractionProvider: The extraction pipeline
 * - ExtractionPromptProvider: Prompt management
 * - ExtractionExperimentService: Experiment orchestration
 */

import { Module } from '@nestjs/common';
import { AppConfigModule } from '../common/config/config.module';
import { LangfuseModule } from '../modules/langfuse/langfuse.module';
import { LangGraphExtractionProvider } from '../modules/extraction-jobs/llm/langgraph-extraction.provider';
import { ExtractionPromptProvider } from '../modules/extraction-jobs/llm/langgraph/prompts/prompt-provider.service';
import { ExtractionExperimentService } from '../modules/extraction-jobs/evaluation/extraction-experiment.service';

@Module({
  imports: [
    // Global modules - these export their services
    AppConfigModule,
    LangfuseModule,
  ],
  providers: [
    // Extraction-specific providers (not registered in global modules)
    ExtractionPromptProvider,
    LangGraphExtractionProvider,
    ExtractionExperimentService,
  ],
  exports: [ExtractionExperimentService],
})
export class ExperimentModule {}
