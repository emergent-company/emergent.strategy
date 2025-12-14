/**
 * Tier 3: LLM Judge Verification Service
 *
 * Uses Gemini to make a final verification decision when:
 * - Tier 1 (exact match) fails
 * - Tier 2 (NLI) returns uncertain scores (0.4-0.6 range)
 * - Tier 2 (NLI) is unavailable
 *
 * This is the most expensive tier and should only be used when cheaper methods are inconclusive.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import type { LLMJudgeResult, VerificationConfig } from './types';
import { AppConfigService } from '../../common/config/config.service';

// LLM Judge prompts
const ENTITY_VERIFICATION_PROMPT = `You are a verification judge. Your task is to determine if an extracted entity is mentioned in the source text.

<source_text>
{SOURCE_TEXT}
</source_text>

<entity>
Name: {ENTITY_NAME}
Type: {ENTITY_TYPE}
</entity>

Instructions:
1. Check if the entity "{ENTITY_NAME}" is mentioned in the source text
2. Consider variations in spelling, case, or minor formatting differences
3. The entity type "{ENTITY_TYPE}" should match what's described in the text

Respond in this exact JSON format:
{
  "verified": true or false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of your decision"
}`;

const PROPERTY_VERIFICATION_PROMPT = `You are a verification judge. Your task is to determine if an extracted property value is supported by the source text.

<source_text>
{SOURCE_TEXT}
</source_text>

<claim>
Entity: {ENTITY_NAME}
Property: {PROPERTY_NAME}
Value: {PROPERTY_VALUE}
</claim>

Instructions:
1. Check if the source text supports that "{ENTITY_NAME}" has "{PROPERTY_NAME}" equal to "{PROPERTY_VALUE}"
2. Consider variations in phrasing, synonyms, or equivalent expressions
3. The claim must be explicitly or clearly implied by the source text

Respond in this exact JSON format:
{
  "verified": true or false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of your decision"
}`;

const DESCRIPTION_VERIFICATION_PROMPT = `You are a verification judge. Your task is to determine if a description is supported by the source text.

<source_text>
{SOURCE_TEXT}
</source_text>

<description>
{DESCRIPTION}
</description>

Instructions:
1. Check if the description is supported by the source text
2. The description should be factually accurate based on what the source text says
3. Consider paraphrasing and equivalent expressions
4. The description doesn't need to be verbatim, but must be consistent with the source

Respond in this exact JSON format:
{
  "verified": true or false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of your decision"
}`;

const RELATIONSHIP_EXISTS_PROMPT = `You are a verification judge. Your task is to determine if two entities are related in the source text.

<source_text>
{SOURCE_TEXT}
</source_text>

<entities>
Entity 1: {SOURCE_NAME}
Entity 2: {TARGET_NAME}
</entities>

Instructions:
1. Check if both entities are mentioned in the source text
2. Determine if there is any relationship or connection between them
3. They don't need to be in the same sentence, but there should be some connection

Respond in this exact JSON format:
{
  "verified": true or false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of your decision"
}`;

const RELATIONSHIP_TYPE_PROMPT = `You are a verification judge. Your task is to determine if the relationship type between two entities is semantically correct based on the source text.

<source_text>
{SOURCE_TEXT}
</source_text>

<relationship>
Source: {SOURCE_NAME}
Target: {TARGET_NAME}
Relationship Type: {RELATIONSHIP_TYPE}
{SCHEMA_CONTEXT}
</relationship>

Instructions:
1. Check if the relationship type correctly describes how the source entity relates to the target entity
2. The relationship can be EXPLICITLY stated OR IMPLICITLY supported by the text
3. Accept equivalent expressions, synonyms, and contextually appropriate variations
4. Consider the schema description and valid entity types when evaluating

Respond in this exact JSON format:
{
  "verified": true or false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of your decision"
}`;

@Injectable()
export class LLMJudgeService {
  private readonly logger = new Logger(LLMJudgeService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {
    this.initializeClient();
  }

  private initializeClient() {
    try {
      const projectId = this.config.vertexAiProjectId;
      const location = this.config.vertexAiLocation || 'us-central1';

      if (!projectId) {
        this.logger.warn(
          'LLM Judge service disabled: VERTEX_AI_PROJECT_ID not configured'
        );
        return;
      }

      this.client = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location,
      });

      this.logger.log(`LLM Judge initialized with project: ${projectId}`);
    } catch (error) {
      this.logger.error('Failed to initialize LLM Judge client', error);
      this.client = null;
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Parse LLM response to extract verification result
   */
  private parseLLMResponse(response: string): LLMJudgeResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        verified: Boolean(parsed.verified),
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        explanation: parsed.explanation || 'No explanation provided',
        rawResponse: response,
      };
    } catch {
      // Fallback: try to infer from text
      const lowerResponse = response.toLowerCase();
      const verified =
        lowerResponse.includes('"verified": true') ||
        lowerResponse.includes('"verified":true') ||
        (lowerResponse.includes('verified') &&
          !lowerResponse.includes('not verified'));

      return {
        verified,
        confidence: 0.5,
        explanation: 'Could not parse structured response',
        rawResponse: response,
      };
    }
  }

  /**
   * Truncate source text for LLM context
   */
  private truncateForLLM(text: string, maxChars: number = 4000): string {
    if (text.length <= maxChars) return text;

    const truncated = text.substring(0, maxChars);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');

    const breakPoint = Math.max(lastPeriod, lastNewline);
    if (breakPoint > maxChars * 0.5) {
      return (
        truncated.substring(0, breakPoint + 1) + '\n[... text truncated ...]'
      );
    }

    return truncated + '\n[... text truncated ...]';
  }

  /**
   * Verify entity using LLM Judge (Tier 3)
   */
  async verifyEntity(
    entityName: string,
    entityType: string | undefined,
    sourceText: string,
    config: Pick<VerificationConfig, 'llmJudgeModel'>
  ): Promise<LLMJudgeResult> {
    if (!this.client) {
      return {
        verified: false,
        confidence: 0,
        explanation: 'LLM Judge service not available',
      };
    }

    try {
      const prompt = ENTITY_VERIFICATION_PROMPT.replace(
        '{SOURCE_TEXT}',
        this.truncateForLLM(sourceText)
      )
        .replace('{ENTITY_NAME}', entityName)
        .replace('{ENTITY_TYPE}', entityType || 'unknown');

      const result = await this.client.models.generateContent({
        model: config.llmJudgeModel,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const response = result.text ?? '';
      return this.parseLLMResponse(response);
    } catch (error) {
      this.logger.error('LLM Judge entity verification failed', error);
      return {
        verified: false,
        confidence: 0,
        explanation: `LLM Judge error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Verify property using LLM Judge (Tier 3)
   */
  async verifyProperty(
    entityName: string,
    propertyName: string,
    propertyValue: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'llmJudgeModel'>
  ): Promise<LLMJudgeResult> {
    if (!this.client) {
      return {
        verified: false,
        confidence: 0,
        explanation: 'LLM Judge service not available',
      };
    }

    try {
      const prompt = PROPERTY_VERIFICATION_PROMPT.replace(
        '{SOURCE_TEXT}',
        this.truncateForLLM(sourceText)
      )
        .replace('{ENTITY_NAME}', entityName)
        .replace('{PROPERTY_NAME}', propertyName)
        .replace('{PROPERTY_VALUE}', propertyValue);

      const result = await this.client.models.generateContent({
        model: config.llmJudgeModel,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const response = result.text ?? '';
      return this.parseLLMResponse(response);
    } catch (error) {
      this.logger.error('LLM Judge property verification failed', error);
      return {
        verified: false,
        confidence: 0,
        explanation: `LLM Judge error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Batch verify multiple claims with LLM Judge
   */
  async verifyBatch(
    claims: Array<{
      entityName: string;
      entityType?: string;
      propertyName?: string;
      propertyValue?: string;
    }>,
    sourceText: string,
    config: Pick<VerificationConfig, 'llmJudgeModel'>
  ): Promise<LLMJudgeResult[]> {
    if (claims.length === 0) return [];

    if (!this.client) {
      return claims.map(() => ({
        verified: false,
        confidence: 0,
        explanation: 'LLM Judge service not available',
      }));
    }

    // For small batches, verify individually
    if (claims.length <= 3) {
      const results: LLMJudgeResult[] = [];
      for (const claim of claims) {
        if (claim.propertyName && claim.propertyValue) {
          results.push(
            await this.verifyProperty(
              claim.entityName,
              claim.propertyName,
              claim.propertyValue,
              sourceText,
              config
            )
          );
        } else {
          results.push(
            await this.verifyEntity(
              claim.entityName,
              claim.entityType,
              sourceText,
              config
            )
          );
        }
      }
      return results;
    }

    // For larger batches, use batch prompt
    try {
      const claimsList = claims
        .map((c, i) => {
          if (c.propertyName && c.propertyValue) {
            return `${i + 1}. Entity "${c.entityName}" has ${
              c.propertyName
            } = "${c.propertyValue}"`;
          }
          return `${i + 1}. Entity "${c.entityName}" (type: ${
            c.entityType || 'unknown'
          }) is mentioned`;
        })
        .join('\n');

      const prompt = `You are a verification judge. Verify each claim against the source text.

<source_text>
${this.truncateForLLM(sourceText)}
</source_text>

<claims>
${claimsList}
</claims>

For each claim, determine if it is supported by the source text.

Respond with a JSON array in this exact format:
[
  {"index": 1, "verified": true/false, "confidence": 0.0-1.0, "explanation": "brief reason"},
  {"index": 2, "verified": true/false, "confidence": 0.0-1.0, "explanation": "brief reason"},
  ...
]`;

      const result = await this.client.models.generateContent({
        model: config.llmJudgeModel,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const response = result.text ?? '';

      // Parse batch response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        index: number;
        verified: boolean;
        confidence: number;
        explanation: string;
      }>;

      // Map results back to claims order
      return claims.map((_, i) => {
        const item = parsed.find((p) => p.index === i + 1);
        if (item) {
          return {
            verified: Boolean(item.verified),
            confidence: item.confidence,
            explanation: item.explanation,
            rawResponse: response,
          };
        }
        return {
          verified: false,
          confidence: 0,
          explanation: 'No result found for this claim',
          rawResponse: response,
        };
      });
    } catch (error) {
      this.logger.warn(
        'Batch verification failed, falling back to individual',
        error
      );
      // Fallback to individual verification
      const results: LLMJudgeResult[] = [];
      for (const claim of claims) {
        if (claim.propertyName && claim.propertyValue) {
          results.push(
            await this.verifyProperty(
              claim.entityName,
              claim.propertyName,
              claim.propertyValue,
              sourceText,
              config
            )
          );
        } else {
          results.push(
            await this.verifyEntity(
              claim.entityName,
              claim.entityType,
              sourceText,
              config
            )
          );
        }
      }
      return results;
    }
  }

  /**
   * Verify a description using LLM Judge (Tier 3)
   */
  async verifyDescription(
    description: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'llmJudgeModel'>
  ): Promise<LLMJudgeResult> {
    if (!this.client) {
      return {
        verified: false,
        confidence: 0,
        explanation: 'LLM Judge service not available',
      };
    }

    try {
      const prompt = DESCRIPTION_VERIFICATION_PROMPT.replace(
        '{SOURCE_TEXT}',
        this.truncateForLLM(sourceText)
      ).replace('{DESCRIPTION}', description);

      const result = await this.client.models.generateContent({
        model: config.llmJudgeModel,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const response = result.text ?? '';
      return this.parseLLMResponse(response);
    } catch (error) {
      this.logger.error('LLM Judge description verification failed', error);
      return {
        verified: false,
        confidence: 0,
        explanation: `LLM Judge error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Verify that two entities have some relationship using LLM Judge (Tier 3)
   */
  async verifyRelationshipExists(
    sourceName: string,
    targetName: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'llmJudgeModel'>
  ): Promise<LLMJudgeResult> {
    if (!this.client) {
      return {
        verified: false,
        confidence: 0,
        explanation: 'LLM Judge service not available',
      };
    }

    try {
      const prompt = RELATIONSHIP_EXISTS_PROMPT.replace(
        '{SOURCE_TEXT}',
        this.truncateForLLM(sourceText)
      )
        .replace('{SOURCE_NAME}', sourceName)
        .replace('{TARGET_NAME}', targetName);

      const result = await this.client.models.generateContent({
        model: config.llmJudgeModel,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const response = result.text ?? '';
      return this.parseLLMResponse(response);
    } catch (error) {
      this.logger.error(
        'LLM Judge relationship existence verification failed',
        error
      );
      return {
        verified: false,
        confidence: 0,
        explanation: `LLM Judge error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Verify that a relationship type is correct using LLM Judge (Tier 3)
   */
  async verifyRelationshipType(
    sourceName: string,
    targetName: string,
    relationshipType: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'llmJudgeModel'>,
    schema?: {
      description?: string;
      label?: string;
      inverseLabel?: string;
      fromTypes?: string[];
      toTypes?: string[];
      semanticHints?: string[];
    }
  ): Promise<LLMJudgeResult> {
    if (!this.client) {
      return {
        verified: false,
        confidence: 0,
        explanation: 'LLM Judge service not available',
      };
    }

    try {
      // Build schema context if available
      let schemaContext = '';
      if (schema) {
        const parts: string[] = [];
        if (schema.description) {
          parts.push(`Description: ${schema.description}`);
        }
        if (schema.label) {
          parts.push(`Label: "${schema.label}"`);
        }
        if (schema.inverseLabel) {
          parts.push(`Inverse: "${schema.inverseLabel}"`);
        }
        if (schema.fromTypes?.length) {
          parts.push(`Valid source types: ${schema.fromTypes.join(', ')}`);
        }
        if (schema.toTypes?.length) {
          parts.push(`Valid target types: ${schema.toTypes.join(', ')}`);
        }
        if (schema.semanticHints?.length) {
          parts.push(
            `Semantic equivalents: ${schema.semanticHints.join(', ')}`
          );
        }
        if (parts.length > 0) {
          schemaContext = parts.join('\n');
        }
      }

      const prompt = RELATIONSHIP_TYPE_PROMPT.replace(
        '{SOURCE_TEXT}',
        this.truncateForLLM(sourceText)
      )
        .replace('{SOURCE_NAME}', sourceName)
        .replace('{TARGET_NAME}', targetName)
        .replace('{RELATIONSHIP_TYPE}', relationshipType)
        .replace('{SCHEMA_CONTEXT}', schemaContext ? `\n${schemaContext}` : '');

      const result = await this.client.models.generateContent({
        model: config.llmJudgeModel,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const response = result.text ?? '';
      return this.parseLLMResponse(response);
    } catch (error) {
      this.logger.error(
        'LLM Judge relationship type verification failed',
        error
      );
      return {
        verified: false,
        confidence: 0,
        explanation: `LLM Judge error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }
}
