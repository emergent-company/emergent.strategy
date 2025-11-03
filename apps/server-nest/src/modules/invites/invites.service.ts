import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ZitadelService } from '../auth/zitadel.service';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

interface InviteRow { id: string; organization_id: string; project_id: string | null; email: string; role: string; status: string; token: string; }

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
        private readonly db: DatabaseService,
        private readonly zitadelService: ZitadelService
    ) { }

    private randomToken(): string { return crypto.randomBytes(24).toString('hex'); }

    /**
     * Create invitation AND Zitadel user in a single operation
     * 
     * Flow:
     * 1. Check if user already exists in Zitadel
     * 2. If not, create new Zitadel user
     * 3. Store invitation metadata in Zitadel
     * 4. Create invitation record in database
     * 5. Send password set notification email
     * 6. Return invitation details
     */
    async createWithUser(dto: CreateInviteWithUserDto): Promise<{
        inviteId: string;
        token: string;
        zitadelUserId: string;
        email: string;
    }> {
        const { email, firstName, lastName, organizationId, projectId, role, invitedByUserId } = dto;

        // Validate input
        if (!organizationId && !projectId) {
            throw new BadRequestException('Either organizationId or projectId must be provided');
        }

        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            throw new BadRequestException('Invalid email format');
        }

        try {
            // Step 1: Check if user already exists in Zitadel
            let existingUser = await this.zitadelService.getUserByEmail(email);
            let zitadelUserId: string;

            if (existingUser) {
                this.logger.log(`User already exists in Zitadel: ${existingUser.id} (${email})`);
                zitadelUserId = existingUser.id;
            } else {
                // Step 2: Create new Zitadel user
                zitadelUserId = await this.zitadelService.createUser(email, firstName, lastName);
                this.logger.log(`Created new Zitadel user: ${zitadelUserId} (${email})`);
            }

            // Step 3: Generate invitation token
            const inviteId = uuidv4();
            const token = this.randomToken();
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);  // 7 days expiry

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
            await this.db.query(
                `INSERT INTO kb.invites (id, token, email, organization_id, project_id, invited_by_user_id, expires_at, created_at, status, role)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'pending', $8)`,
                [inviteId, token, email.toLowerCase(), organizationId || null, projectId || null, invitedByUserId, expiresAt, role]
            );

            // Step 6: Send password set notification email
            await this.zitadelService.sendSetPasswordNotification(zitadelUserId, inviteId);

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

    async create(orgId: string, role: string, email: string, projectId?: string | null) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException({ error: { code: 'validation-failed', message: 'Invalid email' } });
        const token = this.randomToken();
        const res = await this.db.query<InviteRow>(
            `INSERT INTO kb.invites(organization_id, project_id, email, role, token) VALUES($1,$2,$3,$4,$5) RETURNING id, organization_id, project_id, email, role, status, token`,
            [orgId, projectId || null, email.toLowerCase(), role]
        );
        const r = res.rows[0];
        return { id: r.id, orgId: r.organization_id, projectId: r.project_id, email: r.email, role: r.role, status: r.status, token: r.token };
    }

    async accept(token: string, userId: string) {
        const res = await this.db.query<InviteRow>(`SELECT id, organization_id, project_id, email, role, status, token FROM kb.invites WHERE token = $1`, [token]);
        if (!res.rowCount) throw new NotFoundException({ error: { code: 'not-found', message: 'Invite not found' } });
        const invite = res.rows[0];
        if (invite.status !== 'pending') throw new BadRequestException({ error: { code: 'invalid-state', message: 'Invite not pending' } });

        // Get user's zitadel_user_id for role granting
        const userResult = await this.db.query(
            `SELECT zitadel_user_id FROM core.user_profiles WHERE id = $1`,
            [userId]
        );

        if (!userResult.rows.length) {
            throw new BadRequestException({ error: { code: 'user-not-found', message: 'User profile not found' } });
        }

        const zitadelUserId = userResult.rows[0].zitadel_user_id;

        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');

            // Grant role in Zitadel if project invite
            if (invite.project_id && this.zitadelService.isConfigured()) {
                const projectId = process.env.ZITADEL_PROJECT_ID;
                if (projectId) {
                    try {
                        // Determine Zitadel role based on invite role
                        const zitadelRole = invite.role === 'org_admin' ? 'org_admin' : 'project_user';
                        await this.zitadelService.grantProjectRole(zitadelUserId, projectId, zitadelRole);
                        this.logger.log(
                            `Granted role ${zitadelRole} in project ${projectId} to user ${zitadelUserId}`
                        );
                    } catch (error) {
                        this.logger.warn(
                            `Failed to grant Zitadel role (continuing with database memberships): ${(error as Error).message}`
                        );
                        // Continue with database memberships even if Zitadel grant fails
                    }
                }
            }

            // userId is now the internal UUID from req.user.id
            if (invite.project_id) {
                await client.query(`INSERT INTO kb.project_memberships(project_id, user_id, role) VALUES($1,$2,$3) ON CONFLICT (project_id, user_id) DO NOTHING`, [invite.project_id, userId, invite.role]);
            } else if (invite.role === 'org_admin') {
                await client.query(`INSERT INTO kb.organization_memberships(organization_id, user_id, role) VALUES($1,$2,'org_admin') ON CONFLICT (organization_id, user_id) DO NOTHING`, [invite.organization_id, userId]);
            } else {
                // non-admin org-level roles not yet implemented, treat as project-level requirement missing
                throw new BadRequestException({ error: { code: 'unsupported', message: 'Non-admin org invite unsupported without project' } });
            }
            await client.query(`UPDATE kb.invites SET status='accepted', accepted_at = now() WHERE id = $1`, [invite.id]);
            await client.query('COMMIT');

            this.logger.log(`User ${userId} accepted invitation ${invite.id}`);
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw e;
        } finally { client.release(); }
        return { status: 'accepted' };
    }
}
