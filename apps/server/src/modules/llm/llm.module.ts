/**
 * LLM Module
 *
 * Provides native LLM services for structured output and function calling.
 * This module wraps the @google/genai SDK to provide reliable structured
 * output that doesn't timeout like LangChain's withStructuredOutput.
 *
 * Two providers are available:
 * - NativeGeminiService: Uses Vertex AI with GCP service account auth
 * - GoogleAIStudioService: Uses Google AI Studio with API key auth
 */

import { Module } from '@nestjs/common';
import { NativeGeminiService } from './native-gemini.service';
import { GoogleAIStudioService } from './google-ai-studio.service';
import { AppConfigModule } from '../../common/config/config.module';
import { LangfuseModule } from '../langfuse/langfuse.module';

@Module({
  imports: [AppConfigModule, LangfuseModule],
  providers: [NativeGeminiService, GoogleAIStudioService],
  exports: [NativeGeminiService, GoogleAIStudioService],
})
export class LlmModule {}
