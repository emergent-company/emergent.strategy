import { Injectable, Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import { AppConfigService } from '../../../common/config/config.service';
import {
    ILLMProvider,
    ExtractionResult,
    ExtractedEntity,
} from './llm-provider.interface';
import { getSchemaForType } from '../schemas';

/**
 * LangChain + Google Gemini provider for entity extraction
 * 
 * Uses ChatGoogleGenerativeAI with .withStructuredOutput() for type-safe extraction.
 * Follows the same pattern as chat-generation.service.ts for consistency.
 */
@Injectable()
export class LangChainGeminiProvider implements ILLMProvider {
    private readonly logger = new Logger(LangChainGeminiProvider.name);
    private model: ChatGoogleGenerativeAI | null = null;

    constructor(private readonly config: AppConfigService) {
        this.initialize();
    }

    private initialize() {
        const apiKey = this.config.googleApiKey; // Shared with chat service

        if (!apiKey) {
            this.logger.warn('LangChain Gemini not configured: GOOGLE_API_KEY missing');
            return;
        }

        // Debug: Log the API key being used (masked for security)
        const maskedKey = apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'undefined';
        const modelName = this.config.vertexAiModel || 'gemini-2.5-flash';

        // Force console.log to ensure we see this
        // eslint-disable-next-line no-console
        console.log(`[LangChainGeminiProvider] Initializing with API key: ${maskedKey} (length: ${apiKey?.length || 0}), model: ${modelName}`);
        this.logger.log(`Using API key: ${maskedKey} (length: ${apiKey?.length || 0}), model: ${modelName}`);

        try {
            // Use same model configuration as chat service for consistency
            this.model = new ChatGoogleGenerativeAI({
                apiKey: apiKey,
                model: modelName,
                temperature: 0, // Deterministic for extraction
                maxOutputTokens: 8192,
            });

            this.logger.log(`LangChain Gemini initialized: model=${modelName}`);
        } catch (error) {
            this.logger.error('Failed to initialize LangChain Gemini', error);
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
        allowedTypes?: string[]
    ): Promise<ExtractionResult> {
        if (!this.isConfigured()) {
            throw new Error('LangChain Gemini provider not configured');
        }

        const startTime = Date.now();
        const allEntities: ExtractedEntity[] = [];
        const discoveredTypes = new Set<string>();
        const debugCalls: any[] = []; // Collect debug info for each LLM call

        // Process each type separately with its specific schema
        const typesToExtract = allowedTypes || this.getAvailableSchemas();

        this.logger.debug(`Extracting ${typesToExtract.length} types: ${typesToExtract.join(', ')}`);

        for (const typeName of typesToExtract) {
            const callStart = Date.now();
            try {
                const { entities, prompt, rawResponse } = await this.extractEntitiesForType(
                    typeName,
                    documentContent,
                    extractionPrompt
                );

                // Store debug information for this call
                debugCalls.push({
                    type: typeName,
                    input: {
                        document: documentContent.substring(0, 500) + (documentContent.length > 500 ? '...' : ''), // Truncate for storage
                        prompt: prompt,
                        allowed_types: [typeName]
                    },
                    output: rawResponse,
                    entities_found: entities.length,
                    duration_ms: Date.now() - callStart,
                    timestamp: new Date().toISOString(),
                    model: this.config.vertexAiModel || 'gemini-2.5-flash',
                    status: 'success'
                });

                if (entities.length > 0) {
                    allEntities.push(...entities);
                    discoveredTypes.add(typeName);
                    this.logger.debug(`Extracted ${entities.length} ${typeName} entities`);
                }
            } catch (error) {
                this.logger.error(`Failed to extract ${typeName}:`, error);

                // Store error debug information
                debugCalls.push({
                    type: typeName,
                    input: {
                        document: documentContent.substring(0, 500) + (documentContent.length > 500 ? '...' : ''),
                        prompt: extractionPrompt,
                        allowed_types: [typeName]
                    },
                    error: error instanceof Error ? error.message : String(error),
                    duration_ms: Date.now() - callStart,
                    timestamp: new Date().toISOString(),
                    model: this.config.vertexAiModel || 'gemini-2.5-flash',
                    status: 'error'
                });

                // Continue with other types even if one fails
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
                types_processed: typesToExtract.length
            }
        };
    }

    /**
     * Extract entities for a specific type using its Zod schema
     */
    private async extractEntitiesForType(
        typeName: string,
        documentContent: string,
        basePrompt: string
    ): Promise<{ entities: ExtractedEntity[]; prompt: string; rawResponse: any }> {
        const schema = getSchemaForType(typeName);

        if (!schema) {
            this.logger.warn(`No schema found for type: ${typeName}, skipping`);
            return { entities: [], prompt: basePrompt, rawResponse: null };
        }

        // Create array schema to extract multiple entities
        const arraySchema = z.object({
            entities: z.array(schema as any), // Use any to avoid deep type instantiation
        });

        // Build type-specific prompt
        const typePrompt = this.buildTypeSpecificPrompt(typeName, basePrompt, documentContent);

        // Use structured output with Zod schema
        const structuredModel = this.model!.withStructuredOutput(arraySchema as any, {
            name: `extract_${typeName.toLowerCase()}`,
        });

        try {
            // Invoke the model with structured output
            const result: any = await structuredModel.invoke(typePrompt);

            // Transform to ExtractedEntity format
            const entities: ExtractedEntity[] = (result.entities || []).map((entity: any) => ({
                type_name: typeName,
                name: this.extractName(entity, typeName),
                description: this.extractDescription(entity),
                business_key: this.extractBusinessKey(entity),
                properties: this.extractProperties(entity),
                confidence: entity.confidence || 0.8, // Default if not provided
            }));

            return {
                entities,
                prompt: typePrompt,
                rawResponse: result
            };
        } catch (error) {
            // Check if it's a JSON parsing error from malformed LLM response
            if (error instanceof SyntaxError && error.message.includes('JSON')) {
                this.logger.warn(`JSON parsing error for ${typeName}: ${error.message}`);
                this.logger.warn('The LLM returned malformed JSON. Skipping this entity type.');

                // Return empty result instead of crashing the entire extraction
                return {
                    entities: [],
                    prompt: typePrompt,
                    rawResponse: { error: 'JSON parsing failed', message: error.message }
                };
            }

            // Check if it's a Google API schema validation error
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('Invalid JSON payload')) {
                this.logger.warn(`Google API schema validation error for ${typeName}: ${errorMessage}`);
                this.logger.warn('The schema contains unsupported JSON Schema features. Skipping this entity type.');

                // Return empty result instead of crashing
                return {
                    entities: [],
                    prompt: typePrompt,
                    rawResponse: { error: 'Schema validation failed', message: errorMessage }
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
        documentContent: string
    ): string {
        const typeInstructions = this.getTypeInstructions(typeName);

        return `${basePrompt}

**Entity Type to Extract:** ${typeName}

${typeInstructions}

**Instructions:**
- Extract ALL ${typeName} entities found in the document
- For each entity, provide a confidence score (0.0-1.0)
- Include the original text snippet that supports the extraction
- If no ${typeName} entities are found, return an empty array

**Document Content:**

${documentContent}

**Output:** Return a JSON object with an "entities" array containing the extracted ${typeName} entities.`;
    }

    /**
     * Get type-specific extraction instructions
     */
    private getTypeInstructions(typeName: string): string {
        const instructions: Record<string, string> = {
            Requirement: 'Extract functional and non-functional requirements. Look for statements of what the system must do or constraints it must satisfy.',
            Decision: 'Extract decisions made or proposed. Look for conclusions, choices, or determinations about how to proceed.',
            Feature: 'Extract product features or capabilities. Look for descriptions of functionality or user-facing capabilities.',
            Task: 'Extract actionable tasks and action items. Look for assignments, todos, or specific actions that need to be taken.',
            Risk: 'Extract potential risks or threats. Look for concerns, potential problems, or uncertainties.',
            Issue: 'Extract problems or concerns. Look for bugs, defects, blockers, or current problems.',
            Stakeholder: 'Extract people or groups mentioned. Look for individuals, teams, departments, or organizations involved.',
            Constraint: 'Extract limitations or restrictions. Look for boundaries, limitations, or fixed constraints on the project.',
        };

        return instructions[typeName] || `Extract ${typeName} entities from the document.`;
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
        const { confidence, source_text, extraction_reasoning, ...properties } = entity;
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
