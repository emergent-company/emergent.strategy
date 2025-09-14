import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

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

    @ApiProperty({ description: 'Organization UUID (must belong to caller; no implicit default org)' })
    @IsString()
    orgId!: string;
}
