import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfileService } from '../user-profile/user-profile.service';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { Project } from '../../entities/project.entity';
import { Integration } from '../../entities/integration.entity';
import { Chunk } from '../../entities/chunk.entity';
import { ObjectExtractionJob } from '../../entities/object-extraction-job.entity';
import { GraphObject } from '../../entities/graph-object.entity';
import { Document } from '../../entities/document.entity';
import { Org } from '../../entities/org.entity';

export interface DeletionResult {
  deleted: {
    organizations: number;
    projects: number;
    documents: number;
    chunks: number;
    extractionJobs: number;
    graphObjects: number;
    integrations: number;
  };
  duration_ms: number;
}

/**
 * Service for deleting all user data from the system.
 * Used for:
 * 1. User account deletion (when user wants to delete their account)
 * 2. Test cleanup (cleaning test user data between E2E tests)
 */
@Injectable()
export class UserDeletionService {
  private readonly logger = new Logger(UserDeletionService.name);

  constructor(
    @InjectRepository(OrganizationMembership)
    private readonly orgMembershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    @InjectRepository(Chunk)
    private readonly chunkRepo: Repository<Chunk>,
    @InjectRepository(ObjectExtractionJob)
    private readonly extractionJobRepo: Repository<ObjectExtractionJob>,
    @InjectRepository(GraphObject)
    private readonly graphObjectRepo: Repository<GraphObject>,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(Org)
    private readonly orgRepo: Repository<Org>,
    private readonly userProfileService: UserProfileService
  ) {}

  /**
   * Delete all data associated with a user.
   * This is a cascading delete that removes:
   * - Organizations owned by the user
   * - Projects in those organizations
   * - All data in those projects (documents, chunks, embeddings, etc.)
   *
   * @param userId - The Zitadel user ID
   * @returns Statistics about what was deleted
   */
  async deleteUserData(userId: string): Promise<DeletionResult> {
    const startTime = Date.now();
    this.logger.log(`Starting deletion for user: ${userId}`);

    const result: DeletionResult = {
      deleted: {
        organizations: 0,
        projects: 0,
        documents: 0,
        chunks: 0,
        extractionJobs: 0,
        graphObjects: 0,
        integrations: 0,
      },
      duration_ms: 0,
    };

    try {
      // Step 1: Lookup internal UUID by Zitadel ID
      // userId parameter is the Zitadel subject ID (TEXT)
      const profile = await this.userProfileService.get(userId);
      if (!profile) {
        this.logger.warn(`User profile not found for Zitadel ID: ${userId}`);
        return {
          deleted: {
            documents: 0,
            chunks: 0,
            extractionJobs: 0,
            graphObjects: 0,
            projects: 0,
            organizations: 0,
            integrations: 0,
          },
          duration_ms: 0,
        };
      }

      // Step 2: Get all organizations where this user is an admin using internal UUID
      const orgs = await this.orgMembershipRepo.find({
        where: {
          userId: profile.id, // Use internal UUID, not Zitadel ID
          role: 'org_admin',
        },
        select: ['organizationId'],
      });

      this.logger.log(`Found ${orgs.length} organizations to delete`);

      for (const orgMembership of orgs) {
        // Get projects in this org
        const projects = await this.projectRepo.find({
          where: { organizationId: orgMembership.organizationId },
          select: ['id'],
        });

        this.logger.log(
          `Found ${projects.length} projects in org ${orgMembership.organizationId}`
        );

        for (const project of projects) {
          // Delete project data
          await this.deleteProjectData(project.id, result);
        }

        result.deleted.projects += projects.length;

        // Delete integrations for this org
        const integrationsResult = await this.integrationRepo.delete({
          organizationId: orgMembership.organizationId,
        });
        result.deleted.integrations += integrationsResult.affected || 0;

        // Delete organization
        await this.orgRepo.delete({ id: orgMembership.organizationId });
        result.deleted.organizations++;
      }

      result.duration_ms = Date.now() - startTime;
      this.logger.log(`Deletion complete: ${JSON.stringify(result)}`);

      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error deleting user data: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Delete all data for a specific project
   */
  private async deleteProjectData(
    projectId: string,
    result: DeletionResult
  ): Promise<void> {
    this.logger.log(`Deleting data for project: ${projectId}`);

    // Note: embeddings are stored in chunks.embedding column (vector type), not a separate table
    // They will be deleted automatically when chunks are deleted

    // Get all document IDs for this project
    const documents = await this.documentRepo.find({
      where: { projectId },
      select: ['id'],
    });
    const documentIds = documents.map((d) => d.id);

    // Delete chunks for all documents (will cascade to delete embeddings since they're in the same row)
    if (documentIds.length > 0) {
      const chunksResult = await this.chunkRepo
        .createQueryBuilder()
        .delete()
        .where('document_id IN (:...documentIds)', { documentIds })
        .execute();
      result.deleted.chunks += chunksResult.affected || 0;
    }

    // Delete extraction jobs
    const jobsResult = await this.extractionJobRepo.delete({ projectId });
    result.deleted.extractionJobs += jobsResult.affected || 0;

    // Delete graph objects (relationships are cascade deleted via foreign key)
    const graphObjectsResult = await this.graphObjectRepo.delete({ projectId });
    result.deleted.graphObjects += graphObjectsResult.affected || 0;

    // Delete documents
    const docsResult = await this.documentRepo.delete({ projectId });
    result.deleted.documents += docsResult.affected || 0;

    // Delete the project itself
    await this.projectRepo.delete({ id: projectId });
  }

  /**
   * Safety check: Verify this is a test environment before allowing deletion
   */
  isTestEnvironment(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  /**
   * Safety check: Verify email is a test account
   */
  isTestEmail(email: string): boolean {
    const testPatterns = [
      /^e2e-test@/i,
      /^test.*@example\.com$/i,
      /@example\.com$/i,
      /test.*@/i,
    ];

    return testPatterns.some((pattern) => pattern.test(email));
  }
}
