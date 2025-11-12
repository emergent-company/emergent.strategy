import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Issues from documents
 * Represents a problem or concern that needs attention
 */
export const IssueSchema = BaseExtractedEntitySchema.extend({
  title: z.string().describe('Issue title or summary'),
  description: z.string().describe('Detailed issue description'),

  issue_type: z
    .enum([
      'bug',
      'defect',
      'problem',
      'concern',
      'blocker',
      'question',
      'other',
    ])
    .optional()
    .describe('Type of issue'),

  status: z
    .enum([
      'open',
      'in-progress',
      'resolved',
      'closed',
      'wont-fix',
      'duplicate',
    ])
    .optional()
    .describe('Current status'),

  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .describe('Severity level'),

  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .optional()
    .describe('Priority level'),

  root_cause: z.string().optional().describe('Root cause if known'),

  resolution: z.string().optional().describe('How the issue was resolved'),

  workaround: z.string().optional().describe('Temporary workaround if any'),

  tags: z.array(z.string()).optional().describe('Custom tags'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedIssue = z.infer<typeof IssueSchema>;
