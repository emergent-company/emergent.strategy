import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional } from 'class-validator';

export class ProjectDto {
    @ApiProperty({ example: 'proj_1' })
    id!: string;
    @ApiProperty({ example: 'Demo Project' })
    name!: string;
    @ApiProperty({ example: 'org_1' })
    orgId!: string;
    @ApiProperty({ example: 'This knowledge base contains...', required: false })
    kb_purpose?: string;
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
}
