import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileService } from '../src/modules/user-profile/user-profile.service';
import { DatabaseService } from '../src/common/database/database.service';

// Minimal shape of QueryResult used in service (rowCount, rows)
interface MockQueryResult<T> { rowCount: number; rows: T[] }

describe('UserProfileService', () => {
    // Use a loosely typed mock; specific assertions inspect call arguments.
    const db = {
        query: vi.fn()
    } as unknown as DatabaseService;

    let service: UserProfileService;
    beforeEach(() => {
        vi.clearAllMocks();
        service = new UserProfileService(db);
    });

    it('get() returns null when profile missing (by zitadelUserId)', async () => {
        (db.query as any).mockResolvedValueOnce({ rowCount: 0, rows: [] } satisfies MockQueryResult<any>);
        const res = await service.get('zitadel-123');
        expect(res).toBeNull();
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE zitadel_user_id'), ['zitadel-123']);
    });

    it('get() maps row when profile exists (by zitadelUserId)', async () => {
        (db.query as any).mockResolvedValueOnce({
            rowCount: 1,
            rows: [{
                id: 'uuid-1',
                zitadel_user_id: 'zitadel-123',
                first_name: 'A',
                last_name: 'B',
                display_name: 'C',
                phone_e164: '+1',
                avatar_object_key: 'k'
            }]
        } satisfies MockQueryResult<any>);
        const res = await service.get('zitadel-123');
        expect(res).toEqual({
            id: 'uuid-1',
            subjectId: 'zitadel-123',  // Legacy field for backwards compat
            zitadelUserId: 'zitadel-123',
            firstName: 'A',
            lastName: 'B',
            displayName: 'C',
            phoneE164: '+1',
            avatarObjectKey: 'k'
        });
    });

    it('getById() returns null when profile missing (by UUID)', async () => {
        (db.query as any).mockResolvedValueOnce({ rowCount: 0, rows: [] } satisfies MockQueryResult<any>);
        const res = await service.getById('uuid-1');
        expect(res).toBeNull();
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id'), ['uuid-1']);
    });

    it('getById() maps row when profile exists (by UUID)', async () => {
        (db.query as any).mockResolvedValueOnce({
            rowCount: 1,
            rows: [{
                id: 'uuid-1',
                zitadel_user_id: 'zitadel-123',
                first_name: 'A',
                last_name: 'B',
                display_name: 'C',
                phone_e164: '+1',
                avatar_object_key: 'k'
            }]
        } satisfies MockQueryResult<any>);
        const res = await service.getById('uuid-1');
        expect(res).toEqual({
            id: 'uuid-1',
            subjectId: 'zitadel-123',  // Legacy field for backwards compat
            zitadelUserId: 'zitadel-123',
            firstName: 'A',
            lastName: 'B',
            displayName: 'C',
            phoneE164: '+1',
            avatarObjectKey: 'k'
        });
    });

    it('upsertBase inserts (idempotent ignore conflicts)', async () => {
        (db.query as any).mockResolvedValueOnce({ rowCount: 1, rows: [] } satisfies MockQueryResult<any>);
        await service.upsertBase('zitadel-123');
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO core.user_profiles'), ['zitadel-123']);
    });

    it('update returns existing when patch empty (uses getById)', async () => {
        // path: empty patch, existing present
        (db.query as any).mockResolvedValueOnce({
            rowCount: 1,
            rows: [{
                id: 'uuid-1',
                zitadel_user_id: 'zitadel-123',
                first_name: null,
                last_name: null,
                display_name: null,
                phone_e164: null,
                avatar_object_key: null
            }]
        } satisfies MockQueryResult<any>);
        const res = await service.update('uuid-1', {});
        expect(res).toEqual({
            id: 'uuid-1',
            subjectId: 'zitadel-123',  // Legacy field for backwards compat
            zitadelUserId: 'zitadel-123',
            firstName: null,
            lastName: null,
            displayName: null,
            phoneE164: null,
            avatarObjectKey: null
        });
    });

    it('update throws not_found when no existing', async () => {
        (db.query as any).mockResolvedValueOnce({ rowCount: 0, rows: [] } satisfies MockQueryResult<any>);
        await expect(service.update('missing-uuid', {})).rejects.toThrow('not_found');
    });

    it('update applies patch with snake_case conversion', async () => {
        // first call (db.query) will be the UPDATE since we supply non-empty patch
        (db.query as any).mockResolvedValueOnce({
            rowCount: 1,
            rows: [{
                id: 'uuid-1',
                zitadel_user_id: 'zitadel-123',
                first_name: 'Jane',
                last_name: 'Doe',
                display_name: 'JD',
                phone_e164: '+1',
                avatar_object_key: 'k'
            }]
        } satisfies MockQueryResult<any>);
        const res = await service.update('uuid-1', { firstName: 'Jane', displayName: 'JD' });
        expect(res.displayName).toBe('JD');
        const sql = (db.query as any).mock.calls[0][0] as string;
        expect(sql).toContain('UPDATE core.user_profiles SET');
        expect(sql).toMatch(/first_name = \$2/);
        expect(sql).toMatch(/display_name = \$3/);
    });

    it('listAlternativeEmails returns mapped rows', async () => {
        (db.query as any).mockResolvedValueOnce({
            rowCount: 2, rows: [
                { email: 'a@example.com', verified: true, created_at: new Date('2024-01-01T00:00:00Z') },
                { email: 'b@example.com', verified: false, created_at: new Date('2024-01-02T00:00:00Z') }
            ]
        } satisfies MockQueryResult<any>);
        const rows = await service.listAlternativeEmails('uuid-1');
        expect(rows).toEqual([
            { email: 'a@example.com', verified: true, createdAt: '2024-01-01T00:00:00.000Z' },
            { email: 'b@example.com', verified: false, createdAt: '2024-01-02T00:00:00.000Z' },
        ]);
    });

    it('addAlternativeEmail trims + lowercases and returns inserted row', async () => {
        // Check for duplicate first (returns no rows = no duplicate)
        (db.query as any).mockResolvedValueOnce({ rowCount: 0, rows: [] } satisfies MockQueryResult<any>);
        // insert returning
        (db.query as any).mockResolvedValueOnce({ rowCount: 1, rows: [{ email: 'new@example.com', verified: false, created_at: new Date('2024-02-01T00:00:00Z') }] } satisfies MockQueryResult<any>);

        const res = await service.addAlternativeEmail('uuid-1', '  NEW@Example.com ');
        expect(res).toEqual({ email: 'new@example.com', verified: false, createdAt: '2024-02-01T00:00:00.000Z' });
        // Check the INSERT query (second call)
        expect((db.query as any).mock.calls[1][0]).toContain('INSERT INTO core.user_emails');
        expect((db.query as any).mock.calls[1][1][1]).toBe('new@example.com');
    });

    it('deleteAlternativeEmail normalizes email', async () => {
        (db.query as any).mockResolvedValueOnce({ rowCount: 1, rows: [] } satisfies MockQueryResult<any>);
        await service.deleteAlternativeEmail('uuid-1', ' Test@Example.COM  ');
        expect((db.query as any).mock.calls[0][1][1]).toBe('test@example.com');
    });

    it('deleteAlternativeEmail normalizes email', async () => {
        (db.query as any).mockResolvedValueOnce({ rowCount: 1, rows: [] } satisfies MockQueryResult<any>);
        const res = await service.deleteAlternativeEmail('s', ' Test@Example.COM ');
        expect(res).toEqual({ status: 'deleted' });
        const args = (db.query as any).mock.calls[0];
        expect(args[0]).toContain('DELETE FROM core.user_emails');
        expect(args[1][1]).toBe('test@example.com');
    });
});
