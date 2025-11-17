import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class BulkDeleteRequestDto {
  @ApiProperty({
    description: 'Array of document IDs to delete',
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
    ],
    type: [String],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one document ID required' })
  @IsUUID('4', { each: true, message: 'Each ID must be a valid UUID v4' })
  ids: string[];
}
