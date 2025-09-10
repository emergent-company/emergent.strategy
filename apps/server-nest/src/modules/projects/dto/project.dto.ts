import { ApiProperty } from '@nestjs/swagger';

export class ProjectDto {
    @ApiProperty({ example: 'proj_1' })
    id!: string;
    @ApiProperty({ example: 'Demo Project' })
    name!: string;
    @ApiProperty({ example: 'org_1' })
    orgId!: string;
}
