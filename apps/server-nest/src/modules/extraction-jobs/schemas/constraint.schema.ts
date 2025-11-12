import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Constraints from documents
 * Represents a limitation or restriction on the project
 */
export const ConstraintSchema = BaseExtractedEntitySchema.extend({
  title: z.string().describe('Constraint title or summary'),
  description: z.string().describe('Detailed constraint description'),

  constraint_type: z
    .enum([
      'technical',
      'business',
      'resource',
      'time',
      'budget',
      'regulatory',
      'legal',
      'policy',
      'environmental',
      'other',
    ])
    .optional()
    .describe('Type of constraint'),

  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .describe('Impact severity'),

  is_negotiable: z
    .boolean()
    .optional()
    .describe('Whether this constraint can be negotiated'),

  impact: z
    .string()
    .optional()
    .describe('How this constraint impacts the project'),

  mitigation: z
    .string()
    .optional()
    .describe('Ways to work within or around this constraint'),

  tags: z.array(z.string()).optional().describe('Custom tags'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedConstraint = z.infer<typeof ConstraintSchema>;
