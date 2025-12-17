import { IsString, IsOptional, IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request DTO for sending a message in merge chat
 */
export class MergeChatSendDto {
  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Source object ID' })
  @IsUUID()
  sourceObjectId: string;

  @ApiProperty({ description: 'Target object ID' })
  @IsUUID()
  targetObjectId: string;
}

/**
 * Request DTO for applying a merge suggestion
 */
export class MergeChatApplyDto {
  @ApiProperty({ description: 'Message ID containing the suggestion' })
  @IsString()
  messageId: string;

  @ApiProperty({ description: 'Index of the suggestion within the message' })
  @IsNumber()
  @Min(0)
  suggestionIndex: number;
}

/**
 * Request DTO for rejecting a merge suggestion
 */
export class MergeChatRejectDto {
  @ApiProperty({ description: 'Message ID containing the suggestion' })
  @IsString()
  messageId: string;

  @ApiProperty({ description: 'Index of the suggestion within the message' })
  @IsNumber()
  @Min(0)
  suggestionIndex: number;

  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Types for merge suggestion actions
 */
export type MergeSuggestionType =
  | 'property_merge'
  | 'keep_source'
  | 'keep_target'
  | 'combine'
  | 'new_value'
  | 'drop_property';

/**
 * A merge suggestion from the AI assistant
 */
export interface MergeChatSuggestionDto {
  index: number;
  type: MergeSuggestionType;
  propertyKey: string;
  explanation: string;
  sourceValue: unknown;
  targetValue: unknown;
  suggestedValue: unknown;
  status: 'pending' | 'accepted' | 'rejected';
}

/**
 * A message in the merge chat
 */
export interface MergeChatMessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  userId?: string;
  userName?: string;
  suggestions?: MergeChatSuggestionDto[];
  createdAt: string;
}

/**
 * A merge chat conversation for a task
 */
export interface MergeChatConversationDto {
  id: string;
  taskId: string;
  sourceObjectId: string;
  targetObjectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * The current merge preview state
 */
export interface MergePreviewDto {
  suggestedProperties: Record<string, unknown>;
  propertyDecisions: Record<string, MergeChatSuggestionDto>;
}

/**
 * Response for loading a merge chat conversation
 */
export interface MergeChatLoadResponseDto {
  conversation: MergeChatConversationDto;
  messages: MergeChatMessageDto[];
  mergePreview?: MergePreviewDto;
}

/**
 * Result of applying a merge suggestion
 */
export interface ApplyMergeSuggestionResultDto {
  success: boolean;
  error?: string;
  updatedProperties?: Record<string, unknown>;
}
