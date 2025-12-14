import { Injectable, Logger } from '@nestjs/common';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { AppConfigService } from '../../../common/config/config.service';
import { LangfuseService } from '../../langfuse/langfuse.service';
import { LlmCallDumpService } from './llm-call-dump.service';
import { LlmResponseCaptureHandler } from './llm-response-capture-handler';
import {
  ILLMProvider,
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionOptions,
  ExistingEntityContext,
} from './llm-provider.interface';
import {
  extractionToolDefs,
  ExtractedEntityToolCall,
  ExtractedRelationshipToolCall,
} from './extraction-tools';

/**
 * Default timeout for LLM API calls (5 minutes)
 * This prevents hanging indefinitely on slow or stuck API calls.
 * Can be overridden via LLM_CALL_TIMEOUT_MS environment variable.
 */
const DEFAULT_LLM_CALL_TIMEOUT_MS = 300_000;

/**
 * Check if LLM debug mode is enabled via environment variable
 */
function isDebugEnabled(): boolean {
  return process.env.LLM_DEBUG === 'true' || process.env.LLM_DEBUG === '1';
}

/**
 * Helper to wrap a promise with a timeout and normalize errors.
 * Handles cases where LangChain/Vertex AI returns undefined or malformed errors.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${operationName} timed out after ${timeoutMs}ms. The LLM API may be unresponsive.`
        )
      );
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        // Normalize undefined or malformed errors from LangChain/Vertex AI
        // LangChain sometimes throws errors where error.message is undefined
        if (error === undefined || error === null) {
          reject(
            new Error(
              `${operationName} failed with an undefined error. This may indicate an API authentication or configuration issue.`
            )
          );
        } else if (error instanceof Error) {
          reject(error);
        } else if (typeof error === 'string') {
          reject(new Error(error));
        } else {
          // Convert unknown error to a proper Error object
          const errorMessage =
            error?.message ||
            error?.error?.message ||
            (typeof error === 'object' ? JSON.stringify(error) : String(error));
          reject(new Error(`${operationName} failed: ${errorMessage}`));
        }
      });
  });
}

/**
 * LangChain Gemini LLM Provider for entity extraction.
 * Uses ChatVertexAI with .withStructuredOutput() for type-safe extraction.
 * Supports dynamic type schemas.
 */
