import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { ZitadelService, ZitadelUser } from '../auth/zitadel.service';
import { DatabaseService } from '../../common/database/database.service';

/**
 * Result of syncing a single user
 */
interface SyncResult {
  userId: string;
  zitadelUserId: string;
  success: boolean;
  updatedFields: string[];
  error?: string;
}

/**
 * UserProfileSyncWorkerService
 *
 * Background worker that periodically synchronizes user profile data from Zitadel
 * to the local database. This ensures:
 *
 * 1. Users who signed up via Zitadel have their profile data (name, email) in our DB
 * 2. Profile updates in Zitadel (e.g., name changes) are reflected locally
 * 3. Release notifications and other features have access to user emails
 *
 * Sync Logic:
 * - Finds users with incomplete local data (missing firstName, lastName, displayName, or email)
 * - Fetches user data from Zitadel Management API
 * - Updates local records without overwriting existing values (unless null)
 *
 * Configuration (environment variables):
 * - USER_PROFILE_SYNC_ENABLED: Enable/disable the worker (default: true)
 * - USER_PROFILE_SYNC_INTERVAL_MS: Poll interval in ms (default: 300000 = 5 minutes)
 * - USER_PROFILE_SYNC_BATCH_SIZE: Users per batch (default: 10)
 *
 * The worker follows the same patterns as other background workers in the codebase:
 * - Uses setTimeout polling (not setInterval)
 * - Implements OnModuleInit/OnModuleDestroy lifecycle hooks
 * - Disabled during tests unless ENABLE_WORKERS_IN_TESTS=true
 * - Checks database online status before starting
 */
