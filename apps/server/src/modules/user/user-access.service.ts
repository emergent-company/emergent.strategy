import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrgWithProjectsDto, ProjectWithRoleDto } from './dto/user-access.dto';

interface OrgRow {
  org_id: string;
  org_name: string;
  role: string;
}

interface ProjectRow {
  project_id: string;
  project_name: string;
  org_id: string;
  role: string;
  kb_purpose: string | null;
  auto_extract_objects: boolean;
  auto_extract_config: any;
}

/**
 * Service for retrieving user access tree (organizations and projects with roles)
 */
@Injectable()
export class UserAccessService {
  constructor(private dataSource: DataSource) {}

  /**
   * Get complete access tree for a user, including organizations and projects with roles.
   * Uses optimized queries with joins to avoid N+1 patterns.
   * Uses a single QueryRunner connection for all queries to minimize pool overhead.
   *
   * @param userId - Internal user UUID (from req.user.id)
   * @returns Array of organizations with nested projects, each including user's role
   */
  async getAccessTree(userId: string): Promise<OrgWithProjectsDto[]> {
    if (!userId) {
      return [];
    }

    // Use a single QueryRunner to execute both queries on the same connection
    // This reduces pg-pool.connect calls from 2 to 1 for this operation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Execute both queries in parallel on the same connection
      const [orgRows, projectRows] = await Promise.all([
        // Query 1: Get all organizations user has membership in, with roles
        queryRunner.query(
          `SELECT o.id as org_id, o.name as org_name, om.role
           FROM kb.orgs o
           INNER JOIN kb.organization_memberships om ON o.id = om.organization_id
           WHERE om.user_id = $1
           ORDER BY o.created_at DESC`,
          [userId]
        ) as Promise<OrgRow[]>,
        // Query 2: Get all projects user has membership in, with roles and org association
        queryRunner.query(
          `SELECT p.id as project_id, p.name as project_name, p.organization_id as org_id,
                  pm.role, p.kb_purpose, p.auto_extract_objects, p.auto_extract_config
           FROM kb.projects p
           INNER JOIN kb.project_memberships pm ON p.id = pm.project_id
           WHERE pm.user_id = $1
           ORDER BY p.created_at DESC`,
          [userId]
        ) as Promise<ProjectRow[]>,
      ]);

      // Build hierarchical structure: group projects under their parent organizations
      const orgsMap = new Map<string, OrgWithProjectsDto>();

      // Initialize all orgs with empty project arrays
      for (const orgRow of orgRows) {
        orgsMap.set(orgRow.org_id, {
          id: orgRow.org_id,
          name: orgRow.org_name,
          role: orgRow.role,
          projects: [],
        });
      }

      // Add projects to their parent organizations
      for (const projRow of projectRows) {
        const org = orgsMap.get(projRow.org_id);
        if (org) {
          const project: ProjectWithRoleDto = {
            id: projRow.project_id,
            name: projRow.project_name,
            orgId: projRow.org_id,
            role: projRow.role,
          };

          // Include optional fields if present
          if (projRow.kb_purpose) {
            project.kb_purpose = projRow.kb_purpose;
          }
          if (projRow.auto_extract_objects !== null) {
            project.auto_extract_objects = projRow.auto_extract_objects;
          }
          if (projRow.auto_extract_config) {
            project.auto_extract_config = projRow.auto_extract_config;
          }

          org.projects.push(project);
        }
      }

      // Return as array, maintaining org creation order (most recent first)
      return Array.from(orgsMap.values());
    } finally {
      // Always release the QueryRunner connection back to the pool
      await queryRunner.release();
    }
  }
}
