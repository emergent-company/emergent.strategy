/**
 * Document Router Node
 *
 * Classifies the document into categories (narrative, legal, technical, other)
 * to select the most appropriate extraction strategy.
 *
 * This is an LLM-based node that uses JSON response mode for classification.
 * Note: We use responseMimeType: 'application/json' instead of withStructuredOutput()
 * because withStructuredOutput() causes TypeScript "type instantiation too deep" errors.
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import { Logger } from '@nestjs/common';
import {
  ExtractionGraphState,
  ExtractionGraphStateType,
  DocumentCategory,
  RouterOutputSchema,
} from '../state';
import {
  ROUTER_SYSTEM_PROMPT,
  buildRouterUserPrompt,
} from '../prompts/router.prompts';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import { createNodeSpan } from '../tracing';

const logger = new Logger('DocumentRouterNode');

/**
 * Node configuration
 */
export interface DocumentRouterNodeConfig {
  /** Model name to use for classification */
  modelName: string;
  /** GCP project ID */
  projectId: string;
  /** Vertex AI location */
  location: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Optional LangfuseService for tracing */
  langfuseService?: LangfuseService | null;
}

/**
 * Create the document router node function
 *
 * The node takes the graph state, classifies the document, and returns
 * the updated state with the document category.
 */
export function createDocumentRouterNode(config: DocumentRouterNodeConfig) {
  const {
    modelName,
    projectId,
    location,
    timeoutMs = 30000,
    langfuseService = null,
  } = config;

  // Create model with JSON response mode
  // NOTE: We explicitly set apiKey to undefined to prevent LangChain from
  // using GOOGLE_API_KEY env var. Vertex AI requires OAuth (ADC), not API keys.
  const model = new ChatVertexAI({
    model: modelName,
    apiKey: '', // Empty string bypasses GOOGLE_API_KEY env var, forces ADC auth
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
  } as any);

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const startTime = Date.now();
    logger.debug('Starting document classification');

    // Build the prompt with JSON schema instructions
    const userPrompt = buildRouterUserPrompt(state.original_text);
    const fullPrompt = `${ROUTER_SYSTEM_PROMPT}

**JSON Schema for Response:**
\`\`\`json
{
  "type": "object",
  "properties": {
    "category": { "type": "string", "enum": ["narrative", "legal", "technical", "other"] },
    "reasoning": { "type": "string" }
  },
  "required": ["category"]
}
\`\`\`

Return ONLY a valid JSON object matching this schema. No explanation or markdown.

${userPrompt}`;

    // Create tracing span for this node with full prompt
    const span = createNodeSpan(
      langfuseService,
      state,
      'document_router',
      {
        textLength: state.original_text.length,
        textPreview:
          state.original_text.substring(0, 500) +
          (state.original_text.length > 500 ? '...' : ''),
        prompt: fullPrompt,
      },
      { modelName }
    );

    try {
      const result = await Promise.race([
        model.invoke(fullPrompt),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Router node timed out')),
            timeoutMs
          )
        ),
      ]);

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

      let parsed: { category: string; reasoning?: string };
      try {
        parsed = JSON.parse(cleanedContent);
      } catch {
        logger.warn(
          `Failed to parse router JSON response: ${cleanedContent.substring(
            0,
            200
          )}`
        );
        span.endWithError('JSON parse error');
        return {
          doc_category: 'other',
          feedback_log: ['Router: JSON parse error'],
          node_responses: {
            router: {
              error: 'JSON parse error',
              category: 'other',
              duration_ms: Date.now() - startTime,
            },
          },
        };
      }

      // Validate with Zod
      const validated = RouterOutputSchema.safeParse(parsed);
      const category: DocumentCategory = validated.success
        ? validated.data.category
        : 'other';
      const reasoning = validated.success ? validated.data.reasoning || '' : '';

      logger.log(
        `Document classified as "${category}" in ${
          Date.now() - startTime
        }ms. Reason: ${reasoning.slice(0, 100)}`
      );

      // End tracing span with success
      span.end({ category, reasoning });

      return {
        doc_category: category,
        total_prompt_tokens: 0, // TODO: Extract from response metadata
        total_completion_tokens: 0,
        node_responses: {
          router: {
            category,
            reasoning,
            duration_ms: Date.now() - startTime,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(
        `Document classification failed: ${errorMessage}. Defaulting to "other"`
      );

      // End tracing span with error
      span.endWithError(errorMessage);

      // Default to "other" on error - extraction can still proceed
      return {
        doc_category: 'other',
        feedback_log: [`Router error: ${errorMessage}`],
        node_responses: {
          router: {
            error: errorMessage,
            category: 'other',
            duration_ms: Date.now() - startTime,
          },
        },
      };
    }
  };
}

/**
 * Simple fallback router that uses heuristics instead of LLM
 *
 * Useful for testing or when LLM is not available
 */
export function createHeuristicRouterNode() {
  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const text = state.original_text.toLowerCase();

    let category: DocumentCategory = 'other';

    // Simple heuristics based on common patterns
    if (
      text.includes('chapter') ||
      text.includes('verse') ||
      text.includes('said unto') ||
      text.includes('once upon')
    ) {
      category = 'narrative';
    } else if (
      text.includes('whereas') ||
      text.includes('hereby') ||
      text.includes('party') ||
      text.includes('agreement')
    ) {
      category = 'legal';
    } else if (
      text.includes('api') ||
      text.includes('function') ||
      text.includes('interface') ||
      text.includes('component')
    ) {
      category = 'technical';
    }

    logger.debug(`Heuristic router classified document as "${category}"`);

    return {
      doc_category: category,
      node_responses: {
        router: {
          category,
          method: 'heuristic',
        },
      },
    };
  };
}
