import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Worker statistics DTO
 */
export class UserSyncStatsDto {
  @ApiProperty({ description: 'Total users processed since worker start' })
  processed: number;

  @ApiProperty({ description: 'Total successful syncs since worker start' })
  succeeded: number;

  @ApiProperty({ description: 'Total failed syncs since worker start' })
  failed: number;

  @ApiPropertyOptional({
    description: 'Timestamp of last sync batch',
    type: String,
    format: 'date-time',
  })
  lastSyncAt: Date | null;

  @ApiProperty({ description: 'Whether the worker is currently running' })
  running: boolean;
}

/**
 * Status response DTO
 */
export class UserSyncStatusResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: UserSyncStatsDto })
  data: UserSyncStatsDto;
}

/**
 * Single user sync result
 */
export class UserSyncResultDto {
  @ApiProperty({ description: 'Internal user ID' })
  userId: string;

  @ApiProperty({ description: 'Zitadel user ID' })
  zitadelUserId: string;

  @ApiProperty({ description: 'Whether sync was successful' })
  success: boolean;

  @ApiProperty({
    description: 'Fields that were updated',
    type: [String],
    example: ['firstName', 'lastName', 'email'],
  })
  updatedFields: string[];

  @ApiPropertyOptional({ description: 'Error message if sync failed' })
  error?: string;
}

/**
 * Trigger sync response
 */
export class TriggerSyncResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ description: 'Status message' })
  message: string;
}

/**
 * User sync response (single user)
 */
export class UserSyncResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional({ type: UserSyncResultDto })
  data?: UserSyncResultDto;

  @ApiPropertyOptional({ description: 'Error message if user not found' })
  error?: string;
}

/**
 * User needing sync summary
 */
export class UserNeedingSyncDto {
  @ApiProperty({ description: 'Internal user ID' })
  id: string;

  @ApiProperty({ description: 'Zitadel user ID' })
  zitadelUserId: string;

  @ApiPropertyOptional({ description: 'First name (null if needs sync)' })
  firstName: string | null;

  @ApiPropertyOptional({ description: 'Last name (null if needs sync)' })
  lastName: string | null;

  @ApiPropertyOptional({ description: 'Display name (null if needs sync)' })
  displayName: string | null;

  @ApiPropertyOptional({ description: 'Last sync timestamp' })
  lastSyncedAt: Date | null;

  @ApiProperty({ description: 'Whether user has email in local DB' })
  hasEmail: boolean;
}

/**
 * Users needing sync response
 */
export class UsersNeedingSyncResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: [UserNeedingSyncDto] })
  data: UserNeedingSyncDto[];

  @ApiProperty({ description: 'Total count of users needing sync' })
  total: number;
}
