import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageDto {
  @ApiProperty({ description: 'Message role', enum: ['user', 'assistant'] })
  @IsString()
  role!: 'user' | 'assistant';

  @ApiProperty({ description: 'Message content' })
  @IsString()
  content!: string;
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
}
