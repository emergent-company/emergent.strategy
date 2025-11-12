import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Features from documents
 * Represents a product feature or capability
 */
export const FeatureSchema = BaseExtractedEntitySchema.extend({
  name: z.string().describe('Feature name or title'),
  description: z.string().describe('Detailed feature description'),

  feature_type: z
    .enum([
      'new',
      'enhancement',
      'improvement',
      'refactor',
      'technical',
      'other',
    ])
    .optional()
    .describe('Type of feature'),

  status: z
    .enum([
      'proposed',
      'planned',
      'in-progress',
      'completed',
      'released',
      'deprecated',
      'cancelled',
    ])
    .optional()
    .describe('Current status'),

  priority: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .describe('Priority level'),

  complexity: z
    .enum(['trivial', 'low', 'medium', 'high', 'very-high'])
    .optional()
    .describe('Estimated complexity'),

  user_story: z
    .string()
    .optional()
    .describe('User story format (As a... I want... So that...)'),

  acceptance_criteria: z
    .string()
    .optional()
    .describe('Criteria for feature completion'),

  estimated_effort: z
    .string()
    .optional()
    .describe('Estimated effort (hours, days, story points)'),

  tags: z.array(z.string()).optional().describe('Custom tags'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedFeature = z.infer<typeof FeatureSchema>;
