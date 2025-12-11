/**
 * Google AI Studio Service
 *
 * A reusable service that wraps the native @google/genai SDK for Google AI Studio.
 * This provides an alternative to Vertex AI using simple API key authentication,
 * which may help avoid Dynamic Shared Quota (DSQ) contention issues.
 *
 * Key differences from NativeGeminiService (Vertex AI):
 * - Uses API key authentication instead of GCP service account
 * - No project/location configuration needed
 * - May have different rate limits and quotas
 *
 * Key features:
 * - Structured output via responseSchema (JSON mode)
 * - Function calling via tools/functionDeclarations
 * - Langfuse tracing integration
 * - Timeout handling
 * - Type-safe schema conversion (Zod to Google Schema)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  GoogleGenAI,
  Type,
  FunctionCallingConfigMode,
  type Schema as GoogleSchema,
  type FunctionDeclaration,
} from '@google/genai';
import { z } from 'zod';
import { AppConfigService } from '../../common/config/config.service';
import { LangfuseService } from '../langfuse/langfuse.service';
import {
  FinishReason,
  type StructuredOutputConfig,
  type FunctionCallingConfig,
  type TracingContext,
  type LLMResult,
} from './native-gemini.service';

@Injectable()
export class GoogleAIStudioService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAIStudioService.name);
  private ai: GoogleGenAI | null = null;
  private defaultModel: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly langfuseService: LangfuseService
  ) {}

  onModuleInit() {
    const apiKey = this.config.googleApiKey;
    this.defaultModel = this.config.googleAiModel;

    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_API_KEY not configured - GoogleAIStudioService will not be available'
      );
      return;
    }

    try {
      this.ai = new GoogleGenAI({ apiKey });
      this.logger.log(
        `GoogleAIStudioService initialized (model: ${this.defaultModel})`
      );
    } catch (error) {
      this.logger.error('Failed to initialize GoogleGenAI with API key', error);
      this.ai = null;
    }
  }

  /**
   * Check if the service is available
   */
  isAvailable(): boolean {
    return this.ai !== null;
  }

  /**
   * Get the provider name for logging/tracing
   */
  getProviderName(): string {
    return 'google-ai-studio';
  }

  /**
   * Generate structured output using responseSchema
   *
   * This is the most reliable method for getting structured JSON from Gemini.
   * The schema is enforced at the API level, not via function calling.
   *
   * @param prompt - The prompt to send to the model
   * @param schema - Google Schema object defining the expected output structure
   * @param config - Optional configuration
   * @param tracing - Optional tracing context for Langfuse
   * @returns Parsed result with the expected type
   */
  async generateStructuredOutput<T>(
    prompt: string,
    schema: GoogleSchema,
    config: StructuredOutputConfig = {},
    tracing?: TracingContext
  ): Promise<LLMResult<T>> {
    const startTime = Date.now();
    const {
      model = this.defaultModel,
      temperature = 0.1,
      maxOutputTokens = 65535,
      timeoutMs = 180000, // 3 minutes - based on xlarge performance testing
    } = config;

    // Timing diagnostics
    const timing = {
      setupMs: 0,
      apiCallMs: 0,
      parseMs: 0,
      totalMs: 0,
    };

    if (!this.ai) {
      return {
        success: false,
        error: 'GoogleAIStudioService not initialized',
        durationMs: Date.now() - startTime,
      };
    }

    // Provider info for diagnostics
    const providerInfo = {
      provider: 'google-ai-studio',
      model,
      method: 'responseSchema',
    };

    // Create Langfuse generation if tracing is enabled
    const generation = tracing?.traceId
      ? this.langfuseService.createObservation(
          tracing.traceId,
          tracing.generationName || 'structured_output',
          { prompt },
          {
            ...tracing.metadata,
            ...providerInfo,
            promptLength: prompt.length,
            timeoutMs,
            temperature,
            maxOutputTokens,
          },
          tracing.parentObservationId
        )
      : null;

    timing.setupMs = Date.now() - startTime;
    const apiCallStart = Date.now();

    try {
      const response = await this.withTimeout(
        this.ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature,
            maxOutputTokens,
          },
        }),
        timeoutMs
      );

      timing.apiCallMs = Date.now() - apiCallStart;
      const parseStart = Date.now();

      const text = response.text?.trim();
      if (!text) {
        throw new Error('Empty response from model');
      }

      // Check for truncation due to token limits
      const finishReason = response.candidates?.[0]?.finishReason;
      const finishReasonStr = String(finishReason || '').toUpperCase();

      if (
        finishReasonStr === 'MAX_TOKENS' ||
        finishReason === FinishReason.MAX_TOKENS
      ) {
        this.logger.warn(
          `Response truncated due to MAX_TOKENS limit (${maxOutputTokens}). ` +
            `Response length: ${text.length} chars, ` +
            `Tokens used: ${
              response.usageMetadata?.candidatesTokenCount || 'unknown'
            }.`
        );
        throw new Error(
          `Response truncated at ${text.length} chars due to MAX_TOKENS limit (${maxOutputTokens}).`
        );
      }

      // Check for safety blocks
      if (
        finishReasonStr === 'SAFETY' ||
        finishReason === FinishReason.SAFETY
      ) {
        throw new Error(
          `Response blocked due to safety filters: ${JSON.stringify(
            response.candidates?.[0]?.safetyRatings || {}
          )}`
        );
      }

      // Check for recitation (copyright) blocks
      if (
        finishReasonStr === 'RECITATION' ||
        finishReason === FinishReason.RECITATION
      ) {
        throw new Error(
          'Response blocked due to recitation/copyright detection'
        );
      }

      const parsed = JSON.parse(text) as T;

      timing.parseMs = Date.now() - parseStart;
      timing.totalMs = Date.now() - startTime;

      // Log timing breakdown for diagnostics
      this.logger.debug(
        `[${
          tracing?.generationName || 'structured_output'
        }] Timing breakdown: ` +
          `setup=${timing.setupMs}ms, api=${timing.apiCallMs}ms, parse=${timing.parseMs}ms, total=${timing.totalMs}ms | ` +
          `Provider: google-ai-studio/${model}`
      );

      // Update Langfuse generation
      if (generation) {
        this.langfuseService.updateObservation(
          generation,
          {
            result: parsed,
            _diagnostics: {
              timing,
              finishReason: finishReasonStr,
              responseLength: text.length,
              provider: providerInfo,
            },
          },
          {
            promptTokens: response.usageMetadata?.promptTokenCount,
            completionTokens: response.usageMetadata?.candidatesTokenCount,
            totalTokens: response.usageMetadata?.totalTokenCount,
          },
          model,
          'success'
        );
      }

      return {
        success: true,
        data: parsed,
        durationMs: timing.totalMs,
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount,
          completionTokens: response.usageMetadata?.candidatesTokenCount,
          totalTokens: response.usageMetadata?.totalTokenCount,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      timing.apiCallMs = Date.now() - apiCallStart;
      timing.totalMs = Date.now() - startTime;

      const isTimeout = errorMessage.includes('Timeout');

      this.logger.error(
        `[${
          tracing?.generationName || 'structured_output'
        }] Failed: ${errorMessage} | ` +
          `Timing: setup=${timing.setupMs}ms, api=${timing.apiCallMs}ms, total=${timing.totalMs}ms | ` +
          `Provider: google-ai-studio/${model}` +
          (isTimeout ? ' [TIMEOUT]' : '')
      );

      if (generation) {
        this.langfuseService.updateObservation(
          generation,
          {
            error: errorMessage,
            _diagnostics: {
              timing,
              isTimeout,
              provider: providerInfo,
            },
          },
          undefined,
          model,
          'error',
          errorMessage
        );
      }

      return {
        success: false,
        error: errorMessage,
        durationMs: timing.totalMs,
      };
    }
  }

  /**
   * Generate output using function calling
   *
   * This method uses tools/functionDeclarations to get structured output.
   * The model is forced to call the specified function.
   *
   * @param prompt - The prompt to send to the model
   * @param functionDeclaration - The function declaration with schema
   * @param config - Configuration including function name
   * @param tracing - Optional tracing context for Langfuse
   * @returns The function call arguments parsed as the expected type
   */
  async generateWithFunctionCall<T>(
    prompt: string,
    functionDeclaration: FunctionDeclaration,
    config: FunctionCallingConfig,
    tracing?: TracingContext
  ): Promise<LLMResult<T>> {
    const startTime = Date.now();
    const {
      model = this.defaultModel,
      temperature = 0.1,
      maxOutputTokens = 65535,
      timeoutMs = 180000, // 3 minutes - based on xlarge performance testing
      functionName,
      forceCall = true,
    } = config;

    // Timing diagnostics
    const timing = {
      setupMs: 0,
      apiCallMs: 0,
      parseMs: 0,
      totalMs: 0,
    };

    if (!this.ai) {
      return {
        success: false,
        error: 'GoogleAIStudioService not initialized',
        durationMs: Date.now() - startTime,
      };
    }

    // Provider info for diagnostics
    const providerInfo = {
      provider: 'google-ai-studio',
      model,
      method: 'function_calling',
      functionName,
    };

    // Create Langfuse generation if tracing is enabled
    const generation = tracing?.traceId
      ? this.langfuseService.createObservation(
          tracing.traceId,
          tracing.generationName || `function_call_${functionName}`,
          { prompt },
          {
            ...tracing.metadata,
            ...providerInfo,
            promptLength: prompt.length,
            timeoutMs,
            temperature,
            maxOutputTokens,
          },
          tracing.parentObservationId
        )
      : null;

    timing.setupMs = Date.now() - startTime;
    const apiCallStart = Date.now();

    try {
      const response = await this.withTimeout(
        this.ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature,
            maxOutputTokens,
            tools: [{ functionDeclarations: [functionDeclaration] }],
            toolConfig: forceCall
              ? {
                  functionCallingConfig: {
                    mode: FunctionCallingConfigMode.ANY,
                    allowedFunctionNames: [functionName],
                  },
                }
              : undefined,
          },
        }),
        timeoutMs
      );

      timing.apiCallMs = Date.now() - apiCallStart;
      const parseStart = Date.now();

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        throw new Error('No function calls in response');
      }

      const targetCall = functionCalls.find((fc) => fc.name === functionName);
      if (!targetCall || !targetCall.args) {
        throw new Error(`Function ${functionName} not called`);
      }

      const data = targetCall.args as T;

      timing.parseMs = Date.now() - parseStart;
      timing.totalMs = Date.now() - startTime;

      // Log timing breakdown for diagnostics
      this.logger.debug(
        `[${
          tracing?.generationName || `function_call_${functionName}`
        }] Timing breakdown: ` +
          `setup=${timing.setupMs}ms, api=${timing.apiCallMs}ms, parse=${timing.parseMs}ms, total=${timing.totalMs}ms | ` +
          `Provider: google-ai-studio/${model}`
      );

      // Update Langfuse generation
      if (generation) {
        this.langfuseService.updateObservation(
          generation,
          {
            result: data,
            _diagnostics: {
              timing,
              provider: providerInfo,
            },
          },
          {
            promptTokens: response.usageMetadata?.promptTokenCount,
            completionTokens: response.usageMetadata?.candidatesTokenCount,
            totalTokens: response.usageMetadata?.totalTokenCount,
          },
          model,
          'success'
        );
      }

      return {
        success: true,
        data,
        durationMs: timing.totalMs,
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount,
          completionTokens: response.usageMetadata?.candidatesTokenCount,
          totalTokens: response.usageMetadata?.totalTokenCount,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      timing.apiCallMs = Date.now() - apiCallStart;
      timing.totalMs = Date.now() - startTime;

      const isTimeout = errorMessage.includes('Timeout');

      this.logger.error(
        `[${
          tracing?.generationName || `function_call_${functionName}`
        }] Failed: ${errorMessage} | ` +
          `Timing: setup=${timing.setupMs}ms, api=${timing.apiCallMs}ms, total=${timing.totalMs}ms | ` +
          `Provider: google-ai-studio/${model}` +
          (isTimeout ? ' [TIMEOUT]' : '')
      );

      if (generation) {
        this.langfuseService.updateObservation(
          generation,
          {
            error: errorMessage,
            _diagnostics: {
              timing,
              isTimeout,
              provider: providerInfo,
            },
          },
          undefined,
          model,
          'error',
          errorMessage
        );
      }

      return {
        success: false,
        error: errorMessage,
        durationMs: timing.totalMs,
      };
    }
  }

  /**
   * Convert a Zod schema to a Google Schema for use with responseSchema
   */
  zodToGoogleSchema(zodSchema: z.ZodType): GoogleSchema {
    return this.convertZodType(zodSchema);
  }

  /**
   * Create a function declaration from a name, description, and Zod schema
   */
  createFunctionDeclaration(
    name: string,
    description: string,
    parametersSchema: z.ZodType
  ): FunctionDeclaration {
    return {
      name,
      description,
      parameters: this.zodToGoogleSchema(parametersSchema),
    };
  }

  // ==========================================================================
  // Private helper methods
  // ==========================================================================

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  private convertZodType(zodType: z.ZodType): GoogleSchema {
    // Handle ZodOptional - unwrap and mark as not required
    if (zodType instanceof z.ZodOptional) {
      const innerSchema = this.convertZodType(zodType._def.innerType);
      return { ...innerSchema, nullable: true };
    }

    // Handle ZodNullable
    if (zodType instanceof z.ZodNullable) {
      const innerSchema = this.convertZodType(zodType._def.innerType);
      return { ...innerSchema, nullable: true };
    }

    // Handle ZodString
    if (zodType instanceof z.ZodString) {
      return {
        type: Type.STRING,
        description: zodType.description,
      };
    }

    // Handle ZodNumber
    if (zodType instanceof z.ZodNumber) {
      return {
        type: Type.NUMBER,
        description: zodType.description,
      };
    }

    // Handle ZodBoolean
    if (zodType instanceof z.ZodBoolean) {
      return {
        type: Type.BOOLEAN,
        description: zodType.description,
      };
    }

    // Handle ZodArray
    if (zodType instanceof z.ZodArray) {
      return {
        type: Type.ARRAY,
        items: this.convertZodType(zodType._def.type),
        description: zodType.description,
      };
    }

    // Handle ZodObject
    if (zodType instanceof z.ZodObject) {
      const shape = zodType._def.shape();
      const properties: Record<string, GoogleSchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.convertZodType(value as z.ZodType);

        // Check if the field is required (not optional)
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: Type.OBJECT,
        properties,
        required: required.length > 0 ? required : undefined,
        description: zodType.description,
      };
    }

    // Handle ZodEnum
    if (zodType instanceof z.ZodEnum) {
      return {
        type: Type.STRING,
        enum: zodType._def.values,
        description: zodType.description,
      };
    }

    // Handle ZodRecord
    if (zodType instanceof z.ZodRecord) {
      return {
        type: Type.OBJECT,
        description: zodType.description,
      };
    }

    // Handle ZodAny
    if (zodType instanceof z.ZodAny) {
      return {
        type: Type.STRING,
        description: zodType.description,
      };
    }

    // Default fallback
    this.logger.warn(
      `Unknown Zod type: ${zodType.constructor.name}, defaulting to STRING`
    );
    return { type: Type.STRING };
  }
}
