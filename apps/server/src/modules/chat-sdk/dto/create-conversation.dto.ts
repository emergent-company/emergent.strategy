import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'Optional initial title for the conversation',
    required: false,
    example: 'New conversation',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: 'Optional project ID to associate with the conversation',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class CreateConversationResponseDto {
  @ApiProperty({
    description: 'The newly created conversation ID (UUID format)',
    example: '321618f2-bf5a-44b9-bd02-e885ceed7f43',
  })
  id!: string;

  @ApiProperty({
    description: 'The conversation title',
    example: 'New conversation',
  })
  title!: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-11-20T10:30:00.000Z',
  })
  createdAt!: string;
}
