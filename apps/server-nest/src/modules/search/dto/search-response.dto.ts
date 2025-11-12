import { ApiProperty } from '@nestjs/swagger';
import { SearchMode } from './search-query.dto';

export class SearchResultDto {
  @ApiProperty({ example: 'mock-1' }) id!: string;
  @ApiProperty({ example: 'Result snippet for "foo" (#1, mode=hybrid)' })
  snippet!: string;
  @ApiProperty({ example: 0.98 }) score!: number;
  @ApiProperty({ example: 'source.doc#L10', required: false }) source?: string;
  @ApiProperty({
    example:
      'Related: links to Requirement "REQ-1" via \'implements\'; linked from Meeting "M3" via \'discussed_in\'',
    description:
      'Human-readable summary of how this result relates to other objects in the knowledge graph',
    required: false,
  })
  pathSummary?: string;
}

export class SearchResponseDto {
  @ApiProperty({ enum: SearchMode }) mode!: SearchMode;
  @ApiProperty({ type: SearchResultDto, isArray: true })
  results!: SearchResultDto[];
  @ApiProperty({
    required: false,
    example: 'Embeddings unavailable; fell back to lexical.',
  })
  warning?: string;

  // Phase 3: Query Telemetry (5a)
  @ApiProperty({
    description: 'Query execution time in milliseconds',
    example: 142.5,
    required: false,
  })
  query_time_ms?: number;

  @ApiProperty({
    description: 'Total number of results found before pagination/limits',
    example: 50,
    required: false,
  })
  result_count?: number;
}
