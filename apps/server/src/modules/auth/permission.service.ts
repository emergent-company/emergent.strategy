import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';

// Role to scope catalogue (mirrors spec ROLE_SCOPE_MAP subset actually enforced now)
const ROLE_SCOPE_MAP: Record<string, string[]> = {
  org_admin: [
    'org:read',
    'org:project:create',
    'org:project:delete',
    'org:invite:create',
    'project:read',
    'project:invite:create',
    'documents:read',
    'documents:write',
    'documents:delete',
    'ingest:write',
    'search:read',
    'chunks:read',
    'chat:use',
    'chat:admin',
    'notifications:read',
    'notifications:write',
    'tasks:read',
    'tasks:write',
    'extraction:read',
    'extraction:write',
    'user-activity:read',
    'user-activity:write',
  ],
  project_admin: [
    'org:read',
    'project:read',
    'project:invite:create',
    'documents:read',
    'documents:write',
    'documents:delete',
    'ingest:write',
    'search:read',
    'chunks:read',
    'chat:use',
    'notifications:read',
    'notifications:write',
    'tasks:read',
    'tasks:write',
    'extraction:read',
    'extraction:write',
    'user-activity:read',
    'user-activity:write',
  ],
  project_user: [
    'org:read',
    'project:read',
    'documents:read',
    'search:read',
    'chunks:read',
    'chat:use',
    'notifications:read',
    'notifications:write',
    'tasks:read',
    'tasks:write',
    'extraction:read',
    'user-activity:read',
    'user-activity:write',
  ],
};

export interface EffectivePermissions {
  userId: string;
  orgRoles: { orgId: string; role: 'org_admin' }[];
  projectRoles: { projectId: string; role: 'project_admin' | 'project_user' }[];
  scopes: string[]; // deduped
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  constructor(
    @InjectRepository(OrganizationMembership)
    private readonly orgMembershipRepository: Repository<OrganizationMembership>,
    @InjectRepository(ProjectMembership)
    private readonly projectMembershipRepository: Repository<ProjectMembership>,
    private readonly db: DatabaseService
  ) {}

  /** Load memberships for a user and expand to scopes (server-side authoritative expansion). */
  async compute(userId: string): Promise<EffectivePermissions> {
    if (!this.db.isOnline()) {
      // Offline fallback: grant minimal visibility only.
      return { userId, orgRoles: [], projectRoles: [], scopes: ['org:read'] };
    }
    // Membership tables assumed to exist (ensured during schema bootstrap / upgrade).
    // userId is now the internal UUID from req.user.id. User profile already exists from auth flow.
    this.logger.log(`Computing permissions for user ${userId}`);

    // Fetch memberships using TypeORM (type-safe!)
    const orgMemberships = await this.orgMembershipRepository.find({
      where: { userId },
      select: ['organizationId', 'role'],
    });

    const projectMemberships = await this.projectMembershipRepository.find({
      where: { userId },
      select: ['projectId', 'role'],
    });

    const scopes: string[] = [];
    const pushScopes = (role: string) => {
      const mapped = ROLE_SCOPE_MAP[role];
      if (mapped) scopes.push(...mapped);
    };

    for (const membership of orgMemberships) pushScopes(membership.role);
    for (const membership of projectMemberships) pushScopes(membership.role);

    // Implicit org:read from any project membership (if not already covered) – spec rule.
    if (projectMemberships.length > 0) scopes.push('org:read');

    const dedup = Array.from(new Set(scopes));
    return {
      userId,
      orgRoles: orgMemberships.map((m) => ({
        orgId: m.organizationId,
        role: m.role as 'org_admin',
      })),
      projectRoles: projectMemberships.map((m) => ({
        projectId: m.projectId,
        role: m.role as 'project_admin' | 'project_user',
      })),
      scopes: dedup,
    };
  }
}
