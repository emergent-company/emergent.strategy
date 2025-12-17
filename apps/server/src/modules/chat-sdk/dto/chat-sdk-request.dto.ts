import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
  IsUUID,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

// AI SDK UIMessage part types
export class TextPartDto {
  @ApiProperty({ description: 'Part type', enum: ['text'] })
  @IsString()
  @IsIn(['text'])
  type!: 'text';

  @ApiProperty({ description: 'Text content' })
  @IsString()
  text!: string;
}

// Support both AI SDK UIMessage format (with parts[]) and simple format (with content)
export class MessageDto {
  @ApiProperty({ description: 'Message ID (optional)', required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Message role', enum: ['user', 'assistant'] })
  @IsString()
  role!: 'user' | 'assistant';

  @ApiProperty({
    description: 'Message content (simple format)',
    required: false,
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: 'Message parts (AI SDK format)',
    type: [TextPartDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TextPartDto)
  parts?: TextPartDto[];

  /**
   * Get the text content from either content or parts[].
   * Supports both simple format and AI SDK UIMessage format.
   */
  getText(): string {
    if (this.content) {
      return this.content;
    }
    if (this.parts && this.parts.length > 0) {
      return this.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
    }
    return '';
  }
}

export class ChatSdkRequestDto {
  @ApiProperty({
    description: 'Array of messages in the conversation',
    type: [MessageDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages!: MessageDto[];

  @ApiProperty({
    description: 'Optional conversation ID to continue existing conversation',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({
    description: 'Optional project ID for scoped knowledge base search',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({
    description:
      'Array of enabled tool names. If null, all tools are enabled (default). If empty array, no tools are enabled.',
    required: false,
    type: [String],
    nullable: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTools?: string[] | null;
}
