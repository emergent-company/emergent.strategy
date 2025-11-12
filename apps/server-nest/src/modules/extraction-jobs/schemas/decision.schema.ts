import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Decisions from documents
 * Represents a decision made during or outside of meetings
 */
export const DecisionSchema = BaseExtractedEntitySchema.extend({
  title: z.string().describe('Brief decision summary'),
  description: z.string().optional().describe('Detailed decision description'),
  rationale: z.string().optional().describe('Why this decision was made'),

  decision_type: z
    .enum([
      'strategic',
      'tactical',
      'technical',
      'organizational',
      'process',
      'product',
      'other',
    ])
    .optional()
    .describe('Type of decision'),

  status: z
    .enum([
      'proposed',
      'under-review',
      'approved',
      'rejected',
      'implemented',
      'reversed',
    ])
    .optional()
    .describe('Current status of the decision'),

  priority: z
    .enum(['critical', 'high', 'medium', 'low'])
    .optional()
    .describe('Decision priority'),

  reversible: z
    .boolean()
    .optional()
    .describe('Whether this decision can be easily reversed'),

  impact_scope: z
    .enum(['team', 'department', 'organization', 'company-wide'])
    .optional()
    .describe('Scope of decision impact'),

  alternatives_considered: z
    .string()
    .optional()
    .describe('Alternative options that were considered'),

  tags: z.array(z.string()).optional().describe('Custom tags'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedDecision = z.infer<typeof DecisionSchema>;
