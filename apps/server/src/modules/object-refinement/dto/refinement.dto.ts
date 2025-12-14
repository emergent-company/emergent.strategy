import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsNumber } from 'class-validator';
import {
  RefinementSuggestionType,
  SuggestionStatus,
} from '../object-refinement.types';

/**
 * DTO for sending a message in refinement chat
 */
export class RefinementMessageDto {
  @ApiProperty({ description: 'The message content from the user' })
  @IsString()
  content: string;
}

/**
 * DTO for applying a suggestion
 */
export class ApplySuggestionDto {
  @ApiProperty({ description: 'The message ID containing the suggestion' })
  @IsUUID()
  messageId: string;

  @ApiProperty({ description: 'Index of the suggestion in the message' })
  @IsNumber()
  suggestionIndex: number;

  @ApiProperty({ description: 'Current object version for optimistic locking' })
  @IsNumber()
  expectedVersion: number;
}

/**
 * DTO for rejecting a suggestion
 */
export class RejectSuggestionDto {
  @ApiProperty({ description: 'The message ID containing the suggestion' })
  @IsUUID()
  messageId: string;

  @ApiProperty({ description: 'Index of the suggestion in the message' })
  @IsNumber()
  suggestionIndex: number;

  @ApiPropertyOptional({ description: 'Optional reason for rejection' })
  @IsString()
  @IsOptional()
  reason?: string;
}

/**
 * DTO for a suggestion in the response
 */
export class RefinementSuggestionResponseDto {
  @ApiProperty({ description: 'Index of the suggestion' })
  index: number;

  @ApiProperty({
    description: 'Type of suggestion',
    enum: [
      'property_change',
      'relationship_add',
      'relationship_remove',
      'rename',
    ],
  })
  type: RefinementSuggestionType;

  @ApiProperty({ description: 'Explanation for the suggestion' })
  explanation: string;

  @ApiProperty({ description: 'Suggestion details (varies by type)' })
  details: Record<string, unknown>;

  @ApiProperty({
    description: 'Current status of the suggestion',
    enum: ['pending', 'accepted', 'rejected'],
  })
  status: SuggestionStatus;
}

/**
 * DTO for conversation response
 */
export class RefinementConversationDto {
  @ApiProperty({ description: 'Conversation ID' })
  id: string;

  @ApiProperty({ description: 'Object ID this conversation is for' })
  objectId: string;

  @ApiProperty({ description: 'Conversation title' })
  title: string;

  @ApiProperty({ description: 'When the conversation was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the conversation was last updated' })
  updatedAt: Date;

  @ApiProperty({ description: 'Number of messages in the conversation' })
  messageCount: number;
}

/**
 * DTO for a message in refinement chat
 */
export class RefinementChatMessageDto {
  @ApiProperty({ description: 'Message ID' })
  id: string;

  @ApiProperty({
    description: 'Role of the message sender',
    enum: ['user', 'assistant'],
  })
  role: 'user' | 'assistant';

  @ApiProperty({ description: 'Message content' })
  content: string;

  @ApiProperty({
    description: 'User ID who sent the message (for user messages)',
  })
  @IsOptional()
  userId?: string;

  @ApiProperty({ description: 'Display name of the user' })
  @IsOptional()
  userName?: string;

  @ApiProperty({
    description: 'Suggestions in this message (for assistant messages)',
  })
  @IsOptional()
  suggestions?: RefinementSuggestionResponseDto[];

  @ApiProperty({ description: 'When the message was created' })
  createdAt: Date;
}

/**
 * DTO for apply suggestion result
 */
export class ApplySuggestionResultDto {
  @ApiProperty({
    description: 'Whether the suggestion was successfully applied',
  })
  success: boolean;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'New version number after applying' })
  newVersion?: number;

  @ApiPropertyOptional({ description: 'ID of the affected entity' })
  affectedId?: string;
}
