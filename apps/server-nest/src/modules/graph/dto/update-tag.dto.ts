import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateTagDto {
  @ApiPropertyOptional({
    description: 'Updated tag description',
    example: 'Updated stable release',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}
