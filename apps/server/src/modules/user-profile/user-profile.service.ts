import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not } from 'typeorm';
import {
  UserProfileDto,
  UpdateUserProfileDto,
  AlternativeEmailDto,
} from './dto/profile.dto';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { Org } from '../../entities/org.entity';
import { Project } from '../../entities/project.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { EmailService } from '../email/email.service';
import { ZitadelService } from '../auth/zitadel.service';

/**
 * Simple in-memory cache entry with expiration
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory cache for user profiles to reduce DB queries during auth
 *
 * Why in-memory vs Redis:
 * - User profiles are read frequently during every authenticated request
 * - Data is small (just profile DTOs)
 * - TTL is short (60 seconds) so staleness is minimal
 * - Avoids Redis round-trip latency for hot path
 *
 * Cache invalidation:
 * - TTL-based (60 seconds default)
 * - Explicit invalidation on profile updates
 * - Max size limit to prevent memory issues
 */
class ProfileCache {
  private cache = new Map<string, CacheEntry<UserProfileDto>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 10000, ttlSeconds = 60) {
    this.maxSize = maxSize;
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): UserProfileDto | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: UserProfileDto): void {
    // Evict oldest entries if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateByUserId(userId: string): void {
    // Invalidate by internal UUID (used after profile updates)
    for (const [key, entry] of this.cache.entries()) {
      if (entry.value.id === userId) {
        this.cache.delete(key);
      }
    }
  }
}

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  // In-memory cache for user profile lookups (reduces DB queries in auth flow)
  // Cache key: zitadelUserId, value: UserProfileDto
  private readonly profileCache = new ProfileCache(
    parseInt(process.env.USER_PROFILE_CACHE_MAX_SIZE || '10000', 10),
    parseInt(process.env.USER_PROFILE_CACHE_TTL_SECONDS || '60', 10)
  );

  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(Org)
    private readonly orgRepository: Repository<Org>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(OrganizationMembership)
    private readonly orgMembershipRepository: Repository<OrganizationMembership>,
    @InjectRepository(ProjectMembership)
    private readonly projectMembershipRepository: Repository<ProjectMembership>,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => ZitadelService))
    private readonly zitadelService: ZitadelService,
    private readonly dataSource: DataSource
  ) {}

  private map(row: any): UserProfileDto {
    return {
      id: row.id,
      subjectId: row.zitadel_user_id, // Legacy field name for backwards compat
      zitadelUserId: row.zitadel_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      phoneE164: row.phone_e164,
      avatarObjectKey: row.avatar_object_key,
    };
  }

  async get(zitadelUserId: string): Promise<UserProfileDto | null> {
    // Used by auth service - accepts Zitadel ID
    // Check cache first (reduces DB queries in hot auth path)
    const cached = this.profileCache.get(zitadelUserId);
    if (cached) {
      return cached;
    }

    const profile = await this.userProfileRepository.findOne({
      where: { zitadelUserId },
    });
    if (!profile) return null;

    const dto = this.mapEntity(profile);
    // Cache the profile for subsequent requests
    this.profileCache.set(zitadelUserId, dto);
    return dto;
  }

  async getById(userId: string): Promise<UserProfileDto | null> {
    // Used by controllers - accepts internal UUID
    const profile = await this.userProfileRepository.findOne({
      where: { id: userId },
    });
    if (!profile) return null;
    return this.mapEntity(profile);
  }

  /**
   * Get user profile with primary email for auth purposes.
   * Used by auth service to avoid redundant Zitadel API calls.
   * Returns cached profile data including the user's primary email if available.
   */
  async getWithEmail(
    zitadelUserId: string
  ): Promise<(UserProfileDto & { email?: string }) | null> {
    const profile = await this.get(zitadelUserId);
    if (!profile) return null;

    // Fetch primary email (first one added)
    const primaryEmail = await this.userEmailRepository.findOne({
      where: { userId: profile.id },
      order: { createdAt: 'ASC' },
    });

    return {
      ...profile,
      email: primaryEmail?.email,
    };
  }

  async upsertBase(
    subjectId: string,
    profile?: {
      firstName?: string;
      lastName?: string;
      displayName?: string;
      email?: string;
    }
  ): Promise<void> {
    // Check if ACTIVE (non-deleted) user exists first to avoid overwriting local changes (Requirement: User Profile Persistence)
    let userProfile = await this.userProfileRepository.findOne({
      where: { zitadelUserId: subjectId, deletedAt: IsNull() },
      select: ['id', 'welcomeEmailSentAt'],
    });

    if (!userProfile) {
      // Check if there's a soft-deleted profile to reactivate
      const deletedProfile = await this.userProfileRepository.findOne({
        where: { zitadelUserId: subjectId, deletedAt: Not(IsNull()) },
        select: ['id'],
      });

      if (deletedProfile) {
        // Reactivate the soft-deleted profile
        this.logger.log(
          `Reactivating soft-deleted profile ${deletedProfile.id} for Zitadel user ${subjectId}`
        );
        await this.userProfileRepository.update(deletedProfile.id, {
          deletedAt: null,
          deletedBy: null,
          welcomeEmailSentAt: null, // Reset so they get welcome email again
          firstName: profile?.firstName,
          lastName: profile?.lastName,
          displayName: profile?.displayName,
        });
        userProfile = await this.userProfileRepository.findOne({
          where: { id: deletedProfile.id },
          select: ['id', 'welcomeEmailSentAt'],
        });
      } else {
        // Create new user with profile data from Zitadel (Requirement: User Profile Data Sync)
        userProfile = await this.userProfileRepository.save({
          zitadelUserId: subjectId,
          firstName: profile?.firstName,
          lastName: profile?.lastName,
          displayName: profile?.displayName,
        });
      }
    }

    // Sync email to user_emails table if provided
    if (profile?.email && userProfile?.id) {
      const normalizedEmail = profile.email.trim().toLowerCase();
      try {
        // Check if this email already exists for this user
        const existingEmail = await this.userEmailRepository.findOne({
          where: { userId: userProfile.id, email: normalizedEmail },
        });
        if (!existingEmail) {
          // Check if email exists for another user (unique constraint)
          const emailInUse = await this.userEmailRepository.findOne({
            where: { email: normalizedEmail },
          });
          if (!emailInUse) {
            await this.userEmailRepository.save({
              userId: userProfile.id,
              email: normalizedEmail,
              verified: true, // Email from Zitadel JWT is considered verified
            });
          }
        }
      } catch (error) {
        // Log but don't fail auth on email sync error
        this.logger.warn(
          `Failed to sync email for user ${userProfile.id}: ${error}`
        );
      }

      // Send welcome email to new users (only once)
      // Check welcomeEmailSentAt to ensure we only send once, even if profile existed before
      if (!userProfile.welcomeEmailSentAt) {
        await this.sendWelcomeEmailAsync(
          userProfile.id,
          normalizedEmail,
          profile.firstName || profile.displayName
        );
      }
    }
  }

  /**
   * Send welcome email asynchronously (fire-and-forget).
   * Errors are logged but don't block the login flow.
   */
  private async sendWelcomeEmailAsync(
    userId: string,
    email: string,
    name?: string
  ): Promise<void> {
    try {
      const adminUrl = process.env.ADMIN_URL || 'http://localhost:5176';
      const dashboardUrl = `${adminUrl}/`;

      const result = await this.emailService.sendWelcomeEmail({
        toEmail: email,
        toName: name,
        dashboardUrl,
        userId,
      });

      if (result.queued) {
        // Mark welcome email as sent
        await this.userProfileRepository.update(userId, {
          welcomeEmailSentAt: new Date(),
        });
        this.logger.log(`Welcome email queued for user ${userId}`);
      } else {
        this.logger.warn(
          `Failed to queue welcome email for user ${userId}: ${result.error}`
        );
      }
    } catch (error) {
      // Log but don't fail - welcome email is non-critical
      this.logger.error(
        `Error sending welcome email for user ${userId}`,
        error
      );
    }
  }

  private mapEntity(profile: UserProfile): UserProfileDto {
    return {
      id: profile.id,
      subjectId: profile.zitadelUserId,
      zitadelUserId: profile.zitadelUserId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      displayName: profile.displayName,
      phoneE164: profile.phoneE164,
      avatarObjectKey: profile.avatarObjectKey,
    };
  }

  async update(
    userId: string,
    patch: UpdateUserProfileDto
  ): Promise<UserProfileDto> {
    const profile = await this.userProfileRepository.findOne({
      where: { id: userId },
    });
    if (!profile) throw new Error('not_found');

    // Update only provided fields
    if (patch.firstName !== undefined) profile.firstName = patch.firstName;
    if (patch.lastName !== undefined) profile.lastName = patch.lastName;
    if (patch.displayName !== undefined)
      profile.displayName = patch.displayName;
    if (patch.phoneE164 !== undefined) profile.phoneE164 = patch.phoneE164;

    const updated = await this.userProfileRepository.save(profile);

    // Invalidate cache for this user (by zitadelUserId)
    if (profile.zitadelUserId) {
      this.profileCache.invalidate(profile.zitadelUserId);
    }

    return this.mapEntity(updated);
  }

  async listAlternativeEmails(userId: string): Promise<AlternativeEmailDto[]> {
    const emails = await this.userEmailRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return emails.map((e) => ({
      email: e.email,
      verified: e.verified,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async addAlternativeEmail(
    userId: string,
    emailRaw: string
  ): Promise<AlternativeEmailDto> {
    const email = emailRaw.trim().toLowerCase();

    // Check if email already exists for this user
    const existing = await this.userEmailRepository.findOne({
      where: { userId, email },
    });
    if (existing) {
      return {
        email: existing.email,
        verified: existing.verified,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    // Insert new email
    const newEmail = this.userEmailRepository.create({
      userId,
      email,
      verified: false,
    });
    const saved = await this.userEmailRepository.save(newEmail);

    // TODO: trigger verification email dispatch (out of scope now)
    return {
      email: saved.email,
      verified: saved.verified,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async deleteAlternativeEmail(
    userId: string,
    emailRaw: string
  ): Promise<{ status: 'deleted' }> {
    const email = emailRaw.trim().toLowerCase();
    await this.userEmailRepository.delete({ userId, email });
    return { status: 'deleted' };
  }

  /**
   * Soft-delete a user account and cascade to owned orgs/projects
   *
   * Cascade logic:
   * 1. Find all orgs where user is sole owner
   * 2. For each such org, soft-delete all its projects
   * 3. Soft-delete those orgs
   * 4. Remove user's memberships from other orgs/projects
   * 5. Soft-delete user profile
   * 6. Deactivate user in Zitadel (prevents login)
   *
   * @param userId - Internal user UUID
   * @returns Summary of what was deleted
   */
  async softDeleteAccount(userId: string): Promise<{
    deletedOrgs: string[];
    deletedProjects: string[];
    removedMemberships: number;
  }> {
    const now = new Date();
    const deletedOrgs: string[] = [];
    const deletedProjects: string[] = [];
    let removedMemberships = 0;

    // Get the user profile to find Zitadel user ID
    const userProfile = await this.userProfileRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!userProfile) {
      throw new Error('User not found or already deleted');
    }

    // Use a transaction for atomicity
    await this.dataSource.transaction(async (manager) => {
      // 1. Find all org memberships for this user with role 'owner'
      const ownerMemberships = await manager.find(OrganizationMembership, {
        where: { userId, role: 'owner' },
      });

      for (const membership of ownerMemberships) {
        // Check if this user is the SOLE owner of this org
        const ownerCount = await manager.count(OrganizationMembership, {
          where: { organizationId: membership.organizationId, role: 'owner' },
        });

        if (ownerCount === 1) {
          // User is sole owner - soft delete org and all its projects
          const orgId = membership.organizationId;

          // Find and soft-delete all projects in this org
          const projects = await manager.find(Project, {
            where: { organizationId: orgId, deletedAt: IsNull() },
          });

          for (const project of projects) {
            await manager.update(Project, project.id, {
              deletedAt: now,
              deletedBy: userId,
            });
            deletedProjects.push(project.id);
            this.logger.log(`Soft-deleted project: ${project.id}`);
          }

          // Soft-delete the org
          await manager.update(Org, orgId, {
            deletedAt: now,
            deletedBy: userId,
          });
          deletedOrgs.push(orgId);
          this.logger.log(`Soft-deleted org: ${orgId}`);
        }
      }

      // 2. Remove all org memberships for this user (both owned and non-owned)
      const orgMembershipsDeleted = await manager.delete(
        OrganizationMembership,
        {
          userId,
        }
      );
      removedMemberships += orgMembershipsDeleted.affected || 0;

      // 3. Remove all project memberships for this user
      const projectMembershipsDeleted = await manager.delete(
        ProjectMembership,
        {
          userId,
        }
      );
      removedMemberships += projectMembershipsDeleted.affected || 0;

      // 4. Soft-delete the user profile
      await manager.update(UserProfile, userId, {
        deletedAt: now,
        deletedBy: userId,
      });
      this.logger.log(`Soft-deleted user profile: ${userId}`);
    });

    // 5. Deactivate user in Zitadel (outside transaction - external service)
    if (userProfile.zitadelUserId) {
      try {
        await this.zitadelService.deactivateUser(userProfile.zitadelUserId);
        this.logger.log(
          `Deactivated Zitadel user: ${userProfile.zitadelUserId}`
        );
      } catch (error) {
        // Log but don't fail - user is already soft-deleted locally
        this.logger.error(
          `Failed to deactivate Zitadel user ${userProfile.zitadelUserId}: ${
            (error as Error).message
          }`
        );
      }
    }

    return {
      deletedOrgs,
      deletedProjects,
      removedMemberships,
    };
  }
}
