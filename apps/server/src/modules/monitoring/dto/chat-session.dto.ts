import { ApiProperty } from '@nestjs/swagger';
import { LogEntryDto, LLMCallDto } from './resource-detail.dto';

export class McpToolCallDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'session_123' })
  sessionId!: string;

  @ApiProperty({ required: false, example: 'conv_456' })
  conversationId?: string;

  @ApiProperty({ example: 1 })
  turnNumber!: number;

  @ApiProperty({ example: 'semantic_search' })
  toolName!: string;

  @ApiProperty({
    required: false,
    example: { query: 'find documents about AI' },
  })
  toolParameters?: Record<string, any>;

  @ApiProperty({ required: false, example: { results: [] } })
  toolResult?: Record<string, any>;

  @ApiProperty({ required: false, example: 250 })
  executionTimeMs?: number;

  @ApiProperty({ example: 'success', enum: ['success', 'error', 'timeout'] })
  status!: 'success' | 'error' | 'timeout';

  @ApiProperty({ required: false, example: 'Timeout after 30s' })
  errorMessage?: string;

  @ApiProperty({ required: false, example: 'Here are the search results...' })
  finalLlmPrompt?: string;

  @ApiProperty({ example: '2025-10-23T10:30:00Z' })
  timestamp!: string;
}

export class ChatSessionSummaryDto {
  @ApiProperty({ example: 'session_123' })
  sessionId!: string;

  @ApiProperty({ example: '2025-10-23T10:00:00Z' })
  startedAt!: string;

  @ApiProperty({ example: '2025-10-23T10:15:00Z' })
  lastActivityAt!: string;

  @ApiProperty({ example: 25 })
  logCount!: number;

  @ApiProperty({ required: false, example: 0.0087 })
  totalCost?: number;

  @ApiProperty({ required: false, example: 8 })
  totalTurns?: number;
}

export class ChatSessionDetailDto {
  @ApiProperty({ example: 'session_123' })
  sessionId!: string;

  @ApiProperty({ example: 'conv_456' })
  conversationId!: string;

  @ApiProperty({ example: 'user_789' })
  userId!: string;

  @ApiProperty({ example: '2025-10-23T10:00:00Z' })
  startedAt!: string;

  @ApiProperty({ required: false, example: '2025-10-23T10:15:00Z' })
  completedAt?: string;

  @ApiProperty({ required: false, example: 900000 })
  durationMs?: number;

  @ApiProperty({ example: 8 })
  totalTurns!: number;

  @ApiProperty({ example: 0.0087 })
  totalCost!: number;

  @ApiProperty({ example: 1500 })
  totalTokens!: number;

  @ApiProperty({ type: [LogEntryDto] })
  logs!: LogEntryDto[];

  @ApiProperty({ type: [LLMCallDto] })
  llmCalls!: LLMCallDto[];

  @ApiProperty({ type: [McpToolCallDto] })
  toolCalls!: McpToolCallDto[];
}
