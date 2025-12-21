import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ZitadelService } from '../auth/zitadel.service';
import { EmailService } from '../email/email.service';
import { Invite } from '../../entities/invite.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { Project } from '../../entities/project.entity';
import { Org } from '../../entities/org.entity';
import { PendingInviteDto, SentInviteDto } from './dto/invite.dto';
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
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(ProjectMembership)
    private readonly projectMembershipRepository: Repository<ProjectMembership>,
    @InjectRepository(OrganizationMembership)
    private readonly orgMembershipRepository: Repository<OrganizationMembership>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Org)
    private readonly orgRepository: Repository<Org>,
    private readonly dataSource: DataSource,
    private readonly zitadelService: ZitadelService,
    private readonly emailService: EmailService
  ) {}

  private randomToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Send invitation email to the invited user.
   *
   * This method sends a branded invitation email via our email infrastructure.
   * The Zitadel password notification is still sent as a fallback/secondary mechanism.
   *
   * @param params.email - Recipient email address
   * @param params.recipientName - Recipient's display name (optional)
   * @param params.inviterName - Inviter's display name (optional)
   * @param params.organizationName - Organization name the user is being invited to
   * @param params.inviteId - Invitation ID for tracking
   * @param params.token - Invitation token for the accept URL
   * @param params.expiresAt - Invitation expiration date (optional)
   */
  private async sendInvitationEmail(params: {
    email: string;
    recipientName?: string;
    inviterName?: string;
    organizationName: string;
    inviteId: string;
    token: string;
    expiresAt?: Date;
  }): Promise<void> {
    // Skip if email service is disabled
    if (!this.emailService.isEnabled()) {
      this.logger.debug(
        `Email service disabled, skipping invitation email for ${params.email}`
      );
      return;
    }

    // Construct the invitation acceptance URL
    const adminUrl = process.env.ADMIN_URL || 'http://localhost:5176';
    const inviteUrl = `${adminUrl}/invites/accept?token=${params.token}`;

    // Format expiration date if provided
    const expiresAtFormatted = params.expiresAt
      ? params.expiresAt.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : undefined;

    const result = await this.emailService.sendTemplatedEmail({
      templateName: 'invitation',
      toEmail: params.email,
      toName: params.recipientName,
      subject: `You've been invited to join ${params.organizationName}`,
      templateData: {
        recipientName: params.recipientName,
        inviterName: params.inviterName,
        organizationName: params.organizationName,
        inviteUrl,
        expiresAt: expiresAtFormatted,
      },
      sourceType: 'invite',
      sourceId: params.inviteId,
    });

    if (result.queued) {
      this.logger.log(
        `Queued invitation email for ${params.email} (job: ${result.jobId})`
      );
    } else {
      this.logger.warn(
        `Failed to queue invitation email for ${params.email}: ${result.error}`
      );
    }
  }

  /**
   * Create invitation AND Zitadel user in a single operation
   *
   * Flow:
   * 1. Check if user already exists in Zitadel
   * 2. If not, create new Zitadel user
   * 3. Store invitation metadata in Zitadel
   * 4. Create invitation record in database
   * 5. Send branded invitation email (if email service enabled)
   * 6. Send Zitadel password set notification as fallback
   * 7. Return invitation details
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
      // Fetch organization name for the invitation email
      let organizationName = 'the organization';
      if (organizationId) {
        const org = await this.orgRepository.findOne({
          where: { id: organizationId },
          select: ['name'],
        });
        if (org?.name) {
          organizationName = org.name;
        }
      }

      // Fetch inviter's name for the invitation email
      let inviterName: string | undefined;
      if (invitedByUserId) {
        const inviterProfile = await this.userProfileRepository.findOne({
          where: { id: invitedByUserId },
          select: ['displayName'],
        });
        if (inviterProfile?.displayName) {
          inviterName = inviterProfile.displayName;
        }
      }

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

      // Step 6: Send branded invitation email (non-blocking)
      // This runs in the background - we don't await to avoid blocking the invite flow
      this.sendInvitationEmail({
        email: email.toLowerCase(),
        recipientName: `${firstName} ${lastName}`.trim() || undefined,
        inviterName,
        organizationName,
        inviteId,
        token,
        expiresAt,
      }).catch((err) => {
        this.logger.error(
          `Error sending invitation email for ${email}: ${
            (err as Error).message
          }`
        );
      });

      // Step 7: Send Zitadel password set notification as fallback
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

  /**
   * Create an invitation by email only.
   *
   * This method:
   * 1. Checks if user already exists in Zitadel
   * 2. If not, creates a new Zitadel user with name derived from email
   * 3. Creates the invitation record
   * 4. Sends invitation email
   * 5. For new users, sends Zitadel password notification
   *
   * @param orgId - Organization ID
   * @param role - Role to assign ('org_admin', 'project_admin', 'project_user')
   * @param email - Email address to invite
   * @param projectId - Optional project ID for project invitations
   * @param invitedByUserId - Optional user ID of the person sending the invite
   */
  async create(
    orgId: string,
    role: string,
    email: string,
    projectId?: string | null,
    invitedByUserId?: string
  ) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException({
        error: { code: 'validation-failed', message: 'Invalid email' },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Fetch organization name for the invitation email
      let organizationName = 'the organization';
      const org = await this.orgRepository.findOne({
        where: { id: orgId },
        select: ['name'],
      });
      if (org?.name) {
        organizationName = org.name;
      }

      // Fetch inviter's name for the invitation email
      let inviterName: string | undefined;
      if (invitedByUserId) {
        const inviterProfile = await this.userProfileRepository.findOne({
          where: { id: invitedByUserId },
          select: ['displayName'],
        });
        if (inviterProfile?.displayName) {
          inviterName = inviterProfile.displayName;
        }
      }

      // Check if user already exists in Zitadel
      let existingUser = await this.zitadelService.getUserByEmail(
        normalizedEmail
      );
      let zitadelUserId: string | undefined;
      let isNewUser = false;

      if (existingUser) {
        this.logger.log(
          `User already exists in Zitadel: ${existingUser.id} (${normalizedEmail})`
        );
        zitadelUserId = existingUser.id;
      } else {
        // Derive name from email (e.g., "john.doe@example.com" -> firstName: "John", lastName: "Doe")
        const emailPrefix = normalizedEmail.split('@')[0];
        const nameParts = emailPrefix.split(/[._-]/).filter(Boolean);

        let firstName: string;
        let lastName: string;

        if (nameParts.length >= 2) {
          // e.g., john.doe -> John Doe
          firstName = this.capitalizeFirstLetter(nameParts[0]);
          lastName = this.capitalizeFirstLetter(nameParts.slice(1).join(' '));
        } else if (nameParts.length === 1) {
          // e.g., johndoe -> Johndoe (no separator)
          firstName = this.capitalizeFirstLetter(nameParts[0]);
          lastName = ''; // Zitadel may require a last name, we'll use empty string
        } else {
          // Fallback
          firstName = 'User';
          lastName = '';
        }

        // Create new Zitadel user
        zitadelUserId = await this.zitadelService.createUser(
          normalizedEmail,
          firstName,
          lastName || firstName // Use firstName as lastName fallback if empty
        );
        isNewUser = true;
        this.logger.log(
          `Created new Zitadel user: ${zitadelUserId} (${normalizedEmail}) with name "${firstName} ${
            lastName || firstName
          }"`
        );
      }

      // Generate invitation token and set expiry
      const inviteId = uuidv4();
      const token = this.randomToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      // Store invitation metadata in Zitadel (if we have a Zitadel user)
      if (zitadelUserId) {
        const inviteMetadata = {
          inviteId,
          role,
          organizationId: orgId,
          projectId: projectId || null,
          invitedByUserId: invitedByUserId || null,
          invitedAt: new Date().toISOString(),
        };

        await this.zitadelService.updateUserMetadata(zitadelUserId, {
          'spec-server-invite': inviteMetadata,
        });
      }

      // Create invitation record in database
      const invite = this.inviteRepository.create({
        id: inviteId,
        token,
        organizationId: orgId,
        projectId: projectId || null,
        email: normalizedEmail,
        role,
        expiresAt,
        status: 'pending',
      });
      const saved = await this.inviteRepository.save(invite);

      // Send branded invitation email (non-blocking)
      this.sendInvitationEmail({
        email: normalizedEmail,
        inviterName,
        organizationName,
        inviteId,
        token,
        expiresAt,
      }).catch((err) => {
        this.logger.error(
          `Error sending invitation email for ${normalizedEmail}: ${
            (err as Error).message
          }`
        );
      });

      // For new users, send Zitadel password set notification (non-blocking)
      // This is optional - the user can always use "Forgot Password" on the login page
      if (isNewUser && zitadelUserId) {
        this.zitadelService
          .sendSetPasswordNotification(zitadelUserId, inviteId)
          .catch((err) => {
            this.logger.warn(
              `Optional: Failed to send Zitadel password notification for ${normalizedEmail}: ${
                (err as Error).message
              }`
            );
          });
      }

      this.logger.log(
        `Created invitation ${inviteId} for ${normalizedEmail}${
          isNewUser ? ' (new user)' : ' (existing user)'
        }`
      );

      return {
        id: saved.id,
        orgId: saved.organizationId,
        projectId: saved.projectId,
        email: saved.email,
        role: saved.role,
        status: saved.status,
        token: saved.token,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create invitation for ${normalizedEmail}: ${
          (error as Error).message
        }`
      );
      throw error;
    }
  }

  /**
   * Capitalize the first letter of a string
   */
  private capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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

    // Verify the user's email matches the invite email
    const userEmails = await this.userEmailRepository.find({
      where: { userId },
      select: ['email'],
    });
    const userEmailLowercase = userEmails.map((e) => e.email.toLowerCase());
    if (!userEmailLowercase.includes(invite.email.toLowerCase())) {
      throw new BadRequestException({
        error: {
          code: 'email-mismatch',
          message: 'This invitation was sent to a different email address',
        },
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

      // Auto-add user to organization when accepting project invite
      if (invite.projectId && invite.organizationId) {
        const existingOrgMembership = await queryRunner.manager.findOne(
          OrganizationMembership,
          {
            where: { organizationId: invite.organizationId, userId },
          }
        );

        if (!existingOrgMembership) {
          const orgMembership = this.orgMembershipRepository.create({
            organizationId: invite.organizationId,
            userId,
            role: 'org_member', // Basic membership, not admin
          });
          await queryRunner.manager.save(orgMembership).catch(() => {
            // Ignore conflict - already exists
          });
          this.logger.log(
            `Auto-added user ${userId} to organization ${invite.organizationId}`
          );
        }
      }

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

  /**
   * List pending invitations for the current user by email
   */
  async listPendingForUser(userId: string): Promise<PendingInviteDto[]> {
    // Get user's emails
    const userEmails = await this.userEmailRepository.find({
      where: { userId },
      select: ['email'],
    });

    if (userEmails.length === 0) {
      return [];
    }

    const emails = userEmails.map((e) => e.email.toLowerCase());

    // Find pending invitations for these emails
    const invites = await this.inviteRepository
      .createQueryBuilder('invite')
      .leftJoinAndSelect('invite.project', 'project')
      .where('LOWER(invite.email) IN (:...emails)', { emails })
      .andWhere('invite.status = :status', { status: 'pending' })
      .andWhere('(invite.expiresAt IS NULL OR invite.expiresAt > :now)', {
        now: new Date(),
      })
      .orderBy('invite.createdAt', 'DESC')
      .getMany();

    // Get org names
    const orgIds = [...new Set(invites.map((i) => i.organizationId))];
    const orgs = await this.orgRepository.findByIds(orgIds);
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

    return invites.map((invite) => ({
      id: invite.id,
      projectId: invite.projectId ?? undefined,
      projectName: invite.project?.name ?? undefined,
      organizationId: invite.organizationId,
      organizationName: orgMap.get(invite.organizationId) ?? undefined,
      role: invite.role,
      token: invite.token,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt ?? undefined,
    }));
  }

  /**
   * Decline an invitation
   */
  async decline(inviteId: string, userId: string): Promise<{ status: string }> {
    // Get user's emails to verify they can decline this invite
    const userEmails = await this.userEmailRepository.find({
      where: { userId },
      select: ['email'],
    });

    if (userEmails.length === 0) {
      throw new ForbiddenException({
        error: { code: 'forbidden', message: 'User has no email addresses' },
      });
    }

    const emails = userEmails.map((e) => e.email.toLowerCase());

    const invite = await this.inviteRepository.findOne({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Invitation not found' },
      });
    }

    // Verify the invite is for this user
    if (!emails.includes(invite.email.toLowerCase())) {
      throw new ForbiddenException({
        error: {
          code: 'forbidden',
          message: 'This invitation is not for you',
        },
      });
    }

    if (invite.status !== 'pending') {
      throw new BadRequestException({
        error: {
          code: 'invalid-state',
          message: `Invitation is already ${invite.status}`,
        },
      });
    }

    invite.status = 'declined';
    await this.inviteRepository.save(invite);

    this.logger.log(`User ${userId} declined invitation ${invite.id}`);

    return { status: 'declined' };
  }

  /**
   * List sent invitations for a project
   */
  async listForProject(projectId: string): Promise<SentInviteDto[]> {
    const invites = await this.inviteRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();

    return invites.map((invite) => {
      // Determine effective status (check for expiry)
      let status = invite.status;
      if (status === 'pending' && invite.expiresAt && invite.expiresAt < now) {
        status = 'expired';
      }

      return {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt ?? undefined,
      };
    });
  }

  /**
   * Cancel/revoke a pending invitation
   */
  async cancel(
    inviteId: string,
    requestingUserId: string
  ): Promise<{ status: string }> {
    const invite = await this.inviteRepository.findOne({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Invitation not found' },
      });
    }

    if (invite.status !== 'pending') {
      throw new BadRequestException({
        error: {
          code: 'invalid-state',
          message: `Cannot cancel invitation with status: ${invite.status}`,
        },
      });
    }

    // TODO: Add authorization check - ensure requesting user has admin access
    // to the project/org the invite belongs to. For now, we trust the guard.

    invite.status = 'revoked';
    invite.revokedAt = new Date();
    await this.inviteRepository.save(invite);

    this.logger.log(
      `Invitation ${invite.id} revoked by user ${requestingUserId}`
    );

    return { status: 'revoked' };
  }

  /**
   * Get invite by ID (for authorization checks)
   */
  async getById(inviteId: string): Promise<Invite | null> {
    return this.inviteRepository.findOne({ where: { id: inviteId } });
  }
}
