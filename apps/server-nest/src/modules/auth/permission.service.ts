import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

// Role to scope catalogue (mirrors spec ROLE_SCOPE_MAP subset actually enforced now)
const ROLE_SCOPE_MAP: Record<string, string[]> = {
    org_admin: [
        'org:read',
        'org:project:create', 'org:project:delete', 'org:invite:create',
        'project:read', 'project:invite:create',
        'documents:read', 'documents:write', 'documents:delete',
        'ingest:write', 'search:read', 'chunks:read',
        'chat:use', 'chat:admin',
        'notifications:read', 'notifications:write',
        'extraction:read', 'extraction:write'
    ],
    project_admin: [
        'org:read',
        'project:read', 'project:invite:create',
        'documents:read', 'documents:write', 'documents:delete',
        'ingest:write', 'search:read', 'chunks:read',
        'chat:use',
        'notifications:read', 'notifications:write',
        'extraction:read', 'extraction:write'
    ],
    project_user: [
        'org:read',
        'project:read',
        'documents:read', 'search:read', 'chunks:read',
        'chat:use',
        'notifications:read', 'notifications:write',
        'extraction:read'
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
    constructor(private readonly db: DatabaseService) { }

    /** Load memberships for a user and expand to scopes (server-side authoritative expansion). */
    async compute(userId: string): Promise<EffectivePermissions> {
        if (!this.db.isOnline()) {
            // Offline fallback: grant minimal visibility only.
            return { userId, orgRoles: [], projectRoles: [], scopes: ['org:read'] };
        }
        // Membership tables assumed to exist (ensured during schema bootstrap / upgrade).
        // Lazy ensure a user profile row exists (idempotent). subject_id is canonical internal id.
        this.logger.log(`Computing permissions for user ${userId} - ensuring profile exists`);
        try {
            await this.db.query(
                `INSERT INTO core.user_profiles(subject_id)
                             VALUES($1)
                             ON CONFLICT (subject_id) DO NOTHING`,
                [userId],
            );
            this.logger.log(`Successfully ensured user profile exists for ${userId}`);
        } catch (e) {
            this.logger.error(`Failed ensuring user profile row for ${userId}`, e as Error);
        }
        // Fetch memberships. Ignore org/project name joins for performance (controllers will filter by ids supplied in headers).
        const orgRows = await this.db.query<{ organization_id: string; role: string }>(
            'SELECT org_id, role FROM kb.organization_memberships WHERE subject_id = $1',
            [userId]
        );
        const projectRows = await this.db.query<{ project_id: string; role: string }>(
            'SELECT project_id, role FROM kb.project_memberships WHERE subject_id = $1',
            [userId]
        );
        const scopes: string[] = [];
        const pushScopes = (role: string) => {
            const mapped = ROLE_SCOPE_MAP[role];
            if (mapped) scopes.push(...mapped);
        };
        for (const r of orgRows.rows) pushScopes(r.role);
        for (const r of projectRows.rows) pushScopes(r.role);
        // Implicit org:read from any project membership (if not already covered) – spec rule.
        if (projectRows.rowCount) scopes.push('org:read');
        const dedup = Array.from(new Set(scopes));
        return {
            userId,
            orgRoles: orgRows.rows.map(r => ({ orgId: r.organization_id, role: r.role as 'org_admin' })),
            projectRoles: projectRows.rows.map(r => ({ projectId: r.project_id, role: r.role as 'project_admin' | 'project_user' })),
            scopes: dedup,
        };
    }
}
