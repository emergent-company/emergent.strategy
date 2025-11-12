import { z } from 'zod';

/**
 * Base schema for all extracted entities
 * Common fields that should be present in every extraction
 */
export const BaseExtractedEntitySchema = z.object({
  /**
   * Confidence score from LLM (0.0 - 1.0)
   * Higher scores indicate higher confidence in the extraction
   */
  confidence: z.number().describe('Confidence score from 0 to 1'),

  /**
   * Verbatim text from document that supports this extraction
   * Used for provenance and review
   */
  source_text: z
    .string()
    .optional()
    .describe('Original text from document that supports this extraction'),

  /**
   * Additional reasoning or context from LLM about why this was extracted
   */
  extraction_reasoning: z
    .string()
    .optional()
    .describe('LLM reasoning for this extraction'),
});

/**
 * Helper type to infer TypeScript type from base schema
 */
export type BaseExtractedEntity = z.infer<typeof BaseExtractedEntitySchema>;
