import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class UserProfileDto {
  @ApiProperty({
    description: 'Internal UUID user id (primary key)',
    format: 'uuid',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    description:
      'Canonical internal user id (subject id, from identity provider) - DEPRECATED: use id',
    format: 'uuid',
  })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({
    description: 'Zitadel user ID (external auth provider)',
    required: false,
  })
  @IsOptional()
  @IsString()
  zitadelUserId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string | null;

  @ApiProperty({
    required: false,
    description: 'Display name fallback (explicit) or derived (first + last)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string | null;

  @ApiProperty({
    required: false,
    description: 'E.164 formatted phone number, leading + and digits',
  })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,15}$/)
  phoneE164?: string | null;

  @ApiProperty({
    required: false,
    description: 'Object storage key for avatar (if stored internally)',
  })
  @IsOptional()
  @IsString()
  avatarObjectKey?: string | null;
}

export class UpdateUserProfileDto {
  @IsOptional() @IsString() @Length(1, 100) firstName?: string | null;
  @IsOptional() @IsString() @Length(1, 100) lastName?: string | null;
  @IsOptional() @IsString() @Length(1, 120) displayName?: string | null;
  @IsOptional() @Matches(/^\+[1-9]\d{6,15}$/) phoneE164?: string | null;
}

export class AlternativeEmailDto {
  @ApiProperty({ description: 'Email address (lowercased canonical form)' })
  email!: string;
  @ApiProperty({ description: 'Verification status' })
  verified!: boolean;
  @ApiProperty({ description: 'ISO timestamp created' })
  createdAt!: string;
}

export class AddAlternativeEmailDto {
  @IsString()
  @Length(3, 254)
  email!: string;
}

export class DeleteAccountResponseDto {
  @ApiProperty({
    description: 'IDs of organizations that were soft-deleted',
    type: [String],
  })
  deletedOrgs!: string[];

  @ApiProperty({
    description: 'IDs of projects that were soft-deleted',
    type: [String],
  })
  deletedProjects!: string[];

  @ApiProperty({
    description: 'Number of memberships removed (org + project)',
  })
  removedMemberships!: number;
}
