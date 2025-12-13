/**
 * Extraction Prompt Provider
 *
 * Provides prompts for the extraction pipeline with Langfuse integration
 * and local fallback support.
 *
 * This service implements Option A (minimal) from the Langfuse Prompt Management spec:
 * - Fetches prompts from Langfuse when available
 * - Falls back to local prompts when Langfuse is unavailable
 * - Supports dynamic variable injection via compile()
 *
 * Prompt Structure:
 * - Method-specific prompts: entity-extractor-json, entity-extractor-fn, etc.
 * - Retry partials: Prepended to main prompt on retry attempts
 */

import {
  Injectable,
  Logger,
  Inject,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import {
  EXTRACTION_PROMPT_NAMES,
  PromptFetchOptions,
  LangfusePromptClient,
} from '../../../../langfuse/prompts/types';
import {
  ENTITY_EXTRACTOR_SYSTEM_PROMPT,
  buildEntityExtractionPrompt,
  buildEntityRetryPrompt,
  buildEntityRetryPartial,
  ExtractionMethod as EntityExtractionMethod,
} from './entity.prompts';
import {
  RELATIONSHIP_BUILDER_SYSTEM_PROMPT,
  buildRelationshipPrompt,
  buildRelationshipRetryPartial,
  combineChunksForContext,
  ExtractionMethod,
} from './relationship.prompts';
import { InternalEntity, InternalRelationship } from '../state';
import type { ExistingEntityContext } from '../../llm-provider.interface';

/**
 * Result of fetching a prompt - either from Langfuse or local fallback
 */
export interface PromptResult {
  /** The compiled or raw prompt text */
  prompt: string;
  /** Whether this prompt came from Langfuse */
  fromLangfuse: boolean;
  /** Langfuse prompt version (if from Langfuse) */
  version?: number;
  /** Langfuse prompt labels (if from Langfuse) */
  labels?: string[];
  /**
   * The raw LangfusePromptClient object for linking to observations.
   * Only present when fromLangfuse is true.
   */
  langfusePrompt?: LangfusePromptClient;
}

@Injectable()
export class ExtractionPromptProvider implements OnModuleInit {
  private readonly logger = new Logger(ExtractionPromptProvider.name);

  constructor(
    @Optional()
    @Inject(LangfuseService)
    private readonly langfuseService?: LangfuseService
  ) {
    // Note: LangfuseService is not fully initialized until onModuleInit runs
    // so we cannot check isPromptManagementAvailable() here
  }

  onModuleInit() {
    if (this.langfuseService?.isPromptManagementAvailable()) {
      this.logger.log(
        'ExtractionPromptProvider initialized with Langfuse prompt management'
      );
    } else {
      this.logger.log(
        'ExtractionPromptProvider initialized with local prompts only'
      );
    }
  }

  /**
   * Check if Langfuse prompt management is available
   */
  isLangfuseAvailable(): boolean {
    return this.langfuseService?.isPromptManagementAvailable() ?? false;
  }

  /**
   * Get the entity extractor prompt.
   *
   * Attempts to fetch from Langfuse first, falls back to local prompt building.
   * Uses method-specific prompts for better output format control.
   *
   * For Langfuse prompts: Uses a template with {{documentText}}, {{schemaDefinitions}}, {{allowedTypes}}
   * For local fallback: Uses the buildEntityExtractionPrompt function
   *
   * @param documentText - The document text to extract entities from
   * @param objectSchemas - Schema definitions for entity types
   * @param allowedTypes - Optional subset of types to extract
   * @param existingEntities - Optional existing entities for context-aware extraction
   * @param options - Prompt fetch options
   * @param extractionMethod - The extraction method being used (json_freeform or function_calling)
   */
  async getEntityExtractorPrompt(
    documentText: string,
    objectSchemas: Record<string, any>,
    allowedTypes?: string[],
    existingEntities?: ExistingEntityContext[],
    options?: PromptFetchOptions,
    extractionMethod: EntityExtractionMethod = 'json_freeform'
  ): Promise<PromptResult> {
    const typesToExtract = allowedTypes || Object.keys(objectSchemas);

    // Determine which prompt to use based on extraction method
    const promptName =
      extractionMethod === 'function_calling'
        ? EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR_FN
        : EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR_JSON;

    // Try Langfuse first
    if (this.isLangfuseAvailable()) {
      try {
        const langfusePrompt = await this.langfuseService!.getTextPrompt(
          promptName,
          options
        );

        if (langfusePrompt) {
          // Build existing entities context for Langfuse prompt
          const existingEntitiesContext =
            this.formatExistingEntitiesForPrompt(existingEntities);

          // Format schema definitions - LLM needs to know what properties each type has
          // Note: withStructuredOutput only provides OUTPUT schema (response format),
          // NOT the entity type definitions (what a Person is, what properties it has)
          const schemaDefinitions = this.formatSchemaDefinitions(
            objectSchemas,
            typesToExtract
          );

          this.logger.debug(
            `[getEntityExtractorPrompt] documentText length: ${
              documentText.length
            }, allowedTypes: ${typesToExtract.join(', ')}, prompt version: ${
              langfusePrompt.version
            }, existingEntities: ${
              existingEntities?.length || 0
            }, schemaDefinitions length: ${schemaDefinitions.length}`
          );

          const compiled = this.langfuseService!.compilePrompt(langfusePrompt, {
            documentText,
            allowedTypes: typesToExtract.join(', '),
            // Schema definitions tell the LLM what properties each entity type should have
            schemaDefinitions,
            // Add existing entities context for context-aware extraction
            existingEntitiesContext,
          }) as string;

          this.logger.debug(
            `Using Langfuse prompt "${promptName}" v${langfusePrompt.version}, compiled length: ${compiled.length}`
          );

          if (compiled.length === 0) {
            this.logger.error(
              `[getEntityExtractorPrompt] CRITICAL: Compiled prompt is EMPTY! Falling back to local prompt.`
            );
            // Fall through to local fallback
          } else {
            return {
              prompt: compiled,
              fromLangfuse: true,
              version: langfusePrompt.version,
              labels: langfusePrompt.labels,
              langfusePrompt,
            };
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Langfuse prompt "${promptName}", using fallback`,
          error
        );
      }
    }

    // Fallback to local prompt
    this.logger.debug(
      `Using local entity extractor prompt (${extractionMethod}) with ${
        existingEntities?.length || 0
      } existing entities`
    );
    return {
      prompt: buildEntityExtractionPrompt(
        documentText,
        objectSchemas,
        allowedTypes,
        existingEntities,
        extractionMethod
      ),
      fromLangfuse: false,
    };
  }

  /**
   * Get the entity extractor retry prompt.
   *
   * Currently only supports local fallback as retry prompts are highly dynamic.
   */
  async getEntityExtractorRetryPrompt(
    documentText: string,
    currentEntities: InternalEntity[],
    orphanTempIds: string[],
    feedback: string
  ): Promise<PromptResult> {
    // Retry prompts are very dynamic - use local for now
    // Future enhancement: Create a Langfuse template with {{orphanFeedback}}, {{previousResult}}
    return {
      prompt: buildEntityRetryPrompt(
        documentText,
        currentEntities,
        orphanTempIds,
        feedback
      ),
      fromLangfuse: false,
    };
  }

  /**
   * Get the relationship builder prompt.
   *
   * Attempts to fetch from Langfuse first, falls back to local prompt building.
   * Uses semantic chunks for document context to avoid mid-text truncation.
   * Uses method-specific prompts for better output format control.
   *
   * @param documentChunks - Semantically chunked document text (required)
   * @param entities - Extracted entities to build relationships between
   * @param relationshipSchemas - Available relationship type definitions
   * @param existingEntities - Existing entities from project for reference
   * @param orphanTempIds - Entity temp_ids that need relationships
   * @param options - Prompt fetch options (e.g., label for A/B testing)
   * @param extractionMethod - The extraction method being used
   * @throws Error if documentChunks is empty or contains oversized chunks
   */
  async getRelationshipBuilderPrompt(
    documentChunks: string[],
    entities: InternalEntity[],
    relationshipSchemas: Record<string, any>,
    existingEntities?: ExistingEntityContext[],
    orphanTempIds?: string[],
    options?: PromptFetchOptions,
    extractionMethod: ExtractionMethod = 'json_freeform'
  ): Promise<PromptResult> {
    // Determine which prompt to use based on extraction method
    const promptName =
      extractionMethod === 'function_calling'
        ? EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER_FN
        : EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER_JSON;

    // Try Langfuse first
    if (this.isLangfuseAvailable()) {
      try {
        const langfusePrompt = await this.langfuseService!.getTextPrompt(
          promptName,
          options
        );

        if (langfusePrompt) {
          // Combine chunks respecting semantic boundaries
          const { text: documentContext } =
            combineChunksForContext(documentChunks);

          // Format entities as clean bullet list (not JSON)
          const entitiesList = entities
            .map((e) => {
              let line = `- **${e.temp_id}** [${e.type}]: ${e.name}`;
              if (e.description) {
                line += `\n  Description: ${e.description.slice(0, 200)}${
                  e.description.length > 200 ? '...' : ''
                }`;
              }
              return line;
            })
            .join('\n');

          // Format relationship types
          const relationshipTypes =
            this.formatRelationshipTypes(relationshipSchemas);

          const compiled = this.langfuseService!.compilePrompt(langfusePrompt, {
            documentText: documentContext,
            entities: entitiesList,
            relationshipTypes,
          }) as string;

          this.logger.debug(
            `Using Langfuse prompt "${promptName}" v${langfusePrompt.version} with ${extractionMethod} method`
          );

          return {
            prompt: compiled,
            fromLangfuse: true,
            version: langfusePrompt.version,
            labels: langfusePrompt.labels,
            langfusePrompt,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Langfuse prompt "${promptName}", using fallback`,
          error
        );
      }
    }

    // Fallback to local prompt
    this.logger.debug(
      `Using local relationship builder prompt (${extractionMethod})`
    );
    return {
      prompt: buildRelationshipPrompt(
        entities,
        relationshipSchemas,
        documentChunks,
        existingEntities,
        orphanTempIds,
        extractionMethod
      ),
      fromLangfuse: false,
    };
  }

  /**
   * Get the base system prompt for entity extraction.
   * This is useful when you need just the system prompt without document context.
   */
  async getEntityExtractorSystemPrompt(
    _options?: PromptFetchOptions
  ): Promise<PromptResult> {
    // For system prompts, we could have a separate Langfuse prompt
    // For now, return the local constant
    return {
      prompt: ENTITY_EXTRACTOR_SYSTEM_PROMPT,
      fromLangfuse: false,
    };
  }

  /**
   * Get the base system prompt for relationship building.
   */
  async getRelationshipBuilderSystemPrompt(
    _options?: PromptFetchOptions
  ): Promise<PromptResult> {
    return {
      prompt: RELATIONSHIP_BUILDER_SYSTEM_PROMPT,
      fromLangfuse: false,
    };
  }

  // ============================================================================
  // Helper methods for formatting prompt variables
  // ============================================================================

  /**
   * Format schema definitions into a string for prompt injection.
   * Includes property definitions and example entity structures.
   *
   * IMPORTANT: The entity structure has top-level fields (name, type, description)
   * and a `properties` object for type-specific attributes.
   * - name, description are ALWAYS top-level (not in properties)
   * - type-specific attributes (role, tribe, etc.) go in properties
   */
  private formatSchemaDefinitions(
    objectSchemas: Record<string, any>,
    typesToExtract: string[]
  ): string {
    // Fields that are top-level in the entity structure, NOT in properties
    const TOP_LEVEL_FIELDS = ['name', 'description', 'type'];

    let result = '';

    for (const typeName of typesToExtract) {
      const schema = objectSchemas[typeName];
      if (schema) {
        result += `### ${typeName}\n`;
        if (schema.description) {
          result += `${schema.description}\n\n`;
        }

        // Add extraction guidelines if available
        if (schema.extraction_guidelines) {
          result += `**Extraction Guidelines:**\n${schema.extraction_guidelines}\n\n`;
        }

        // Get properties source (handle nested schema structure)
        const propsSource = schema.schema?.properties || schema.properties;
        const requiredList = schema.schema?.required || schema.required || [];

        if (propsSource) {
          // Filter out top-level fields and metadata fields - these go in properties object
          const additionalPropEntries = Object.entries(
            propsSource as Record<string, any>
          ).filter(
            ([propName]) =>
              !TOP_LEVEL_FIELDS.includes(propName) && !propName.startsWith('_')
          );

          if (additionalPropEntries.length > 0) {
            result += `**Additional Properties** (stored in \`properties\` object):\n`;

            for (const [propName, propSchema] of additionalPropEntries) {
              const prop = propSchema as Record<string, any>;
              const required = requiredList.includes(propName) ? '*' : '';
              let propLine = `  - ${propName}${required}`;

              if (prop.type) {
                propLine += ` (${prop.type})`;
              }

              if (prop.enum && Array.isArray(prop.enum)) {
                propLine += `: one of [${prop.enum
                  .map((v: string) => `"${v}"`)
                  .join(', ')}]`;
              } else if (prop.description) {
                propLine += `: ${prop.description}`;
              }

              result += propLine + '\n';
            }
            result += '\n';

            // Generate synthetic example showing correct structure
            // Use more realistic example values based on property descriptions
            const exampleProps: Record<string, any> = {};
            let propIndex = 0;

            for (const [propName, propSchema] of additionalPropEntries) {
              const prop = propSchema as Record<string, any>;
              // Include first few properties as examples
              if (propIndex < 3) {
                if (
                  prop.enum &&
                  Array.isArray(prop.enum) &&
                  prop.enum.length > 0
                ) {
                  exampleProps[propName] = prop.enum[0];
                } else if (prop.type === 'integer' || prop.type === 'number') {
                  exampleProps[propName] = 1;
                } else if (prop.type === 'boolean') {
                  exampleProps[propName] = true;
                } else if (prop.type === 'array') {
                  // Generate contextual array example
                  exampleProps[propName] = ['value1', 'value2'];
                } else {
                  // Generate more meaningful example values based on property name
                  exampleProps[propName] = this.generateExampleValue(
                    propName,
                    prop.description
                  );
                }
              }
              propIndex++;
            }

            // Show example with correct structure: name/description top-level, others in properties
            // NO temp_id - that's generated internally, not by LLM
            const syntheticExample = {
              name: this.generateExampleName(typeName),
              type: typeName,
              description: `Brief description of this ${typeName.toLowerCase()}`,
              properties: exampleProps,
            };
            result += `**Example ${typeName} entity:**\n`;
            result +=
              '```json\n' +
              JSON.stringify(syntheticExample, null, 2) +
              '\n```\n';
          } else {
            // No additional properties, just show basic structure
            const basicExample = {
              name: `Example ${typeName} Name`,
              type: typeName,
              description: `Brief description of this ${typeName}`,
            };
            result += `**Example ${typeName} entity:**\n`;
            result +=
              '```json\n' + JSON.stringify(basicExample, null, 2) + '\n```\n';
          }
        }
        result += '\n';
      }
    }

    return result;
  }

  /**
   * Format relationship types into a string for prompt injection
   */
  private formatRelationshipTypes(
    relationshipSchemas: Record<string, any>
  ): string {
    let result = '';

    for (const [typeName, schema] of Object.entries(relationshipSchemas)) {
      result += `### ${typeName}\n`;
      if ((schema as any).description) {
        result += `${(schema as any).description}\n`;
      }
      const sourceTypes =
        (schema as any).source_types || (schema as any).fromTypes || [];
      const targetTypes =
        (schema as any).target_types || (schema as any).toTypes || [];
      if (sourceTypes.length > 0 || targetTypes.length > 0) {
        result += `Allowed: ${sourceTypes.join('|') || 'any'} → ${
          targetTypes.join('|') || 'any'
        }\n`;
      }
      result += '\n';
    }

    return result;
  }

  /**
   * Format existing entities into a string for prompt injection.
   * Groups entities by type and includes similarity scores if available.
   */
  private formatExistingEntitiesForPrompt(
    existingEntities?: ExistingEntityContext[]
  ): string {
    if (!existingEntities || existingEntities.length === 0) {
      return '';
    }

    let result = `
## Existing Entities in Knowledge Graph

These entities already exist. Use their exact names if the document references them:

`;

    // Group by type for easier reading
    const byType = new Map<string, ExistingEntityContext[]>();
    for (const entity of existingEntities) {
      const list = byType.get(entity.type_name) || [];
      list.push(entity);
      byType.set(entity.type_name, list);
    }

    // Show top entities per type (limit to avoid prompt bloat)
    const MAX_PER_TYPE = 10;
    const MAX_TOTAL = 50;
    let totalShown = 0;

    for (const [typeName, entities] of byType) {
      if (totalShown >= MAX_TOTAL) break;

      result += `### ${typeName}\n`;
      const toShow = entities.slice(0, MAX_PER_TYPE);
      for (const entity of toShow) {
        if (totalShown >= MAX_TOTAL) break;
        const similarity = entity.similarity
          ? ` (similarity: ${(entity.similarity * 100).toFixed(0)}%)`
          : '';
        const desc = entity.description
          ? ` - ${entity.description.slice(0, 100)}`
          : '';
        result += `- **${entity.name}**${similarity}${desc}\n`;
        totalShown++;
      }
      if (entities.length > MAX_PER_TYPE) {
        result += `  _(and ${entities.length - MAX_PER_TYPE} more)_\n`;
      }
    }

    return result;
  }

  /**
   * Generate a realistic example name for an entity type
   */
  private generateExampleName(typeName: string): string {
    const examples: Record<string, string> = {
      Person: 'John the Baptist',
      Place: 'Jerusalem',
      Event: 'The Last Supper',
      Group: 'Pharisees',
      Book: 'Genesis',
      Quote: 'In the beginning...',
      Covenant: 'Abrahamic Covenant',
      Prophecy: 'Coming of the Messiah',
      Miracle: 'Healing of the blind man',
      Angel: 'Gabriel',
      Object: 'Ark of the Covenant',
    };
    return examples[typeName] || `Example ${typeName}`;
  }

  /**
   * Generate a realistic example value for a property
   */
  private generateExampleValue(propName: string, description?: string): string {
    // Common property examples
    const examples: Record<string, string> = {
      role: 'prophet',
      tribe: 'Tribe of Judah',
      father: 'Abraham',
      mother: 'Sarah',
      occupation: 'fisherman',
      significance: 'Key figure in early Christianity',
      birth_location: 'Bethlehem',
      death_location: 'Jerusalem',
      region: 'Galilee',
      country: 'Israel',
      author: 'Moses',
      testament: 'Old Testament',
      category: 'Wisdom',
      speaker: 'Jesus',
      context: 'During the Sermon on the Mount',
      leader: 'Moses',
      type: 'city',
      location: 'Mount Sinai',
    };
    return examples[propName] || `example ${propName}`;
  }
}
