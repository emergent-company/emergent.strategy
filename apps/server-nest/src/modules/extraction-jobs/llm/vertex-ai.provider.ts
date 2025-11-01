import { Injectable, Logger } from '@nestjs/common';
import { VertexAI } from '@google-cloud/vertexai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { AppConfigService } from '../../../common/config/config.service';
import { MonitoringLoggerService } from '../../monitoring/monitoring-logger.service';
import {
    ILLMProvider,
    ExtractionResult,
    ExtractedEntity,
} from './llm-provider.interface';

/**
 * Google Vertex AI provider for entity extraction
 * 
 * Uses Gemini 1.5 Pro for structured entity extraction from documents.
 */
@Injectable()
export class VertexAIProvider implements ILLMProvider {
    private readonly logger = new Logger(VertexAIProvider.name);
    private vertexAI: VertexAI | null = null;

    constructor(
        private readonly config: AppConfigService,
        private readonly monitoringLogger: MonitoringLoggerService,
    ) {
        this.initialize();
    }

    private initialize() {
        const projectId = this.config.vertexAiProjectId;
        const location = this.config.vertexAiLocation;

        if (!projectId) {
            this.logger.warn('Vertex AI not configured: GCP_PROJECT_ID missing');
            return;
        }

        if (!location) {
            this.logger.warn('Vertex AI not configured: VERTEX_AI_LOCATION missing');
            return;
        }

        try {
            this.vertexAI = new VertexAI({
                project: projectId,
                location: location,
            });
            this.logger.log(`Vertex AI initialized: project=${projectId}, location=${location}`);
        } catch (error) {
            this.logger.error('Failed to initialize Vertex AI', error);
            this.vertexAI = null;
        }
    }

    getName(): string {
        return 'VertexAI';
    }

    isConfigured(): boolean {
        return this.vertexAI !== null;
    }

