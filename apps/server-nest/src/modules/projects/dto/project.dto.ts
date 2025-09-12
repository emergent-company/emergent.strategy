import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ProjectDto {
    @ApiProperty({ example: 'proj_1' })
    id!: string;
    @ApiProperty({ example: 'Demo Project' })
    name!: string;
    @ApiProperty({ example: 'org_1' })
    orgId!: string;
}

export class CreateProjectDto {
    @ApiProperty({ example: 'My Project', description: 'Project name (unique per organization, case-insensitive)' })
    @IsString()
    @MinLength(1)
    name!: string;

    @ApiProperty({ required: false, description: 'Organization UUID (optional – if omitted, default org will be used or created)' })
    @IsOptional()
    @IsString()
    orgId?: string;
}
