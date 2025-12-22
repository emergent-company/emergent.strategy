import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from '../../entities/user-profile.entity';

/** Debounce interval for activity tracking (ms). One DB write per user per interval. */
const DEBOUNCE_MS = 60_000;

/**
 * In-memory cache: userId -> timestamp of last DB write.
 * Multi-instance deployments each maintain their own cache (acceptable ~60s granularity).
 */
const activityCache = new Map<string, number>();

/**
 * Middleware that tracks user activity by updating `lastActivityAt` timestamp.
 * @see openspec/changes/add-superadmin-panel/design.md (D3)
 */
@Injectable()
export class ActivityTrackingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ActivityTrackingMiddleware.name);

  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>
  ) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const user = (req as any).user;
    if (!user?.id) {
      return next();
    }

    this.trackActivity(user.id as string);
    next();
  }

  private trackActivity(userId: string): void {
    const now = Date.now();
    const lastUpdate = activityCache.get(userId) || 0;

    if (now - lastUpdate > DEBOUNCE_MS) {
      activityCache.set(userId, now);

      this.updateActivityInDb(userId).catch((error) => {
        this.logger.warn(
          `Failed to update activity for user ${userId}: ${error.message}`
        );
        activityCache.delete(userId);
      });
    }
  }

  async updateActivityInDb(userId: string): Promise<void> {
    await this.userProfileRepository.update(
      { id: userId },
      { lastActivityAt: new Date() }
    );
  }

  /** @internal Test utility: get current cache state */
  static getActivityCache(): Map<string, number> {
    return activityCache;
  }

  /** @internal Test utility: clear the activity cache */
  static clearActivityCache(): void {
    activityCache.clear();
  }

  /** @internal Test utility: set a specific cache entry */
  static setCacheEntry(userId: string, timestamp: number): void {
    activityCache.set(userId, timestamp);
  }
}
