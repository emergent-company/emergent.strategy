import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Requirements from documents
 * Represents a functional or non-functional requirement
 */
export const RequirementSchema = BaseExtractedEntitySchema.extend({
  name: z.string().describe('Short requirement name or identifier'),
  description: z.string().describe('Detailed requirement description'),

  type: z
    .enum([
      'functional',
      'non-functional',
      'business',
      'technical',
      'user',
      'system',
      'other',
    ])
    .optional()
    .describe('Type of requirement'),

  priority: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .describe('Priority level'),

  status: z
    .enum([
      'draft',
      'proposed',
      'approved',
      'in-progress',
      'completed',
      'rejected',
      'deprecated',
    ])
    .optional()
    .describe('Current status'),

  acceptance_criteria: z
    .string()
    .optional()
    .describe('Criteria for completion'),

  tags: z
    .array(z.string())
    .optional()
    .describe('Custom tags for categorization'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedRequirement = z.infer<typeof RequirementSchema>;
