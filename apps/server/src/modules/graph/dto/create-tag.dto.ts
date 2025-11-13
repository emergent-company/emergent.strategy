import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class CreateTagDto {
  @ApiProperty({
    description: 'Tag name (unique within project)',
    example: 'stable',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    description: 'Product version ID to tag',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @IsUUID()
  @IsNotEmpty()
  product_version_id!: string;

  @ApiPropertyOptional({
    description: 'Optional tag description',
    example: 'Stable release for production',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}
