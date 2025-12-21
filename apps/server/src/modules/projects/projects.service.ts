import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { ProjectDto } from './dto/project.dto';
import { ProjectMemberDto } from './dto/project-member.dto';
import { TemplatePackService } from '../template-packs/template-pack.service';
import { AppConfigService } from '../../common/config/config.service';
import { Project } from '../../entities/project.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { Org } from '../../entities/org.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(ProjectMembership)
    private membershipRepo: Repository<ProjectMembership>,
    @InjectRepository(Org) private orgRepo: Repository<Org>,
    @InjectRepository(UserProfile)
    private userProfileRepo: Repository<UserProfile>,
    @InjectRepository(UserEmail) private userEmailRepo: Repository<UserEmail>,
    private dataSource: DataSource,
    private readonly db: DatabaseService,
    private readonly templatePacks: TemplatePackService,
    private readonly config: AppConfigService
  ) {}

  async list(limit = 100, orgId?: string): Promise<ProjectDto[]> {
    if (orgId) {
      // Guard: if orgId isn't a UUID, return empty list (prevents invalid uuid 22P02 errors)
      if (
        !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          orgId
        )
      ) {
        return [];
      }
      // Set tenant context for RLS/query isolation (even if no RLS policy, ensures consistent context)
      // Note: runWithTenantContext now derives orgId from projectId, but we don't have a specific project here.
      // For listing projects by org, we'll bypass runWithTenantContext since we're listing multiple projects.
      // The organizationId filter in the query ensures we only see projects for this org.
      const projects = await this.projectRepo.find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' },
        take: limit,
      });
      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        orgId: p.organizationId,
        kb_purpose: p.kbPurpose ?? undefined,
      }));
    }
    const projects = await this.projectRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      orgId: p.organizationId,
      kb_purpose: p.kbPurpose ?? undefined,
    }));
  }

  async getById(id: string): Promise<ProjectDto | null> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) {
      return null;
    }
    return {
      id: project.id,
      name: project.name,
      orgId: project.organizationId,
      kb_purpose: project.kbPurpose ?? undefined,
      chat_prompt_template: project.chatPromptTemplate ?? undefined,
      auto_extract_objects: project.autoExtractObjects,
      auto_extract_config: project.autoExtractConfig,
      chunking_config: project.chunkingConfig ?? undefined,
      allow_parallel_extraction: project.allowParallelExtraction,
      extraction_config: project.extractionConfig ?? undefined,
    };
  }

  async create(
    name: string,
    orgId?: string,
    userId?: string
  ): Promise<ProjectDto> {
    if (!name || !name.trim()) {
      throw new BadRequestException({
        error: {
          code: 'validation-failed',
          message: 'Name required',
          details: { name: ['must not be blank'] },
        },
      });
    }
    if (!orgId) {
      // New behavior: organization must be specified explicitly (no implicit default creation)
      throw new BadRequestException({
        error: {
          code: 'org-required',
          message: 'Organization id (orgId) is required to create a project',
        },
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let project: ProjectDto | null = null;
    try {
      // Race-hardened approach: perform org existence check and project insert in SAME transaction
      const org = await queryRunner.manager.findOne(Org, {
        where: { id: orgId },
        lock: { mode: 'pessimistic_read' },
      });

      if (!org) {
        throw new BadRequestException({
          error: { code: 'org-not-found', message: 'Organization not found' },
        });
      }

      const newProject = this.projectRepo.create({
        organizationId: orgId,
        name: name.trim(),
      });

      const savedProject = await queryRunner.manager.save(newProject);

      if (userId) {
        // userId is now the internal UUID from req.user.id
        // User profile already exists from auth flow, just insert membership
        try {
          const membership = this.membershipRepo.create({
            projectId: savedProject.id,
            userId,
            role: 'project_admin',
          });
          await queryRunner.manager.save(membership);
        } catch {
          // Ignore duplicate membership errors
        }
      }

      await queryRunner.commitTransaction();
      project = {
        id: savedProject.id,
        name: savedProject.name,
        orgId: savedProject.organizationId,
      };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      const msg = (e as Error).message;
      // Translate FK org deletion race into stable org-not-found semantic
      if (msg.includes('projects_organization_id_fkey')) {
        throw new BadRequestException({
          error: {
            code: 'org-not-found',
            message: 'Organization not found (possibly deleted concurrently)',
          },
        });
      }
      if (msg.includes('duplicate'))
        throw new BadRequestException({
          error: {
            code: 'duplicate',
            message: 'Project with this name exists in org',
          },
        });
      throw e;
    } finally {
      await queryRunner.release();
    }

    if (!project) {
      throw new BadRequestException({
        error: {
          code: 'project-create-failed',
          message: 'Project creation failed unexpectedly',
        },
      });
    }

    await this.installDefaultTemplatePack(project, orgId, userId);

    return project;
  }

  /**
   * Update a project's properties (name, kb_purpose, chat_prompt_template, auto_extract_objects, auto_extract_config, etc.)
   * Returns the updated project or null if not found.
   */
  async update(
    projectId: string,
    updates: {
      name?: string;
      kb_purpose?: string;
      chat_prompt_template?: string;
      auto_extract_objects?: boolean;
      auto_extract_config?: any;
      chunking_config?: any;
      allow_parallel_extraction?: boolean;
      extraction_config?: any;
    }
  ): Promise<ProjectDto | null> {
    // Validate UUID shape
    if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) return null;

    // If no fields to update, just return current project
    if (Object.keys(updates).length === 0) {
      return this.getById(projectId);
    }

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project) {
      return null;
    }

    // Apply updates
    if (updates.name !== undefined) {
      project.name = updates.name;
    }
    if (updates.kb_purpose !== undefined) {
      project.kbPurpose = updates.kb_purpose;
    }
    if (updates.chat_prompt_template !== undefined) {
      project.chatPromptTemplate = updates.chat_prompt_template;
    }
    if (updates.auto_extract_objects !== undefined) {
      project.autoExtractObjects = updates.auto_extract_objects;
    }
    if (updates.auto_extract_config !== undefined) {
      project.autoExtractConfig = updates.auto_extract_config;
    }
    if (updates.chunking_config !== undefined) {
      project.chunkingConfig = updates.chunking_config;
    }
    if (updates.allow_parallel_extraction !== undefined) {
      project.allowParallelExtraction = updates.allow_parallel_extraction;
    }
    if (updates.extraction_config !== undefined) {
      project.extractionConfig = updates.extraction_config;
    }

    const savedProject = await this.projectRepo.save(project);

    return {
      id: savedProject.id,
      name: savedProject.name,
      orgId: savedProject.organizationId,
      kb_purpose: savedProject.kbPurpose ?? undefined,
      chat_prompt_template: savedProject.chatPromptTemplate ?? undefined,
      auto_extract_objects: savedProject.autoExtractObjects,
      auto_extract_config: savedProject.autoExtractConfig,
      chunking_config: savedProject.chunkingConfig ?? undefined,
      allow_parallel_extraction: savedProject.allowParallelExtraction,
      extraction_config: savedProject.extractionConfig ?? undefined,
    };
  }

  /**
   * Delete a project and cascade-remove associated artifacts (documents, chunks, chat conversations/messages).
   * FKs with ON DELETE CASCADE remove dependent rows (documents -> chunks, chat_conversations -> chat_messages).
   * Returns true if the project existed and was deleted.
   */
  async delete(projectId: string): Promise<boolean> {
    // Validate UUID shape quickly to avoid errors from invalid input.
    if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) return false;
    const result = await this.projectRepo.delete(projectId);
    return (result.affected ?? 0) > 0;
  }

  private async installDefaultTemplatePack(
    project: ProjectDto,
    orgId: string,
    userId?: string
  ): Promise<void> {
    const defaultPackId = this.config.extractionDefaultTemplatePackId;
    if (!defaultPackId) {
      this.logger.debug(
        `No default template pack configured; skipping auto-install for project ${project.id}`
      );
      return;
    }

    try {
      await this.templatePacks.assignTemplatePackToProject(
        project.id,
        orgId,
        userId ?? SYSTEM_USER_ID,
        { template_pack_id: defaultPackId }
      );
      this.logger.log(
        `Installed default template pack ${defaultPackId} for project ${project.id}`
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.debug(
          `Default template pack already installed for project ${project.id}`
        );
        return;
      }

      if (error instanceof NotFoundException) {
        this.logger.error(
          `Default template pack ${defaultPackId} not found; project ${project.id} will require manual assignment`
        );
        return;
      }

      this.logger.error(
        `Failed to install default template pack ${defaultPackId} for project ${
          project.id
        }: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * List all members of a project with their profile info
   */
  async listMembers(projectId: string): Promise<ProjectMemberDto[]> {
    // Validate UUID shape
    if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) {
      return [];
    }

    // Query memberships with user profile and email
    const memberships = await this.membershipRepo
      .createQueryBuilder('membership')
      .innerJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('user.emails', 'email')
      .where('membership.projectId = :projectId', { projectId })
      .orderBy('membership.createdAt', 'ASC')
      .getMany();

    return memberships.map((m) => {
      // Get primary email (first verified, or just first)
      const emails = m.user.emails || [];
      const primaryEmail =
        emails.find((e) => e.verified)?.email || emails[0]?.email || '';

      return {
        id: m.userId,
        email: primaryEmail,
        displayName: m.user.displayName ?? undefined,
        firstName: m.user.firstName ?? undefined,
        lastName: m.user.lastName ?? undefined,
        avatarUrl: m.user.avatarObjectKey ?? undefined, // TODO: Convert to actual URL
        role: m.role,
        joinedAt: m.createdAt,
      };
    });
  }

  /**
   * Remove a member from a project
   * @param projectId The project ID
   * @param userId The user ID to remove
   * @param requestingUserId The ID of the user making the request (for self-removal prevention if admin)
   * @returns true if member was removed, false if not found
   * @throws ForbiddenException if trying to remove the last admin
   */
  async removeMember(
    projectId: string,
    userId: string,
    requestingUserId?: string
  ): Promise<boolean> {
    // Validate UUID shapes
    if (
      !/^[0-9a-fA-F-]{36}$/.test(projectId) ||
      !/^[0-9a-fA-F-]{36}$/.test(userId)
    ) {
      return false;
    }

    // Find the membership
    const membership = await this.membershipRepo.findOne({
      where: { projectId, userId },
    });

    if (!membership) {
      return false;
    }

    // If removing an admin, check they're not the last one
    if (membership.role === 'project_admin') {
      const adminCount = await this.membershipRepo.count({
        where: { projectId, role: 'project_admin' },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException({
          error: {
            code: 'last-admin',
            message:
              'Cannot remove the last admin from the project. Assign another admin first.',
          },
        });
      }
    }

    await this.membershipRepo.delete({ projectId, userId });
    return true;
  }
}
