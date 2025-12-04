import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsObject,
  IsIn,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Configuration for document chunking at the project level.
 * These settings are used as defaults when ingesting documents.
 */
export class ChunkingConfigDto {
  @ApiProperty({
    example: 'sentence',
    description: 'Chunking strategy to use',
    enum: ['character', 'sentence', 'paragraph'],
  })
  @IsIn(['character', 'sentence', 'paragraph'])
  strategy: 'character' | 'sentence' | 'paragraph';

  @ApiProperty({
    example: 1200,
    description: 'Maximum chunk size in characters (100-10000)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  maxChunkSize?: number;

  @ApiProperty({
    example: 100,
    description: 'Minimum chunk size in characters (10-1000)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1000)
  minChunkSize?: number;

  @ApiProperty({
    example: 200,
    description: 'Overlap between chunks in characters (0-500)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  overlap?: number;
}

export class ProjectDto {
  @ApiProperty({ example: 'proj_1' })
  id!: string;
  @ApiProperty({ example: 'Demo Project' })
  name!: string;
  @ApiProperty({ example: 'org_1' })
  orgId!: string;
  @ApiProperty({ example: 'This knowledge base contains...', required: false })
  kb_purpose?: string;
  @ApiProperty({
    example:
      'You are a helpful assistant...\n\n{{GRAPH_CONTEXT}}\n\n{{MESSAGE}}',
    description: 'Custom chat prompt template with placeholders',
    required: false,
  })
  chat_prompt_template?: string;
  @ApiProperty({
    example: false,
    description:
      'When true, automatically create extraction jobs when documents are uploaded',
    required: false,
  })
  auto_extract_objects?: boolean;
  @ApiProperty({
    example: {
      enabled_types: ['Requirement', 'Decision', 'Feature'],
      min_confidence: 0.7,
      duplicate_strategy: 'skip',
      require_review: true,
      notify_on_complete: true,
      notification_channels: ['inbox'],
    },
    description: 'Configuration for automatic extraction jobs',
    required: false,
  })
  auto_extract_config?: any;
  @ApiProperty({
    example: {
      strategy: 'sentence',
      maxChunkSize: 1200,
      minChunkSize: 100,
      overlap: 200,
    },
    description:
      'Default document chunking configuration for this project. Used when ingesting documents without explicit chunking options.',
    required: false,
  })
  chunking_config?: ChunkingConfigDto | null;

  @ApiProperty({
    example: false,
    description:
      'When true, allows multiple extraction jobs to run in parallel for this project. When false (default), jobs are queued and run one at a time.',
    required: false,
  })
  allow_parallel_extraction?: boolean;
}

export class CreateProjectDto {
  @ApiProperty({
    example: 'My Project',
    description: 'Project name (unique per organization, case-insensitive)',
  })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    description:
      'Organization UUID (must belong to caller; no implicit default org)',
  })
  @IsString()
  orgId!: string;
}

export class UpdateProjectDto {
  @ApiProperty({
    example: 'Updated Project Name',
    description: 'New project name (unique per organization)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({
    example: 'This knowledge base contains documentation about...',
    description:
      'Markdown description of the knowledge base purpose and domain. Used by auto-discovery to understand context.',
    required: false,
  })
  @IsOptional()
  @IsString()
  kb_purpose?: string;

  @ApiProperty({
    example:
      'You are a helpful assistant specialized in {{DOMAIN}}.\n\n{{GRAPH_CONTEXT}}\n\n{{MESSAGE}}',
    description:
      'Custom chat prompt template. Supports placeholders: {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, {{MESSAGE}}, {{MARKDOWN_RULES}}',
    required: false,
  })
  @IsOptional()
  @IsString()
  chat_prompt_template?: string;

  @ApiProperty({
    example: false,
    description:
      'Enable/disable automatic extraction of objects from uploaded documents',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  auto_extract_objects?: boolean;

  @ApiProperty({
    example: {
      enabled_types: ['Requirement', 'Decision', 'Feature'],
      min_confidence: 0.7,
      duplicate_strategy: 'skip',
      require_review: true,
      notify_on_complete: true,
      notification_channels: ['inbox'],
    },
    description:
      'Configuration for automatic extraction (enabled_types, min_confidence, duplicate_strategy, require_review, notify_on_complete, notification_channels)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  auto_extract_config?: any;

  @ApiProperty({
    example: {
      strategy: 'sentence',
      maxChunkSize: 1200,
      minChunkSize: 100,
      overlap: 200,
    },
    description:
      'Default document chunking configuration. Strategy options: character (fixed boundaries), sentence (preserves sentences), paragraph (preserves paragraphs/sections).',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChunkingConfigDto)
  chunking_config?: ChunkingConfigDto | null;

  @ApiProperty({
    example: false,
    description:
      'When true, allows multiple extraction jobs to run in parallel for this project. When false (default), jobs are queued and run one at a time.',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  allow_parallel_extraction?: boolean;
}
