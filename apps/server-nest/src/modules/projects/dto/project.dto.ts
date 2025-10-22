import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional, IsBoolean, IsObject } from 'class-validator';

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
        example: 'You are a helpful assistant...\n\n{{GRAPH_CONTEXT}}\n\n{{MESSAGE}}',
        description: 'Custom chat prompt template with placeholders',
        required: false
    })
    chat_prompt_template?: string;
    @ApiProperty({
        example: false,
        description: 'When true, automatically create extraction jobs when documents are uploaded',
        required: false
    })
    auto_extract_objects?: boolean;
    @ApiProperty({
        example: {
            enabled_types: ['Requirement', 'Decision', 'Feature'],
            min_confidence: 0.7,
            duplicate_strategy: 'skip',
            require_review: true,
            notify_on_complete: true,
            notification_channels: ['inbox']
        },
        description: 'Configuration for automatic extraction jobs',
        required: false
    })
    auto_extract_config?: any;
}

export class CreateProjectDto {
    @ApiProperty({ example: 'My Project', description: 'Project name (unique per organization, case-insensitive)' })
    @IsString()
    @MinLength(1)
    name!: string;

    @ApiProperty({ description: 'Organization UUID (must belong to caller; no implicit default org)' })
    @IsString()
    orgId!: string;
}

export class UpdateProjectDto {
    @ApiProperty({ example: 'Updated Project Name', description: 'New project name (unique per organization)', required: false })
    @IsOptional()
    @IsString()
    @MinLength(1)
    name?: string;

    @ApiProperty({
        example: 'This knowledge base contains documentation about...',
        description: 'Markdown description of the knowledge base purpose and domain. Used by auto-discovery to understand context.',
        required: false
    })
    @IsOptional()
    @IsString()
    kb_purpose?: string;

    @ApiProperty({
        example: 'You are a helpful assistant specialized in {{DOMAIN}}.\n\n{{GRAPH_CONTEXT}}\n\n{{MESSAGE}}',
        description: 'Custom chat prompt template. Supports placeholders: {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, {{MESSAGE}}, {{MARKDOWN_RULES}}',
        required: false
    })
    @IsOptional()
    @IsString()
    chat_prompt_template?: string;

    @ApiProperty({
        example: false,
        description: 'Enable/disable automatic extraction of objects from uploaded documents',
        required: false
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
            notification_channels: ['inbox']
        },
        description: 'Configuration for automatic extraction (enabled_types, min_confidence, duplicate_strategy, require_review, notify_on_complete, notification_channels)',
        required: false
    })
    @IsOptional()
    @IsObject()
    auto_extract_config?: any;
}
