import { Injectable, Logger } from '@nestjs/common';
import { VertexAI } from '@google-cloud/vertexai';
import { AppConfigService } from '../../../common/config/config.service';
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

    constructor(private readonly config: AppConfigService) {
        this.initialize();
    }

    private initialize() {
        const projectId = this.config.vertexAiProjectId;
        const location = this.config.vertexAiLocation;

        if (!projectId) {
            this.logger.warn('Vertex AI not configured: VERTEX_AI_PROJECT_ID missing');
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
        allowedTypes?: string[]
    ): Promise<ExtractionResult> {
        if (!this.isConfigured()) {
            throw new Error('Vertex AI provider not configured');
        }

        const model = this.config.vertexAiModel;
        if (!model) {
            throw new Error('VERTEX_AI_MODEL not configured');
        }

        this.logger.debug(`Extracting entities with model: ${model}`);

        try {
            const generativeModel = this.vertexAI!.getGenerativeModel({
                model: model,
            });

            // Build the prompt
            const fullPrompt = this.buildPrompt(
                documentContent,
                extractionPrompt,
                allowedTypes
            );

            // Call the LLM
            const startTime = Date.now();
            const result = await generativeModel.generateContent({
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                generationConfig: {
                    temperature: 0.1, // Low temperature for structured extraction
                    maxOutputTokens: 8192,
                },
            });

            const duration = Date.now() - startTime;
            this.logger.debug(`LLM response received in ${duration}ms`);

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
                this.logger.error('Failed to parse LLM response as JSON', { text, parseError });
                throw new Error('Invalid JSON response from LLM');
            }

            // Validate and normalize the response
            const entities = this.normalizeEntities(parsed.entities || parsed);
            const discoveredTypes = this.extractDiscoveredTypes(entities);

            // Extract usage metadata
            const usage = response.usageMetadata
                ? {
                    prompt_tokens: response.usageMetadata.promptTokenCount || 0,
                    completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
                    total_tokens: response.usageMetadata.totalTokenCount || 0,
                }
                : undefined;

            this.logger.log(
                `Extracted ${entities.length} entities, discovered ${discoveredTypes.length} types, ` +
                `tokens: ${usage?.total_tokens || 'unknown'}`
            );

            return {
                entities,
                discovered_types: discoveredTypes,
                usage,
                raw_response: response,
            };
        } catch (error) {
            this.logger.error('Entity extraction failed', error);
            throw error;
        }
    }

    private buildPrompt(
        documentContent: string,
        extractionPrompt: string,
        allowedTypes?: string[]
    ): string {
        let prompt = extractionPrompt + '\n\n';

        if (allowedTypes && allowedTypes.length > 0) {
            prompt += `**Allowed Entity Types:**\n${allowedTypes.map(t => `- ${t}`).join('\n')}\n\n`;
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
