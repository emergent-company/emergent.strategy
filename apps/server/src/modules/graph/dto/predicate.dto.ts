import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * Supported operators for property predicate filtering.
 *
 * - equals: Exact match (===)
 * - notEquals: Not equal (!==)
 * - contains: String contains substring (case-sensitive)
 * - greaterThan: Numeric/string comparison (>)
 * - lessThan: Numeric/string comparison (<)
 * - greaterThanOrEqual: Numeric/string comparison (>=)
 * - lessThanOrEqual: Numeric/string comparison (<=)
 * - in: Value exists in array
 * - notIn: Value does not exist in array
 * - matches: Regular expression match (case-sensitive)
 * - exists: Property path exists (value is not null/undefined)
 * - notExists: Property path does not exist (value is null/undefined)
 */
export type PredicateOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'in'
  | 'notIn'
  | 'matches'
  | 'exists'
  | 'notExists';

/**
 * PredicateDto: Filter nodes/edges based on property values.
 *
 * Uses JSON Pointer (RFC 6901) syntax for path navigation.
 * Examples:
 * - "/status" → object.status
 * - "/metadata/priority" → object.metadata.priority
 * - "/tags/0" → object.tags[0]
 *
 * Use cases:
 * - Filter nodes by status: { path: "/status", operator: "equals", value: "active" }
 * - Filter edges by confidence: { path: "/confidence", operator: "greaterThan", value: 0.7 }
 * - Filter by labels: { path: "/labels", operator: "contains", value: "important" }
 */
export class PredicateDto {
  /**
   * JSON Pointer path to the property to evaluate.
   * Must start with "/" and follow RFC 6901 syntax.
   *
   * Examples:
   * - "/status"
   * - "/metadata/priority"
   * - "/tags/0"
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\/.*/, { message: 'path must start with / (JSON Pointer syntax)' })
  path!: string;

  /**
   * Comparison operator to apply.
   */
  @ApiProperty({
    description: 'Comparison operator to apply',
    enum: [
      'equals',
      'notEquals',
      'greaterThan',
      'lessThan',
      'greaterThanOrEqual',
      'lessThanOrEqual',
      'contains',
      'in',
      'notIn',
      'matches',
      'exists',
      'notExists',
    ],
    example: 'equals',
  })
  @IsIn([
    'equals',
    'notEquals',
    'greaterThan',
    'lessThan',
    'greaterThanOrEqual',
    'lessThanOrEqual',
    'contains',
    'in',
    'notIn',
    'matches',
    'exists',
    'notExists',
  ])
  operator!: PredicateOperator;

  /**
   * Value to compare against.
   * Type depends on operator:
   * - equals/notEquals: any type
   * - contains: string
   * - greaterThan/lessThan: number or string
   * - in/notIn: array
   * - matches: regex pattern string
   * - exists/notExists: not used (can be omitted)
   */
  @IsOptional()
  value?: any;
}