@Injectable()
export class LangChainGeminiProvider implements ILLMProvider {
  private readonly logger = new Logger(LangChainGeminiProvider.name);
  /** Model configured for JSON response mode (legacy) */
  private model: ChatVertexAI | null = null;
  /** Model configured for tool calling */
  private toolModel: ChatVertexAI | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly langfuseService: LangfuseService,
    private readonly llmCallDumpService: LlmCallDumpService
  ) {
    this.initialize();
  }

  /**
   * Get the LLM call timeout from config or use the default.
   */
  private get llmCallTimeoutMs(): number {
    return this.config.llmCallTimeoutMs || DEFAULT_LLM_CALL_TIMEOUT_MS;
  }

  private initialize() {
    const projectId = this.config.vertexAiProjectId;
    const location = this.config.vertexAiLocation;
    const modelName = this.config.vertexAiModel;

    if (!projectId) {
      this.logger.warn(
        'LangChain Vertex AI not configured: GCP_PROJECT_ID missing'
      );
      return;
    }

    if (!location) {
      this.logger.warn(
        'LangChain Vertex AI not configured: VERTEX_AI_LOCATION missing'
      );
      return;
    }

    if (!modelName) {
      this.logger.warn(
        'LangChain Vertex AI not configured: VERTEX_AI_MODEL missing'
      );
      return;
    }

    this.logger.log(
      `Initializing Vertex AI: project=${projectId}, location=${location}, model=${modelName}`
    );

    try {
      // Note: We use responseMimeType for JSON output instead of withStructuredOutput()
      // because withStructuredOutput() causes timeouts with Vertex AI Gemini models.
      // NOTE: We explicitly set apiKey to undefined to prevent LangChain from
      // using GOOGLE_API_KEY env var. Vertex AI requires OAuth (ADC), not API keys.
      this.model = new ChatVertexAI({
        model: modelName,
        apiKey: '', // Empty string bypasses GOOGLE_API_KEY env var, forces ADC auth
        authOptions: {
          projectId: projectId,
        },
        location: location,
        temperature: 0.1, // Low temperature for consistent extraction results
        maxOutputTokens: 65535, // gemini-2.5-flash-lite max output tokens
        responseMimeType: 'application/json', // Forces clean JSON output
      } as any); // Cast to any because responseMimeType may not be in types

      // Create a second model instance for tool calling (no responseMimeType)
      this.toolModel = new ChatVertexAI({
        model: modelName,
        apiKey: '', // Empty string bypasses GOOGLE_API_KEY env var, forces ADC auth
        authOptions: {
          projectId: projectId,
        },
        location: location,
        temperature: 0.1, // Low temperature for consistent tool calls
        maxOutputTokens: 65535,
      });

      this.logger.log(`LangChain Vertex AI initialized: model=${modelName}`);
      if (isDebugEnabled()) {
        this.logger.log(
          '[LLM_DEBUG] Debug mode ENABLED - full prompts and responses will be logged'
        );
      } else {
        this.logger.debug(
          'Set LLM_DEBUG=true to enable detailed prompt/response logging'
        );
      }
    } catch (error) {
      this.logger.error('Failed to initialize LangChain Vertex AI', error);
      this.model = null;
    }
  }

  getName(): string {
    return 'LangChain-Gemini';
  }

  isConfigured(): boolean {
    return this.model !== null;
  }

  async extractEntities(
    documentContent: string,
    extractionPrompt: string,
    options: ExtractionOptions
  ): Promise<ExtractionResult> {
    if (!this.isConfigured()) {
      throw new Error('LangChain Gemini provider not configured');
    }

    const {
      objectSchemas,
      relationshipSchemas,
      allowedTypes,
      existingEntities,
      context,
    } = options;

    // Use tool-based extraction if relationship schemas are provided
    // This enables unified extraction of entities AND relationships
    const useToolExtraction =
      relationshipSchemas && Object.keys(relationshipSchemas).length > 0;

    if (useToolExtraction) {
      this.logger.log(
        'Using tool-based extraction (relationship schemas provided)'
      );
      return this.extractWithToolBindingFull(
        documentContent,
        extractionPrompt,
        options
      );
    }

    // Legacy JSON-based extraction (entity-only)
    const startTime = Date.now();
    const allEntities: ExtractedEntity[] = [];
    const allRelationships: ExtractedRelationship[] = [];
    const discoveredTypes = new Set<string>();
    const debugCalls: any[] = []; // Collect debug info for each LLM call

    // Split document into chunks if it's large
    const chunks = await this.splitDocumentIntoChunks(documentContent);

    if (chunks.length > 1) {
      this.logger.log(
        `Document split into ${chunks.length} chunks for processing`
      );
    }

    // Process each type separately with its specific schema
    const typesToExtract = allowedTypes || Object.keys(objectSchemas);

    this.logger.debug(
      `Extracting ${typesToExtract.length} types: ${typesToExtract.join(', ')}`
    );

    // Process each chunk for each type
    for (const typeName of typesToExtract) {
      const typeStartTime = Date.now();
      const typeEntities: ExtractedEntity[] = [];

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const callStart = Date.now();

        try {
          // Pass previously extracted entities for this type to provide context
          // This helps the LLM avoid duplicates and use consistent naming
          const previouslyExtracted =
            typeEntities.length > 0 ? typeEntities : undefined;

          if (previouslyExtracted && previouslyExtracted.length > 0) {
            this.logger.debug(
              `[${typeName}] Chunk ${chunkIndex + 1}/${
                chunks.length
              }: providing ${
                previouslyExtracted.length
              } previously extracted entities as context`
            );
          }

          const { entities, prompt, rawResponse } =
            await this.extractEntitiesForType(
              typeName,
              chunk,
              extractionPrompt,
              objectSchemas[typeName],
              previouslyExtracted,
              chunkIndex,
              chunks.length,
              context?.traceId,
              context?.parentObservationId
            );

          // Store debug information for this call
          debugCalls.push({
            type: typeName,
            chunk_index: chunkIndex,
            chunk_count: chunks.length,
            previously_extracted_count: previouslyExtracted?.length ?? 0,
            input: {
              document:
                chunk.substring(0, 500) + (chunk.length > 500 ? '...' : ''), // Truncate for storage
              prompt: prompt,
              allowed_types: [typeName],
              cross_chunk_context: previouslyExtracted
                ? previouslyExtracted.map((e) => e.name)
                : [],
            },
            output: rawResponse,
            entities_found: entities.length,
            duration_ms: Date.now() - callStart,
            timestamp: new Date().toISOString(),
            model: this.config.vertexAiModel,
            status: 'success',
          });
          if (entities.length > 0) {
            typeEntities.push(...entities);
          }
        } catch (error) {
          this.logger.error(
            `Failed to extract ${typeName} from chunk ${chunkIndex + 1}/${
              chunks.length
            }:`,
            error
          );

          // Store error debug information
          debugCalls.push({
            type: typeName,
            chunk_index: chunkIndex,
            chunk_count: chunks.length,
            input: {
              document:
                chunk.substring(0, 500) + (chunk.length > 500 ? '...' : ''),
              prompt: extractionPrompt,
              allowed_types: [typeName],
            },
            error: error instanceof Error ? error.message : String(error),
            duration_ms: Date.now() - callStart,
            timestamp: new Date().toISOString(),
            model: this.config.vertexAiModel,
            status: 'error',
          }); // Continue with other chunks even if one fails
        }
      }

      // Deduplicate entities by name within the type
      const deduplicatedEntities = this.deduplicateEntities(typeEntities);

      if (deduplicatedEntities.length > 0) {
        allEntities.push(...deduplicatedEntities);
        discoveredTypes.add(typeName);
        this.logger.debug(
          `Extracted ${deduplicatedEntities.length} unique ${typeName} entities ` +
            `(${typeEntities.length} total before deduplication) in ${
              Date.now() - typeStartTime
            }ms`
        );
      }
    }

    const duration = Date.now() - startTime;

    this.logger.log(
      `Extracted ${allEntities.length} entities and ${allRelationships.length} relationships across ${discoveredTypes.size} types in ${duration}ms`
    );

    return {
      entities: allEntities,
      relationships: allRelationships,
      discovered_types: Array.from(discoveredTypes),
      usage: {
        prompt_tokens: 0, // Not available from LangChain yet
        completion_tokens: 0,
        total_tokens: 0,
      },
      raw_response: {
        llm_calls: debugCalls,
        total_duration_ms: duration,
        total_entities: allEntities.length,
        total_relationships: allRelationships.length,
        types_processed: typesToExtract.length,
        chunks_processed: chunks.length,
      },
    };
  }

  /**
   * Split document into chunks using LangChain text splitter
   */
  private async splitDocumentIntoChunks(
    documentContent: string
  ): Promise<string[]> {
    const chunkSize = this.config.extractionChunkSize;
    const chunkOverlap = this.config.extractionChunkOverlap;

    // If document is smaller than chunk size, return as single chunk
    if (documentContent.length <= chunkSize) {
      return [documentContent];
    }

    this.logger.debug(
      `Splitting document (${documentContent.length} chars) into chunks ` +
        `(size: ${chunkSize}, overlap: ${chunkOverlap})`
    );

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });

    const chunks = await splitter.splitText(documentContent);

    this.logger.debug(`Created ${chunks.length} chunks`);

    return chunks;
  }

  /**
   * Deduplicate entities by name (case-insensitive)
   * Keeps the entity with highest confidence when duplicates found
   */
  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const entityMap = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const key = entity.name.toLowerCase();
      const existing = entityMap.get(key);
      const entityConfidence = entity.confidence || 0;
      const existingConfidence = existing?.confidence || 0;

      if (!existing || entityConfidence > existingConfidence) {
        entityMap.set(key, entity);
      }
    }

    return Array.from(entityMap.values());
  }

  private sanitizeSchema(schema: any): any {
    if (typeof schema !== 'object' || schema === null) return schema;
    if (Array.isArray(schema)) return schema.map((i) => this.sanitizeSchema(i));

    const newSchema: any = {};
    const allowedKeys = [
      'type',
      'description',
      'enum',
      'items',
      'properties',
      'required',
    ];

    for (const key in schema) {
      if (key.startsWith('_')) continue;
      if (['title', 'default', 'format'].includes(key)) continue;

      if (allowedKeys.includes(key)) {
        newSchema[key] = this.sanitizeSchema(schema[key]);
      }
    }
    return newSchema;
  }

  /**
   * Extract entities for a specific type using JSON prompting
   * Note: We use responseMimeType instead of withStructuredOutput() because
   * withStructuredOutput() causes timeouts with Vertex AI Gemini models.
   *
   * @param typeName - The entity type to extract
   * @param documentContent - The document chunk content
   * @param basePrompt - Base extraction prompt
   * @param objectSchema - JSON schema for the entity type
   * @param previouslyExtracted - Entities already extracted from previous chunks (for context)
   * @param chunkIndex - Current chunk index (0-based)
   * @param totalChunks - Total number of chunks
   */
  private async extractEntitiesForType(
    typeName: string,
    documentContent: string,
    basePrompt: string,
    objectSchema?: any,
    previouslyExtracted?: ExtractedEntity[],
    chunkIndex?: number,
    totalChunks?: number,
    traceId?: string,
    parentObservationId?: string
  ): Promise<{
    entities: ExtractedEntity[];
    prompt: string;
    rawResponse: any;
  }> {
    if (!objectSchema) {
      this.logger.error(`No schema provided for type: ${typeName}`);
      throw new Error(`No schema provided for type: ${typeName}`);
    }

    // Sanitize schema to remove internal fields and unsupported keys
    const sanitizedSchema = this.sanitizeSchema(objectSchema);

    // Build type-specific prompt with schema information and JSON output instructions
    const typePrompt = this.buildTypeSpecificPrompt(
      typeName,
      basePrompt,
      documentContent,
      objectSchema,
      previouslyExtracted,
      chunkIndex,
      totalChunks
    );

    // Add JSON schema to prompt for guidance
    const jsonSchemaStr = JSON.stringify(
      {
        type: 'object',
        properties: {
          entities: {
            type: 'array',
            items: sanitizedSchema,
          },
        },
        required: ['entities'],
      },
      null,
      2
    );

    const fullPrompt = `${typePrompt}

**JSON Schema for Response:**
\`\`\`json
${jsonSchemaStr}
\`\`\`

    Return ONLY a valid JSON object matching this schema. No explanation or markdown.`;

    let observation = null;
    if (traceId) {
      observation = this.langfuseService.createObservation(
        traceId,
        `extract-${typeName}`,
        {
          typeName,
          chunkIndex,
          totalChunks,
          documentContent:
            documentContent.substring(0, 1000) +
            (documentContent.length > 1000 ? '...' : ''),
          prompt: fullPrompt,
        },
        {
          model: this.config.vertexAiModel,
          provider: 'LangChain-Gemini',
        },
        parentObservationId
      );
    }

    try {
      // Invoke the model with JSON response format, wrapped in timeout
      this.logger.debug(
        `[${typeName}] Starting LLM call (timeout: ${this.llmCallTimeoutMs}ms)`
      );
      const callStartTime = Date.now();

      // Debug logging: show exactly what we're sending to the LLM
      if (isDebugEnabled()) {
        this.logger.log('');
        this.logger.log('='.repeat(80));
        this.logger.log(
          `[LLM_DEBUG] JSON EXTRACTION REQUEST - Type: ${typeName}`
        );
        this.logger.log('='.repeat(80));
        this.logger.log('[LLM_DEBUG] Model: ' + this.config.vertexAiModel);
        this.logger.log('[LLM_DEBUG] Mode: JSON response (legacy)');
        this.logger.log('[LLM_DEBUG] Entity type: ' + typeName);
        this.logger.log(
          `[LLM_DEBUG] Chunk: ${(chunkIndex ?? 0) + 1}/${totalChunks ?? 1}`
        );
        this.logger.log(
          '[LLM_DEBUG] Previously extracted count: ' +
            (previouslyExtracted?.length ?? 0)
        );
        this.logger.log(
          '[LLM_DEBUG] Document chunk length: ' +
            documentContent.length +
            ' chars'
        );
        this.logger.log('-'.repeat(80));
        this.logger.log('[LLM_DEBUG] FULL PROMPT:');
        this.logger.log('-'.repeat(80));
        this.logger.log(fullPrompt);
        this.logger.log('-'.repeat(80));
      }

      const result = await withTimeout(
        this.model!.invoke(fullPrompt, {
          tags: ['extraction-job', typeName],
          metadata: {
            type: typeName,
            provider: 'LangChain-Gemini',
          },
        }),
        this.llmCallTimeoutMs,
        `LLM extraction for ${typeName}`
      );

      // Guard against undefined result from LangChain (can occur with API errors or malformed responses)
      if (!result) {
        this.logger.error(
          `[${typeName}] LLM invoke returned undefined result after ${
            Date.now() - callStartTime
          }ms`
        );
        if (observation) {
          this.langfuseService.updateObservation(
            observation,
            { error: 'LLM returned undefined result' },
            undefined,
            this.config.vertexAiModel,
            'error',
            'LLM returned undefined result'
          );
        }
        return {
          entities: [],
          prompt: fullPrompt,
          rawResponse: { error: 'LLM returned undefined result' },
        };
      }

      this.logger.debug(
        `[${typeName}] LLM call completed in ${Date.now() - callStartTime}ms`
      );

      // Parse the JSON response
      const content =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);

      // Clean up markdown code blocks if present
      const cleanedContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Debug logging: show the raw LLM response
      if (isDebugEnabled()) {
        this.logger.log('-'.repeat(80));
        this.logger.log(`[LLM_DEBUG] RAW RESPONSE for ${typeName}:`);
        this.logger.log('-'.repeat(80));
        this.logger.log('[LLM_DEBUG] Raw content length: ' + content.length);
        this.logger.log('[LLM_DEBUG] Cleaned content:');
        this.logger.log(
          cleanedContent.substring(0, 2000) +
            (cleanedContent.length > 2000 ? '... (truncated)' : '')
        );
        this.logger.log('='.repeat(80));
        this.logger.log('');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(cleanedContent);
      } catch (parseError) {
        this.logger.warn(
          `[${typeName}] Failed to parse JSON response: ${cleanedContent.substring(
            0,
            200
          )}...`
        );
        if (observation) {
          this.langfuseService.updateObservation(
            observation,
            { error: 'JSON parse error', content: cleanedContent },
            undefined,
            this.config.vertexAiModel,
            'error',
            'JSON parse error'
          );
        }
        return {
          entities: [],
          prompt: fullPrompt,
          rawResponse: { error: 'JSON parse error', content: cleanedContent },
        };
      }

      if (observation) {
        const usage = result.response_metadata?.usage as any;
        this.langfuseService.updateObservation(
          observation,
          parsed,
          {
            promptTokens: usage?.prompt_token_count,
            completionTokens: usage?.candidates_token_count,
            totalTokens: usage?.total_token_count,
          },
          this.config.vertexAiModel
        );
      }

      // Transform to ExtractedEntity format
      const entities: ExtractedEntity[] = (parsed.entities || []).map(
        (entity: any) => ({
          type_name: typeName,
          name: this.extractName(entity, typeName),
          description: this.extractDescription(entity),
          // NOTE: business_key is no longer set - key column is nullable
          properties: this.extractProperties(entity),
          confidence: entity.confidence || 0.8, // Default if not provided
        })
      );

      return {
        entities,
        prompt: fullPrompt,
        rawResponse: parsed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (observation) {
        this.langfuseService.updateObservation(
          observation,
          null,
          undefined,
          this.config.vertexAiModel,
          'error',
          errorMessage
        );
      }

      // Check if it's a timeout error
      if (errorMessage.includes('timed out')) {
        this.logger.error(`[${typeName}] LLM call timed out: ${errorMessage}`);
        // Return empty result with timeout error info
        return {
          entities: [],
          prompt: typePrompt,
          rawResponse: {
            error: 'LLM call timed out',
            message: errorMessage,
            timeout_ms: this.llmCallTimeoutMs,
          },
        };
      }

      // Check if it's a JSON parsing error from malformed LLM response
      if (error instanceof SyntaxError && errorMessage.includes('JSON')) {
        this.logger.warn(`JSON parsing error for ${typeName}: ${errorMessage}`);
        this.logger.warn(
          'The LLM returned malformed JSON. Skipping this entity type.'
        );

        // Return empty result instead of crashing the entire extraction
        return {
          entities: [],
          prompt: typePrompt,
          rawResponse: { error: 'JSON parsing failed', message: errorMessage },
        };
      }

      // Check if it's a Google API schema validation error
      if (errorMessage.includes('Invalid JSON payload')) {
        this.logger.warn(
          `Google API schema validation error for ${typeName}: ${errorMessage}`
        );
        this.logger.warn(
          'The schema contains unsupported JSON Schema features. Skipping this entity type.'
        );

        // Return empty result instead of crashing
        return {
          entities: [],
          prompt: typePrompt,
          rawResponse: {
            error: 'Schema validation failed',
            message: errorMessage,
          },
        };
      }

      // Check for common API errors and handle gracefully
      if (
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('429') ||
        errorMessage.includes('quota')
      ) {
        this.logger.error(
          `[${typeName}] Rate limit or quota exceeded: ${errorMessage}`
        );
        return {
          entities: [],
          prompt: typePrompt,
          rawResponse: {
            error: 'Rate limit exceeded',
            message: errorMessage,
          },
        };
      }

      if (
        errorMessage.includes('UNAVAILABLE') ||
        errorMessage.includes('503') ||
        errorMessage.includes('502')
      ) {
        this.logger.error(
          `[${typeName}] LLM service unavailable: ${errorMessage}`
        );
        return {
          entities: [],
          prompt: typePrompt,
          rawResponse: {
            error: 'Service unavailable',
            message: errorMessage,
          },
        };
      }

      // Check if this is the "empty generations" error from LangChain
      // This happens when Vertex AI returns an empty or malformed response
      if (
        errorMessage.includes(
          "Cannot read properties of undefined (reading 'message')"
        ) ||
        errorMessage.includes('generations') ||
        errorMessage.includes('chatGeneration')
      ) {
        this.logger.warn(
          `[${typeName}] Vertex AI returned empty/malformed response. ` +
            `This may indicate rate limiting, safety filtering, or API issues. Returning empty result.`
        );
        return {
          entities: [],
          prompt: typePrompt,
          rawResponse: {
            error: 'Vertex AI returned empty response',
            details: errorMessage,
          },
        };
      }

      // For other errors, log and throw (so outer catch can detect failures)
      this.logger.error(
        `[${typeName}] LLM extraction failed with unexpected error: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
      // Re-throw the error so the outer catch block can detect it
      throw error;
    }
  }

  /**
   * Build type-specific extraction prompt
   *
   * @param typeName - The entity type to extract
   * @param basePrompt - Base extraction prompt
   * @param documentContent - The document chunk content
   * @param objectSchema - JSON schema for the entity type
   * @param previouslyExtracted - Entities already extracted from previous chunks
   * @param chunkIndex - Current chunk index (0-based)
   * @param totalChunks - Total number of chunks
   */
  private buildTypeSpecificPrompt(
    typeName: string,
    basePrompt: string,
    documentContent: string,
    objectSchema?: any,
    previouslyExtracted?: ExtractedEntity[],
    chunkIndex?: number,
    totalChunks?: number
  ): string {
    const typeInstructions = this.getTypeInstructions(typeName);
    const isMultiChunk = totalChunks !== undefined && totalChunks > 1;
    const chunkInfo = isMultiChunk
      ? `\n**Processing Chunk ${(chunkIndex ?? 0) + 1} of ${totalChunks}**\n`
      : '';

    let prompt = `${basePrompt}

**Entity Type to Extract:** ${typeName}
${chunkInfo}
`;

    // Add schema information if available
    if (objectSchema) {
      if (objectSchema.description) {
        prompt += `**Description:** ${objectSchema.description}\n\n`;
      }

      if (objectSchema.properties) {
        prompt += '**Schema Definition:**\n';
        prompt += 'Properties:\n';
        for (const [propName, propDef] of Object.entries(
          objectSchema.properties as Record<string, any>
        )) {
          // Skip internal fields (like _schema_version) from prompt text
          if (propName.startsWith('_')) continue;

          const required = objectSchema.required?.includes(propName)
            ? ' (required)'
            : '';
          const description = propDef.description || '';
          const typeInfo = propDef.type ? ` [${propDef.type}]` : '';
          const enumInfo = propDef.enum
            ? ` (options: ${propDef.enum.join(', ')})`
            : '';
          prompt += `  - ${propName}${required}${typeInfo}${enumInfo}: ${description}\n`;
        }
        prompt += '\n';
      }

      // Add examples if available
      if (
        objectSchema.examples &&
        Array.isArray(objectSchema.examples) &&
        objectSchema.examples.length > 0
      ) {
        prompt += '**Examples:**\n';
        for (const example of objectSchema.examples) {
          prompt += '```json\n' + JSON.stringify(example, null, 2) + '\n```\n';
        }
        prompt += '\n';
      }
    }

    // Add previously extracted entities context for multi-chunk processing
    if (previouslyExtracted && previouslyExtracted.length > 0) {
      prompt += `**Previously Extracted ${typeName} Entities (from earlier chunks):**\n`;
      prompt += `The following ${previouslyExtracted.length} entities have already been extracted from previous parts of this document.\n`;
      prompt += `- Use consistent naming: if you find the same entity, use the EXACT same name as listed below\n`;
      prompt += `- Avoid duplicates: do NOT extract entities that are already in this list unless you have NEW information\n`;
      prompt += `- Add new info: if you find additional details about an existing entity, you may include it with the same name and additional properties\n\n`;

      // List previously extracted entities (limit to avoid token overflow)
      const maxToShow = 50; // Limit context size
      const entitiesToShow = previouslyExtracted.slice(-maxToShow); // Show most recent

      for (const entity of entitiesToShow) {
        const desc = entity.description
          ? ` - ${entity.description.substring(0, 100)}${
              entity.description.length > 100 ? '...' : ''
            }`
          : '';
        prompt += `  • ${entity.name}${desc}\n`;
      }

      if (previouslyExtracted.length > maxToShow) {
        prompt += `  ... and ${
          previouslyExtracted.length - maxToShow
        } more entities\n`;
      }
      prompt += '\n';
    }

    prompt += `${typeInstructions}

**Instructions:**
- Extract ALL ${typeName} entities found in the document
- For each entity, provide a confidence score (0.0-1.0)
- Include the original text snippet that supports the extraction
- If no ${typeName} entities are found, return an empty array

**Document Content:**

${documentContent}

**Output:** Return a JSON object with an "entities" array containing the extracted ${typeName} entities.`;

    return prompt;
  }

  /**
   * Get type-specific extraction instructions
   */
  private getTypeInstructions(typeName: string): string {
    const instructions: Record<string, string> = {
      Requirement:
        'Extract functional and non-functional requirements. Look for statements of what the system must do or constraints it must satisfy.',
      Decision:
        'Extract decisions made or proposed. Look for conclusions, choices, or determinations about how to proceed.',
      Feature:
        'Extract product features or capabilities. Look for descriptions of functionality or user-facing capabilities.',
      Task: 'Extract actionable tasks and action items. Look for assignments, todos, or specific actions that need to be taken.',
      Risk: 'Extract potential risks or threats. Look for concerns, potential problems, or uncertainties.',
      Issue:
        'Extract problems or concerns. Look for bugs, defects, blockers, or current problems.',
      Stakeholder:
        'Extract people or groups mentioned. Look for individuals, teams, departments, or organizations involved.',
      Constraint:
        'Extract limitations or restrictions. Look for boundaries, limitations, or fixed constraints on the project.',
    };

    return (
      instructions[typeName] ||
      `Extract ${typeName} entities from the document.`
    );
  }

  /**
   * Extract name field from entity based on type
   */
  private extractName(entity: any, typeName: string): string {
    // Different types use different fields for the name
    return entity.name || entity.title || typeName;
  }

  /**
   * Extract description field from entity
   */
  private extractDescription(entity: any): string {
    return entity.description || entity.rationale || '';
  }

  /**
   * Extract business key if available
   */
  private extractBusinessKey(entity: any): string | undefined {
    // Use name as business key for entity linking
    return entity.name || entity.title;
  }

  /**
   * Extract all properties as key-value pairs
   */
  private extractProperties(entity: any): Record<string, any> {
    const { confidence, source_text, extraction_reasoning, ...properties } =
      entity;
    return properties;
  }

  /**
   * Get available extraction schemas
   */
  private getAvailableSchemas(): string[] {
    return [
      'Requirement',
      'Decision',
      'Feature',
      'Task',
      'Risk',
      'Issue',
      'Stakeholder',
      'Constraint',
    ];
  }

  // ============================================================================
  // TOOL-BASED EXTRACTION (New Approach)
  // ============================================================================

  /**
   * Full document extraction using tool calling.
   *
   * This is the entry point for tool-based extraction that:
   * - Splits the document into chunks
   * - Processes each chunk with extractWithToolBinding
   * - Aggregates and deduplicates results
   * - Returns the unified ExtractionResult
   *
   * @param documentContent - Full document content
   * @param extractionPrompt - Base extraction prompt
   * @param options - Extraction options with schemas and context
   */
  private async extractWithToolBindingFull(
    documentContent: string,
    extractionPrompt: string,
    options: ExtractionOptions
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const allEntities: ExtractedEntity[] = [];
    const allRelationships: ExtractedRelationship[] = [];
    const discoveredTypes = new Set<string>();
    const debugCalls: any[] = [];

    const { context } = options;

    // Start job tracking for LLM dump if enabled
    if (this.llmCallDumpService.isEnabled() && context?.jobId) {
      await this.llmCallDumpService.startJob(context.jobId, {
        projectId: context.projectId,
        documentLength: documentContent.length,
        entityTypes: options.allowedTypes || Object.keys(options.objectSchemas),
        relationshipTypes: options.relationshipSchemas
          ? Object.keys(options.relationshipSchemas)
          : [],
        existingEntitiesCount: options.existingEntities?.length ?? 0,
      });
    }

    // Split document into chunks
    const chunks = await this.splitDocumentIntoChunks(documentContent);

    if (chunks.length > 1) {
      this.logger.log(
        `[ToolExtraction] Document split into ${chunks.length} chunks for processing`
      );
    }

    // Process each chunk, passing previously extracted entities for context
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];

      // Pass previously extracted entities to help with naming consistency
      const previousEntities =
        allEntities.length > 0 ? [...allEntities] : undefined;

      if (previousEntities && previousEntities.length > 0) {
        this.logger.debug(
          `[ToolExtraction] Chunk ${chunkIndex + 1}/${
            chunks.length
          }: providing ${
            previousEntities.length
          } previously extracted entities as context`
        );
      }

      const { entities, relationships, rawResponse } =
        await this.extractWithToolBinding(
          chunk,
          extractionPrompt,
          options,
          chunkIndex,
          chunks.length,
          previousEntities
        );

      // Store debug info
      debugCalls.push({
        chunk_index: chunkIndex,
        chunk_count: chunks.length,
        input: {
          document: chunk.substring(0, 500) + (chunk.length > 500 ? '...' : ''),
          prompt_length: extractionPrompt.length,
          previously_extracted_count: previousEntities?.length ?? 0,
        },
        output: rawResponse,
        entities_found: entities.length,
        relationships_found: relationships.length,
        timestamp: new Date().toISOString(),
        model: this.config.vertexAiModel,
        status: rawResponse.error ? 'error' : 'success',
      });

      // Accumulate results
      if (entities.length > 0) {
        allEntities.push(...entities);
        entities.forEach((e) => discoveredTypes.add(e.type_name));
      }
      if (relationships.length > 0) {
        allRelationships.push(...relationships);
      }
    }

    // Deduplicate entities by name (case-insensitive)
    const deduplicatedEntities = this.deduplicateEntities(allEntities);

    // Deduplicate relationships (same source, target, type)
    const deduplicatedRelationships =
      this.deduplicateRelationships(allRelationships);

    const duration = Date.now() - startTime;

    this.logger.log(
      `[ToolExtraction] Extracted ${deduplicatedEntities.length} entities ` +
        `(${allEntities.length} before dedup) and ${deduplicatedRelationships.length} relationships ` +
        `(${allRelationships.length} before dedup) across ${discoveredTypes.size} types in ${duration}ms`
    );

    // Finish job tracking for LLM dump if enabled
    if (this.llmCallDumpService.isEnabled() && context?.jobId) {
      await this.llmCallDumpService.finishJob(context.jobId, {
        totalEntities: deduplicatedEntities.length,
        totalRelationships: deduplicatedRelationships.length,
        durationMs: duration,
      });
    }

    return {
      entities: deduplicatedEntities,
      relationships: deduplicatedRelationships,
      discovered_types: Array.from(discoveredTypes),
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      raw_response: {
        extraction_mode: 'tool-binding',
        llm_calls: debugCalls,
        total_duration_ms: duration,
        total_entities: deduplicatedEntities.length,
        total_relationships: deduplicatedRelationships.length,
        types_processed: discoveredTypes.size,
        chunks_processed: chunks.length,
      },
    };
  }

  /**
   * Deduplicate relationships by source+target+type combination.
   * Keeps the relationship with highest confidence when duplicates found.
   */
  private deduplicateRelationships(
    relationships: ExtractedRelationship[]
  ): ExtractedRelationship[] {
    const relMap = new Map<string, ExtractedRelationship>();

    for (const rel of relationships) {
      // Build a key from source, target, and type
      const sourceKey = rel.source.id || rel.source.name?.toLowerCase() || '';
      const targetKey = rel.target.id || rel.target.name?.toLowerCase() || '';
      const key = `${sourceKey}|${targetKey}|${rel.relationship_type.toLowerCase()}`;

      const existing = relMap.get(key);
      const relConfidence = rel.confidence || 0;
      const existingConfidence = existing?.confidence || 0;

      if (!existing || relConfidence > existingConfidence) {
        relMap.set(key, rel);
      }
    }

    return Array.from(relMap.values());
  }

  /**
   * Extract entities and relationships using tool calling.
   *
   * This is a unified extraction approach that:
   * - Makes ONE LLM call per chunk (not one per type)
   * - Extracts ALL entity types AND relationships together
   * - Uses native tool calling for guaranteed structure
   *
   * @param chunk - Document chunk to extract from
   * @param extractionPrompt - Base extraction prompt
   * @param options - Extraction options with schemas and context
   * @param chunkIndex - Current chunk index (0-based)
   * @param totalChunks - Total number of chunks
   * @param previousEntities - Entities extracted from previous chunks (for context)
   */
  private async extractWithToolBinding(
    chunk: string,
    extractionPrompt: string,
    options: ExtractionOptions,
    chunkIndex: number,
    totalChunks: number,
    previousEntities?: ExtractedEntity[]
  ): Promise<{
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
    rawResponse: any;
  }> {
    if (!this.toolModel) {
      throw new Error('Tool model not initialized');
    }

    const {
      objectSchemas,
      relationshipSchemas,
      allowedTypes,
      existingEntities,
      context,
    } = options;

    // Build the unified extraction prompt
    const prompt = this.buildToolExtractionPrompt(
      chunk,
      extractionPrompt,
      objectSchemas,
      relationshipSchemas,
      allowedTypes,
      existingEntities,
      previousEntities,
      chunkIndex,
      totalChunks
    );

    // Bind the extraction tools to the model
    const modelWithTools = this.toolModel.bindTools(extractionToolDefs);

    const callStartTime = Date.now();
    this.logger.debug(
      `[ToolExtraction] Starting tool-based extraction for chunk ${
        chunkIndex + 1
      }/${totalChunks}`
    );

    // Debug logging: show exactly what we're sending to the LLM
    if (isDebugEnabled()) {
      this.logger.log('');
      this.logger.log('='.repeat(80));
      this.logger.log(
        `[LLM_DEBUG] EXTRACTION REQUEST - Chunk ${
          chunkIndex + 1
        }/${totalChunks}`
      );
      this.logger.log('='.repeat(80));
      this.logger.log('[LLM_DEBUG] Model: ' + this.config.vertexAiModel);
      this.logger.log(
        '[LLM_DEBUG] Tools bound: extract_entity, extract_relationship'
      );
      this.logger.log(
        '[LLM_DEBUG] Entity types: ' +
          (allowedTypes || Object.keys(objectSchemas)).join(', ')
      );
      this.logger.log(
        '[LLM_DEBUG] Relationship schemas: ' +
          (relationshipSchemas
            ? Object.keys(relationshipSchemas).join(', ')
            : 'none')
      );
      this.logger.log(
        '[LLM_DEBUG] Existing entities count: ' +
          (existingEntities?.length ?? 0)
      );
      this.logger.log(
        '[LLM_DEBUG] Previous entities count: ' +
          (previousEntities?.length ?? 0)
      );
      this.logger.log(
        '[LLM_DEBUG] Document chunk length: ' + chunk.length + ' chars'
      );
      this.logger.log('-'.repeat(80));
      this.logger.log('[LLM_DEBUG] FULL PROMPT:');
      this.logger.log('-'.repeat(80));
      this.logger.log(prompt);
      this.logger.log('-'.repeat(80));
    }

    // Create a response capture handler to capture raw LLM response data
    // This is especially useful for debugging when Vertex AI returns empty/malformed responses
    const captureHandler = new LlmResponseCaptureHandler();

    let result: Awaited<ReturnType<typeof modelWithTools.invoke>>;
    try {
      result = await withTimeout(
        modelWithTools.invoke(prompt, {
          tags: ['extraction-job', 'tool-calling'],
          metadata: {
            chunkIndex,
            totalChunks,
            provider: 'LangChain-Gemini-Tools',
          },
          callbacks: [captureHandler],
        }),
        this.llmCallTimeoutMs,
        `Tool-based extraction for chunk ${chunkIndex + 1}`
      );
    } catch (invokeError: unknown) {
      // Get any captured data from the handler - this may contain partial response info
      const capturedData = captureHandler.getLastCapture();
      if (capturedData) {
        this.logger.debug(
          `[ToolExtraction] Captured LLM data on error: ${captureHandler.getLastCaptureSummary()}`
        );
      }

      // Enhanced error logging for debugging LLM failures
      const errorDetails = {
        type: invokeError?.constructor?.name || 'Unknown',
        message:
          invokeError instanceof Error
            ? invokeError.message
            : String(invokeError),
        stack: invokeError instanceof Error ? invokeError.stack : undefined,
        raw: JSON.stringify(
          invokeError,
          Object.getOwnPropertyNames(invokeError || {})
        ),
        // Include captured data if available
        capturedLlmOutput: capturedData?.llmOutput,
        capturedLlmResult: capturedData?.llmResult
          ? {
              generationsCount: capturedData.llmResult.generations?.length ?? 0,
              llmOutputKeys: capturedData.llmResult.llmOutput
                ? Object.keys(capturedData.llmResult.llmOutput)
                : [],
            }
          : undefined,
      };
      this.logger.error(
        `[ToolExtraction] LLM invoke failed for chunk ${
          chunkIndex + 1
        }: ${JSON.stringify(errorDetails)}`
      );

      // Check if this is the "empty generations" error from LangChain
      // This happens when Vertex AI returns an empty or malformed response
      const errorMessage =
        invokeError instanceof Error
          ? invokeError.message
          : String(invokeError);
      if (
        errorMessage.includes(
          "Cannot read properties of undefined (reading 'message')"
        ) ||
        errorMessage.includes('generations') ||
        errorMessage.includes('chatGeneration')
      ) {
        this.logger.warn(
          `[ToolExtraction] Vertex AI returned empty/malformed response for chunk ${
            chunkIndex + 1
          }. ` +
            `This may indicate rate limiting, safety filtering, or API issues. Returning empty result.`
        );

        // Dump the error case to files if enabled
        if (this.llmCallDumpService.isEnabled() && context?.jobId) {
          await this.llmCallDumpService.dumpCall({
            jobId: context.jobId,
            timestamp: new Date().toISOString(),
            model: this.config.vertexAiModel || 'unknown',
            mode: 'tool-binding',
            chunkIndex,
            totalChunks,
            chunkLength: chunk.length,
            context: {
              entityTypes: allowedTypes || Object.keys(objectSchemas),
              relationshipTypes: relationshipSchemas
                ? Object.keys(relationshipSchemas)
                : undefined,
              existingEntitiesCount: existingEntities?.length ?? 0,
              previouslyExtractedCount: previousEntities?.length ?? 0,
            },
            prompt: {
              full: prompt,
              length: prompt.length,
            },
            response: {
              content: null,
              durationMs: Date.now() - callStartTime,
              error: `Vertex AI returned empty/malformed response: ${errorMessage}`,
              // Include captured data from callback handler
              capturedLlmOutput: capturedData?.llmOutput,
              capturedLlmResultSummary: capturedData?.llmResult
                ? {
                    generationsCount:
                      capturedData.llmResult.generations?.length ?? 0,
                    llmOutputKeys: capturedData.llmResult.llmOutput
                      ? Object.keys(capturedData.llmResult.llmOutput)
                      : [],
                  }
                : undefined,
            },
            results: {
              entitiesExtracted: 0,
              relationshipsExtracted: 0,
            },
          });
        }

        return {
          entities: [],
          relationships: [],
          rawResponse: {
            error: 'Vertex AI returned empty response',
            details: errorMessage,
          },
        };
      }

      throw invokeError;
    }

    // Guard against undefined result from LangChain (can occur with API errors or malformed responses)
    if (!result) {
      const errorMsg = `LLM invoke returned undefined result after ${
        Date.now() - callStartTime
      }ms`;
      this.logger.error(`[ToolExtraction] ${errorMsg}`);

      // Check for any captured data that might help with debugging
      const capturedData = captureHandler.getLastCapture();
      if (capturedData) {
        this.logger.debug(
          `[ToolExtraction] Captured data for undefined result: ${captureHandler.getLastCaptureSummary()}`
        );
      }

      // Dump the error case to files if enabled
      if (this.llmCallDumpService.isEnabled() && context?.jobId) {
        await this.llmCallDumpService.dumpCall({
          jobId: context.jobId,
          timestamp: new Date().toISOString(),
          model: this.config.vertexAiModel || 'unknown',
          mode: 'tool-binding',
          chunkIndex,
          totalChunks,
          chunkLength: chunk.length,
          context: {
            entityTypes: allowedTypes || Object.keys(objectSchemas),
            relationshipTypes: relationshipSchemas
              ? Object.keys(relationshipSchemas)
              : undefined,
            existingEntitiesCount: existingEntities?.length ?? 0,
            previouslyExtractedCount: previousEntities?.length ?? 0,
          },
          prompt: {
            full: prompt,
            length: prompt.length,
          },
          response: {
            content: null,
            durationMs: Date.now() - callStartTime,
            error: errorMsg,
            // Include captured data from callback handler
            capturedLlmOutput: capturedData?.llmOutput,
            capturedLlmResultSummary: capturedData?.llmResult
              ? {
                  generationsCount:
                    capturedData.llmResult.generations?.length ?? 0,
                  llmOutputKeys: capturedData.llmResult.llmOutput
                    ? Object.keys(capturedData.llmResult.llmOutput)
                    : [],
                }
              : undefined,
          },
          results: {
            entitiesExtracted: 0,
            relationshipsExtracted: 0,
          },
        });
      }

      return {
        entities: [],
        relationships: [],
        rawResponse: { error: errorMsg },
      };
    }

    try {
      this.logger.debug(
        `[ToolExtraction] LLM call completed in ${Date.now() - callStartTime}ms`
      );

      // Debug logging: show the raw LLM response
      if (isDebugEnabled()) {
        this.logger.log('-'.repeat(80));
        this.logger.log('[LLM_DEBUG] RAW RESPONSE:');
        this.logger.log('-'.repeat(80));
        this.logger.log(
          '[LLM_DEBUG] Content: ' +
            (typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content))
        );
        this.logger.log(
          '[LLM_DEBUG] Tool calls count: ' + (result.tool_calls?.length ?? 0)
        );
        if (result.tool_calls && result.tool_calls.length > 0) {
          this.logger.log('[LLM_DEBUG] Tool calls:');
          for (const tc of result.tool_calls) {
            this.logger.log(
              `[LLM_DEBUG]   - ${tc.name}: ${JSON.stringify(tc.args)}`
            );
          }
        }
        this.logger.log('='.repeat(80));
        this.logger.log('');
      }

      // Extract entities and relationships from tool_calls
      const entities: ExtractedEntity[] = [];
      const relationships: ExtractedRelationship[] = [];

      if (result.tool_calls && result.tool_calls.length > 0) {
        for (const toolCall of result.tool_calls) {
          if (toolCall.name === 'extract_entity') {
            const args = toolCall.args as ExtractedEntityToolCall;
            entities.push({
              type_name: args.type_name,
              name: args.name,
              description: args.description,
              // NOTE: business_key is no longer set - key column is nullable
              properties: args.properties || {},
              // Note: confidence is no longer extracted by LLM - calculated by cascade system
            });
          } else if (toolCall.name === 'extract_relationship') {
            const args = toolCall.args as ExtractedRelationshipToolCall;
            relationships.push({
              source: {
                name: args.source_name || undefined,
                id: args.source_id || undefined,
              },
              target: {
                name: args.target_name || undefined,
                id: args.target_id || undefined,
              },
              relationship_type: args.relationship_type,
              description: args.description,
              // Note: confidence is no longer extracted by LLM - calculated by cascade system
            });
          }
        }
      }

      this.logger.debug(
        `[ToolExtraction] Extracted ${entities.length} entities and ${
          relationships.length
        } relationships from chunk ${chunkIndex + 1}`
      );

      // Dump LLM call to files if enabled
      if (this.llmCallDumpService.isEnabled() && context?.jobId) {
        await this.llmCallDumpService.dumpCall({
          jobId: context.jobId,
          timestamp: new Date().toISOString(),
          model: this.config.vertexAiModel || 'unknown',
          mode: 'tool-binding',
          chunkIndex,
          totalChunks,
          chunkLength: chunk.length,
          context: {
            entityTypes: allowedTypes || Object.keys(objectSchemas),
            relationshipTypes: relationshipSchemas
              ? Object.keys(relationshipSchemas)
              : undefined,
            existingEntitiesCount: existingEntities?.length ?? 0,
            existingEntitySamples: existingEntities
              ?.slice(0, 10)
              .map((e) => `[${e.type_name}] ${e.name}`),
            previouslyExtractedCount: previousEntities?.length ?? 0,
            previouslyExtractedSamples: previousEntities
              ?.slice(-10)
              .map((e) => `[${e.type_name}] ${e.name}`),
          },
          prompt: {
            full: prompt,
            length: prompt.length,
          },
          response: {
            content:
              typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content),
            toolCalls: result.tool_calls?.map((tc) => ({
              name: tc.name,
              args: tc.args,
            })),
            durationMs: Date.now() - callStartTime,
          },
          results: {
            entitiesExtracted: entities.length,
            relationshipsExtracted: relationships.length,
            entityNames: entities.map((e) => `[${e.type_name}] ${e.name}`),
            relationshipSummaries: relationships.map(
              (r) =>
                `${r.source.name || r.source.id} -[${r.relationship_type}]-> ${
                  r.target.name || r.target.id
                }`
            ),
          },
        });
      }

      return {
        entities,
        relationships,
        rawResponse: {
          tool_calls: result.tool_calls,
          content: result.content,
          duration_ms: Date.now() - callStartTime,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[ToolExtraction] Failed for chunk ${chunkIndex + 1}: ${errorMessage}`
      );

      // Dump error case to files if enabled
      if (this.llmCallDumpService.isEnabled() && context?.jobId) {
        await this.llmCallDumpService.dumpCall({
          jobId: context.jobId,
          timestamp: new Date().toISOString(),
          model: this.config.vertexAiModel || 'unknown',
          mode: 'tool-binding',
          chunkIndex,
          totalChunks,
          chunkLength: chunk.length,
          context: {
            entityTypes: allowedTypes || Object.keys(objectSchemas),
            relationshipTypes: relationshipSchemas
              ? Object.keys(relationshipSchemas)
              : undefined,
            existingEntitiesCount: existingEntities?.length ?? 0,
            previouslyExtractedCount: previousEntities?.length ?? 0,
          },
          prompt: {
            full: prompt,
            length: prompt.length,
          },
          response: {
            content: null,
            durationMs: Date.now() - callStartTime,
            error: errorMessage,
          },
          results: {
            entitiesExtracted: 0,
            relationshipsExtracted: 0,
          },
        });
      }

      return {
        entities: [],
        relationships: [],
        rawResponse: {
          error: errorMessage,
          duration_ms: Date.now() - callStartTime,
        },
      };
    }
  }

  /**
   * Build the prompt for tool-based extraction.
   * This is a unified prompt that instructs the LLM to extract
   * all entity types and relationships in a single pass.
   */
  private buildToolExtractionPrompt(
    documentContent: string,
    basePrompt: string,
    objectSchemas: Record<string, any>,
    relationshipSchemas?: Record<string, any>,
    allowedTypes?: string[],
    existingEntities?: ExistingEntityContext[],
    previousEntities?: ExtractedEntity[],
    chunkIndex?: number,
    totalChunks?: number
  ): string {
    const isMultiChunk = totalChunks !== undefined && totalChunks > 1;
    const chunkInfo = isMultiChunk
      ? `\n**Processing Chunk ${(chunkIndex ?? 0) + 1} of ${totalChunks}**\n`
      : '';

    const typesToExtract = allowedTypes || Object.keys(objectSchemas);

    let prompt = `${basePrompt}${basePrompt ? '\n' : ''}${chunkInfo}
## Your Task

You are an expert knowledge graph builder. Your job is to build a connected knowledge graph from the document below.

**IMPORTANT: You must extract BOTH entities AND relationships.**

A knowledge graph without relationships is useless. For every entity you extract, consider:
- What other entities is it connected to?
- What is the nature of that connection?

Use the \`extract_entity\` tool for each entity you find.
Use the \`extract_relationship\` tool for each relationship between entities.

## Entity Types to Extract

`;

    // Add entity type definitions
    for (const typeName of typesToExtract) {
      const schema = objectSchemas[typeName];
      if (schema) {
        prompt += `### ${typeName}\n`;
        if (schema.description) {
          prompt += `${schema.description}\n`;
        }
        prompt += `Properties: `;
        if (schema.properties) {
          const props = Object.entries(schema.properties as Record<string, any>)
            .filter(([name]) => !name.startsWith('_'))
            .map(([name, def]: [string, any]) => {
              const required = schema.required?.includes(name) ? '*' : '';
              return `${name}${required}`;
            });
          prompt += props.join(', ');
        }
        prompt += '\n\n';
      }
    }

    // Add relationship type definitions if available
    if (relationshipSchemas && Object.keys(relationshipSchemas).length > 0) {
      prompt += `## Relationship Types

`;
      for (const [typeName, schema] of Object.entries(relationshipSchemas)) {
        prompt += `### ${typeName}\n`;
        if ((schema as any).description) {
          prompt += `${(schema as any).description}\n`;
        }
        // Support both naming conventions: source_types/target_types and fromTypes/toTypes
        const sourceTypes =
          (schema as any).source_types || (schema as any).fromTypes || [];
        const targetTypes =
          (schema as any).target_types || (schema as any).toTypes || [];
        const allowedSource =
          sourceTypes.length > 0 ? sourceTypes.join(', ') : 'any';
        const allowedTarget =
          targetTypes.length > 0 ? targetTypes.join(', ') : 'any';
        prompt += `Source: ${allowedSource} → Target: ${allowedTarget}\n\n`;
      }
    }

    // Add existing entities context (for referencing by UUID)
    if (existingEntities && existingEntities.length > 0) {
      prompt += `## Existing Objects in Knowledge Graph

The following objects already exist. When creating relationships TO or FROM these objects,
use their **id** (UUID) in source_id or target_id instead of source_name/target_name.

`;
      const maxToShow = 30;
      const entitiesToShow = existingEntities.slice(0, maxToShow);
      for (const entity of entitiesToShow) {
        prompt += `### ${entity.type_name}: "${entity.name}"\n`;
        prompt += `- **id**: ${entity.id}\n`;

        // Add description if present
        if (entity.description) {
          prompt += `- **description**: ${entity.description}\n`;
        }

        // Add all other properties with clear field names
        if (entity.properties && Object.keys(entity.properties).length > 0) {
          for (const [key, value] of Object.entries(entity.properties)) {
            // Format the value appropriately
            let valueStr: string;
            if (value === null || value === undefined) {
              valueStr = '(not set)';
            } else if (Array.isArray(value)) {
              // For arrays, show count and first few items
              if (value.length === 0) {
                valueStr = '[]';
              } else if (typeof value[0] === 'object') {
                valueStr = `[${value.length} items]`;
              } else {
                valueStr =
                  value.length <= 3
                    ? JSON.stringify(value)
                    : `[${value.slice(0, 3).join(', ')}, ... +${
                        value.length - 3
                      } more]`;
              }
            } else if (typeof value === 'object') {
              valueStr = JSON.stringify(value);
            } else {
              valueStr = String(value);
            }
            prompt += `- **${key}**: ${valueStr}\n`;
          }
        }

        // Add relationships if present
        if (entity.relationships && entity.relationships.length > 0) {
          prompt += `- **relationships**:\n`;
          for (const rel of entity.relationships) {
            if (rel.direction === 'outgoing') {
              prompt += `  - ${rel.type} → [${rel.related_entity_type}] "${rel.related_entity_name}"\n`;
            } else {
              prompt += `  - [${rel.related_entity_type}] "${rel.related_entity_name}" → ${rel.type} → this\n`;
            }
          }
        }

        prompt += '\n';
      }
      if (existingEntities.length > maxToShow) {
        prompt += `... and ${
          existingEntities.length - maxToShow
        } more objects\n`;
      }
      prompt += '\n';
    }

    // Add previously extracted entities (for multi-chunk consistency)
    if (previousEntities && previousEntities.length > 0) {
      prompt += `## Previously Extracted Entities (from earlier chunks)

Use consistent naming - if you find the same entity, use the EXACT same name.

`;
      const maxToShow = 30;
      const entitiesToShow = previousEntities.slice(-maxToShow);
      for (const entity of entitiesToShow) {
        prompt += `- [${entity.type_name}] "${entity.name}"\n`;
      }
      if (previousEntities.length > maxToShow) {
        prompt += `... and ${previousEntities.length - maxToShow} more\n`;
      }
      prompt += '\n';
    }

    prompt += `## Instructions

1. **Extract Entities**: For each entity, call \`extract_entity\` with:
   - name: A clear, descriptive name
   - type_name: One of the entity types listed above
   - description: What this entity represents
   - properties: Any additional type-specific properties
   - confidence: How confident you are (0.0-1.0)

2. **Extract Relationships**: For EVERY connection between entities, call \`extract_relationship\` with:
   - source_name/target_name: Names of entities you extracted in this batch
   - source_id/target_id: UUIDs of existing entities (if any were provided above)
   - relationship_type: One of the relationship types listed above
   - description: Details about this specific relationship
   - confidence: How confident you are (0.0-1.0)

3. **CRITICAL: Description References = Relationships**
   If you mention another entity in a description, you MUST also create a relationship to that entity.
   The description captures WHAT the relationship is; the relationship makes it QUERYABLE.

   **Examples:**
   - Entity: "Seven stars" with description "Held in the right hand of the Son of Man"
     → REQUIRES relationship: "Seven stars" --HELD_BY--> "Son of Man"
   
   - Entity: "Tree of Life" with description "Located in the paradise of God"  
     → REQUIRES relationship: "Tree of Life" --LOCATED_IN--> "Paradise of God"
   
   - Entity: "War in Heaven" with description "Michael and his angels fight against Satan"
     → REQUIRES relationships:
       - "War in Heaven" --PARTICIPATES_IN--> "Michael" (or reverse direction)
       - "War in Heaven" --PARTICIPATES_IN--> "Satan"
   
   - Entity: "Devil" with description "Contended with Archangel Michael over the body of Moses"
     → REQUIRES relationships:
       - "Devil" --OPPOSED_TO--> "Archangel Michael"  
       - "Devil" --RELATED_TO--> "Body of Moses"

   **Anti-pattern to avoid:**
   ❌ Creating entity with description "X is related to Y" but NO relationship to Y
   ✅ Creating entity with description "X is related to Y" AND relationship X→Y

4. **Relationship Examples** (based on the document):
   - If person A is the brother of person B → call extract_relationship with SIBLING_OF
   - If person A serves person B → call extract_relationship with appropriate type
   - If an event involves a person → call extract_relationship connecting them

5. Only extract what is explicitly stated or strongly implied in the document

## Document Content

${documentContent}

Now extract all entities AND their relationships. Remember: a knowledge graph needs connections!
IMPORTANT: For every entity reference in a description, create a corresponding relationship.`;

    return prompt;
  }
}
