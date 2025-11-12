import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Risks from documents
 * Represents a potential risk or threat to project success
 */
export const RiskSchema = BaseExtractedEntitySchema.extend({
  title: z.string().describe('Risk title or summary'),
  description: z.string().describe('Detailed risk description'),

  risk_type: z
    .enum([
      'technical',
      'business',
      'operational',
      'financial',
      'security',
      'compliance',
      'reputational',
      'schedule',
      'resource',
      'other',
    ])
    .optional()
    .describe('Type of risk'),

  status: z
    .enum([
      'identified',
      'assessed',
      'mitigated',
      'monitored',
      'closed',
      'realized',
    ])
    .optional()
    .describe('Current status'),

  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .describe('Severity if realized'),

  probability: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Probability of occurrence'),

  impact: z.string().optional().describe('Potential impact if realized'),

  mitigation_strategy: z
    .string()
    .optional()
    .describe('How to mitigate or prevent this risk'),

  contingency_plan: z.string().optional().describe('Plan if risk is realized'),

  tags: z.array(z.string()).optional().describe('Custom tags'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedRisk = z.infer<typeof RiskSchema>;
