import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvitesService } from '../src/modules/invites/invites.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// Minimal mock DatabaseService
class MockDb {
    queries: any[] = [];
    // configurable responses
    insertResult: any;
    selectInvite: any;
    selectUserProfile: any;
    client: any;

    query<T = any>(sql: string, params: any[]) {
        this.queries.push({ sql, params });
        if (sql.startsWith('INSERT INTO kb.invites')) {
            return Promise.resolve({ rows: [this.insertResult], rowCount: 1 });
        }
        if (sql.startsWith('SELECT id, organization_id, project_id, email, role, status, token FROM kb.invites')) {
            if (!this.selectInvite) return Promise.resolve({ rows: [], rowCount: 0 });
            return Promise.resolve({ rows: [this.selectInvite], rowCount: 1 });
        }
        if (sql.startsWith('SELECT zitadel_user_id FROM core.user_profiles')) {
            if (!this.selectUserProfile) return Promise.resolve({ rows: [], rowCount: 0 });
            return Promise.resolve({ rows: [this.selectUserProfile], rowCount: 1 });
        }
        if (sql.startsWith('UPDATE kb.invites')) {
            return Promise.resolve({ rowCount: 1 });
        }
        throw new Error('Unexpected query: ' + sql);
    }
    async getClient() {
        if (this.client) return this.client;
        const client = {
            queries: [] as any[],
            query: (sql: string, params?: any[]) => {
                client.queries.push({ sql, params });
                if (sql.startsWith('INSERT INTO kb.project_memberships')) return Promise.resolve({ rowCount: 1 });
                if (sql.startsWith('INSERT INTO kb.organization_memberships')) return Promise.resolve({ rowCount: 1 });
                if (sql.startsWith('UPDATE kb.invites')) return Promise.resolve({ rowCount: 1 });
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
                throw new Error('Unexpected tx query: ' + sql);
            },
            release: vi.fn(),
        };
        this.client = client;
        return client;
    }
}

// Mock ZitadelService
const createMockZitadelService = () => ({
    isConfigured: vi.fn(() => false),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUserMetadata: vi.fn(),
    sendSetPasswordNotification: vi.fn(),
    grantProjectRole: vi.fn(),
    introspect: vi.fn(),
    getAccessToken: vi.fn(),
    getUserProjectRoles: vi.fn(),
}) as any;

