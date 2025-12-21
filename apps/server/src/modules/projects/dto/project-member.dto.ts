import { ApiProperty } from '@nestjs/swagger';

export class ProjectMemberDto {
  @ApiProperty({ description: 'User ID (internal UUID)' })
  id: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'Display name', required: false })
  displayName?: string;

  @ApiProperty({ description: 'First name', required: false })
  firstName?: string;

  @ApiProperty({ description: 'Last name', required: false })
  lastName?: string;

  @ApiProperty({ description: 'Avatar URL', required: false })
  avatarUrl?: string;

  @ApiProperty({
    description: 'Role in the project',
    enum: ['project_admin', 'project_user'],
  })
  role: string;

  @ApiProperty({ description: 'Date when user joined the project' })
  joinedAt: Date;
}

export class ProjectMembersResponseDto {
  @ApiProperty({ type: [ProjectMemberDto] })
  members: ProjectMemberDto[];
}