    async extractEntities(
        documentContent: string,
        extractionPrompt: string,
        objectSchemas: Record<string, any>,
        allowedTypes?: string[],
        availableTags?: string[],
        context?: { jobId: string; projectId: string }
    ): Promise<ExtractionResult> {
        if (!this.isConfigured()) {
            throw new Error('Vertex AI provider not configured');
        }

        const model = this.config.vertexAiModel;
        if (!model) {
            throw new Error('VERTEX_AI_MODEL not configured');
        }

        this.logger.debug(`Extracting entities with model: ${model}`);
        if (availableTags && availableTags.length > 0) {
            this.logger.debug(`Available tags for reuse: ${availableTags.join(', ')}`);
        }

        const startTime = Date.now();
        const allEntities: ExtractedEntity[] = [];
        const discoveredTypes = new Set<string>();
        const debugCalls: any[] = []; // Collect debug info for each LLM call
        let totalTokens = 0;
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        try {
            const generativeModel = this.vertexAI!.getGenerativeModel({
                model: model,
            });

            // Split document into chunks if it's large
            const chunks = await this.splitDocumentIntoChunks(documentContent);

            if (chunks.length > 1) {
                this.logger.log(`Document split into ${chunks.length} chunks for processing`);
            }

            // Process each type separately with its specific schema
            const typesToExtract = allowedTypes || Object.keys(objectSchemas);

            this.logger.debug(`Extracting ${typesToExtract.length} types: ${typesToExtract.join(', ')}`);

            // Process each chunk for each type
            for (const typeName of typesToExtract) {
                const typeStartTime = Date.now();
                const typeEntities: ExtractedEntity[] = [];

                for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                    const chunk = chunks[chunkIndex];
                    const callStart = Date.now();

                    try {
                        const { entities, usage, response } = await this.extractEntitiesForType(
                            generativeModel,
                            typeName,
                            chunk,
                            extractionPrompt,
                            objectSchemas[typeName],
                            availableTags,
                            context
                        );

                        // Accumulate token usage
                        if (usage) {
                            totalTokens += usage.total_tokens;
                            totalPromptTokens += usage.prompt_tokens;
                            totalCompletionTokens += usage.completion_tokens;
                        }

                        // Store debug information for this call
                        debugCalls.push({
                            type: typeName,
                            chunk_index: chunkIndex,
                            chunk_count: chunks.length,
                            input: {
                                document: chunk.substring(0, 500) + (chunk.length > 500 ? '...' : ''),
                                prompt: extractionPrompt,
                                allowed_types: [typeName],
                                available_tags: availableTags || []
                            },
                            output: response,
                            entities_found: entities.length,
                            duration_ms: Date.now() - callStart,
                            timestamp: new Date().toISOString(),
                            model: model,
                            status: 'success',
                            usage: usage
                        });

                        if (entities.length > 0) {
                            typeEntities.push(...entities);
                        }
                    } catch (error) {
                        this.logger.error(`Failed to extract ${typeName} from chunk ${chunkIndex + 1}/${chunks.length}:`, error);

                        // Store error debug information
                        debugCalls.push({
                            type: typeName,
                            chunk_index: chunkIndex,
                            chunk_count: chunks.length,
                            input: {
                                document: chunk.substring(0, 500) + (chunk.length > 500 ? '...' : ''),
                                prompt: extractionPrompt,
                                allowed_types: [typeName],
                                available_tags: availableTags || []
                            },
                            error: error instanceof Error ? error.message : String(error),
                            duration_ms: Date.now() - callStart,
                            timestamp: new Date().toISOString(),
                            model: model,
                            status: 'error'
                        });

                        // Continue with other chunks even if one fails
                    }
                }

                // Deduplicate entities by name within the type
                const deduplicatedEntities = this.deduplicateEntities(typeEntities);

                if (deduplicatedEntities.length > 0) {
                    allEntities.push(...deduplicatedEntities);
                    discoveredTypes.add(typeName);
                    this.logger.debug(
                        `Extracted ${deduplicatedEntities.length} unique ${typeName} entities ` +
                        `(${typeEntities.length} total before deduplication) in ${Date.now() - typeStartTime}ms`
                    );
                }
            }

            const duration = Date.now() - startTime;

            this.logger.log(
                `Extracted ${allEntities.length} total entities across ${discoveredTypes.size} types in ${duration}ms, ` +
                `tokens: ${totalTokens}`
            );

            return {
                entities: allEntities,
                discovered_types: Array.from(discoveredTypes),
                usage: {
                    prompt_tokens: totalPromptTokens,
                    completion_tokens: totalCompletionTokens,
                    total_tokens: totalTokens,
                },
                raw_response: {
                    llm_calls: debugCalls,
                    total_duration_ms: duration,
                    total_entities: allEntities.length,
                    types_processed: typesToExtract.length,
                    chunks_processed: chunks.length
                }
            };
        } catch (error) {
            this.logger.error('Entity extraction failed', error);
            throw error;
        }
    }

    /**
     * Extract entities for a specific type from a single chunk
     */
    private async extractEntitiesForType(
        generativeModel: any,
        typeName: string,
        documentContent: string,
        extractionPrompt: string,
        objectSchema?: any,
        availableTags?: string[],
        context?: { jobId: string; projectId: string }
    ): Promise<{ entities: ExtractedEntity[], usage?: any, response: any }> {
        // Build the prompt with schema for this specific type
        const fullPrompt = this.buildPrompt(
            documentContent,
            extractionPrompt,
            objectSchema ? { [typeName]: objectSchema } : {},
            [typeName],
            availableTags
        );

        // Start monitoring the LLM call
        let callId: string | undefined;
        if (context) {
            try {
                callId = await this.monitoringLogger.startLLMCall({
                    processId: context.jobId,
                    processType: 'extraction_job',
                    modelName: this.config.vertexAiModel || 'unknown',
                    status: 'pending',
                    requestPayload: {
                        type: typeName,
                        prompt_length: fullPrompt.length,
                        document_length: documentContent.length,
                        available_tags: availableTags || [],
                    },
                    projectId: context.projectId,
                });
            } catch (error) {
                this.logger.warn('Failed to start LLM call monitoring', error);
            }
        }

        const llmCallStartTime = Date.now();

        try {
            // Call the LLM
            const result = await generativeModel.generateContent({
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                generationConfig: {
                    temperature: 0.1, // Low temperature for structured extraction
                    maxOutputTokens: 8192,
                },
            });

            // Parse the response
            const response = result.response;
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (!text) {
                throw new Error('Empty response from Vertex AI');
            }

            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
            const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

            let parsed: any;
            try {
                parsed = JSON.parse(jsonText);
            } catch (parseError) {
                // Log full details for debugging
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                const finishReason = response.candidates?.[0]?.finishReason;

                this.logger.error('Failed to parse LLM response as JSON', {
                    rawText: text.substring(0, 5000),
                    extractedJson: jsonText.substring(0, 5000),
                    parseError: errorMessage,
                    responseLength: text.length,
                    finishReason,
                    safetyRatings: response.candidates?.[0]?.safetyRatings,
                });

                // Complete monitoring with error
                if (callId && context) {
                    try {
                        await this.monitoringLogger.completeLLMCall({
                            id: callId,
                            status: 'error',
                            errorMessage: `JSON parse error: ${errorMessage}`,
                            durationMs: Date.now() - llmCallStartTime,
                        });
                    } catch (monitorError) {
                        this.logger.warn('Failed to complete LLM call monitoring', monitorError);
                    }
                }

                // Throw with enhanced error including response metadata
                const error: Error & { responseMetadata?: any } = new Error(
                    finishReason && finishReason !== 'STOP'
                        ? `Invalid JSON response from LLM (finish_reason: ${finishReason})`
                        : 'Invalid JSON response from LLM'
                );

                // Attach metadata for logging
                error.responseMetadata = {
                    rawTextPreview: text.substring(0, 1000),
                    responseLength: text.length,
                    finishReason,
                    extractedJsonPreview: jsonText.substring(0, 1000),
                    parseError: errorMessage,
                };

                throw error;
            }

            // Validate and normalize the response
            const entities = this.normalizeEntities(parsed.entities || parsed);

            // Extract usage metadata
            const usage = response.usageMetadata
                ? {
                    prompt_tokens: response.usageMetadata.promptTokenCount || 0,
                    completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
                    total_tokens: response.usageMetadata.totalTokenCount || 0,
                }
                : undefined;

            // Complete monitoring with success
            if (callId && context && usage) {
                try {
                    await this.monitoringLogger.completeLLMCall({
                        id: callId,
                        responsePayload: {
                            entities_count: entities.length,
                            response_length: text.length,
                            type: typeName,
                        },
                        status: 'success',
                        inputTokens: usage.prompt_tokens,
                        outputTokens: usage.completion_tokens,
                        durationMs: Date.now() - llmCallStartTime,
                    });
                } catch (monitorError) {
                    this.logger.warn('Failed to complete LLM call monitoring', monitorError);
                }
            }

            return { entities, usage, response };
        } catch (error) {
            // Complete monitoring with error if not already done
            if (callId && context) {
                try {
                    await this.monitoringLogger.completeLLMCall({
                        id: callId,
                        status: 'error',
                        errorMessage: error instanceof Error ? error.message : String(error),
                        durationMs: Date.now() - llmCallStartTime,
                    });
                } catch (monitorError) {
                    this.logger.warn('Failed to complete LLM call monitoring', monitorError);
                }
            }

            throw error;
        }
    }

    /**
     * Split document into chunks using LangChain text splitter with overlap
     */
    private async splitDocumentIntoChunks(documentContent: string): Promise<string[]> {
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

    private buildPrompt(
        documentContent: string,
        extractionPrompt: string,
        objectSchemas: Record<string, any>,
        allowedTypes?: string[],
        availableTags?: string[]
    ): string {
        let prompt = extractionPrompt + '\n\n';

        // Add object type schemas if available
        if (Object.keys(objectSchemas).length > 0) {
            prompt += '**Object Type Schemas:**\n';
            prompt += 'Extract entities matching these schema definitions:\n\n';

            // Determine which schemas to show
            const schemasToShow = allowedTypes && allowedTypes.length > 0
                ? allowedTypes.filter(type => objectSchemas[type])
                : Object.keys(objectSchemas);

            for (const typeName of schemasToShow) {
                const schema = objectSchemas[typeName];
                prompt += `**${typeName}:**\n`;

                if (schema.description) {
                    prompt += `${schema.description}\n\n`;
                }

                if (schema.properties) {
                    prompt += 'Properties:\n';
                    for (const [propName, propDef] of Object.entries(schema.properties as Record<string, any>)) {
                        const required = schema.required?.includes(propName) ? ' (required)' : '';
                        const description = propDef.description || '';
                        const typeInfo = propDef.type ? ` [${propDef.type}]` : '';
                        const enumInfo = propDef.enum ? ` (options: ${propDef.enum.join(', ')})` : '';
                        prompt += `  - ${propName}${required}${typeInfo}${enumInfo}: ${description}\n`;
                    }
                }

                // Add examples if available
                if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
                    prompt += '\nExamples:\n';
                    for (const example of schema.examples) {
                        prompt += '```json\n' + JSON.stringify(example, null, 2) + '\n```\n';
                    }
                }

                prompt += '\n';
            }
            prompt += '\n';
        }

        if (allowedTypes && allowedTypes.length > 0) {
            prompt += `**Allowed Entity Types:**\n${allowedTypes.map(t => `- ${t}`).join('\n')}\n\n`;
        }

        // Add available tags for consistency
        if (availableTags && availableTags.length > 0) {
            prompt += `**Available Tags:**\n`;
            prompt += 'When adding tags to entities, prefer using tags from this existing list for consistency:\n';
            prompt += availableTags.map(t => `- ${t}`).join('\n') + '\n';
            prompt += 'Only create new tags if none of the existing tags are semantically appropriate.\n';
            prompt += 'Tags should be lowercase, hyphenated (e.g., "high-priority", "backend-service").\n\n';
        }

        prompt += '**Document Content:**\n\n' + documentContent + '\n\n';
        prompt += '**Instructions:**\n';
        prompt += 'Extract entities as a JSON array with the following structure:\n';
        prompt += '```json\n';
        prompt += '{\n';
        prompt += '  "entities": [\n';
        prompt += '    {\n';
        prompt += '      "type_name": "Entity Type",\n';
        prompt += '      "name": "Entity Name",\n';
        prompt += '      "description": "Detailed description",\n';
        prompt += '      "business_key": "optional-unique-key",\n';
        prompt += '      "properties": { "key": "value" },\n';
        prompt += '      "confidence": 0.95\n';
        prompt += '    }\n';
        prompt += '  ]\n';
        prompt += '}\n';
        prompt += '```\n\n';
        prompt += 'Return ONLY valid JSON, no additional text.';

        return prompt;
    }

    private normalizeEntities(data: any): ExtractedEntity[] {
        if (!data) {
            return [];
        }

        // Handle both array and object with entities field
        const entityList = Array.isArray(data) ? data : data.entities || [];

        return entityList
            .filter((e: any) => e && e.type_name && e.name)
            .map((e: any) => ({
                type_name: String(e.type_name).trim(),
                name: String(e.name).trim(),
                description: String(e.description || '').trim(),
                business_key: e.business_key ? String(e.business_key).trim() : undefined,
                properties: e.properties || {},
                confidence: typeof e.confidence === 'number' ? e.confidence : 0.8,
            }));
    }

    private extractDiscoveredTypes(entities: ExtractedEntity[]): string[] {
        const types = new Set<string>();
        entities.forEach(e => types.add(e.type_name));
        return Array.from(types);
    }
}
