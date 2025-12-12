/**
 * Tier 3: LLM Judge Verification
 *
 * Uses Gemini to make a final verification decision when:
 * - Tier 1 (exact match) fails
 * - Tier 2 (NLI) returns uncertain scores (0.4-0.6 range)
 * - Tier 2 (NLI) is unavailable
 *
 * This is the most expensive tier and should only be used when cheaper methods are inconclusive.
 */

import { GoogleGenAI } from '@google/genai';
import type { LLMJudgeResult, VerificationConfig } from './types';
import { CONFIG } from '../config';

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

// Cached client instance
let cachedClient: GoogleGenAI | null = null;

/**
 * Get Gemini client - uses Vertex AI configuration from the project
 */
function getGeminiClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;

  cachedClient = new GoogleGenAI({
    vertexai: true,
    project: CONFIG.projectId,
    location: CONFIG.location,
  });

  return cachedClient;
}

/**
 * Parse LLM response to extract verification result
 */
function parseLLMResponse(response: string): LLMJudgeResult {
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
function truncateForLLM(text: string, maxChars: number = 4000): string {
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
export async function verifyEntityWithLLM(
  entityName: string,
  entityType: string | undefined,
  sourceText: string,
  config: Pick<VerificationConfig, 'llmJudgeModel'>
): Promise<LLMJudgeResult> {
  try {
    const client = getGeminiClient();

    const prompt = ENTITY_VERIFICATION_PROMPT.replace(
      '{SOURCE_TEXT}',
      truncateForLLM(sourceText)
    )
      .replace('{ENTITY_NAME}', entityName)
      .replace('{ENTITY_TYPE}', entityType || 'unknown');

    const result = await client.models.generateContent({
      model: config.llmJudgeModel,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const response = result.text ?? '';
    return parseLLMResponse(response);
  } catch (error) {
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
export async function verifyPropertyWithLLM(
  entityName: string,
  propertyName: string,
  propertyValue: string,
  sourceText: string,
  config: Pick<VerificationConfig, 'llmJudgeModel'>
): Promise<LLMJudgeResult> {
  try {
    const client = getGeminiClient();

    const prompt = PROPERTY_VERIFICATION_PROMPT.replace(
      '{SOURCE_TEXT}',
      truncateForLLM(sourceText)
    )
      .replace('{ENTITY_NAME}', entityName)
      .replace('{PROPERTY_NAME}', propertyName)
      .replace('{PROPERTY_VALUE}', propertyValue);

    const result = await client.models.generateContent({
      model: config.llmJudgeModel,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const response = result.text ?? '';
    return parseLLMResponse(response);
  } catch (error) {
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
 * Uses a single prompt for efficiency
 */
export async function verifyBatchWithLLM(
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

  // For small batches, verify individually
  if (claims.length <= 3) {
    const results: LLMJudgeResult[] = [];
    for (const claim of claims) {
      if (claim.propertyName && claim.propertyValue) {
        results.push(
          await verifyPropertyWithLLM(
            claim.entityName,
            claim.propertyName,
            claim.propertyValue,
            sourceText,
            config
          )
        );
      } else {
        results.push(
          await verifyEntityWithLLM(
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
    const client = getGeminiClient();

    const claimsList = claims
      .map((c, i) => {
        if (c.propertyName && c.propertyValue) {
          return `${i + 1}. Entity "${c.entityName}" has ${c.propertyName} = "${
            c.propertyValue
          }"`;
        }
        return `${i + 1}. Entity "${c.entityName}" (type: ${
          c.entityType || 'unknown'
        }) is mentioned`;
      })
      .join('\n');

    const prompt = `You are a verification judge. Verify each claim against the source text.

<source_text>
${truncateForLLM(sourceText)}
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

    const result = await client.models.generateContent({
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
  } catch {
    // Fallback to individual verification
    const results: LLMJudgeResult[] = [];
    for (const claim of claims) {
      if (claim.propertyName && claim.propertyValue) {
        results.push(
          await verifyPropertyWithLLM(
            claim.entityName,
            claim.propertyName,
            claim.propertyValue,
            sourceText,
            config
          )
        );
      } else {
        results.push(
          await verifyEntityWithLLM(
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
