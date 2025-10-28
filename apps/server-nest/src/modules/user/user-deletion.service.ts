import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { UserProfileService } from '../user-profile/user-profile.service';

export interface DeletionResult {
    deleted: {
        organizations: number;
        projects: number;
        documents: number;
        chunks: number;
        embeddings: number;
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
        private readonly db: DatabaseService,
        private readonly userProfileService: UserProfileService,
    ) { }

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
                embeddings: 0,
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
                        embeddings: 0,
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
            const orgsResult = await this.db.query<{ id: string }>(
                `SELECT DISTINCT om.organization_id as id 
                 FROM kb.organization_memberships om 
                 WHERE om.user_id = $1 AND om.role = 'org_admin'`,
                [profile.id] // Use internal UUID, not Zitadel ID
            );
            const orgs = orgsResult.rows;

            this.logger.log(`Found ${orgs.length} organizations to delete`);

            for (const org of orgs) {
                // Get projects in this org
                const projectsResult = await this.db.query<{ id: string }>(
                    `SELECT id FROM kb.projects WHERE org_id = $1`,
                    [org.id]
                );
                const projects = projectsResult.rows;

                this.logger.log(`Found ${projects.length} projects in org ${org.id}`);

                for (const project of projects) {
                    // Delete project data
                    await this.deleteProjectData(project.id, result);
                }

                result.deleted.projects += projects.length;

                // Delete integrations for this org
                const integrationsDeleted = await this.db.query(
                    `DELETE FROM kb.integrations WHERE org_id = $1`,
                    [org.id]
                );
                result.deleted.integrations += integrationsDeleted.rowCount || 0;

                // Delete organization
                await this.db.query(
                    `DELETE FROM kb.orgs WHERE id = $1`,
                    [org.id]
                );
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
    private async deleteProjectData(projectId: string, result: DeletionResult): Promise<void> {
        this.logger.log(`Deleting data for project: ${projectId}`);

        // Delete embeddings (must be before chunks due to foreign key)
        const embeddingsDeleted = await this.db.query(
            `DELETE FROM kb.embeddings WHERE chunk_id IN (
                SELECT id FROM kb.chunks WHERE document_id IN (
                    SELECT id FROM kb.documents WHERE project_id = $1
                )
            )`,
            [projectId]
        );
        result.deleted.embeddings += embeddingsDeleted.rowCount || 0;

        // Delete chunks (must be before documents due to foreign key)
        const chunksDeleted = await this.db.query(
            `DELETE FROM kb.chunks WHERE document_id IN (
                SELECT id FROM kb.documents WHERE project_id = $1
            )`,
            [projectId]
        );
        result.deleted.chunks += chunksDeleted.rowCount || 0;

        // Delete extraction jobs
        const jobsDeleted = await this.db.query(
            `DELETE FROM kb.object_extraction_jobs WHERE project_id = $1`,
            [projectId]
        );
        result.deleted.extractionJobs += jobsDeleted.rowCount || 0;

        // Delete graph objects and relationships
        const graphObjectsDeleted = await this.db.query(
            `DELETE FROM kb.graph_objects WHERE project_id = $1`,
            [projectId]
        );
        result.deleted.graphObjects += graphObjectsDeleted.rowCount || 0;

        // Graph relationships are cascade deleted via foreign key

        // Delete documents
        const docsDeleted = await this.db.query(
            `DELETE FROM kb.documents WHERE project_id = $1`,
            [projectId]
        );
        result.deleted.documents += docsDeleted.rowCount || 0;

        // Delete the project itself
        await this.db.query(
            `DELETE FROM kb.projects WHERE id = $1`,
            [projectId]
        );
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

        return testPatterns.some(pattern => pattern.test(email));
    }
}
