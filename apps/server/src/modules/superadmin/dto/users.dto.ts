import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search by name or email (partial match)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by organization ID',
  })
  @IsOptional()
  @IsUUID()
  orgId?: string;
}

export class UserOrgMembershipDto {
  @ApiProperty({ description: 'Organization ID' })
  orgId: string;

  @ApiProperty({ description: 'Organization name' })
  orgName: string;

  @ApiProperty({ description: 'Role in the organization' })
  role: string;

  @ApiProperty({ description: 'When the user joined' })
  joinedAt: Date;
}

export class SuperadminUserDto {
  @ApiProperty({ description: 'User profile ID' })
  id: string;

  @ApiProperty({ description: 'Zitadel user ID' })
  zitadelUserId: string;

  @ApiPropertyOptional({ description: 'First name' })
  firstName: string | null;

  @ApiPropertyOptional({ description: 'Last name' })
  lastName: string | null;

  @ApiPropertyOptional({ description: 'Display name' })
  displayName: string | null;

  @ApiPropertyOptional({ description: 'Primary email address' })
  primaryEmail: string | null;

  @ApiPropertyOptional({ description: 'Last activity timestamp' })
  lastActivityAt: Date | null;

  @ApiProperty({ description: 'Account created timestamp' })
  createdAt: Date;

  @ApiProperty({
    description: 'Organizations the user belongs to',
    type: [UserOrgMembershipDto],
  })
  organizations: UserOrgMembershipDto[];
}

export class ListUsersResponseDto {
  @ApiProperty({ type: [SuperadminUserDto] })
  users: SuperadminUserDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
