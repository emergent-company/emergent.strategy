import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

/**
 * DTO for sending a message in email template refinement chat
 */
export class EmailTemplateRefinementMessageDto {
  @ApiProperty({ description: 'The message content from the user' })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'Current MJML content for context (optional)',
  })
  @IsString()
  @IsOptional()
  currentMjml?: string;

  @ApiPropertyOptional({
    description: 'Current subject template for context (optional)',
  })
  @IsString()
  @IsOptional()
  currentSubject?: string;
}

/**
 * Suggestion types for email template refinement
 */
export type EmailTemplateSuggestionType = 'mjml_change' | 'subject_change';

/**
 * Suggestion status
 */
export type EmailTemplateSuggestionStatus = 'pending' | 'accepted' | 'rejected';

/**
 * DTO for a suggestion in the response
 */
export class EmailTemplateSuggestionDto {
  @ApiProperty({ description: 'Index of the suggestion' })
  index: number;

  @ApiProperty({
    description: 'Type of suggestion',
    enum: ['mjml_change', 'subject_change'],
  })
  type: EmailTemplateSuggestionType;

  @ApiProperty({ description: 'Explanation for the suggestion' })
  explanation: string;

  @ApiProperty({ description: 'New content (MJML or subject template)' })
  newContent: string;

  @ApiProperty({
    description: 'Current status of the suggestion',
    enum: ['pending', 'accepted', 'rejected'],
  })
  status: EmailTemplateSuggestionStatus;

  @ApiPropertyOptional({
    description:
      'Template version number this suggestion was generated for. Used to detect stale suggestions.',
  })
  generatedForVersion?: number;
}

/**
 * DTO for applying a suggestion
 */
export class ApplyEmailTemplateSuggestionDto {
  @ApiProperty({ description: 'ID of the message containing the suggestion' })
  @IsString()
  messageId: string;

  @ApiProperty({ description: 'Index of the suggestion to apply' })
  @IsNumber()
  suggestionIndex: number;

  @ApiProperty({
    description: 'Type of suggestion',
    enum: ['mjml_change', 'subject_change'],
  })
  @IsIn(['mjml_change', 'subject_change'])
  type: EmailTemplateSuggestionType;

  @ApiProperty({ description: 'New content to apply' })
  @IsString()
  newContent: string;

  @ApiPropertyOptional({ description: 'Change summary for version history' })
  @IsString()
  @IsOptional()
  changeSummary?: string;
}

/**
 * DTO for a message in refinement chat
 */
export class EmailTemplateRefinementChatMessageDto {
  @ApiProperty({ description: 'Message ID' })
  id: string;

  @ApiProperty({
    description: 'Role of the message sender',
    enum: ['user', 'assistant'],
  })
  role: 'user' | 'assistant';

  @ApiProperty({ description: 'Message content' })
  content: string;

  @ApiPropertyOptional({ description: 'User ID who sent the message' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Suggestions in this message (for assistant messages)',
  })
  suggestions?: EmailTemplateSuggestionDto[];

  @ApiProperty({ description: 'When the message was created' })
  createdAt: Date;
}

/**
 * DTO for conversation response
 */
export class EmailTemplateRefinementConversationDto {
  @ApiProperty({ description: 'Conversation ID' })
  id: string;

  @ApiProperty({ description: 'Template ID this conversation is for' })
  templateId: string;

  @ApiProperty({ description: 'Template name' })
  templateName: string;

  @ApiProperty({ description: 'Messages in the conversation' })
  messages: EmailTemplateRefinementChatMessageDto[];

  @ApiProperty({ description: 'When the conversation was created' })
  createdAt: Date;
}

/**
 * DTO for apply suggestion result
 */
export class ApplyEmailTemplateSuggestionResultDto {
  @ApiProperty({
    description: 'Whether the suggestion was successfully applied',
  })
  success: boolean;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'New version number after applying' })
  versionNumber?: number;
}
