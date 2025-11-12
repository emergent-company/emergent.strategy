import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ZitadelService } from '../auth/zitadel.service';
import { Invite } from '../../entities/invite.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

interface CreateInviteWithUserDto {
  email: string;
  firstName: string;
  lastName: string;
  organizationId?: string;
  projectId?: string;
  role: 'org_admin' | 'project_admin' | 'project_user';
  invitedByUserId: string;
}

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    @InjectRepository(Invite)
    private readonly inviteRepository: Repository<Invite>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(ProjectMembership)
    private readonly projectMembershipRepository: Repository<ProjectMembership>,
    @InjectRepository(OrganizationMembership)
    private readonly orgMembershipRepository: Repository<OrganizationMembership>,
    private readonly dataSource: DataSource,
    private readonly zitadelService: ZitadelService
  ) {}

  private randomToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Create invitation AND Zitadel user in a single operation
   *
   * Flow:
   * 1. Check if user already exists in Zitadel
   * 2. If not, create new Zitadel user
   * 3. Store invitation metadata in Zitadel
   * 4. Create invitation record in database
   * 5. Send password set notification email
   * 6. Return invitation details
   */
  async createWithUser(dto: CreateInviteWithUserDto): Promise<{
    inviteId: string;
    token: string;
    zitadelUserId: string;
    email: string;
  }> {
    const {
      email,
      firstName,
      lastName,
      organizationId,
      projectId,
      role,
      invitedByUserId,
    } = dto;

    // Validate input
    if (!organizationId && !projectId) {
      throw new BadRequestException(
        'Either organizationId or projectId must be provided'
      );
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    try {
      // Step 1: Check if user already exists in Zitadel
      let existingUser = await this.zitadelService.getUserByEmail(email);
      let zitadelUserId: string;

      if (existingUser) {
        this.logger.log(
          `User already exists in Zitadel: ${existingUser.id} (${email})`
        );
        zitadelUserId = existingUser.id;
      } else {
        // Step 2: Create new Zitadel user
        zitadelUserId = await this.zitadelService.createUser(
          email,
          firstName,
          lastName
        );
        this.logger.log(
          `Created new Zitadel user: ${zitadelUserId} (${email})`
        );
      }

      // Step 3: Generate invitation token
      const inviteId = uuidv4();
      const token = this.randomToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      // Step 4: Store invitation metadata in Zitadel
      const inviteMetadata = {
        inviteId,
        role,
        organizationId: organizationId || null,
        projectId: projectId || null,
        invitedByUserId,
        invitedAt: new Date().toISOString(),
      };

      await this.zitadelService.updateUserMetadata(zitadelUserId, {
        'spec-server-invite': inviteMetadata,
      });

      // Step 5: Create invitation record in database
      const invite = this.inviteRepository.create({
        id: inviteId,
        token,
        email: email.toLowerCase(),
        organizationId: organizationId!,
        projectId: projectId || null,
        expiresAt,
        status: 'pending',
        role,
      });
      await this.inviteRepository.save(invite);

      // Step 6: Send password set notification email
      await this.zitadelService.sendSetPasswordNotification(
        zitadelUserId,
        inviteId
      );

      this.logger.log(
        `Created invitation ${inviteId} for ${email} (Zitadel user: ${zitadelUserId})`
      );

      return {
        inviteId,
        token,
        zitadelUserId,
        email: email.toLowerCase(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to create invitation with user: ${(error as Error).message}`
      );
      throw error;
    }
  }

  async create(
    orgId: string,
    role: string,
    email: string,
    projectId?: string | null
  ) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException({
        error: { code: 'validation-failed', message: 'Invalid email' },
      });
    }

    const token = this.randomToken();
    const invite = this.inviteRepository.create({
      organizationId: orgId,
      projectId: projectId || null,
      email: email.toLowerCase(),
      role,
      token,
    });

    const saved = await this.inviteRepository.save(invite);
    return {
      id: saved.id,
      orgId: saved.organizationId,
      projectId: saved.projectId,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      token: saved.token,
    };
  }

  async accept(token: string, userId: string) {
    const invite = await this.inviteRepository.findOne({ where: { token } });
    if (!invite) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Invite not found' },
      });
    }
    if (invite.status !== 'pending') {
      throw new BadRequestException({
        error: { code: 'invalid-state', message: 'Invite not pending' },
      });
    }

    // Get user's zitadel_user_id for role granting
    const userProfile = await this.userProfileRepository.findOne({
      where: { id: userId },
      select: ['zitadelUserId'],
    });

    if (!userProfile) {
      throw new BadRequestException({
        error: { code: 'user-not-found', message: 'User profile not found' },
      });
    }

    const zitadelUserId = userProfile.zitadelUserId;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Grant role in Zitadel if project invite
      if (invite.projectId && this.zitadelService.isConfigured()) {
        const projectId = process.env.ZITADEL_PROJECT_ID;
        if (projectId) {
          try {
            // Determine Zitadel role based on invite role
            const zitadelRole =
              invite.role === 'org_admin' ? 'org_admin' : 'project_user';
            await this.zitadelService.grantProjectRole(
              zitadelUserId,
              projectId,
              zitadelRole
            );
            this.logger.log(
              `Granted role ${zitadelRole} in project ${projectId} to user ${zitadelUserId}`
            );
          } catch (error) {
            this.logger.warn(
              `Failed to grant Zitadel role (continuing with database memberships): ${
                (error as Error).message
              }`
            );
            // Continue with database memberships even if Zitadel grant fails
          }
        }
      }

      // userId is now the internal UUID from req.user.id
      if (invite.projectId) {
        const membership = this.projectMembershipRepository.create({
          projectId: invite.projectId,
          userId,
          role: invite.role,
        });
        await queryRunner.manager.save(membership).catch(() => {
          // Ignore conflict - already exists
        });
      } else if (invite.role === 'org_admin') {
        const membership = this.orgMembershipRepository.create({
          organizationId: invite.organizationId,
          userId,
          role: 'org_admin',
        });
        await queryRunner.manager.save(membership).catch(() => {
          // Ignore conflict - already exists
        });
      } else {
        // non-admin org-level roles not yet implemented, treat as project-level requirement missing
        throw new BadRequestException({
          error: {
            code: 'unsupported',
            message: 'Non-admin org invite unsupported without project',
          },
        });
      }

      invite.status = 'accepted';
      invite.acceptedAt = new Date();
      await queryRunner.manager.save(invite);

      await queryRunner.commitTransaction();

      this.logger.log(`User ${userId} accepted invitation ${invite.id}`);
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
    return { status: 'accepted' };
  }
}