describe('InvitesService', () => {
    let db: MockDb; let zitadel: any; let service: InvitesService;
    beforeEach(() => {
        db = new MockDb();
        zitadel = createMockZitadelService();
        service = new InvitesService(db as any, zitadel);
    });

    it('creates invite with normalized email', async () => {
        db.insertResult = { id: 'i1', organization_id: 'org1', project_id: null, email: 'user@example.com', role: 'org_admin', status: 'pending', token: 'tkn' };
        const res = await service.create('org1', 'org_admin', 'User@Example.COM', null);
        expect(res).toMatchObject({ id: 'i1', email: 'user@example.com', role: 'org_admin', status: 'pending' });
        // ensure insert recorded
        expect(db.queries[0].params[2]).toBe('user@example.com');
    });

    it('rejects invalid email', async () => {
        await expect(service.create('org1', 'org_admin', 'bad-email', null)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts org_admin invite and creates membership', async () => {
        db.selectInvite = { id: 'i1', organization_id: 'org1', project_id: null, email: 'user@example.com', role: 'org_admin', status: 'pending', token: 'tok' };
        db.selectUserProfile = { zitadel_user_id: 'zitadel-user-1' };  // Mock user profile query
        const out = await service.accept('tok', 'user1');
        expect(out).toEqual({ status: 'accepted' });
        const client = await db.getClient();
        const txSqls = client.queries.map((q: any) => q.sql);
        expect(txSqls).toContain('BEGIN');
        expect(txSqls.some((s: any) => s.startsWith('INSERT INTO kb.organization_memberships'))).toBe(true);
        expect(txSqls).toContain('COMMIT');
    });

    it('accepts project invite and inserts project membership', async () => {
        db.selectInvite = { id: 'i2', organization_id: 'org1', project_id: 'proj1', email: 'user@example.com', role: 'project_user', status: 'pending', token: 'tok2' };
        db.selectUserProfile = { zitadel_user_id: 'zitadel-user-2' };  // Mock user profile query
        const out = await service.accept('tok2', 'user2');
        expect(out).toEqual({ status: 'accepted' });
        const client = await db.getClient();
        expect(client.queries.some((q: any) => q.sql.startsWith('INSERT INTO kb.project_memberships'))).toBe(true);
    });

    it('rejects unsupported non-admin org invite without project', async () => {
        db.selectInvite = { id: 'i3', organization_id: 'org1', project_id: null, email: 'user@example.com', role: 'project_user', status: 'pending', token: 'tok3' };
        await expect(service.accept('tok3', 'user3')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects not found invite', async () => {
        db.selectInvite = null;
        await expect(service.accept('does-not-exist', 'userX')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects already accepted invite', async () => {
        db.selectInvite = { id: 'i4', organization_id: 'org1', project_id: null, email: 'user@example.com', role: 'org_admin', status: 'accepted', token: 'tok4' };
        await expect(service.accept('tok4', 'userZ')).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('InvitesService - createWithUser (Zitadel Integration)', () => {
    let db: MockDb; let zitadel: any; let service: InvitesService;

    beforeEach(() => {
        db = new MockDb();
        zitadel = createMockZitadelService();
        service = new InvitesService(db as any, zitadel);
    });

    describe('creating invitation with new user', () => {
        it('should create Zitadel user if not exists', async () => {
            // Mock: User doesn't exist yet
            zitadel.getUserByEmail.mockResolvedValue(null);
            zitadel.createUser.mockResolvedValue('zitadel-user-123');
            zitadel.updateUserMetadata.mockResolvedValue(undefined);
            zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

            const result = await service.createWithUser({
                email: 'newuser@example.com',
                firstName: 'New',
                lastName: 'User',
                organizationId: 'org-123',
                role: 'project_user',
                invitedByUserId: 'inviter-uuid',
            });

            // Verify Zitadel user was created
            expect(zitadel.getUserByEmail).toHaveBeenCalledWith('newuser@example.com');
            expect(zitadel.createUser).toHaveBeenCalledWith('newuser@example.com', 'New', 'User');
            expect(result.zitadelUserId).toBe('zitadel-user-123');
            expect(result.email).toBe('newuser@example.com');

            // Verify metadata was stored
            expect(zitadel.updateUserMetadata).toHaveBeenCalledWith(
                'zitadel-user-123',
                expect.objectContaining({
                    'spec-server-invite': expect.objectContaining({
                        role: 'project_user',
                        organizationId: 'org-123',
                        invitedByUserId: 'inviter-uuid',
                    }),
                })
            );

            // Verify password notification was sent
            expect(zitadel.sendSetPasswordNotification).toHaveBeenCalledWith(
                'zitadel-user-123',
                expect.any(String)  // inviteId
            );
        });

        it('should use existing Zitadel user if found', async () => {
            // Mock: User already exists
            zitadel.getUserByEmail.mockResolvedValue({ id: 'existing-zitadel-456', email: 'existing@example.com' });
            zitadel.updateUserMetadata.mockResolvedValue(undefined);
            zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

            const result = await service.createWithUser({
                email: 'existing@example.com',
                firstName: 'Existing',
                lastName: 'User',
                projectId: 'proj-789',
                role: 'project_admin',
                invitedByUserId: 'inviter-uuid',
            });

            // Verify existing user was used (createUser NOT called)
            expect(zitadel.getUserByEmail).toHaveBeenCalledWith('existing@example.com');
            expect(zitadel.createUser).not.toHaveBeenCalled();
            expect(result.zitadelUserId).toBe('existing-zitadel-456');
        });

        it('should normalize email to lowercase', async () => {
            zitadel.getUserByEmail.mockResolvedValue(null);
            zitadel.createUser.mockResolvedValue('zitadel-user-789');
            zitadel.updateUserMetadata.mockResolvedValue(undefined);
            zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

            const result = await service.createWithUser({
                email: 'MixedCase@Example.COM',
                firstName: 'Test',
                lastName: 'User',
                organizationId: 'org-123',
                role: 'org_admin',
                invitedByUserId: 'inviter-uuid',
            });

            expect(result.email).toBe('mixedcase@example.com');
            // Verify database insert had lowercase email
            const insertQuery = db.queries.find((q: any) => q.sql.startsWith('INSERT INTO kb.invites'));
            expect(insertQuery.params[2]).toBe('mixedcase@example.com');
        });

        it('should store invitation metadata in Zitadel', async () => {
            zitadel.getUserByEmail.mockResolvedValue(null);
            zitadel.createUser.mockResolvedValue('zitadel-user-999');
            zitadel.updateUserMetadata.mockResolvedValue(undefined);
            zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

            await service.createWithUser({
                email: 'metauser@example.com',
                firstName: 'Meta',
                lastName: 'User',
                organizationId: 'org-456',
                projectId: 'proj-789',
                role: 'project_user',
                invitedByUserId: 'inviter-uuid',
            });

            // Verify metadata structure
            const metadataCall = zitadel.updateUserMetadata.mock.calls[0];
            expect(metadataCall[0]).toBe('zitadel-user-999');
            expect(metadataCall[1]['spec-server-invite']).toMatchObject({
                role: 'project_user',
                organizationId: 'org-456',
                projectId: 'proj-789',
                invitedByUserId: 'inviter-uuid',
            });
            expect(metadataCall[1]['spec-server-invite'].inviteId).toBeDefined();
            expect(metadataCall[1]['spec-server-invite'].invitedAt).toBeDefined();
        });

        it('should create database invitation record', async () => {
            zitadel.getUserByEmail.mockResolvedValue(null);
            zitadel.createUser.mockResolvedValue('zitadel-user-111');
            zitadel.updateUserMetadata.mockResolvedValue(undefined);
            zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

            await service.createWithUser({
                email: 'dbuser@example.com',
                firstName: 'DB',
                lastName: 'User',
                organizationId: 'org-123',
                role: 'org_admin',
                invitedByUserId: 'inviter-uuid',
            });

            // Verify database insert
            const insertQuery = db.queries.find((q: any) => q.sql.startsWith('INSERT INTO kb.invites'));
            expect(insertQuery).toBeDefined();
            expect(insertQuery.params[2]).toBe('dbuser@example.com');  // email
            expect(insertQuery.params[3]).toBe('org-123');  // organization_id
            expect(insertQuery.params[5]).toBe('inviter-uuid');  // invited_by_user_id
            expect(insertQuery.params[7]).toBe('org_admin');  // role
        });

        it('should reject if neither organizationId nor projectId provided', async () => {
            await expect(
                service.createWithUser({
                    email: 'nocontext@example.com',
                    firstName: 'No',
                    lastName: 'Context',
                    role: 'project_user',
                    invitedByUserId: 'inviter-uuid',
                })
            ).rejects.toThrow('Either organizationId or projectId must be provided');
        });

        it('should reject invalid email format', async () => {
            await expect(
                service.createWithUser({
                    email: 'not-an-email',
                    firstName: 'Invalid',
                    lastName: 'Email',
                    organizationId: 'org-123',
                    role: 'project_user',
                    invitedByUserId: 'inviter-uuid',
                })
            ).rejects.toThrow('Invalid email format');
        });
    });

    describe('accepting invitation with Zitadel role grant', () => {
        it('should grant role in Zitadel when accepting project invite', async () => {
            // Setup: Project invite
            db.selectInvite = {
                id: 'invite-123',
                organization_id: 'org-123',
                project_id: 'proj-456',
                email: 'acceptor@example.com',
                role: 'project_user',
                status: 'pending',
                token: 'accept-token',
            };
            db.selectUserProfile = { zitadel_user_id: 'zitadel-acceptor-789' };

            // Mock: Zitadel configured
            zitadel.isConfigured.mockReturnValue(true);
            zitadel.grantProjectRole.mockResolvedValue(undefined);

            // Set ZITADEL_PROJECT_ID for test
            process.env.ZITADEL_PROJECT_ID = 'zitadel-proj-999';

            await service.accept('accept-token', 'user-uuid-123');

            // Verify role was granted in Zitadel
            expect(zitadel.grantProjectRole).toHaveBeenCalledWith(
                'zitadel-acceptor-789',
                'zitadel-proj-999',
                'project_user'
            );

            // Cleanup
            delete process.env.ZITADEL_PROJECT_ID;
        });

        it('should continue even if Zitadel role grant fails', async () => {
            // Setup: Project invite
            db.selectInvite = {
                id: 'invite-456',
                organization_id: 'org-123',
                project_id: 'proj-789',
                email: 'graceful@example.com',
                role: 'project_admin',
                status: 'pending',
                token: 'graceful-token',
            };
            db.selectUserProfile = { zitadel_user_id: 'zitadel-graceful-111' };

            // Mock: Zitadel configured but grant fails
            zitadel.isConfigured.mockReturnValue(true);
            zitadel.grantProjectRole.mockRejectedValue(new Error('Zitadel API error'));

            process.env.ZITADEL_PROJECT_ID = 'zitadel-proj-999';

            // Should not throw - graceful degradation
            const result = await service.accept('graceful-token', 'user-uuid-456');
            expect(result).toEqual({ status: 'accepted' });

            // Cleanup
            delete process.env.ZITADEL_PROJECT_ID;
        });

        it('should skip Zitadel grant if not configured', async () => {
            // Setup: Project invite
            db.selectInvite = {
                id: 'invite-789',
                organization_id: 'org-123',
                project_id: 'proj-999',
                email: 'noconfig@example.com',
                role: 'project_user',
                status: 'pending',
                token: 'noconfig-token',
            };
            db.selectUserProfile = { zitadel_user_id: 'zitadel-noconfig-222' };

            // Mock: Zitadel not configured
            zitadel.isConfigured.mockReturnValue(false);

            await service.accept('noconfig-token', 'user-uuid-789');

            // Verify role grant was NOT attempted
            expect(zitadel.grantProjectRole).not.toHaveBeenCalled();
        });
    });
});
