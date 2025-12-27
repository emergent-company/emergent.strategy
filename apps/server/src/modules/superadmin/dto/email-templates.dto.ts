import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TemplateVariable } from '../../../entities/email-template.entity';
import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';

export class EmailTemplateListItemDto {
  @ApiProperty({ description: 'Template ID' })
  id: string;

  @ApiProperty({ description: 'Template name (e.g., invitation, welcome)' })
  name: string;

  @ApiPropertyOptional({ description: 'Human-readable description' })
  description: string | null;

  @ApiProperty({
    description: 'Whether template has been customized from default',
  })
  isCustomized: boolean;

  @ApiPropertyOptional({ description: 'Current version number' })
  currentVersionNumber: number | null;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'User who last updated the template',
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
  })
  updatedBy: { id: string; name: string } | null;
}

export class ListEmailTemplatesResponseDto {
  @ApiProperty({ type: [EmailTemplateListItemDto] })
  templates: EmailTemplateListItemDto[];
}

export class EmailTemplateVersionDto {
  @ApiProperty({ description: 'Version ID' })
  id: string;

  @ApiProperty({ description: 'Version number' })
  versionNumber: number;

  @ApiProperty({ description: 'When this version was created' })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'User who created this version',
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
  })
  createdBy: { id: string; name: string } | null;
}

export class EmailTemplateDetailDto {
  @ApiProperty({ description: 'Template ID' })
  id: string;

  @ApiProperty({ description: 'Template name' })
  name: string;

  @ApiPropertyOptional({ description: 'Human-readable description' })
  description: string | null;

  @ApiProperty({ description: 'Handlebars template for subject line' })
  subjectTemplate: string;

  @ApiProperty({ description: 'MJML + Handlebars template content' })
  mjmlContent: string;

  @ApiProperty({
    description: 'Template variables definition',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['string', 'url', 'date', 'object'] },
        description: { type: 'string' },
        required: { type: 'boolean' },
        defaultValue: { type: 'object' },
      },
    },
  })
  variables: TemplateVariable[];

  @ApiProperty({
    description: 'Default sample data for preview',
    type: 'object',
  })
  sampleData: Record<string, any>;

  @ApiProperty({
    description: 'Whether template has been customized from default',
  })
  isCustomized: boolean;

  @ApiPropertyOptional({
    description: 'Current version information',
    type: EmailTemplateVersionDto,
  })
  currentVersion: EmailTemplateVersionDto | null;
}

export class UpdateEmailTemplateDto {
  @ApiProperty({ description: 'Handlebars template for subject line' })
  @IsString()
  @MaxLength(500)
  subjectTemplate: string;

  @ApiProperty({ description: 'MJML + Handlebars template content' })
  @IsString()
  mjmlContent: string;

  @ApiPropertyOptional({
    description: 'Sample data for preview',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  sampleData?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Description of changes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class UpdateEmailTemplateResponseDto {
  @ApiProperty({ description: 'Template ID' })
  id: string;

  @ApiProperty({ description: 'New version number' })
  versionNumber: number;

  @ApiProperty({ description: 'When the version was created' })
  createdAt: Date;
}

export class PreviewEmailTemplateDto {
  @ApiPropertyOptional({
    description: 'Override sample data for preview',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

export class PreviewEmailTemplateResponseDto {
  @ApiProperty({ description: 'Rendered HTML content' })
  html: string;

  @ApiPropertyOptional({ description: 'Plain text version' })
  text: string | null;

  @ApiProperty({ description: 'Rendered subject line' })
  subject: string;
}

export class ListEmailTemplateVersionsQueryDto extends PaginationQueryDto {}

export class EmailTemplateVersionListItemDto {
  @ApiProperty({ description: 'Version ID' })
  id: string;

  @ApiProperty({ description: 'Version number' })
  versionNumber: number;

  @ApiPropertyOptional({ description: 'Description of changes' })
  changeSummary: string | null;

  @ApiProperty({ description: 'When this version was created' })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'User who created this version',
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
  })
  createdBy: { id: string; name: string } | null;
}

export class ListEmailTemplateVersionsResponseDto {
  @ApiProperty({ type: [EmailTemplateVersionListItemDto] })
  versions: EmailTemplateVersionListItemDto[];

  @ApiProperty({ description: 'Total number of versions' })
  total: number;

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class RollbackEmailTemplateDto {
  @ApiProperty({ description: 'Version ID to rollback to' })
  @IsUUID()
  versionId: string;
}

export class RollbackEmailTemplateResponseDto {
  @ApiProperty({ description: 'Template ID' })
  id: string;

  @ApiProperty({ description: 'New version number after rollback' })
  versionNumber: number;
}

export class ResetEmailTemplateResponseDto {
  @ApiProperty({ description: 'Template ID' })
  id: string;

  @ApiProperty({ description: 'New version number after reset' })
  versionNumber: number;
}

export class PreviewMjmlDto {
  @ApiProperty({ description: 'MJML content to render' })
  @IsString()
  mjmlContent: string;

  @ApiPropertyOptional({ description: 'Subject template to render' })
  @IsOptional()
  @IsString()
  subjectTemplate?: string;

  @ApiPropertyOptional({
    description: 'Data to inject into templates',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

export class PreviewMjmlResponseDto {
  @ApiProperty({ description: 'Rendered HTML content' })
  html: string;

  @ApiPropertyOptional({ description: 'Plain text version' })
  text: string | null;

  @ApiPropertyOptional({
    description: 'Rendered subject line (if subjectTemplate provided)',
  })
  subject: string | null;
}
