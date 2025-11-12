import { IsArray, IsString, MaxLength, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkUpdateStatusDto {
  @ApiProperty({
    description: 'Array of object IDs to update',
    example: ['uuid1', 'uuid2', 'uuid3'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({
    description: 'New status value',
    example: 'accepted',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  status!: string;
}
