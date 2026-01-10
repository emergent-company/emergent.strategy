import {
  Controller,
  Get,
  Delete,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  Header,
  ParseUUIDPipe,
  Req,
  ForbiddenException,
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
import { AppConfigService } from '../../common/config/config.service';

import { UserProfile } from '../../entities/user-profile.entity';
import { Org } from '../../entities/org.entity';
import { Project } from '../../entities/project.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { Document } from '../../entities/document.entity';
import { EmailJob } from '../../entities/email-job.entity';
import { GraphEmbeddingJob } from '../../entities/graph-embedding-job.entity';
import { ChunkEmbeddingJob } from '../../entities/chunk-embedding-job.entity';
import { ObjectExtractionJob } from '../../entities/object-extraction-job.entity';
import { DocumentParsingJob } from '../../entities/document-parsing-job.entity';
import { DataSourceSyncJob } from '../../entities/data-source-sync-job.entity';
import { DataSourceIntegration } from '../../entities/data-source-integration.entity';

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
import {
  ListEmbeddingJobsQueryDto,
  ListEmbeddingJobsResponseDto,
  EmbeddingJobDto,
  EmbeddingJobStatsDto,
  DeleteEmbeddingJobsDto,
  DeleteEmbeddingJobsResponseDto,
  CleanupOrphanJobsResponseDto,
} from './dto/embedding-jobs.dto';
import {
  SystemConfigResponseDto,
  RevealEnvQueryDto,
  ExternalServiceDto,
  EnvironmentVariableDto,
  DeploymentInfoDto,
} from './dto/system-config.dto';
import {
  ListExtractionJobsQueryDto,
  ListExtractionJobsResponseDto,
  ExtractionJobDto,
  ExtractionJobStatsDto,
  DeleteExtractionJobsDto,
  DeleteExtractionJobsResponseDto,
  CancelExtractionJobsDto,
  CancelExtractionJobsResponseDto,
} from './dto/extraction-jobs.dto';
import {
  ListDocumentParsingJobsQueryDto,
  ListDocumentParsingJobsResponseDto,
  DocumentParsingJobDto,
  DocumentParsingJobStatsDto,
  DeleteDocumentParsingJobsDto,
  DeleteDocumentParsingJobsResponseDto,
  RetryDocumentParsingJobsDto,
  RetryDocumentParsingJobsResponseDto,
} from './dto/document-parsing-jobs.dto';
import {
  ListSyncJobsQueryDto,
  ListSyncJobsResponseDto,
  SyncJobDto,
  SyncJobStatsDto,
  DeleteSyncJobsDto,
  DeleteSyncJobsResponseDto,
  CancelSyncJobsDto,
  CancelSyncJobsResponseDto,
  SyncJobLogsResponseDto,
} from './dto/sync-jobs.dto';

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
    @InjectRepository(GraphEmbeddingJob)
    private readonly graphJobRepo: Repository<GraphEmbeddingJob>,
    @InjectRepository(ChunkEmbeddingJob)
    private readonly chunkJobRepo: Repository<ChunkEmbeddingJob>,
    @InjectRepository(ObjectExtractionJob)
    private readonly extractionJobRepo: Repository<ObjectExtractionJob>,
    @InjectRepository(DocumentParsingJob)
    private readonly documentParsingJobRepo: Repository<DocumentParsingJob>,
    @InjectRepository(DataSourceSyncJob)
    private readonly syncJobRepo: Repository<DataSourceSyncJob>,
    @InjectRepository(DataSourceIntegration)
    private readonly integrationRepo: Repository<DataSourceIntegration>,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly superadminService: SuperadminService,
    private readonly configService: AppConfigService
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
      deliveryStatus: job.deliveryStatus,
      deliveryStatusAt: job.deliveryStatusAt,
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
    const result = await this.emailTemplateService.render(
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
    const result = await this.emailTemplateService.render(
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

  @Delete('users/:id')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Delete a user',
    description: 'Soft deletes a user by setting deletedAt timestamp',
  })
  @ApiOkResponse({
    description: 'User deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ): Promise<{ success: boolean; message: string }> {
    const currentUser = (req as any).user;

    if (currentUser?.id === id) {
      throw new ForbiddenException({
        error: {
          code: 'forbidden',
          message: 'Cannot delete your own account',
        },
      });
    }

    const user = await this.userProfileRepo.findOne({
      where: { id, deletedAt: null as any },
    });

    if (!user) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'User not found',
        },
      });
    }

    await this.userProfileRepo.update(id, {
      deletedAt: new Date(),
      deletedBy: currentUser?.id,
    });

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  @Delete('organizations/:id')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Delete an organization',
    description: 'Soft deletes an organization by setting deletedAt timestamp',
  })
  @ApiOkResponse({
    description: 'Organization deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async deleteOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ): Promise<{ success: boolean; message: string }> {
    const currentUser = (req as any).user;

    const org = await this.orgRepo.findOne({
      where: { id, deletedAt: null as any },
    });

    if (!org) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Organization not found',
        },
      });
    }

    await this.orgRepo.update(id, {
      deletedAt: new Date(),
      deletedBy: currentUser?.id,
    });

    return {
      success: true,
      message: 'Organization deleted successfully',
    };
  }

  @Delete('projects/:id')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Delete a project',
    description: 'Soft deletes a project by setting deletedAt timestamp',
  })
  @ApiOkResponse({
    description: 'Project deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async deleteProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ): Promise<{ success: boolean; message: string }> {
    const currentUser = (req as any).user;

    const project = await this.projectRepo.findOne({
      where: { id, deletedAt: null as any },
    });

    if (!project) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Project not found',
        },
      });
    }

    await this.projectRepo.update(id, {
      deletedAt: new Date(),
      deletedBy: currentUser?.id,
    });

    return {
      success: true,
      message: 'Project deleted successfully',
    };
  }

  @Get('system-config')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Get system configuration',
    description:
      'Returns external service links, deployment information, and environment variables for the super admin dashboard',
  })
  @ApiOkResponse({
    description: 'System configuration',
    type: SystemConfigResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async getSystemConfig(
    @Query() query: RevealEnvQueryDto
  ): Promise<SystemConfigResponseDto> {
    const reveal = query.reveal === true;

    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i,
    ];

    const isSensitive = (name: string): boolean => {
      return sensitivePatterns.some((pattern) => pattern.test(name));
    };

    const maskValue = (value: string, sensitive: boolean): string => {
      if (!sensitive || reveal) return value || '';
      if (!value) return '';
      if (value.length <= 8) return '••••••••';
      return (
        value.substring(0, 4) + '••••••••' + value.substring(value.length - 4)
      );
    };

    const externalServices: ExternalServiceDto[] = [
      {
        name: 'Langfuse',
        url: this.configService.langfuseHost || null,
        enabled: this.configService.langfuseEnabled,
      },
      {
        name: 'SigNoz',
        url: process.env.SIGNOZ_HOST || process.env.SIGNOZ_URL || null,
        enabled: !!(process.env.SIGNOZ_HOST || process.env.SIGNOZ_URL),
      },
      {
        name: 'Zitadel',
        url: process.env.ZITADEL_DOMAIN
          ? `https://${process.env.ZITADEL_DOMAIN}`
          : null,
        enabled: !!process.env.ZITADEL_DOMAIN,
      },
    ];

    const deployment: DeploymentInfoDto = {
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      adminPort: parseInt(process.env.ADMIN_PORT || '5176', 10),
      serverPort: this.configService.port,
      adminUrl:
        process.env.ADMIN_URL ||
        `http://localhost:${process.env.ADMIN_PORT || '5176'}`,
      serverUrl:
        process.env.SERVER_URL || `http://localhost:${this.configService.port}`,
    };

    const envVarDefinitions: Array<{
      name: string;
      value: string | undefined;
      category: string;
    }> = [
      {
        name: 'POSTGRES_HOST',
        value: this.configService.dbHost,
        category: 'Database',
      },
      {
        name: 'POSTGRES_PORT',
        value: String(this.configService.dbPort),
        category: 'Database',
      },
      {
        name: 'POSTGRES_DB',
        value: this.configService.dbName,
        category: 'Database',
      },
      {
        name: 'POSTGRES_USER',
        value: this.configService.dbUser,
        category: 'Database',
      },
      {
        name: 'POSTGRES_PASSWORD',
        value: this.configService.dbPassword,
        category: 'Database',
      },

      {
        name: 'GCP_PROJECT_ID',
        value: this.configService.gcpProjectId,
        category: 'AI/LLM',
      },
      {
        name: 'GOOGLE_API_KEY',
        value: this.configService.googleApiKey,
        category: 'AI/LLM',
      },
      {
        name: 'VERTEX_AI_LOCATION',
        value: this.configService.vertexAiLocation,
        category: 'AI/LLM',
      },
      {
        name: 'VERTEX_AI_MODEL',
        value: this.configService.vertexAiModel,
        category: 'AI/LLM',
      },
      {
        name: 'EMBEDDING_PROVIDER',
        value: process.env.EMBEDDING_PROVIDER,
        category: 'AI/LLM',
      },
      {
        name: 'EMBEDDING_DIMENSION',
        value: String(this.configService.embeddingDimension),
        category: 'AI/LLM',
      },
      {
        name: 'CHAT_MODEL_ENABLED',
        value: String(this.configService.chatModelEnabled),
        category: 'AI/LLM',
      },

      {
        name: 'EXTRACTION_WORKER_ENABLED',
        value: String(this.configService.extractionWorkerEnabled),
        category: 'Extraction',
      },
      {
        name: 'EXTRACTION_METHOD',
        value: this.configService.extractionMethod,
        category: 'Extraction',
      },
      {
        name: 'EXTRACTION_CHUNK_SIZE',
        value: String(this.configService.extractionChunkSize),
        category: 'Extraction',
      },
      {
        name: 'EXTRACTION_VERIFICATION_ENABLED',
        value: String(this.configService.extractionVerificationEnabled),
        category: 'Extraction',
      },
      {
        name: 'EXTRACTION_PIPELINE_MODE',
        value: this.configService.extractionPipelineMode,
        category: 'Extraction',
      },

      {
        name: 'LANGFUSE_ENABLED',
        value: String(this.configService.langfuseEnabled),
        category: 'Observability',
      },
      {
        name: 'LANGFUSE_HOST',
        value: this.configService.langfuseHost,
        category: 'Observability',
      },
      {
        name: 'LANGFUSE_PUBLIC_KEY',
        value: this.configService.langfusePublicKey,
        category: 'Observability',
      },
      {
        name: 'LANGFUSE_SECRET_KEY',
        value: this.configService.langfuseSecretKey,
        category: 'Observability',
      },
      {
        name: 'LANGSMITH_TRACING',
        value: String(this.configService.langsmithTracingEnabled),
        category: 'Observability',
      },

      {
        name: 'ZITADEL_DOMAIN',
        value: process.env.ZITADEL_DOMAIN,
        category: 'Authentication',
      },
      {
        name: 'ZITADEL_CLIENT_ID',
        value: process.env.ZITADEL_CLIENT_ID,
        category: 'Authentication',
      },

      { name: 'NODE_ENV', value: process.env.NODE_ENV, category: 'Services' },
      {
        name: 'PORT',
        value: String(this.configService.port),
        category: 'Services',
      },
      {
        name: 'ADMIN_PORT',
        value: process.env.ADMIN_PORT,
        category: 'Services',
      },
    ];

    const environmentVariables: EnvironmentVariableDto[] =
      envVarDefinitions.map(({ name, value, category }) => {
        const sensitive = isSensitive(name);
        return {
          name,
          value: maskValue(value || '', sensitive),
          sensitive,
          category,
        };
      });

    return {
      externalServices,
      deployment,
      environmentVariables,
    };
  }

  /**
   * List embedding jobs with filters and stats
   */
  @Get('embedding-jobs')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List embedding jobs',
    description:
      'Returns paginated list of embedding jobs (graph and chunk) with optional filters and statistics',
  })
  @ApiOkResponse({
    description: 'List of embedding jobs with stats',
    type: ListEmbeddingJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listEmbeddingJobs(
    @Query() query: ListEmbeddingJobsQueryDto
  ): Promise<ListEmbeddingJobsResponseDto> {
    const { page = 1, limit = 20, type, status, hasError, projectId } = query;
    const skip = (page - 1) * limit;

    // Collect jobs from both tables based on filters
    const jobs: EmbeddingJobDto[] = [];

    // Helper to map jobs to DTOs (with project info from raw results)
    const mapGraphJob = (
      job: GraphEmbeddingJob,
      projId?: string,
      projName?: string
    ): EmbeddingJobDto => ({
      id: job.id,
      type: 'graph',
      targetId: job.objectId,
      projectId: projId,
      projectName: projName,
      status: job.status as any,
      attemptCount: job.attemptCount,
      lastError: job.lastError || undefined,
      priority: job.priority,
      scheduledAt: job.scheduledAt,
      startedAt: job.startedAt || undefined,
      completedAt: job.completedAt || undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

    const mapChunkJob = (
      job: ChunkEmbeddingJob,
      projId?: string,
      projName?: string
    ): EmbeddingJobDto => ({
      id: job.id,
      type: 'chunk',
      targetId: job.chunkId,
      projectId: projId,
      projectName: projName,
      status: job.status as any,
      attemptCount: job.attemptCount,
      lastError: job.lastError || undefined,
      priority: job.priority,
      scheduledAt: job.scheduledAt,
      startedAt: job.startedAt || undefined,
      completedAt: job.completedAt || undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

    // Get graph jobs if not filtered to chunk only
    if (!type || type === 'graph') {
      const graphQb = this.graphJobRepo
        .createQueryBuilder('job')
        .leftJoin('kb.graph_objects', 'obj', 'obj.id = job.object_id')
        .leftJoin('kb.projects', 'proj', 'proj.id = obj.project_id')
        .addSelect('obj.project_id', 'projectId')
        .addSelect('proj.name', 'projectName');

      if (projectId) {
        graphQb.andWhere('obj.project_id = :projectId', { projectId });
      }
      if (status) {
        graphQb.andWhere('job.status = :status', { status });
      }
      if (hasError === true) {
        graphQb.andWhere('job.last_error IS NOT NULL');
      } else if (hasError === false) {
        graphQb.andWhere('job.last_error IS NULL');
      }

      const graphResults = await graphQb
        .orderBy('job.created_at', 'DESC')
        .getRawAndEntities();

      graphResults.entities.forEach((job, index) => {
        const raw = graphResults.raw[index];
        jobs.push(mapGraphJob(job, raw?.projectId, raw?.projectName));
      });
    }

    // Get chunk jobs if not filtered to graph only
    if (!type || type === 'chunk') {
      const chunkQb = this.chunkJobRepo
        .createQueryBuilder('job')
        .leftJoin('kb.chunks', 'chunk', 'chunk.id = job.chunk_id')
        .leftJoin('kb.documents', 'doc', 'doc.id = chunk.document_id')
        .leftJoin('kb.projects', 'proj', 'proj.id = doc.project_id')
        .addSelect('doc.project_id', 'projectId')
        .addSelect('proj.name', 'projectName');

      if (projectId) {
        chunkQb.andWhere('doc.project_id = :projectId', { projectId });
      }
      if (status) {
        chunkQb.andWhere('job.status = :status', { status });
      }
      if (hasError === true) {
        chunkQb.andWhere('job.last_error IS NOT NULL');
      } else if (hasError === false) {
        chunkQb.andWhere('job.last_error IS NULL');
      }

      const chunkResults = await chunkQb
        .orderBy('job.created_at', 'DESC')
        .getRawAndEntities();

      chunkResults.entities.forEach((job, index) => {
        const raw = chunkResults.raw[index];
        jobs.push(mapChunkJob(job, raw?.projectId, raw?.projectName));
      });
    }

    // Sort combined results by createdAt descending
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const total = jobs.length;
    const paginatedJobs = jobs.slice(skip, skip + limit);

    // Calculate stats (always for both types, regardless of filter)
    const [graphStats, chunkStats] = await Promise.all([
      this.graphJobRepo
        .createQueryBuilder('job')
        .select([
          'COUNT(*) as total',
          "SUM(CASE WHEN job.status = 'pending' THEN 1 ELSE 0 END) as pending",
          "SUM(CASE WHEN job.status = 'completed' THEN 1 ELSE 0 END) as completed",
          "SUM(CASE WHEN job.status = 'failed' THEN 1 ELSE 0 END) as failed",
          'SUM(CASE WHEN job.lastError IS NOT NULL THEN 1 ELSE 0 END) as withErrors',
        ])
        .getRawOne(),
      this.chunkJobRepo
        .createQueryBuilder('job')
        .select([
          'COUNT(*) as total',
          "SUM(CASE WHEN job.status = 'pending' THEN 1 ELSE 0 END) as pending",
          "SUM(CASE WHEN job.status = 'completed' THEN 1 ELSE 0 END) as completed",
          "SUM(CASE WHEN job.status = 'failed' THEN 1 ELSE 0 END) as failed",
          'SUM(CASE WHEN job.lastError IS NOT NULL THEN 1 ELSE 0 END) as withErrors',
        ])
        .getRawOne(),
    ]);

    const stats: EmbeddingJobStatsDto = {
      graphTotal: parseInt(graphStats?.total || '0', 10),
      graphPending: parseInt(graphStats?.pending || '0', 10),
      graphCompleted: parseInt(graphStats?.completed || '0', 10),
      graphFailed: parseInt(graphStats?.failed || '0', 10),
      graphWithErrors: parseInt(graphStats?.witherrors || '0', 10),
      chunkTotal: parseInt(chunkStats?.total || '0', 10),
      chunkPending: parseInt(chunkStats?.pending || '0', 10),
      chunkCompleted: parseInt(chunkStats?.completed || '0', 10),
      chunkFailed: parseInt(chunkStats?.failed || '0', 10),
      chunkWithErrors: parseInt(chunkStats?.witherrors || '0', 10),
    };

    const totalPages = Math.ceil(total / limit);

    return {
      jobs: paginatedJobs,
      stats,
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
   * Bulk delete embedding jobs
   */
  @Post('embedding-jobs/delete')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Delete embedding jobs',
    description: 'Bulk delete embedding jobs by IDs and type',
  })
  @ApiOkResponse({
    description: 'Jobs deleted successfully',
    type: DeleteEmbeddingJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async deleteEmbeddingJobs(
    @Body() body: DeleteEmbeddingJobsDto
  ): Promise<DeleteEmbeddingJobsResponseDto> {
    const { ids, type } = body;

    if (ids.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        message: 'No jobs to delete',
      };
    }

    let deletedCount = 0;

    if (type === 'graph') {
      const result = await this.graphJobRepo.delete({ id: In(ids) });
      deletedCount = result.affected || 0;
    } else {
      const result = await this.chunkJobRepo.delete({ id: In(ids) });
      deletedCount = result.affected || 0;
    }

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} ${type} embedding job(s)`,
    };
  }

  /**
   * Cleanup orphan embedding jobs
   */
  @Post('embedding-jobs/cleanup-orphans')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Cleanup orphan embedding jobs',
    description:
      'Delete all embedding jobs that have object_missing error (orphan jobs)',
  })
  @ApiOkResponse({
    description: 'Orphan jobs cleaned up successfully',
    type: CleanupOrphanJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async cleanupOrphanJobs(): Promise<CleanupOrphanJobsResponseDto> {
    // Delete graph jobs with object_missing error
    const graphResult = await this.graphJobRepo
      .createQueryBuilder()
      .delete()
      .where('last_error = :error', { error: 'object_missing' })
      .execute();

    // Delete chunk jobs with similar errors (chunk_missing)
    const chunkResult = await this.chunkJobRepo
      .createQueryBuilder()
      .delete()
      .where('last_error LIKE :error', { error: '%missing%' })
      .execute();

    const totalDeleted =
      (graphResult.affected || 0) + (chunkResult.affected || 0);

    return {
      success: true,
      deletedCount: totalDeleted,
      message: `Cleaned up ${totalDeleted} orphan embedding job(s) (${
        graphResult.affected || 0
      } graph, ${chunkResult.affected || 0} chunk)`,
    };
  }

  /**
   * List extraction jobs with filters and stats
   */
  @Get('extraction-jobs')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List extraction jobs',
    description:
      'Returns paginated list of extraction jobs with optional filters and statistics',
  })
  @ApiOkResponse({
    description: 'List of extraction jobs with stats',
    type: ListExtractionJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listExtractionJobs(
    @Query() query: ListExtractionJobsQueryDto
  ): Promise<ListExtractionJobsResponseDto> {
    const {
      page = 1,
      limit = 20,
      status,
      jobType,
      projectId,
      hasError,
    } = query;
    const skip = (page - 1) * limit;

    // Build query
    // Note: document info is stored in source_type/source_id/source_metadata, not document_id
    // Objects created count is in created_objects JSONB array, not objects_created integer
    const qb = this.extractionJobRepo
      .createQueryBuilder('job')
      .leftJoin('job.project', 'project')
      .select([
        'job.id AS id',
        'job.projectId AS "projectId"',
        'project.name AS "projectName"',
        'CASE WHEN job.source_type = \'document\' THEN job.source_id ELSE job.documentId::text END AS "documentId"',
        "COALESCE(job.source_metadata->>'filename', '') AS \"documentName\"",
        'job.chunkId AS "chunkId"',
        'job.jobType AS "jobType"',
        'job.status AS status',
        'COALESCE(jsonb_array_length(job.created_objects), job.objectsCreated, 0) AS "objectsCreated"',
        'job.relationshipsCreated AS "relationshipsCreated"',
        'job.retryCount AS "retryCount"',
        'job.maxRetries AS "maxRetries"',
        'job.errorMessage AS "errorMessage"',
        'job.startedAt AS "startedAt"',
        'job.completedAt AS "completedAt"',
        'job.createdAt AS "createdAt"',
        'job.updatedAt AS "updatedAt"',
        'job.totalItems AS "totalItems"',
        'job.processedItems AS "processedItems"',
        'job.successfulItems AS "successfulItems"',
        'job.failedItems AS "failedItems"',
      ]);

    // Apply filters
    if (status) {
      qb.andWhere('job.status = :status', { status });
    }
    if (jobType) {
      qb.andWhere('job.jobType = :jobType', { jobType });
    }
    if (projectId) {
      qb.andWhere('job.projectId = :projectId', { projectId });
    }
    if (hasError === true) {
      qb.andWhere('job.errorMessage IS NOT NULL');
    } else if (hasError === false) {
      qb.andWhere('job.errorMessage IS NULL');
    }

    // Get count for pagination
    const countQb = this.extractionJobRepo.createQueryBuilder('job');
    if (status) {
      countQb.andWhere('job.status = :status', { status });
    }
    if (jobType) {
      countQb.andWhere('job.jobType = :jobType', { jobType });
    }
    if (projectId) {
      countQb.andWhere('job.projectId = :projectId', { projectId });
    }
    if (hasError === true) {
      countQb.andWhere('job.errorMessage IS NOT NULL');
    } else if (hasError === false) {
      countQb.andWhere('job.errorMessage IS NULL');
    }

    const [rawResults, total] = await Promise.all([
      qb
        .orderBy('job.createdAt', 'DESC')
        .offset(skip)
        .limit(limit)
        .getRawMany(),
      countQb.getCount(),
    ]);

    // Map to DTOs
    const jobs: ExtractionJobDto[] = rawResults.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName || undefined,
      documentId: row.documentId || undefined,
      documentName: row.documentName || undefined,
      chunkId: row.chunkId || undefined,
      jobType: row.jobType,
      status: row.status,
      objectsCreated: parseInt(row.objectsCreated, 10) || 0,
      relationshipsCreated: row.relationshipsCreated || 0,
      retryCount: row.retryCount || 0,
      maxRetries: row.maxRetries || 3,
      errorMessage: row.errorMessage || undefined,
      startedAt: row.startedAt || undefined,
      completedAt: row.completedAt || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      totalItems: row.totalItems || 0,
      processedItems: row.processedItems || 0,
      successfulItems: row.successfulItems || 0,
      failedItems: row.failedItems || 0,
    }));

    // Calculate stats
    const statsRaw = await this.extractionJobRepo
      .createQueryBuilder('job')
      .select([
        'COUNT(*) as total',
        "SUM(CASE WHEN job.status = 'queued' THEN 1 ELSE 0 END) as queued",
        "SUM(CASE WHEN job.status = 'processing' THEN 1 ELSE 0 END) as processing",
        "SUM(CASE WHEN job.status = 'completed' THEN 1 ELSE 0 END) as completed",
        "SUM(CASE WHEN job.status = 'failed' THEN 1 ELSE 0 END) as failed",
        "SUM(CASE WHEN job.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled",
        'SUM(CASE WHEN job.errorMessage IS NOT NULL THEN 1 ELSE 0 END) as withErrors',
        'SUM(COALESCE(jsonb_array_length(job.created_objects), job.objectsCreated, 0)) as totalObjectsCreated',
        'SUM(job.relationshipsCreated) as totalRelationshipsCreated',
      ])
      .getRawOne();

    const stats: ExtractionJobStatsDto = {
      total: parseInt(statsRaw?.total || '0', 10),
      queued: parseInt(statsRaw?.queued || '0', 10),
      processing: parseInt(statsRaw?.processing || '0', 10),
      completed: parseInt(statsRaw?.completed || '0', 10),
      failed: parseInt(statsRaw?.failed || '0', 10),
      cancelled: parseInt(statsRaw?.cancelled || '0', 10),
      withErrors: parseInt(statsRaw?.witherrors || '0', 10),
      totalObjectsCreated: parseInt(statsRaw?.totalobjectscreated || '0', 10),
      totalRelationshipsCreated: parseInt(
        statsRaw?.totalrelationshipscreated || '0',
        10
      ),
    };

    const totalPages = Math.ceil(total / limit);

    return {
      jobs,
      stats,
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
   * Bulk delete extraction jobs
   */
  @Post('extraction-jobs/delete')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Delete extraction jobs',
    description: 'Bulk delete extraction jobs by IDs',
  })
  @ApiOkResponse({
    description: 'Jobs deleted successfully',
    type: DeleteExtractionJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async deleteExtractionJobs(
    @Body() body: DeleteExtractionJobsDto
  ): Promise<DeleteExtractionJobsResponseDto> {
    const { ids } = body;

    if (ids.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        message: 'No jobs to delete',
      };
    }

    const result = await this.extractionJobRepo.delete({ id: In(ids) });
    const deletedCount = result.affected || 0;

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} extraction job(s)`,
    };
  }

  /**
   * Cancel queued/processing extraction jobs
   */
  @Post('extraction-jobs/cancel')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Cancel extraction jobs',
    description: 'Cancel queued or processing extraction jobs by IDs',
  })
  @ApiOkResponse({
    description: 'Jobs cancelled successfully',
    type: CancelExtractionJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async cancelExtractionJobs(
    @Body() body: CancelExtractionJobsDto
  ): Promise<CancelExtractionJobsResponseDto> {
    const { ids } = body;

    if (ids.length === 0) {
      return {
        success: true,
        cancelledCount: 0,
        message: 'No jobs to cancel',
      };
    }

    // Only cancel jobs that are queued or processing
    const result = await this.extractionJobRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'cancelled' })
      .where('id IN (:...ids)', { ids })
      .andWhere('status IN (:...statuses)', {
        statuses: ['queued', 'processing'],
      })
      .execute();

    const cancelledCount = result.affected || 0;

    return {
      success: true,
      cancelledCount,
      message: `Cancelled ${cancelledCount} extraction job(s)`,
    };
  }

  /**
   * List document parsing jobs (conversion jobs) with filters and stats
   */
  @Get('document-parsing-jobs')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List document parsing jobs',
    description:
      'Returns paginated list of document parsing (conversion) jobs with optional filters and statistics',
  })
  @ApiOkResponse({
    description: 'List of document parsing jobs with stats',
    type: ListDocumentParsingJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listDocumentParsingJobs(
    @Query() query: ListDocumentParsingJobsQueryDto
  ): Promise<ListDocumentParsingJobsResponseDto> {
    const { page = 1, limit = 20, status, projectId, hasError } = query;
    const skip = (page - 1) * limit;

    // Build query
    const qb = this.documentParsingJobRepo
      .createQueryBuilder('job')
      .leftJoin('job.project', 'project')
      .leftJoin(Org, 'org', 'org.id = job.organizationId')
      .select([
        'job.id AS id',
        'job.organizationId AS "organizationId"',
        'org.name AS "organizationName"',
        'job.projectId AS "projectId"',
        'project.name AS "projectName"',
        'job.status AS status',
        'job.sourceType AS "sourceType"',
        'job.sourceFilename AS "sourceFilename"',
        'job.mimeType AS "mimeType"',
        'job.fileSizeBytes AS "fileSizeBytes"',
        'job.storageKey AS "storageKey"',
        'job.documentId AS "documentId"',
        'job.extractionJobId AS "extractionJobId"',
        'LENGTH(job.parsedContent) AS "parsedContentLength"',
        'job.errorMessage AS "errorMessage"',
        'job.retryCount AS "retryCount"',
        'job.maxRetries AS "maxRetries"',
        'job.nextRetryAt AS "nextRetryAt"',
        'job.createdAt AS "createdAt"',
        'job.startedAt AS "startedAt"',
        'job.completedAt AS "completedAt"',
        'job.updatedAt AS "updatedAt"',
        'job.metadata AS metadata',
      ]);

    // Apply filters
    if (status) {
      qb.andWhere('job.status = :status', { status });
    }
    if (projectId) {
      qb.andWhere('job.projectId = :projectId', { projectId });
    }
    if (hasError === true) {
      qb.andWhere('job.errorMessage IS NOT NULL');
    } else if (hasError === false) {
      qb.andWhere('job.errorMessage IS NULL');
    }

    // Get count for pagination
    const countQb = this.documentParsingJobRepo.createQueryBuilder('job');
    if (status) {
      countQb.andWhere('job.status = :status', { status });
    }
    if (projectId) {
      countQb.andWhere('job.projectId = :projectId', { projectId });
    }
    if (hasError === true) {
      countQb.andWhere('job.errorMessage IS NOT NULL');
    } else if (hasError === false) {
      countQb.andWhere('job.errorMessage IS NULL');
    }

    const [rawResults, total] = await Promise.all([
      qb
        .orderBy('job.createdAt', 'DESC')
        .offset(skip)
        .limit(limit)
        .getRawMany(),
      countQb.getCount(),
    ]);

    // Map to DTOs
    const jobs: DocumentParsingJobDto[] = rawResults.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      organizationName: row.organizationName || undefined,
      projectId: row.projectId,
      projectName: row.projectName || undefined,
      status: row.status,
      sourceType: row.sourceType,
      sourceFilename: row.sourceFilename || undefined,
      mimeType: row.mimeType || undefined,
      fileSizeBytes: row.fileSizeBytes
        ? parseInt(row.fileSizeBytes, 10)
        : undefined,
      storageKey: row.storageKey || undefined,
      documentId: row.documentId || undefined,
      extractionJobId: row.extractionJobId || undefined,
      parsedContentLength: row.parsedContentLength
        ? parseInt(row.parsedContentLength, 10)
        : undefined,
      errorMessage: row.errorMessage || undefined,
      retryCount: row.retryCount || 0,
      maxRetries: row.maxRetries || 3,
      nextRetryAt: row.nextRetryAt || undefined,
      createdAt: row.createdAt,
      startedAt: row.startedAt || undefined,
      completedAt: row.completedAt || undefined,
      updatedAt: row.updatedAt,
      metadata: row.metadata || undefined,
    }));

    // Calculate stats
    const statsRaw = await this.documentParsingJobRepo
      .createQueryBuilder('job')
      .select([
        'COUNT(*) as total',
        "SUM(CASE WHEN job.status = 'pending' THEN 1 ELSE 0 END) as pending",
        "SUM(CASE WHEN job.status = 'processing' THEN 1 ELSE 0 END) as processing",
        "SUM(CASE WHEN job.status = 'completed' THEN 1 ELSE 0 END) as completed",
        "SUM(CASE WHEN job.status = 'failed' THEN 1 ELSE 0 END) as failed",
        "SUM(CASE WHEN job.status = 'retry_pending' THEN 1 ELSE 0 END) as retryPending",
        'SUM(CASE WHEN job.errorMessage IS NOT NULL THEN 1 ELSE 0 END) as withErrors',
        'COALESCE(SUM(job.fileSizeBytes), 0) as totalFileSizeBytes',
      ])
      .getRawOne();

    const stats: DocumentParsingJobStatsDto = {
      total: parseInt(statsRaw?.total || '0', 10),
      pending: parseInt(statsRaw?.pending || '0', 10),
      processing: parseInt(statsRaw?.processing || '0', 10),
      completed: parseInt(statsRaw?.completed || '0', 10),
      failed: parseInt(statsRaw?.failed || '0', 10),
      retryPending: parseInt(statsRaw?.retrypending || '0', 10),
      withErrors: parseInt(statsRaw?.witherrors || '0', 10),
      totalFileSizeBytes: parseInt(statsRaw?.totalfilesizebytes || '0', 10),
    };

    const totalPages = Math.ceil(total / limit);

    return {
      jobs,
      stats,
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
   * Bulk delete document parsing jobs
   */
  @Post('document-parsing-jobs/delete')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Delete document parsing jobs',
    description: 'Bulk delete document parsing jobs by IDs',
  })
  @ApiOkResponse({
    description: 'Jobs deleted successfully',
    type: DeleteDocumentParsingJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async deleteDocumentParsingJobs(
    @Body() body: DeleteDocumentParsingJobsDto
  ): Promise<DeleteDocumentParsingJobsResponseDto> {
    const { ids } = body;

    if (ids.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        message: 'No jobs to delete',
      };
    }

    const result = await this.documentParsingJobRepo.delete({ id: In(ids) });
    const deletedCount = result.affected || 0;

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} document parsing job(s)`,
    };
  }

  /**
   * Retry failed document parsing jobs
   */
  @Post('document-parsing-jobs/retry')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Retry document parsing jobs',
    description: 'Reset failed jobs to pending status for retry',
  })
  @ApiOkResponse({
    description: 'Jobs queued for retry',
    type: RetryDocumentParsingJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async retryDocumentParsingJobs(
    @Body() body: RetryDocumentParsingJobsDto
  ): Promise<RetryDocumentParsingJobsResponseDto> {
    const { ids } = body;

    if (ids.length === 0) {
      return {
        success: true,
        retriedCount: 0,
        message: 'No jobs to retry',
      };
    }

    // Only retry jobs that are failed or retry_pending
    const result = await this.documentParsingJobRepo
      .createQueryBuilder()
      .update()
      .set({
        status: 'pending',
        errorMessage: null,
        retryCount: () => 'retry_count + 1',
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('status IN (:...statuses)', {
        statuses: ['failed', 'retry_pending'],
      })
      .execute();

    const retriedCount = result.affected || 0;

    return {
      success: true,
      retriedCount,
      message: `Queued ${retriedCount} job(s) for retry`,
    };
  }

  /**
   * List data source sync jobs with filters and stats
   */
  @Get('sync-jobs')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List data source sync jobs',
    description:
      'Returns paginated list of data source sync jobs with optional filters and statistics',
  })
  @ApiOkResponse({
    description: 'List of sync jobs with stats',
    type: ListSyncJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listSyncJobs(
    @Query() query: ListSyncJobsQueryDto
  ): Promise<ListSyncJobsResponseDto> {
    const { page = 1, limit = 20, status, projectId, hasError } = query;
    const skip = (page - 1) * limit;

    // Build query
    const qb = this.syncJobRepo
      .createQueryBuilder('job')
      .leftJoin('job.project', 'project')
      .leftJoin('job.integration', 'integration')
      .select([
        'job.id AS id',
        'job.integrationId AS "integrationId"',
        'integration.name AS "integrationName"',
        'integration.providerType AS "providerType"',
        'job.projectId AS "projectId"',
        'project.name AS "projectName"',
        'job.status AS status',
        'job.totalItems AS "totalItems"',
        'job.processedItems AS "processedItems"',
        'job.successfulItems AS "successfulItems"',
        'job.failedItems AS "failedItems"',
        'job.skippedItems AS "skippedItems"',
        'job.currentPhase AS "currentPhase"',
        'job.statusMessage AS "statusMessage"',
        'job.errorMessage AS "errorMessage"',
        'job.triggerType AS "triggerType"',
        'job.createdAt AS "createdAt"',
        'job.startedAt AS "startedAt"',
        'job.completedAt AS "completedAt"',
      ]);

    // Apply filters
    if (status) {
      qb.andWhere('job.status = :status', { status });
    }
    if (projectId) {
      qb.andWhere('job.projectId = :projectId', { projectId });
    }
    if (hasError === true) {
      qb.andWhere('job.errorMessage IS NOT NULL');
    } else if (hasError === false) {
      qb.andWhere('job.errorMessage IS NULL');
    }

    // Get count for pagination
    const countQb = this.syncJobRepo.createQueryBuilder('job');
    if (status) {
      countQb.andWhere('job.status = :status', { status });
    }
    if (projectId) {
      countQb.andWhere('job.projectId = :projectId', { projectId });
    }
    if (hasError === true) {
      countQb.andWhere('job.errorMessage IS NOT NULL');
    } else if (hasError === false) {
      countQb.andWhere('job.errorMessage IS NULL');
    }

    const [rawResults, total] = await Promise.all([
      qb
        .orderBy('job.createdAt', 'DESC')
        .offset(skip)
        .limit(limit)
        .getRawMany(),
      countQb.getCount(),
    ]);

    // Map to DTOs
    const jobs: SyncJobDto[] = rawResults.map((row) => ({
      id: row.id,
      integrationId: row.integrationId,
      integrationName: row.integrationName || undefined,
      projectId: row.projectId,
      projectName: row.projectName || undefined,
      providerType: row.providerType || undefined,
      status: row.status,
      totalItems: row.totalItems || 0,
      processedItems: row.processedItems || 0,
      successfulItems: row.successfulItems || 0,
      failedItems: row.failedItems || 0,
      skippedItems: row.skippedItems || 0,
      currentPhase: row.currentPhase || undefined,
      statusMessage: row.statusMessage || undefined,
      errorMessage: row.errorMessage || undefined,
      triggerType: row.triggerType || 'manual',
      createdAt: row.createdAt,
      startedAt: row.startedAt || undefined,
      completedAt: row.completedAt || undefined,
    }));

    // Calculate stats
    const statsRaw = await this.syncJobRepo
      .createQueryBuilder('job')
      .select([
        'COUNT(*) as total',
        "SUM(CASE WHEN job.status = 'pending' THEN 1 ELSE 0 END) as pending",
        "SUM(CASE WHEN job.status = 'running' THEN 1 ELSE 0 END) as running",
        "SUM(CASE WHEN job.status = 'completed' THEN 1 ELSE 0 END) as completed",
        "SUM(CASE WHEN job.status = 'failed' THEN 1 ELSE 0 END) as failed",
        "SUM(CASE WHEN job.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled",
        'SUM(CASE WHEN job.errorMessage IS NOT NULL THEN 1 ELSE 0 END) as withErrors',
        'COALESCE(SUM(job.successfulItems), 0) as totalItemsImported',
      ])
      .getRawOne();

    const stats: SyncJobStatsDto = {
      total: parseInt(statsRaw?.total || '0', 10),
      pending: parseInt(statsRaw?.pending || '0', 10),
      running: parseInt(statsRaw?.running || '0', 10),
      completed: parseInt(statsRaw?.completed || '0', 10),
      failed: parseInt(statsRaw?.failed || '0', 10),
      cancelled: parseInt(statsRaw?.cancelled || '0', 10),
      withErrors: parseInt(statsRaw?.witherrors || '0', 10),
      totalItemsImported: parseInt(statsRaw?.totalitemsimported || '0', 10),
    };

    const totalPages = Math.ceil(total / limit);

    return {
      jobs,
      stats,
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
   * Bulk delete sync jobs
   */
  @Post('sync-jobs/delete')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Delete sync jobs',
    description: 'Bulk delete sync jobs by IDs',
  })
  @ApiOkResponse({
    description: 'Jobs deleted successfully',
    type: DeleteSyncJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async deleteSyncJobs(
    @Body() body: DeleteSyncJobsDto
  ): Promise<DeleteSyncJobsResponseDto> {
    const { ids } = body;

    if (ids.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        message: 'No jobs to delete',
      };
    }

    const result = await this.syncJobRepo.delete({ id: In(ids) });
    const deletedCount = result.affected || 0;

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} sync job(s)`,
    };
  }

  /**
   * Cancel pending/running sync jobs
   */
  @Post('sync-jobs/cancel')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Cancel sync jobs',
    description: 'Cancel pending or running sync jobs by IDs',
  })
  @ApiOkResponse({
    description: 'Jobs cancelled successfully',
    type: CancelSyncJobsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async cancelSyncJobs(
    @Body() body: CancelSyncJobsDto
  ): Promise<CancelSyncJobsResponseDto> {
    const { ids } = body;

    if (ids.length === 0) {
      return {
        success: true,
        cancelledCount: 0,
        message: 'No jobs to cancel',
      };
    }

    // Only cancel jobs that are pending or running
    const result = await this.syncJobRepo
      .createQueryBuilder()
      .update()
      .set({
        status: 'cancelled',
        completedAt: new Date(),
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('status IN (:...statuses)', {
        statuses: ['pending', 'running'],
      })
      .execute();

    const cancelledCount = result.affected || 0;

    return {
      success: true,
      cancelledCount,
      message: `Cancelled ${cancelledCount} sync job(s)`,
    };
  }

  /**
   * Get logs for a specific sync job
   */
  @Get('sync-jobs/:id/logs')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Get sync job logs',
    description: 'Returns detailed logs for a specific sync job',
  })
  @ApiOkResponse({
    description: 'Sync job logs',
    type: SyncJobLogsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Sync job not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async getSyncJobLogs(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<SyncJobLogsResponseDto> {
    const job = await this.syncJobRepo.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Sync job not found',
        },
      });
    }

    return {
      id: job.id,
      status: job.status,
      logs: job.logs || [],
      errorMessage: job.errorMessage || undefined,
      createdAt: job.createdAt,
      startedAt: job.startedAt || undefined,
      completedAt: job.completedAt || undefined,
    };
  }
}
