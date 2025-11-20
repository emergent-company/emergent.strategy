import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    description: 'Array of chat messages',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['user', 'assistant', 'system'] },
        content: { type: 'string' },
      },
    },
  })
  @IsArray()
  messages!: Message[];

  @ApiProperty({
    description: 'Conversation ID for maintaining state',
    required: false,
  })
  @IsOptional()
  @IsString()
  conversationId?: string;
}
