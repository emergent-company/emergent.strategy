import { z } from 'zod';
import { BaseExtractedEntitySchema } from './base.schema';

/**
 * Schema for extracting Tasks from documents
 * Represents an actionable task or action item
 */
export const TaskSchema = BaseExtractedEntitySchema.extend({
  title: z.string().describe('Task title or summary'),
  description: z.string().optional().describe('Detailed task description'),

  task_type: z
    .enum([
      'action-item',
      'todo',
      'bug',
      'research',
      'review',
      'follow-up',
      'other',
    ])
    .optional()
    .describe('Type of task'),

  status: z
    .enum([
      'todo',
      'in-progress',
      'blocked',
      'completed',
      'cancelled',
      'deferred',
    ])
    .optional()
    .describe('Current status'),

  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .optional()
    .describe('Priority level'),

  due_date: z
    .string()
    .optional()
    .describe('Due date (ISO format or natural language)'),

  estimated_hours: z.number().optional().describe('Estimated effort in hours'),

  blocking_reason: z
    .string()
    .optional()
    .describe('If blocked, what is blocking it'),

  tags: z.array(z.string()).optional().describe('Custom tags'),
});

/**
 * Helper type for TypeScript
 */
export type ExtractedTask = z.infer<typeof TaskSchema>;
