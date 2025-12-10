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
} from './entity.prompts';
import {
  RELATIONSHIP_BUILDER_SYSTEM_PROMPT,
  buildRelationshipPrompt,
  combineChunksForContext,
} from './relationship.prompts';
import { InternalEntity } from '../state';
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
   *
   * For Langfuse prompts: Uses a template with {{documentText}}, {{schemaDefinitions}}, {{allowedTypes}}
   * For local fallback: Uses the buildEntityExtractionPrompt function
   */
  async getEntityExtractorPrompt(
    documentText: string,
    objectSchemas: Record<string, any>,
    allowedTypes?: string[],
    existingEntities?: ExistingEntityContext[],
    options?: PromptFetchOptions
  ): Promise<PromptResult> {
    const typesToExtract = allowedTypes || Object.keys(objectSchemas);

    // Try Langfuse first
    if (this.isLangfuseAvailable()) {
      try {
        const langfusePrompt = await this.langfuseService!.getTextPrompt(
          EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR,
          options
        );

        if (langfusePrompt) {
          // Build existing entities context for Langfuse prompt
          const existingEntitiesContext =
            this.formatExistingEntitiesForPrompt(existingEntities);

          // v3+ prompts don't need schemaDefinitions - withStructuredOutput provides the schema
          // Only compile with documentText and allowedTypes
          this.logger.debug(
            `[getEntityExtractorPrompt] documentText length: ${
              documentText.length
            }, allowedTypes: ${typesToExtract.join(', ')}, prompt version: ${
              langfusePrompt.version
            }, existingEntities: ${existingEntities?.length || 0}`
          );

          const compiled = this.langfuseService!.compilePrompt(langfusePrompt, {
            documentText,
            allowedTypes: typesToExtract.join(', '),
            // Keep schemaDefinitions for backward compatibility with v1/v2 prompts
            // but v3+ prompts don't use it
            schemaDefinitions: '',
            // Add existing entities context for context-aware extraction
            existingEntitiesContext,
          }) as string;

          this.logger.debug(
            `Using Langfuse prompt "${EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR}" v${langfusePrompt.version}, compiled length: ${compiled.length}`
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
          `Failed to fetch Langfuse prompt "${EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR}", using fallback`,
          error
        );
      }
    }

    // Fallback to local prompt
    this.logger.debug(
      `Using local entity extractor prompt with ${
        existingEntities?.length || 0
      } existing entities`
    );
    return {
      prompt: buildEntityExtractionPrompt(
        documentText,
        objectSchemas,
        allowedTypes,
        existingEntities
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
   *
   * @param documentChunks - Semantically chunked document text (required)
   * @param entities - Extracted entities to build relationships between
   * @param relationshipSchemas - Available relationship type definitions
   * @param existingEntities - Existing entities from project for reference
   * @param orphanTempIds - Entity temp_ids that need relationships
   * @param options - Prompt fetch options (e.g., label for A/B testing)
   * @throws Error if documentChunks is empty or contains oversized chunks
   */
  async getRelationshipBuilderPrompt(
    documentChunks: string[],
    entities: InternalEntity[],
    relationshipSchemas: Record<string, any>,
    existingEntities?: ExistingEntityContext[],
    orphanTempIds?: string[],
    options?: PromptFetchOptions
  ): Promise<PromptResult> {
    // Try Langfuse first
    if (this.isLangfuseAvailable()) {
      try {
        const langfusePrompt = await this.langfuseService!.getTextPrompt(
          EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER,
          options
        );

        if (langfusePrompt) {
          // Combine chunks respecting semantic boundaries
          const { text: documentContext } =
            combineChunksForContext(documentChunks);

          // Format entities for the template
          const entitiesJson = JSON.stringify(
            entities.map((e) => ({
              temp_id: e.temp_id,
              type: e.type,
              name: e.name,
              description: e.description?.slice(0, 200),
            })),
            null,
            2
          );

          // Format relationship types
          const relationshipTypes =
            this.formatRelationshipTypes(relationshipSchemas);

          const compiled = this.langfuseService!.compilePrompt(langfusePrompt, {
            documentText: documentContext,
            entities: entitiesJson,
            relationshipTypes,
          }) as string;

          this.logger.debug(
            `Using Langfuse prompt "${EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER}" v${langfusePrompt.version}`
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
          `Failed to fetch Langfuse prompt "${EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER}", using fallback`,
          error
        );
      }
    }

    // Fallback to local prompt
    this.logger.debug('Using local relationship builder prompt');
    return {
      prompt: buildRelationshipPrompt(
        entities,
        relationshipSchemas,
        documentChunks,
        existingEntities,
        orphanTempIds
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
   */
  private formatSchemaDefinitions(
    objectSchemas: Record<string, any>,
    typesToExtract: string[]
  ): string {
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
          result += `**Properties** (* = required):\n`;
          const propEntries = Object.entries(
            propsSource as Record<string, any>
          ).filter(([name]) => !name.startsWith('_'));

          for (const [name, propSchema] of propEntries) {
            const prop = propSchema as Record<string, any>;
            const required = requiredList.includes(name) ? '*' : '';
            let propLine = `  - ${name}${required}`;

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

          // Add examples if available from schema
          if (
            schema.examples &&
            Array.isArray(schema.examples) &&
            schema.examples.length > 0
          ) {
            result += `**Example ${typeName} entity with properties:**\n`;
            result +=
              '```json\n' +
              JSON.stringify(schema.examples[0], null, 2) +
              '\n```\n';
          } else {
            // Generate synthetic example showing expected properties structure
            const exampleProps: Record<string, any> = {};
            let propIndex = 0;

            for (const [name, propSchema] of propEntries) {
              const prop = propSchema as Record<string, any>;
              // Include required properties and first few optional ones
              if (requiredList.includes(name) || propIndex < 3) {
                if (
                  prop.enum &&
                  Array.isArray(prop.enum) &&
                  prop.enum.length > 0
                ) {
                  exampleProps[name] = prop.enum[0];
                } else if (prop.type === 'integer' || prop.type === 'number') {
                  exampleProps[name] = 1;
                } else if (prop.type === 'boolean') {
                  exampleProps[name] = true;
                } else {
                  exampleProps[name] = `<${name} value>`;
                }
              }
              propIndex++;
            }

            if (Object.keys(exampleProps).length > 0) {
              const syntheticExample = {
                temp_id: `${typeName.toLowerCase()}_example`,
                name: `Example ${typeName}`,
                type: typeName,
                description: `Description of this ${typeName}`,
                properties: exampleProps,
                confidence: 0.9,
              };
              result += `**Example ${typeName} entity structure:**\n`;
              result +=
                '```json\n' +
                JSON.stringify(syntheticExample, null, 2) +
                '\n```\n';
            }
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
}
