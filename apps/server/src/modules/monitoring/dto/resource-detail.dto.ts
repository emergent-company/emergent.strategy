import { ApiProperty } from '@nestjs/swagger';

export class LogEntryDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'job_123' })
  processId!: string;

  @ApiProperty({ example: 'extraction_job' })
  processType!: string;

  @ApiProperty({
    example: 'info',
    enum: ['debug', 'info', 'warn', 'error', 'fatal'],
  })
  level!: string;

  @ApiProperty({ example: 'Job processing started' })
  message!: string;

  @ApiProperty({
    required: false,
    example: { step: 'extraction', entity_count: 5 },
  })
  metadata?: Record<string, any>;

  @ApiProperty({ example: '2025-10-22T10:30:00Z' })
  timestamp!: string;
}

export class LLMCallDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'job_123' })
  processId!: string;

  @ApiProperty({ example: 'extraction_job' })
  processType!: string;

  @ApiProperty({ example: 'gemini-1.5-pro' })
  modelName!: string;

  @ApiProperty({ example: { prompt: 'Extract entities from...' } })
  requestPayload!: Record<string, any>;

  @ApiProperty({ required: false, example: { entities: [] } })
  responsePayload?: Record<string, any>;

  @ApiProperty({
    example: 'success',
    enum: ['success', 'error', 'timeout', 'pending'],
  })
  status!: string;

  @ApiProperty({ required: false, example: 'Timeout after 30s' })
  errorMessage?: string;

  @ApiProperty({ required: false, example: 1000 })
  inputTokens?: number;

  @ApiProperty({ required: false, example: 500 })
  outputTokens?: number;

  @ApiProperty({ required: false, example: 1500 })
  totalTokens?: number;

  @ApiProperty({ required: false, example: 0.00875 })
  costUsd?: number;

  @ApiProperty({ example: '2025-10-22T10:30:00Z' })
  startedAt!: string;

  @ApiProperty({ required: false, example: '2025-10-22T10:30:05Z' })
  completedAt?: string;

  @ApiProperty({ required: false, example: 5000 })
  durationMs?: number;
}

export class ExtractionJobResourceDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'doc_456' })
  documentId!: string;

  @ApiProperty({
    example: 'completed',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status!: string;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 5 })
  processedItems!: number;

  @ApiProperty({ example: 5 })
  successfulItems!: number;

  @ApiProperty({ example: 0 })
  failedItems!: number;

  @ApiProperty({ example: '2025-10-22T10:30:00Z' })
  startedAt!: string;

  @ApiProperty({ required: false, example: '2025-10-22T10:35:00Z' })
  completedAt?: string;

  @ApiProperty({ required: false, example: 0.0125 })
  totalCostUsd?: number;
}

export class ResourceListResponseDto {
  @ApiProperty({ type: [ExtractionJobResourceDto] })
  items!: ExtractionJobResourceDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 50 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}

export class ResourceDetailResponseDto {
  @ApiProperty({ type: ExtractionJobResourceDto })
  resource!: ExtractionJobResourceDto;

  @ApiProperty({ type: [LogEntryDto] })
  recentLogs!: LogEntryDto[];

  @ApiProperty({ type: [LLMCallDto] })
  llmCalls!: LLMCallDto[];

  @ApiProperty({
    required: false,
    example: { totalCost: 0.0125, avgDuration: 5000 },
  })
  metrics?: Record<string, any>;
}
