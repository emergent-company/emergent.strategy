import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsIn, IsOptional, MaxLength } from 'class-validator';

/**
 * DTO for recording user activity (view/edit of a resource)
 */
export class RecordActivityDto {
  @ApiProperty({
    description: 'Type of resource being accessed',
    enum: ['document', 'object'],
    example: 'document',
  })
  @IsString()
  @IsIn(['document', 'object'])
  resourceType!: 'document' | 'object';

  @ApiProperty({
    description: 'UUID of the document or graph object',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  resourceId!: string;

  @ApiPropertyOptional({
    description: 'Display name of the resource (filename or object name)',
    example: 'requirements.pdf',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resourceName?: string;

  @ApiPropertyOptional({
    description:
      'Additional type info: MIME type for documents, object type for objects',
    example: 'application/pdf',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceSubtype?: string;

  @ApiProperty({
    description: 'Type of action performed',
    enum: ['viewed', 'edited'],
    example: 'viewed',
  })
  @IsString()
  @IsIn(['viewed', 'edited'])
  actionType!: 'viewed' | 'edited';
}

/**
 * Response DTO for recent items
 */
export class RecentItemDto {
  @ApiProperty({ description: 'Unique identifier' })
  id!: string;

  @ApiProperty({
    description: 'Type of resource',
    enum: ['document', 'object'],
  })
  resourceType!: 'document' | 'object';

  @ApiProperty({ description: 'UUID of the resource' })
  resourceId!: string;

  @ApiProperty({ description: 'Display name of the resource', nullable: true })
  resourceName!: string | null;

  @ApiProperty({
    description: 'Additional type info (MIME type or object type)',
    nullable: true,
  })
  resourceSubtype!: string | null;

  @ApiProperty({
    description: 'Type of last action',
    enum: ['viewed', 'edited'],
  })
  actionType!: 'viewed' | 'edited';

  @ApiProperty({ description: 'When the resource was last accessed' })
  accessedAt!: Date;
}

/**
 * Response DTO for getting recent items by type
 */
export class RecentItemsResponseDto {
  @ApiProperty({ description: 'List of recent objects', type: [RecentItemDto] })
  objects!: RecentItemDto[];

  @ApiProperty({
    description: 'List of recent documents',
    type: [RecentItemDto],
  })
  documents!: RecentItemDto[];
}
