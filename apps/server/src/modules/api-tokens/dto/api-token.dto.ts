import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  MaxLength,
  MinLength,
  ArrayMinSize,
  IsIn,
} from 'class-validator';

// ============ Request DTOs ============

/**
 * Available scopes for API tokens
 */
export const API_TOKEN_SCOPES = [
  'schema:read',
  'data:read',
  'data:write',
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export class CreateApiTokenDto {
  @ApiProperty({
    description: 'Human-readable name for the token',
    example: 'Claude Desktop',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    description: 'Scopes to grant to this token',
    example: ['schema:read', 'data:read'],
    enum: API_TOKEN_SCOPES,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(API_TOKEN_SCOPES, { each: true })
  scopes!: ApiTokenScope[];
}

// ============ Response DTOs ============

export class ApiTokenDto {
  @ApiProperty({ description: 'Token ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Human-readable name' })
  name!: string;

  @ApiProperty({
    description: 'Token prefix for identification (first 12 chars)',
    example: 'emt_a1b2c3d4',
  })
  tokenPrefix!: string;

  @ApiProperty({
    description: 'Scopes granted to this token',
    example: ['schema:read', 'data:read'],
  })
  scopes!: string[];

  @ApiProperty({ description: 'When the token was created' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Last time the token was used',
    required: false,
    nullable: true,
  })
  lastUsedAt!: Date | null;

  @ApiProperty({
    description: 'Whether the token is revoked',
  })
  isRevoked!: boolean;
}

export class CreateApiTokenResponseDto extends ApiTokenDto {
  @ApiProperty({
    description:
      'The full token value. IMPORTANT: This is only returned once at creation time.',
    example: 'emt_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8',
  })
  token!: string;
}

export class ApiTokenListResponseDto {
  @ApiProperty({ description: 'List of API tokens', type: [ApiTokenDto] })
  tokens!: ApiTokenDto[];

  @ApiProperty({ description: 'Total number of tokens' })
  total!: number;
}
