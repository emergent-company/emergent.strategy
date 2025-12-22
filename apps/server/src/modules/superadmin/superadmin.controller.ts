import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  Header,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { SuperadminGuard } from './superadmin.guard';
import { Superadmin } from './superadmin.decorator';
import { SuperadminService } from './superadmin.service';
import { EmailTemplateService } from '../email/email-template.service';

import { UserProfile } from '../../entities/user-profile.entity';
import { Org } from '../../entities/org.entity';
import { Project } from '../../entities/project.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { Document } from '../../entities/document.entity';
import { EmailJob } from '../../entities/email-job.entity';

import {
  ListUsersQueryDto,
  ListUsersResponseDto,
  SuperadminUserDto,
  UserOrgMembershipDto,
} from './dto/users.dto';
import {
  ListOrganizationsResponseDto,
  SuperadminOrgDto,
} from './dto/organizations.dto';
import {
  ListProjectsQueryDto,
  ListProjectsResponseDto,
  SuperadminProjectDto,
} from './dto/projects.dto';
import {
  ListEmailJobsQueryDto,
  ListEmailJobsResponseDto,
  SuperadminEmailJobDto,
  EmailJobPreviewResponseDto,
} from './dto/email-jobs.dto';
import { PaginationQueryDto } from './dto/pagination.dto';

