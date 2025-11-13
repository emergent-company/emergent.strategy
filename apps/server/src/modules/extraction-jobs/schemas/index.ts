/**
 * Zod schemas for structured entity extraction using LangChain
 *
 * These schemas define the expected output structure for each entity type
 * when using ChatGoogleGenerativeAI.withStructuredOutput()
 */

export * from './base.schema';
export * from './requirement.schema';
export * from './decision.schema';
export * from './feature.schema';
export * from './task.schema';
export * from './risk.schema';
export * from './issue.schema';
export * from './stakeholder.schema';
export * from './constraint.schema';

import { z } from 'zod';
import { RequirementSchema } from './requirement.schema';
import { DecisionSchema } from './decision.schema';
import { FeatureSchema } from './feature.schema';
import { TaskSchema } from './task.schema';
import { RiskSchema } from './risk.schema';
import { IssueSchema } from './issue.schema';
import { StakeholderSchema } from './stakeholder.schema';
import { ConstraintSchema } from './constraint.schema';

/**
 * Map of entity type names to their Zod schemas
 * Used by extraction provider to get the correct schema for each type
 */
export const EXTRACTION_SCHEMAS: Record<string, z.ZodType> = {
  Requirement: RequirementSchema,
  Decision: DecisionSchema,
  Feature: FeatureSchema,
  Task: TaskSchema,
  Risk: RiskSchema,
  Issue: IssueSchema,
  Stakeholder: StakeholderSchema,
  Constraint: ConstraintSchema,
};

/**
 * Get schema for a given entity type
 * Returns undefined if type not found
 */
export function getSchemaForType(type: string): z.ZodType | undefined {
  return EXTRACTION_SCHEMAS[type];
}
