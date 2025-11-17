import { ApiProperty } from '@nestjs/swagger';

export class DeletionSummaryDto {
  @ApiProperty({
    description: 'Deletion status',
    example: 'deleted',
    enum: ['deleted', 'partial'],
  })
  status: 'deleted' | 'partial';

  @ApiProperty({
    description: 'Summary of deleted entities',
    example: {
      chunks: 42,
      extractionJobs: 3,
      graphObjects: 15,
      graphRelationships: 8,
      notifications: 1,
    },
  })
  summary: {
    chunks: number;
    extractionJobs: number;
    graphObjects: number;
    graphRelationships: number;
    notifications: number;
  };
}

export class BulkDeletionSummaryDto extends DeletionSummaryDto {
  @ApiProperty({
    description: 'Number of documents successfully deleted',
    example: 5,
  })
  deleted: number;

  @ApiProperty({
    description: 'Document IDs that could not be found or deleted',
    example: ['123e4567-e89b-12d3-a456-426614174999'],
    type: [String],
    required: false,
  })
  notFound?: string[];
}
