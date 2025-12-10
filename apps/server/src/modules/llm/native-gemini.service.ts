/**
 * Native Gemini Service
 *
 * A reusable service that wraps the native @google/genai SDK for Vertex AI.
 * This provides reliable structured output and function calling, replacing
 * the problematic LangChain withStructuredOutput implementation.
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

/**
 * Gemini finish reasons
 */
export enum FinishReason {
  STOP = 'STOP',
  MAX_TOKENS = 'MAX_TOKENS',
  SAFETY = 'SAFETY',
  RECITATION = 'RECITATION',
  OTHER = 'OTHER',
}

/**
 * Configuration for a structured output request
 */
export interface StructuredOutputConfig {
  /** Model name (defaults to config value) */
  model?: string;
  /** Temperature (defaults to 0.1) */
  temperature?: number;
  /** Max output tokens (defaults to 16000 - increased from 8000 to avoid truncation) */
  maxOutputTokens?: number;
  /** Timeout in milliseconds (defaults to 120000) */
  timeoutMs?: number;
}

/**
 * Configuration for a function calling request
 */
export interface FunctionCallingConfig extends StructuredOutputConfig {
  /** Function name to call */
  functionName: string;
  /** Force the model to call this function */
  forceCall?: boolean;
}

/**
 * Tracing context for Langfuse integration
 */
export interface TracingContext {
  /** Trace ID for the overall operation */
  traceId?: string;
  /** Parent observation ID for nesting */
  parentObservationId?: string;
  /** Name for the generation (e.g., 'extract_entities') */
  generationName?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Result from a structured output or function call
 */
export interface LLMResult<T> {
  /** Whether the request succeeded */
  success: boolean;
  /** The parsed result (if successful) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Token usage (if available) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

@Injectable()
export class NativeGeminiService implements OnModuleInit {
  private readonly logger = new Logger(NativeGeminiService.name);
  private ai: GoogleGenAI | null = null;
  private defaultModel: string;
  private projectId: string;
  private location: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly langfuseService: LangfuseService
  ) {}

  onModuleInit() {
    this.projectId = this.config.vertexAiProjectId || '';
    this.location = this.config.vertexAiLocation || 'us-central1';
    this.defaultModel = this.config.vertexAiModel || 'gemini-2.5-flash-lite';

    if (!this.projectId) {
      this.logger.warn(
        'GCP_PROJECT_ID not configured - NativeGeminiService will not be available'
      );
      return;
    }

    try {
      this.ai = new GoogleGenAI({
        vertexai: true,
        project: this.projectId,
        location: this.location,
      });
      this.logger.log(
        `NativeGeminiService initialized (project: ${this.projectId}, location: ${this.location}, model: ${this.defaultModel})`
      );
    } catch (error) {
      this.logger.error('Failed to initialize GoogleGenAI', error);
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
      maxOutputTokens = 65535, // Maximum for gemini-2.5-flash-preview
      timeoutMs = 120000,
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
        error: 'NativeGeminiService not initialized',
        durationMs: Date.now() - startTime,
      };
    }

    // Provider info for diagnostics
    const providerInfo = {
      provider: 'vertex-ai',
      projectId: this.projectId,
      location: this.location,
      model,
      method: 'responseSchema',
    };

    // Create Langfuse generation if tracing is enabled
    // Store full prompt - Langfuse has no inherent limit and full prompts are essential for debugging
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
      // finishReason can be a string or enum value depending on SDK version
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
            }. ` +
            `Consider increasing maxOutputTokens.`
        );
        // The JSON will likely be malformed - throw a specific error
        throw new Error(
          `Response truncated at ${text.length} chars due to MAX_TOKENS limit (${maxOutputTokens}). ` +
            `Increase maxOutputTokens or reduce input complexity.`
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

      // Log finish reason for debugging if not STOP
      if (finishReasonStr && finishReasonStr !== 'STOP') {
        this.logger.debug(
          `Finish reason: ${finishReasonStr}, response length: ${text.length} chars`
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
          `Provider: ${this.projectId}/${this.location}/${model}`
      );

      // Update Langfuse generation with timing info in output
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

      // Calculate timing for error path
      timing.apiCallMs = Date.now() - apiCallStart;
      timing.totalMs = Date.now() - startTime;

      const isTimeout = errorMessage.includes('Timeout');

      // Check if this is a JSON parsing error that might indicate truncation
      const isJsonError =
        errorMessage.includes('JSON') ||
        errorMessage.includes('Unexpected end') ||
        errorMessage.includes('Unterminated string');

      // Log with timing info for debugging
      this.logger.error(
        `[${
          tracing?.generationName || 'structured_output'
        }] Failed: ${errorMessage} | ` +
          `Timing: setup=${timing.setupMs}ms, api=${timing.apiCallMs}ms, total=${timing.totalMs}ms | ` +
          `Provider: ${this.projectId}/${this.location}/${model}` +
          (isTimeout ? ' [TIMEOUT]' : '')
      );

      if (isJsonError) {
        this.logger.error(
          `This often indicates response truncation due to token limits. ` +
            `Consider increasing maxOutputTokens (current: ${
              config.maxOutputTokens || 16000
            })`
        );
      }

      // Update Langfuse generation with error and timing
      if (generation) {
        this.langfuseService.updateObservation(
          generation,
          {
            error: errorMessage,
            _diagnostics: {
              timing,
              isTimeout,
              isJsonError,
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
      maxOutputTokens = 65535, // Maximum for gemini-2.5-flash-preview
      timeoutMs = 120000,
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
        error: 'NativeGeminiService not initialized',
        durationMs: Date.now() - startTime,
      };
    }

    // Provider info for diagnostics
    const providerInfo = {
      provider: 'vertex-ai',
      projectId: this.projectId,
      location: this.location,
      model,
      method: 'function_calling',
      functionName,
    };

    // Create Langfuse generation if tracing is enabled
    // Store full prompt - Langfuse has no inherent limit and full prompts are essential for debugging
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
          `Provider: ${this.projectId}/${this.location}/${model}`
      );

      // Update Langfuse generation with timing info
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

      // Calculate timing for error path
      timing.apiCallMs = Date.now() - apiCallStart;
      timing.totalMs = Date.now() - startTime;

      const isTimeout = errorMessage.includes('Timeout');

      // Log with timing info for debugging
      this.logger.error(
        `[${
          tracing?.generationName || `function_call_${functionName}`
        }] Failed: ${errorMessage} | ` +
          `Timing: setup=${timing.setupMs}ms, api=${timing.apiCallMs}ms, total=${timing.totalMs}ms | ` +
          `Provider: ${this.projectId}/${this.location}/${model}` +
          (isTimeout ? ' [TIMEOUT]' : '')
      );

      // Update Langfuse generation with error and timing
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
   *
   * This handles common Zod types and converts them to the Google Schema format.
   * Note: This is a simplified converter - complex Zod features may not be supported.
   *
   * @param zodSchema - The Zod schema to convert
   * @returns Google Schema object
   */
  zodToGoogleSchema(zodSchema: z.ZodType): GoogleSchema {
    return this.convertZodType(zodSchema);
  }

  /**
   * Create a function declaration from a name, description, and Zod schema
   *
   * @param name - Function name
   * @param description - Function description
   * @param parametersSchema - Zod schema for the function parameters
   * @returns FunctionDeclaration for use with generateWithFunctionCall
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

  /**
   * Wrap a promise with a timeout
   */
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

  /**
   * Convert a Zod type to a Google Schema type
   */
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

    // Handle ZodRecord (as object with no defined properties)
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
