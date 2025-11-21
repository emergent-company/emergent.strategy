import { Injectable, Logger } from '@nestjs/common';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { AppConfigService } from '../../../common/config/config.service';
import {
  ILLMProvider,
  ExtractionResult,
  ExtractedEntity,
} from './llm-provider.interface';

/**
 * LangChain Gemini LLM Provider for entity extraction.
 * Uses ChatVertexAI with .withStructuredOutput() for type-safe extraction.
 * Supports dynamic type schemas.
 */
@Injectable()
export class LangChainGeminiProvider implements ILLMProvider {
  private readonly logger = new Logger(LangChainGeminiProvider.name);
  private model: ChatVertexAI | null = null;

  constructor(private readonly config: AppConfigService) {
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
      this.model = new ChatVertexAI({
        model: modelName,
        authOptions: {
          projectId: projectId,
        },
        location: location,
        temperature: 0,
        maxOutputTokens: 8192,
      });

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
    allowedTypes?: string[]
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
          const { entities, prompt, rawResponse } =
            await this.extractEntitiesForType(
              typeName,
              chunk,
              extractionPrompt,
              objectSchemas[typeName]
            );

          // Store debug information for this call
          debugCalls.push({
            type: typeName,
            chunk_index: chunkIndex,
            chunk_count: chunks.length,
            input: {
              document:
                chunk.substring(0, 500) + (chunk.length > 500 ? '...' : ''), // Truncate for storage
              prompt: prompt,
              allowed_types: [typeName],
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
   * Extract entities for a specific type using its Zod schema
   */
  private async extractEntitiesForType(
    typeName: string,
    documentContent: string,
    basePrompt: string,
    objectSchema?: any
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

    // Create array schema to extract multiple entities using JSON Schema
    const jsonSchema = {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: sanitizedSchema,
        },
      },
      required: ['entities'],
    };

    // Build type-specific prompt with schema information
    const typePrompt = this.buildTypeSpecificPrompt(
      typeName,
      basePrompt,
      documentContent,
      objectSchema
    );

    // Use structured output with JSON schema
    const structuredModel = this.model!.withStructuredOutput(jsonSchema, {
      name: `extract_${typeName.toLowerCase()}`,
    });

    try {
      // Invoke the model with structured output
      const result: any = await structuredModel.invoke(typePrompt, {
        tags: ['extraction-job', typeName],
        metadata: {
          type: typeName,
          provider: 'LangChain-Gemini',
        },
      });

      // Transform to ExtractedEntity format
      const entities: ExtractedEntity[] = (result.entities || []).map(
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
        prompt: typePrompt,
        rawResponse: result,
      };
    } catch (error) {
      // Check if it's a JSON parsing error from malformed LLM response
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        this.logger.warn(
          `JSON parsing error for ${typeName}: ${error.message}`
        );
        this.logger.warn(
          'The LLM returned malformed JSON. Skipping this entity type.'
        );

        // Return empty result instead of crashing the entire extraction
        return {
          entities: [],
          prompt: typePrompt,
          rawResponse: { error: 'JSON parsing failed', message: error.message },
        };
      }

      // Check if it's a Google API schema validation error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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

      // For other errors, log and throw (so outer catch can detect failures)
      this.logger.error(`LLM extraction failed for type ${typeName}:`, error);
      // Re-throw the error so the outer catch block can detect it
      throw error;
    }
  }

  /**
   * Build type-specific extraction prompt
   */
  private buildTypeSpecificPrompt(
    typeName: string,
    basePrompt: string,
    documentContent: string,
    objectSchema?: any
  ): string {
    const typeInstructions = this.getTypeInstructions(typeName);

    let prompt = `${basePrompt}

**Entity Type to Extract:** ${typeName}

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
