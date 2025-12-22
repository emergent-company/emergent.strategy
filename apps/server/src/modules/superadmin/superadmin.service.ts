import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Superadmin } from '../../entities/superadmin.entity';

@Injectable()
export class SuperadminService {
  private readonly logger = new Logger(SuperadminService.name);
  private readonly cache = new Map<
    string,
    { isSuperadmin: boolean; cachedAt: number }
  >();
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    @InjectRepository(Superadmin)
    private readonly superadminRepo: Repository<Superadmin>
  ) {}

  /**
   * @param userId - Internal user profile UUID
   * @returns true if user is an active superadmin
   */
  async isSuperadmin(userId: string): Promise<boolean> {
    const cached = this.cache.get(userId);
    const now = Date.now();
    if (cached && now - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.isSuperadmin;
    }

    const grant = await this.superadminRepo.findOne({
      where: {
        userId,
        revokedAt: IsNull(),
      },
    });

    const isSuperadmin = !!grant;
    this.cache.set(userId, { isSuperadmin, cachedAt: now });

    if (isSuperadmin) {
      this.logger.debug(`User ${userId} is a superadmin`);
    }

    return isSuperadmin;
  }

  /**
   * @returns Array of active superadmin grants with user relations
   */
  async getSuperadmins(): Promise<Superadmin[]> {
    return this.superadminRepo.find({
      where: {
        revokedAt: IsNull(),
      },
      relations: ['user', 'grantedByUser'],
      order: {
        grantedAt: 'DESC',
      },
    });
  }

  /**
   * @param userId - Internal user profile UUID
   * @returns Superadmin grant or null
   */
  async getSuperadminGrant(userId: string): Promise<Superadmin | null> {
    return this.superadminRepo.findOne({
      where: {
        userId,
        revokedAt: IsNull(),
      },
      relations: ['user', 'grantedByUser'],
    });
  }

  clearCache(userId: string): void {
    this.cache.delete(userId);
    this.logger.debug(`Cleared superadmin cache for user ${userId}`);
  }

  clearAllCache(): void {
    this.cache.clear();
    this.logger.debug('Cleared all superadmin cache');
  }
}
