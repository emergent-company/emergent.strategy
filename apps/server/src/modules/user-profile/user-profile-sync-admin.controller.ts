import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { UserProfileSyncWorkerService } from './user-profile-sync-worker.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from '../../entities/user-profile.entity';
import {
  UserSyncStatusResponseDto,
  TriggerSyncResponseDto,
  UserSyncResponseDto,
  UsersNeedingSyncResponseDto,
  UserNeedingSyncDto,
} from './dto/user-sync-admin.dto';

/**
 * UserProfileSyncAdminController
 *
 * Admin API for managing user profile synchronization from Zitadel.
 * Provides endpoints to:
 * - Check sync worker status and statistics
 * - Manually trigger sync batches
 * - Sync specific users on-demand
 * - View users that need synchronization
 */
@ApiTags('Admin - User Sync')
@Controller('admin/user-sync')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class UserProfileSyncAdminController {
  constructor(
    private readonly syncWorker: UserProfileSyncWorkerService,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>
  ) {}

  /**
   * Get sync worker status and statistics
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get sync worker status',
    description:
      'Returns current status and statistics of the user profile sync worker',
  })
  @ApiOkResponse({ type: UserSyncStatusResponseDto })
  @ApiStandardErrors()
  @Scopes('admin:read')
  getStatus(): UserSyncStatusResponseDto {
    return {
      success: true,
      data: this.syncWorker.stats(),
    };
  }

  /**
   * Manually trigger a sync batch
   */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger sync batch',
    description:
      'Manually triggers a sync batch to process users with incomplete profile data',
  })
  @ApiOkResponse({ type: TriggerSyncResponseDto })
  @ApiStandardErrors()
  @Scopes('admin:write')
  async triggerSync(): Promise<TriggerSyncResponseDto> {
    try {
      await this.syncWorker.processBatch();
      return {
        success: true,
        message: 'Sync batch triggered successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Sync batch failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Sync a specific user
   */
  @Post('user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync specific user',
    description: 'Manually sync a specific user by their internal ID',
  })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: UserSyncResponseDto })
  @ApiStandardErrors()
  @Scopes('admin:write')
  async syncUser(
    @Param('userId', ParseUUIDPipe) userId: string
  ): Promise<UserSyncResponseDto> {
    const result = await this.syncWorker.syncUserById(userId);

    if (!result) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    return {
      success: result.success,
      data: result,
      error: result.error,
    };
  }

  /**
   * List users that need synchronization
   */
  @Get('users-needing-sync')
  @ApiOperation({
    summary: 'List users needing sync',
    description:
      'Returns a list of users with incomplete profile data that need synchronization',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of users to return (default: 50)',
  })
  @ApiOkResponse({ type: UsersNeedingSyncResponseDto })
  @ApiStandardErrors()
  @Scopes('admin:read')
  async getUsersNeedingSync(
    @Query('limit') limit?: string
  ): Promise<UsersNeedingSyncResponseDto> {
    const maxResults = Math.min(parseInt(limit || '50', 10), 200);

    // Find users with incomplete data
    const users = await this.userProfileRepository
      .createQueryBuilder('profile')
      .leftJoin('profile.emails', 'email')
      .select([
        'profile.id',
        'profile.zitadelUserId',
        'profile.firstName',
        'profile.lastName',
        'profile.displayName',
        'profile.lastSyncedAt',
        'email.email',
      ])
      .where('profile.deleted_at IS NULL')
      // Only real Zitadel users (numeric IDs, not test-user-*)
      .andWhere("profile.zitadel_user_id ~ '^[0-9]+$'")
      // Need sync if missing profile data OR missing email
      .andWhere(
        `(
          profile.first_name IS NULL OR 
          profile.last_name IS NULL OR 
          profile.display_name IS NULL OR
          email.email IS NULL
        )`
      )
      .take(maxResults)
      .getMany();

    // Get total count
    const totalCount = await this.userProfileRepository
      .createQueryBuilder('profile')
      .leftJoin('profile.emails', 'email')
      .where('profile.deleted_at IS NULL')
      .andWhere("profile.zitadel_user_id ~ '^[0-9]+$'")
      .andWhere(
        `(
          profile.first_name IS NULL OR 
          profile.last_name IS NULL OR 
          profile.display_name IS NULL OR
          email.email IS NULL
        )`
      )
      .getCount();

    const data: UserNeedingSyncDto[] = users.map((user) => ({
      id: user.id,
      zitadelUserId: user.zitadelUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      lastSyncedAt: user.lastSyncedAt,
      hasEmail: user.emails && user.emails.length > 0,
    }));

    return {
      success: true,
      data,
      total: totalCount,
    };
  }
}
