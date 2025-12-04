import { Injectable, Logger } from '@nestjs/common';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { AppConfigService } from '../../../common/config/config.service';
import { LangfuseService } from '../../langfuse/langfuse.service';
import {
  ILLMProvider,
  ExtractionResult,
  ExtractedEntity,
} from './llm-provider.interface';

/**
 * Default timeout for LLM API calls (2 minutes)
 * This prevents hanging indefinitely on slow or stuck API calls
 */
const LLM_CALL_TIMEOUT_MS = 120_000;

/**
 * Helper to wrap a promise with a timeout
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
        reject(error);
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
  private model: ChatVertexAI | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly langfuseService: LangfuseService
  ) {
    this.initialize();
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
      this.model = new ChatVertexAI({
        model: modelName,
        authOptions: {
          projectId: projectId,
        },
        location: location,
        temperature: 1.0, // Required workaround for Vertex AI bug
        maxOutputTokens: 65535, // gemini-2.5-flash-lite max output tokens
        responseMimeType: 'application/json', // Forces clean JSON output
      } as any); // Cast to any because responseMimeType may not be in types

      this.logger.log(`LangChain Vertex AI initialized: model=${modelName}`);
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
    objectSchemas: Record<string, any>,
    allowedTypes?: string[],
    availableTags?: string[],
    context?: { jobId: string; projectId: string; traceId?: string }
  ): Promise<ExtractionResult> {
    if (!this.isConfigured()) {
      throw new Error('LangChain Gemini provider not configured');
    }

    const startTime = Date.now();
    const allEntities: ExtractedEntity[] = [];
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
              context?.traceId
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
      `Extracted ${allEntities.length} total entities across ${discoveredTypes.size} types in ${duration}ms`
    );

    return {
      entities: allEntities,
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
    traceId?: string
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
        }
      );
    }

    try {
      // Invoke the model with JSON response format, wrapped in timeout
      this.logger.debug(
        `[${typeName}] Starting LLM call (timeout: ${LLM_CALL_TIMEOUT_MS}ms)`
      );
      const callStartTime = Date.now();

      const result = await withTimeout(
        this.model!.invoke(fullPrompt, {
          tags: ['extraction-job', typeName],
          metadata: {
            type: typeName,
            provider: 'LangChain-Gemini',
          },
        }),
        LLM_CALL_TIMEOUT_MS,
        `LLM extraction for ${typeName}`
      );

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
          business_key: this.extractBusinessKey(entity),
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
            timeout_ms: LLM_CALL_TIMEOUT_MS,
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
}