@ApiTags('superadmin')
@ApiBearerAuth()
@Controller('superadmin')
export class SuperadminController {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepo: Repository<UserProfile>,
    @InjectRepository(Org)
    private readonly orgRepo: Repository<Org>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(OrganizationMembership)
    private readonly orgMembershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(EmailJob)
    private readonly emailJobRepo: Repository<EmailJob>,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly superadminService: SuperadminService
  ) {}

  /**
   * Check if current user is a superadmin
   * This endpoint only requires authentication, not superadmin access
   */
  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Check superadmin status',
    description:
      'Returns whether the current authenticated user is a superadmin',
  })
  @ApiOkResponse({
    description: 'Superadmin status',
    schema: {
      type: 'object',
      properties: {
        isSuperadmin: { type: 'boolean' },
      },
    },
  })
  async checkSuperadminStatus(
    @Req() req: Request
  ): Promise<{ isSuperadmin: boolean }> {
    const user = (req as any).user;
    if (!user?.id) {
      return { isSuperadmin: false };
    }
    const isSuperadmin = await this.superadminService.isSuperadmin(user.id);
    return { isSuperadmin };
  }

  /**
   * List all users with pagination, search, and org filter
   */
  @Get('users')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List all users',
    description:
      'Returns paginated list of all users with their organization memberships and last activity',
  })
  @ApiOkResponse({
    description: 'List of users',
    type: ListUsersResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listUsers(
    @Query() query: ListUsersQueryDto
  ): Promise<ListUsersResponseDto> {
    const { page = 1, limit = 20, search, orgId } = query;
    const skip = (page - 1) * limit;

    // Build the base query
    const qb = this.userProfileRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.emails', 'email')
      .where('user.deletedAt IS NULL');

    // Search filter (name or email)
    if (search) {
      qb.andWhere(
        `(
          user.displayName ILIKE :search 
          OR user.firstName ILIKE :search 
          OR user.lastName ILIKE :search
          OR email.email ILIKE :search
        )`,
        { search: `%${search}%` }
      );
    }

    // Org filter - get users who are members of the specified org
    if (orgId) {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('om.userId')
          .from(OrganizationMembership, 'om')
          .where('om.organizationId = :orgId')
          .getQuery();
        return `user.id IN ${subQuery}`;
      }).setParameter('orgId', orgId);
    }

    // Get total count
    const total = await qb.getCount();

    // Get paginated results
    const users = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    // Fetch organization memberships for each user
    const userIds = users.map((u) => u.id);
    const memberships =
      userIds.length > 0
        ? await this.orgMembershipRepo.find({
            where: { userId: In(userIds) },
            relations: ['organization'],
          })
        : [];

    // Group memberships by user
    const membershipsByUser = new Map<string, OrganizationMembership[]>();
    for (const m of memberships) {
      const existing = membershipsByUser.get(m.userId) || [];
      existing.push(m);
      membershipsByUser.set(m.userId, existing);
    }

    // Transform to response DTOs
    const userDtos: SuperadminUserDto[] = users.map((user) => {
      const userMemberships = membershipsByUser.get(user.id) || [];
      const emails = user.emails || [];
      const primaryEmail =
        emails.find((e) => e.verified)?.email || emails[0]?.email || null;

      const organizations: UserOrgMembershipDto[] = userMemberships.map(
        (m) => ({
          orgId: m.organizationId,
          orgName: m.organization?.name || 'Unknown',
          role: m.role,
          joinedAt: m.createdAt,
        })
      );

      return {
        id: user.id,
        zitadelUserId: user.zitadelUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        primaryEmail,
        lastActivityAt: user.lastActivityAt,
        createdAt: user.createdAt,
        organizations,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      users: userDtos,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * List all organizations with member and project counts
   */
  @Get('organizations')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List all organizations',
    description:
      'Returns paginated list of all organizations with member and project counts',
  })
  @ApiOkResponse({
    description: 'List of organizations',
    type: ListOrganizationsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listOrganizations(
    @Query() query: PaginationQueryDto
  ): Promise<ListOrganizationsResponseDto> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Get orgs with counts using subqueries
    const qb = this.orgRepo
      .createQueryBuilder('org')
      .select([
        'org.id AS id',
        'org.name AS name',
        'org.createdAt AS "createdAt"',
        'org.deletedAt AS "deletedAt"',
      ])
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(*)')
          .from(OrganizationMembership, 'om')
          .where('om.organizationId = org.id');
      }, 'memberCount')
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(*)')
          .from(Project, 'p')
          .where('p.organizationId = org.id')
          .andWhere('p.deletedAt IS NULL');
      }, 'projectCount')
      .orderBy('org.createdAt', 'DESC')
      .offset(skip)
      .limit(limit);

    const [rawResults, total] = await Promise.all([
      qb.getRawMany(),
      this.orgRepo.count(),
    ]);

    const organizations: SuperadminOrgDto[] = rawResults.map((row) => ({
      id: row.id,
      name: row.name,
      memberCount: parseInt(row.memberCount, 10) || 0,
      projectCount: parseInt(row.projectCount, 10) || 0,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      organizations,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * List all projects with optional org filter and document counts
   */
  @Get('projects')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List all projects',
    description:
      'Returns paginated list of all projects with document counts, optionally filtered by organization',
  })
  @ApiOkResponse({
    description: 'List of projects',
    type: ListProjectsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listProjects(
    @Query() query: ListProjectsQueryDto
  ): Promise<ListProjectsResponseDto> {
    const { page = 1, limit = 20, orgId } = query;
    const skip = (page - 1) * limit;

    // Build query with document counts
    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.organization', 'org')
      .select([
        'project.id AS id',
        'project.name AS name',
        'project.organizationId AS "organizationId"',
        'org.name AS "organizationName"',
        'project.createdAt AS "createdAt"',
        'project.deletedAt AS "deletedAt"',
      ])
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(*)')
          .from(Document, 'd')
          .where('d.projectId = project.id');
      }, 'documentCount')
      .where('project.deletedAt IS NULL');

    if (orgId) {
      qb.andWhere('project.organizationId = :orgId', { orgId });
    }

    const countQb = this.projectRepo
      .createQueryBuilder('project')
      .where('project.deletedAt IS NULL');
    if (orgId) {
      countQb.andWhere('project.organizationId = :orgId', { orgId });
    }

    const [rawResults, total] = await Promise.all([
      qb
        .orderBy('project.createdAt', 'DESC')
        .offset(skip)
        .limit(limit)
        .getRawMany(),
      countQb.getCount(),
    ]);

    const projects: SuperadminProjectDto[] = rawResults.map((row) => ({
      id: row.id,
      name: row.name,
      organizationId: row.organizationId,
      organizationName: row.organizationName || 'Unknown',
      documentCount: parseInt(row.documentCount, 10) || 0,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      projects,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * List email jobs with filters
   */
  @Get('email-jobs')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List email jobs',
    description:
      'Returns paginated list of email jobs with optional filters for status, recipient, and date range',
  })
  @ApiOkResponse({
    description: 'List of email jobs',
    type: ListEmailJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listEmailJobs(
    @Query() query: ListEmailJobsQueryDto
  ): Promise<ListEmailJobsResponseDto> {
    const { page = 1, limit = 20, status, recipient, fromDate, toDate } = query;
    const skip = (page - 1) * limit;

    const qb = this.emailJobRepo.createQueryBuilder('job');

    // Apply filters
    if (status) {
      qb.andWhere('job.status = :status', { status });
    }

    if (recipient) {
      qb.andWhere('job.toEmail ILIKE :recipient', {
        recipient: `%${recipient}%`,
      });
    }

    if (fromDate) {
      qb.andWhere('job.createdAt >= :fromDate', {
        fromDate: new Date(fromDate),
      });
    }

    if (toDate) {
      qb.andWhere('job.createdAt <= :toDate', { toDate: new Date(toDate) });
    }

    const [jobs, total] = await qb
      .orderBy('job.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const emailJobs: SuperadminEmailJobDto[] = jobs.map((job) => ({
      id: job.id,
      templateName: job.templateName,
      toEmail: job.toEmail,
      toName: job.toName,
      subject: job.subject,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      createdAt: job.createdAt,
      processedAt: job.processedAt,
      sourceType: job.sourceType,
      sourceId: job.sourceId,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      emailJobs,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Preview an email job by rendering its template
   */
  @Get('email-jobs/:id/preview')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @Header('Content-Type', 'text/html')
  @ApiOperation({
    summary: 'Preview email job',
    description:
      'Renders the email template with stored data and returns HTML content',
  })
  @ApiOkResponse({
    description: 'Rendered HTML email content',
    content: {
      'text/html': {
        schema: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Email job not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async previewEmailJob(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<string> {
    const job = await this.emailJobRepo.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email job not found',
        },
      });
    }

    // Check if template exists
    if (!this.emailTemplateService.hasTemplate(job.templateName)) {
      throw new NotFoundException({
        error: {
          code: 'template_not_found',
          message: `Template '${job.templateName}' not found`,
        },
      });
    }

    // Render the template with stored data
    const result = this.emailTemplateService.render(
      job.templateName,
      job.templateData
    );

    return result.html;
  }

  /**
   * Get email job preview as JSON (alternative endpoint for frontend)
   */
  @Get('email-jobs/:id/preview-json')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Preview email job as JSON',
    description:
      'Renders the email template and returns metadata along with HTML content',
  })
  @ApiOkResponse({
    description: 'Email preview with metadata',
    type: EmailJobPreviewResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Email job not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async previewEmailJobJson(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EmailJobPreviewResponseDto> {
    const job = await this.emailJobRepo.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email job not found',
        },
      });
    }

    // Check if template exists
    if (!this.emailTemplateService.hasTemplate(job.templateName)) {
      throw new NotFoundException({
        error: {
          code: 'template_not_found',
          message: `Template '${job.templateName}' not found`,
        },
      });
    }

    // Render the template with stored data
    const result = this.emailTemplateService.render(
      job.templateName,
      job.templateData
    );

    return {
      html: result.html,
      subject: job.subject,
      toEmail: job.toEmail,
      toName: job.toName,
    };
  }
}
