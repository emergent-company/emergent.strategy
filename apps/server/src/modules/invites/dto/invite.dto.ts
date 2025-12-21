import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, IsIn } from 'class-validator';

// ============ Request DTOs ============

export class CreateInviteDto {
  @ApiProperty({ description: 'Organization ID' })
  @IsUUID()
  orgId!: string;

  @ApiProperty({ description: 'Project ID (optional)', required: false })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ description: 'Email address to invite' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Role for the invited user',
    enum: ['org_admin', 'project_admin', 'project_user'],
  })
  @IsString()
  role!: 'org_admin' | 'project_admin' | 'project_user';
}

export class CreateInviteWithUserDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'First name' })
  @IsString()
  firstName!: string;

  @ApiProperty({ description: 'Last name' })
  @IsString()
  lastName!: string;

  @ApiProperty({ description: 'Organization ID (optional)', required: false })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({ description: 'Project ID (optional)', required: false })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({
    description: 'Role for the invited user',
    enum: ['org_admin', 'project_admin', 'project_user'],
  })
  @IsIn(['org_admin', 'project_admin', 'project_user'])
  role!: 'org_admin' | 'project_admin' | 'project_user';
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invitation token' })
  @IsString()
  token!: string;
}

// ============ Response DTOs ============

export class PendingInviteDto {
  @ApiProperty({ description: 'Invitation ID' })
  id: string;

  @ApiProperty({
    description: 'Project ID (if project invite)',
    required: false,
  })
  projectId?: string;

  @ApiProperty({
    description: 'Project name (if project invite)',
    required: false,
  })
  projectName?: string;

  @ApiProperty({ description: 'Organization ID' })
  organizationId: string;

  @ApiProperty({ description: 'Organization name', required: false })
  organizationName?: string;

  @ApiProperty({ description: 'Role being offered' })
  role: string;

  @ApiProperty({ description: 'Invitation token' })
  token: string;

  @ApiProperty({ description: 'When the invitation was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the invitation expires', required: false })
  expiresAt?: Date;
}

export class SentInviteDto {
  @ApiProperty({ description: 'Invitation ID' })
  id: string;

  @ApiProperty({ description: 'Email address invited' })
  email: string;

  @ApiProperty({ description: 'Role offered' })
  role: string;

  @ApiProperty({
    description: 'Status: pending, accepted, declined, revoked, expired',
  })
  status: string;

  @ApiProperty({ description: 'When the invitation was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the invitation expires', required: false })
  expiresAt?: Date;
}

export class InviteResponseDto {
  @ApiProperty({ description: 'Invitation ID' })
  id: string;

  @ApiProperty({ description: 'Organization ID' })
  orgId: string;

  @ApiProperty({ description: 'Project ID', required: false })
  projectId?: string;

  @ApiProperty({ description: 'Email invited' })
  email: string;

  @ApiProperty({ description: 'Role' })
  role: string;

  @ApiProperty({ description: 'Status' })
  status: string;

  @ApiProperty({ description: 'Token' })
  token: string;
}
