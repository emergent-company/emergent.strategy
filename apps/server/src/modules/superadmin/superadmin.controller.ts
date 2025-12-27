import {
  Controller,
  Get,
  Delete,
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
  SystemConfigResponseDto,
  RevealEnvQueryDto,
  ExternalServiceDto,
  EnvironmentVariableDto,
  DeploymentInfoDto,
} from './dto/system-config.dto';

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
}
