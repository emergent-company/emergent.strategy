import { ApiProperty } from '@nestjs/swagger';

/**
 * Project within an organization with user's role
 */
export class ProjectWithRoleDto {
  @ApiProperty({
    description: 'Project UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  id: string;

  @ApiProperty({ description: 'Project name', example: 'Product Docs' })
  name: string;

  @ApiProperty({
    description: 'Parent organization UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  orgId: string;

  @ApiProperty({
    description: 'User role in project',
    example: 'project_admin',
    enum: ['project_admin', 'project_member'],
  })
  role: string;

  @ApiProperty({ description: 'Knowledge base purpose', required: false })
  kb_purpose?: string;

  @ApiProperty({ description: 'Auto extract objects enabled', required: false })
  auto_extract_objects?: boolean;

  @ApiProperty({ description: 'Auto extract configuration', required: false })
  auto_extract_config?: any;
}

/**
 * Organization with nested projects and user's role
 */
export class OrgWithProjectsDto {
  @ApiProperty({
    description: 'Organization UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: 'Organization name', example: 'Acme Corp' })
  name: string;

  @ApiProperty({
    description: 'User role in organization',
    example: 'org_admin',
    enum: ['org_admin', 'org_member'],
  })
  role: string;

  @ApiProperty({
    description: 'Projects within organization that user has access to',
    type: [ProjectWithRoleDto],
    isArray: true,
  })
  projects: ProjectWithRoleDto[];
}
