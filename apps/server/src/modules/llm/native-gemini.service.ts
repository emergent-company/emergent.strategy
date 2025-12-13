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
  /** Raw response text (for debugging) */
  rawResponse?: string;
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

      // Debug: Log raw response structure
      this.logger.debug(
        `[${
          tracing?.generationName || `function_call_${functionName}`
        }] Raw response: ` +
          `functionCalls=${response.functionCalls?.length || 0}, ` +
          `text=${response.text ? `${response.text.length} chars` : 'none'}, ` +
          `finishReason=${response.candidates?.[0]?.finishReason || 'unknown'}`
      );

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        // Log more details when no function calls
        this.logger.error(
          `[${
            tracing?.generationName || `function_call_${functionName}`
          }] No function calls! ` +
            `Response text: ${response.text?.substring(0, 500) || 'empty'}, ` +
            `Candidates: ${JSON.stringify(
              response.candidates?.[0]?.content || {}
            )}`
        );
        throw new Error('No function calls in response');
      }

      const targetCall = functionCalls.find((fc) => fc.name === functionName);
      if (!targetCall || !targetCall.args) {
        throw new Error(`Function ${functionName} not called`);
      }

      // Debug: Log the actual args received
      const argsPreview = JSON.stringify(targetCall.args).substring(0, 500);
      this.logger.debug(
        `[${
          tracing?.generationName || `function_call_${functionName}`
        }] Function args preview: ${argsPreview}...`
      );

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
   * Generate JSON output without schema enforcement (freeform JSON)
   *
   * This method uses responseMimeType: 'application/json' WITHOUT a responseSchema,
   * allowing the model to follow prompt instructions rather than being constrained
   * by schema enforcement. This produces better property population for entity
   * extraction because the model isn't minimizing output to fit schema constraints.
   *
   * IMPORTANT: Since there's no schema validation, the response may have:
   * - Different structure than expected
   * - Missing required fields
   * - JSON syntax errors (handled with retry)
   *
   * @param prompt - The prompt to send to the model
   * @param config - Optional configuration
   * @param tracing - Optional tracing context for Langfuse
   * @returns Parsed result (caller must handle type validation)
   */
  async generateJsonFreeform<T>(
    prompt: string,
    config: StructuredOutputConfig = {},
    tracing?: TracingContext
  ): Promise<LLMResult<T>> {
    const startTime = Date.now();
    const {
      model = this.defaultModel,
      temperature = 0.1,
      maxOutputTokens = 65535,
      timeoutMs = 180000,
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
      method: 'json_freeform',
    };

    // Create Langfuse generation if tracing is enabled
    const generation = tracing?.traceId
      ? this.langfuseService.createObservation(
          tracing.traceId,
          tracing.generationName || 'json_freeform',
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
            // NO responseSchema - let the model follow prompt instructions
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

      // Check for truncation
      const finishReason = response.candidates?.[0]?.finishReason;
      const finishReasonStr = String(finishReason || '').toUpperCase();

      if (
        finishReasonStr === 'MAX_TOKENS' ||
        finishReason === FinishReason.MAX_TOKENS
      ) {
        this.logger.warn(
          `[json_freeform] Response truncated due to MAX_TOKENS limit (${maxOutputTokens}).`
        );
        throw new Error(
          `Response truncated at ${text.length} chars due to MAX_TOKENS limit.`
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

      // Parse JSON with error handling
      let parsed: T;
      try {
        parsed = JSON.parse(text) as T;
      } catch (parseError) {
        // Try to clean up common JSON issues
        const cleanedText = this.cleanJsonResponse(text);
        try {
          parsed = JSON.parse(cleanedText) as T;
          this.logger.debug(
            '[json_freeform] Recovered from JSON parsing error after cleanup'
          );
        } catch {
          // If cleanup didn't help, throw original error with context
          throw new Error(
            `JSON parsing failed: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }. ` + `Response preview: ${text.substring(0, 200)}...`
          );
        }
      }

      timing.parseMs = Date.now() - parseStart;
      timing.totalMs = Date.now() - startTime;

      this.logger.debug(
        `[${tracing?.generationName || 'json_freeform'}] Timing: ` +
          `setup=${timing.setupMs}ms, api=${timing.apiCallMs}ms, parse=${timing.parseMs}ms, total=${timing.totalMs}ms`
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
        rawResponse: text,
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
      const isJsonError =
        errorMessage.includes('JSON') ||
        errorMessage.includes('Unexpected') ||
        errorMessage.includes('Unterminated');

      this.logger.error(
        `[${
          tracing?.generationName || 'json_freeform'
        }] Failed: ${errorMessage} | ` +
          `Timing: total=${timing.totalMs}ms` +
          (isTimeout ? ' [TIMEOUT]' : '') +
          (isJsonError ? ' [JSON_ERROR]' : '')
      );

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
   * Clean up common JSON response issues
   * Handles: markdown code blocks, trailing commas, etc.
   */
  private cleanJsonResponse(text: string): string {
    let cleaned = text.trim();

    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Remove trailing commas before ] or }
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    return cleaned;
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
    // Use parametersJsonSchema instead of parameters to support additionalProperties
    // The Google SDK's Schema interface doesn't have additionalProperties,
    // but parametersJsonSchema accepts raw JSON Schema which does support it
    const jsonSchema = this.zodToJsonSchema(parametersSchema);

    // Log the generated function declaration schema (using log level to ensure visibility)
    this.logger.log(
      `[createFunctionDeclaration] Function "${name}" JSON schema: ${JSON.stringify(
        jsonSchema,
        null,
        2
      )}`
    );

    return {
      name,
      description,
      parametersJsonSchema: jsonSchema,
    };
  }

  /**
   * Convert Zod schema to standard JSON Schema (supports additionalProperties)
   */
  zodToJsonSchema(zodType: z.ZodType): Record<string, unknown> {
    return this.convertZodToJsonSchema(zodType);
  }

  /**
   * Recursively convert Zod type to JSON Schema format
   */
  private convertZodToJsonSchema(zodType: z.ZodType): Record<string, unknown> {
    // Handle ZodOptional - unwrap and mark as nullable
    if (zodType instanceof z.ZodOptional) {
      const innerSchema = this.convertZodToJsonSchema(zodType._def.innerType);
      return { ...innerSchema, nullable: true };
    }

    // Handle ZodNullable
    if (zodType instanceof z.ZodNullable) {
      const innerSchema = this.convertZodToJsonSchema(zodType._def.innerType);
      return { ...innerSchema, nullable: true };
    }

    // Handle ZodString
    if (zodType instanceof z.ZodString) {
      return {
        type: 'string',
        description: zodType.description,
      };
    }

    // Handle ZodNumber
    if (zodType instanceof z.ZodNumber) {
      return {
        type: 'number',
        description: zodType.description,
      };
    }

    // Handle ZodBoolean
    if (zodType instanceof z.ZodBoolean) {
      return {
        type: 'boolean',
        description: zodType.description,
      };
    }

    // Handle ZodArray
    if (zodType instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.convertZodToJsonSchema(zodType._def.type),
        description: zodType.description,
      };
    }

    // Handle ZodObject
    if (zodType instanceof z.ZodObject) {
      const shape = zodType._def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.convertZodToJsonSchema(value as z.ZodType);

        // Check if the field is required (not optional)
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        description: zodType.description,
      };
    }

    // Handle ZodEnum
    if (zodType instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: zodType._def.values,
        description: zodType.description,
      };
    }

    // Handle ZodRecord - THIS IS THE KEY FIX
    // Use additionalProperties which is supported in standard JSON Schema
    if (zodType instanceof z.ZodRecord) {
      const valueType = zodType._def.valueType;
      // For z.any(), allow any type of value
      const valueSchema =
        valueType instanceof z.ZodAny
          ? {} // Empty schema means "any type allowed"
          : this.convertZodToJsonSchema(valueType);

      return {
        type: 'object',
        additionalProperties: valueSchema,
        description: zodType.description,
      };
    }

    // Handle ZodAny - in JSON Schema, empty object means "any"
    if (zodType instanceof z.ZodAny) {
      return {
        description: zodType.description,
      };
    }

    // Default fallback
    this.logger.warn(
      `[zodToJsonSchema] Unknown Zod type: ${zodType.constructor.name}, defaulting to string`
    );
    return { type: 'string' };
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

    // Handle ZodRecord (as object with dynamic properties using additionalProperties)
    if (zodType instanceof z.ZodRecord) {
      // Get the value type of the record and convert it
      const valueType = zodType._def.valueType;
      const valueSchema = this.convertZodType(valueType);

      // Google's schema uses additionalProperties for dynamic key-value maps
      // This tells Gemini that the object can have arbitrary keys with values of the specified type
      return {
        type: Type.OBJECT,
        additionalProperties: valueSchema,
        description: zodType.description,
      } as GoogleSchema;
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
