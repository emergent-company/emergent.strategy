import { ApiProperty } from '@nestjs/swagger';

export class UserSearchResultDto {
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
}

export class UserSearchResponseDto {
  @ApiProperty({ type: [UserSearchResultDto] })
  users: UserSearchResultDto[];
}
