import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

/**
 * Temporal Filter DTO
 *
 * Enables point-in-time queries on the graph by filtering nodes and edges
 * based on temporal validity fields.
 *
 * Use cases:
 * - Historical analysis: "What did the graph look like on 2024-12-31?"
 * - Audit trails: "Show me all changes before a specific timestamp"
 * - Time-travel queries: "What were the active dependencies last month?"
 */
export class TemporalFilterDto {
  /**
   * Timestamp for point-in-time query (ISO 8601 format).
   *
   * When provided, only nodes/edges valid at this timestamp are included.
   * The interpretation depends on the 'field' parameter.
   *
   * Example: "2024-12-31T23:59:59Z"
   */
  @ApiProperty({
    description:
      'Timestamp for point-in-time query (ISO 8601 format). Only nodes/edges valid at this timestamp are included.',
    example: '2024-12-31T23:59:59Z',
    type: String,
    format: 'date-time',
  })
  @IsDateString()
  asOf!: string;

  /**
   * Which temporal field to use for filtering.
   *
   * - 'valid_from': Use valid_from/valid_to range (semantic validity period)
   * - 'created_at': Only include items created before or at asOf
   * - 'updated_at': Only include items last updated before or at asOf
   *
   * Default: 'valid_from'
   *
   * Note:
   * - 'valid_from' mode checks: valid_from <= asOf AND (valid_to IS NULL OR valid_to > asOf)
   * - 'created_at' mode checks: created_at <= asOf
   * - 'updated_at' mode checks: updated_at <= asOf
   */
  @ApiPropertyOptional({
    description:
      'Which temporal field to use for filtering. Default: valid_from',
    enum: ['valid_from', 'created_at', 'updated_at'],
    default: 'valid_from',
    example: 'valid_from',
  })
  @IsOptional()
  @IsIn(['valid_from', 'created_at', 'updated_at'])
  field?: 'valid_from' | 'created_at' | 'updated_at' = 'valid_from';
}
