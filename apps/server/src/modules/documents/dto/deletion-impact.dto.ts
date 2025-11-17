import { ApiProperty } from '@nestjs/swagger';

export class DeletionImpactDto {
  @ApiProperty({
    description: 'Document information',
    example: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'example.pdf',
      createdAt: '2024-01-01T00:00:00Z',
    },
  })
  document: {
    id: string;
    name: string;
    createdAt: string;
  };

  @ApiProperty({
    description: 'Impact summary of entities that will be deleted',
    example: {
      chunks: 42,
      extractionJobs: 3,
      graphObjects: 15,
      graphRelationships: 8,
      notifications: 1,
    },
  })
  impact: {
    chunks: number;
    extractionJobs: number;
    graphObjects: number;
    graphRelationships: number;
    notifications: number;
  };
}

export class BulkDeletionImpactDto {
  @ApiProperty({
    description: 'Total number of documents to be deleted',
    example: 5,
  })
  totalDocuments: number;

  @ApiProperty({
    description: 'Aggregated impact summary across all documents',
    example: {
      chunks: 150,
      extractionJobs: 12,
      graphObjects: 48,
      graphRelationships: 25,
      notifications: 3,
    },
  })
  impact: {
    chunks: number;
    extractionJobs: number;
    graphObjects: number;
    graphRelationships: number;
    notifications: number;
  };

  @ApiProperty({
    description: 'Optional per-document breakdown',
    required: false,
    type: [DeletionImpactDto],
  })
  documents?: DeletionImpactDto[];
}
