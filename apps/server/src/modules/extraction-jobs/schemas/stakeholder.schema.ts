import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Stakeholders from documents
 * Represents a person or group with interest in the project
 */
export const StakeholderSchema = BaseExtractedEntitySchema.extend({
  name: z.string().describe('Stakeholder name or identifier'),

  role: z.string().optional().describe('Role or position'),

  stakeholder_type: z
    .enum([
      'individual',
      'team',
      'department',
      'organization',
      'customer',
      'partner',
      'vendor',
      'other',
    ])
    .optional()
    .describe('Type of stakeholder'),

  interest_level: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Level of interest in project'),

  influence_level: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Level of influence over project'),

  communication_preference: z
    .string()
    .optional()
    .describe('Preferred communication method'),

  concerns: z.string().optional().describe('Known concerns or interests'),

  expectations: z.string().optional().describe('Expectations from the project'),

  contact_info: z
    .string()
    .optional()
    .describe('Contact information if available'),

  tags: z.array(z.string()).optional().describe('Custom tags'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedStakeholder = z.infer<typeof StakeholderSchema>;