@Injectable()
export class UserProfileSyncWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(UserProfileSyncWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentBatch: Promise<void> | null = null;

  // Metrics (reset on process restart)
  private processedCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private lastSyncAt: Date | null = null;

  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @Inject(ZitadelService)
    private readonly zitadelService: ZitadelService,
    @Optional()
    @Inject(DatabaseService)
    private readonly db?: DatabaseService
  ) {}

  onModuleInit() {
    // Check if sync is enabled
    if (process.env.USER_PROFILE_SYNC_ENABLED === 'false') {
      this.logger.log('User profile sync worker disabled via configuration');
      return;
    }

    // Check database status
    if (this.db && !this.db.isOnline()) {
      this.logger.warn(
        'Database offline at worker init; user profile sync worker idle.'
      );
      return;
    }

    // Disable during tests unless explicitly enabled
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_WORKERS_IN_TESTS !== 'true'
    ) {
      this.logger.debug(
        'User profile sync worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)'
      );
      return;
    }

    // Check if Zitadel is configured
    if (!this.zitadelService.isConfigured()) {
      this.logger.warn(
        'Zitadel not configured; user profile sync worker disabled'
      );
      return;
    }

    this.start();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  /**
   * Start the sync worker
   */
  start(
    intervalMs: number = parseInt(
      process.env.USER_PROFILE_SYNC_INTERVAL_MS || '300000', // 5 minutes default
      10
    )
  ) {
    if (this.timer) return; // already started
    this.running = true;

    const tick = async () => {
      if (!this.running) return;
      try {
        this.currentBatch = this.processBatch();
        await this.currentBatch;
      } catch (e) {
        this.logger.warn('processBatch failed: ' + (e as Error).message);
      } finally {
        this.currentBatch = null;
      }
      this.timer = setTimeout(tick, intervalMs);
    };

    // Start after a short delay to let the app fully initialize
    this.timer = setTimeout(tick, 5000);
    this.logger.log(
      `User profile sync worker started (interval=${intervalMs}ms)`
    );
  }

  /**
   * Stop the sync worker
   */
  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;

    // Wait for current batch to finish
    if (this.currentBatch) {
      this.logger.debug(
        'Waiting for current batch to complete before stopping...'
      );
      try {
        await this.currentBatch;
      } catch (error) {
        this.logger.warn('Current batch failed during shutdown', error);
      }
    }

    this.logger.log('User profile sync worker stopped');
  }

  /**
   * Process a batch of users that need sync
   * Exposed for testing and manual invocation
   */
  async processBatch(): Promise<void> {
    const batchSize = parseInt(
      process.env.USER_PROFILE_SYNC_BATCH_SIZE || '10',
      10
    );

    // Find users with incomplete data
    const usersToSync = await this.findUsersNeedingSync(batchSize);

    if (usersToSync.length === 0) {
      this.logger.debug('No users need sync');
      return;
    }

    this.logger.log(`Processing ${usersToSync.length} users for profile sync`);

    const results: SyncResult[] = [];

    for (const user of usersToSync) {
      const result = await this.syncUser(user);
      results.push(result);
      this.processedCount++;

      if (result.success) {
        this.successCount++;
      } else {
        this.failureCount++;
      }
    }

    this.lastSyncAt = new Date();

    // Log summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    this.logger.log(
      `Sync batch complete: ${succeeded} succeeded, ${failed} failed`
    );

    // Log details for successful syncs
    for (const result of results.filter((r) => r.success)) {
      if (result.updatedFields.length > 0) {
        this.logger.debug(
          `Updated user ${result.userId}: ${result.updatedFields.join(', ')}`
        );
      }
    }
  }

  /**
   * Manually trigger a sync for a specific user
   * Useful for testing and on-demand sync
   */
  async syncUserById(userId: string): Promise<SyncResult | null> {
    const user = await this.userProfileRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user) {
      return null;
    }

    return this.syncUser(user);
  }

  /**
   * Find users that need sync (missing profile data or email)
   */
  private async findUsersNeedingSync(limit: number): Promise<UserProfile[]> {
    // Find users with:
    // 1. Valid Zitadel user ID (numeric, not test-user-*)
    // 2. Not soft-deleted
    // 3. Missing firstName, lastName, displayName, OR no email in user_emails table

    const query = this.userProfileRepository
      .createQueryBuilder('profile')
      // Use the entity relation defined in UserProfile.emails
      .leftJoin('profile.emails', 'email')
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
      .take(limit);

    return query.getMany();
  }

  /**
   * Sync a single user's profile from Zitadel
   */
  private async syncUser(user: UserProfile): Promise<SyncResult> {
    const result: SyncResult = {
      userId: user.id,
      zitadelUserId: user.zitadelUserId,
      success: false,
      updatedFields: [],
    };

    try {
      // Fetch user data from Zitadel
      const zitadelUser = await this.zitadelService.getUserById(
        user.zitadelUserId
      );

      if (!zitadelUser) {
        result.error = 'User not found in Zitadel';
        return result;
      }

      // Update profile fields if they're null locally
      const profileUpdates = this.buildProfileUpdates(user, zitadelUser);

      // Always update lastSyncedAt on successful sync
      profileUpdates.lastSyncedAt = new Date();

      if (Object.keys(profileUpdates).length > 0) {
        await this.userProfileRepository.update(user.id, profileUpdates);
        // Don't include lastSyncedAt in updatedFields report (it's always updated)
        const reportableUpdates = Object.keys(profileUpdates).filter(
          (k) => k !== 'lastSyncedAt'
        );
        result.updatedFields.push(...reportableUpdates);
      }

      // Sync email if missing locally
      const emailUpdated = await this.syncUserEmail(user, zitadelUser);
      if (emailUpdated) {
        result.updatedFields.push('email');
      }

      result.success = true;
      return result;
    } catch (error) {
      result.error = (error as Error).message;
      this.logger.warn(`Failed to sync user ${user.id}: ${result.error}`);
      return result;
    }
  }

  /**
   * Build profile update object (only update null fields)
   */
  private buildProfileUpdates(
    user: UserProfile,
    zitadelUser: ZitadelUser
  ): Partial<UserProfile> {
    const updates: Partial<UserProfile> = {};

    if (!user.firstName && zitadelUser.profile?.firstName) {
      updates.firstName = zitadelUser.profile.firstName;
    }

    if (!user.lastName && zitadelUser.profile?.lastName) {
      updates.lastName = zitadelUser.profile.lastName;
    }

    if (!user.displayName && zitadelUser.profile?.displayName) {
      updates.displayName = zitadelUser.profile.displayName;
    }

    return updates;
  }

  /**
   * Sync user email from Zitadel (add if missing locally)
   */
  private async syncUserEmail(
    user: UserProfile,
    zitadelUser: ZitadelUser
  ): Promise<boolean> {
    if (!zitadelUser.email) {
      return false;
    }

    // Check if user already has this email
    const existingEmail = await this.userEmailRepository.findOne({
      where: {
        userId: user.id,
        email: zitadelUser.email,
      },
    });

    if (existingEmail) {
      return false; // Already have this email
    }

    // Check if email exists for another user
    const emailInUse = await this.userEmailRepository.findOne({
      where: {
        email: zitadelUser.email,
      },
    });

    if (emailInUse) {
      this.logger.warn(
        `Email ${zitadelUser.email} already in use by another user, skipping sync for user ${user.id}`
      );
      return false;
    }

    // Create the email record
    const userEmail = this.userEmailRepository.create({
      userId: user.id,
      email: zitadelUser.email,
      verified: zitadelUser.emailVerified ?? false,
    });

    await this.userEmailRepository.save(userEmail);
    this.logger.debug(`Added email ${zitadelUser.email} for user ${user.id}`);

    return true;
  }

  /**
   * Get worker statistics
   */
  stats() {
    return {
      processed: this.processedCount,
      succeeded: this.successCount,
      failed: this.failureCount,
      lastSyncAt: this.lastSyncAt,
      running: this.running,
    };
  }
}
