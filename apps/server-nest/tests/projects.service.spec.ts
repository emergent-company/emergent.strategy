import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { DatabaseService } from '../src/common/database/database.service';

// Helper to create mock repositories
function createMockRepository(methods: Partial<any> = {}) {
    return {
        findOne: vi.fn(),
        find: vi.fn(),
        save: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        ...methods
    };
}

// Mock DataSource with query runner support
class FakeDataSource {
    public calls: { text: string; params?: any[] }[] = [];
    constructor(private handlers: Array<{ match: RegExp | string; respond: (text: string, params?: any[]) => any }>) { }

    async query(text: string, params?: any[]) {
        this.calls.push({ text, params });
        const h = this.handlers.find(h => typeof h.match === 'string' ? text.includes(h.match) : h.match.test(text));
        if (!h) return [];
        return h.respond(text, params);
    }

    createQueryRunner() {
        const queryRunner = {
            connect: vi.fn().mockResolvedValue(undefined),
            startTransaction: vi.fn().mockResolvedValue(undefined),
            commitTransaction: vi.fn().mockResolvedValue(undefined),
            rollbackTransaction: vi.fn().mockResolvedValue(undefined),
            release: vi.fn().mockResolvedValue(undefined),
            manager: {
                save: vi.fn(),
                query: vi.fn()
            }
        };
        return queryRunner;
    }
}

// Mock DatabaseService
class FakeDb extends DatabaseService {
    constructor() {
        super({} as any);
    }
    isOnline() { return true; }

    async runWithTenantContext<T>(
        tenantId: string | null,
        projectId: string | null,
        callback: () => Promise<T>
    ): Promise<T> {
        return callback();
    }
}

function uuid(n: number) { return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`; }

describe('ProjectsService', () => {
    const noopTemplatePacks = () => ({
        assignTemplatePackToProject: vi.fn().mockResolvedValue(undefined),
    });
    const configWithDefault = (defaultId?: string | null) => ({
        extractionDefaultTemplatePackId: defaultId ?? undefined,
    });

    it('list returns empty for invalid orgId shape', async () => {
        const projectRepo = createMockRepository();
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();
        const dataSource = new FakeDataSource([]);
        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo as any,
            membershipRepo as any,
            orgRepo as any,
            dataSource as any,
            db as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        const res = await svc.list(10, 'not-a-uuid');
        expect(res).toEqual([]);
    });

    it('list returns rows mapped when no orgId', async () => {
        const projects = [
            { id: uuid(1), name: 'P1', organizationId: uuid(9), kbPurpose: null, createdAt: new Date() }
        ];
        const projectRepo = createMockRepository({
            find: vi.fn().mockResolvedValue(projects)
        });
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();
        const dataSource = new FakeDataSource([]);
        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo as any,
            membershipRepo as any,
            orgRepo as any,
            dataSource as any,
            db as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        const res = await svc.list(5);
        expect(res).toEqual([{ id: uuid(1), name: 'P1', orgId: uuid(9), kb_purpose: undefined }]);
    });

    it('create rejects blank name', async () => {
        const projectRepo = createMockRepository();
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();
        const dataSource = new FakeDataSource([]);
        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo as any,
            membershipRepo as any,
            orgRepo as any,
            dataSource as any,
            db as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('  ')).rejects.toMatchObject({ response: { error: { code: 'validation-failed' } } });
    });

    it('create rejects missing orgId', async () => {
        const projectRepo = createMockRepository();
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();
        const dataSource = new FakeDataSource([]);
        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo as any,
            membershipRepo as any,
            orgRepo as any,
            dataSource as any,
            db as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('Proj')).rejects.toMatchObject({ response: { error: { code: 'org-required' } } });
    });

    it('create rejects org not found', async () => {
        const queryRunner = {
            connect: vi.fn().mockResolvedValue(undefined),
            startTransaction: vi.fn().mockResolvedValue(undefined),
            commitTransaction: vi.fn().mockResolvedValue(undefined),
            rollbackTransaction: vi.fn().mockResolvedValue(undefined),
            release: vi.fn().mockResolvedValue(undefined),
            manager: {
                findOne: vi.fn().mockResolvedValue(null), // Org not found
                save: vi.fn()
            }
        };
        const projectRepo = createMockRepository();
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();
        const dataSource = new FakeDataSource([]);
        (dataSource as any).createQueryRunner = vi.fn().mockReturnValue(queryRunner);
        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo as any,
            membershipRepo as any,
            orgRepo as any,
            dataSource as any,
            db as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('Proj', uuid(1))).rejects.toMatchObject({ response: { error: { code: 'org-not-found' } } });
    });

    it('create success without userId', async () => {
        const projectRepo = createMockRepository({
            create: vi.fn().mockReturnValue({ id: uuid(2), name: 'Proj', organizationId: uuid(1) })
        });
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();

        const queryRunner = {
            connect: vi.fn(),
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
            manager: {
                findOne: vi.fn().mockResolvedValue({ id: uuid(1) }), // Org found
                save: vi.fn().mockResolvedValue({ id: uuid(2), name: 'Proj', organizationId: uuid(1), createdAt: new Date() })
            }
        };
        const dataSource = new FakeDataSource([]);
        (dataSource as any).createQueryRunner = vi.fn().mockReturnValue(queryRunner);

        const db = new FakeDb();
        const templatePacks = noopTemplatePacks();
        const svc = new ProjectsService(
            projectRepo, membershipRepo, orgRepo,
            dataSource, db,
            templatePacks, configWithDefault()
        );

        const res = await svc.create('Proj', uuid(1));
        expect(res).toEqual({ id: uuid(2), name: 'Proj', orgId: uuid(1) });
        // Ensure membership not inserted - only 1 save call for project
        expect(queryRunner.manager.save).toHaveBeenCalledTimes(1);
        expect(templatePacks.assignTemplatePackToProject).not.toHaveBeenCalled();
    });

    it('create success with userId inserts membership with profile upsert', async () => {
        const projectRepo = createMockRepository({
            create: vi.fn().mockReturnValue({ id: uuid(3), name: 'Proj2', organizationId: uuid(1) })
        });
        const membershipRepo = createMockRepository({
            create: vi.fn().mockReturnValue({ id: uuid(10), projectId: uuid(3), userId: 'user-123' })
        });
        const orgRepo = createMockRepository();

        const queryRunner = {
            connect: vi.fn(),
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
            manager: {
                findOne: vi.fn().mockResolvedValue({ id: uuid(1) }), // Org found
                save: vi.fn()
                    .mockResolvedValueOnce({ id: uuid(3), name: 'Proj2', organizationId: uuid(1), createdAt: new Date() }) // Project
                    .mockResolvedValueOnce({ id: uuid(10), projectId: uuid(3), userId: 'user-123' }) // Membership
            }
        };
        const dataSource = new FakeDataSource([]);
        (dataSource as any).createQueryRunner = vi.fn().mockReturnValue(queryRunner);

        const db = new FakeDb();
        const templatePacks = noopTemplatePacks();
        const svc = new ProjectsService(
            projectRepo, membershipRepo, orgRepo,
            dataSource, db,
            templatePacks, configWithDefault()
        );

        const res = await svc.create('Proj2', uuid(1), 'user-123');
        expect(res).toEqual({ id: uuid(3), name: 'Proj2', orgId: uuid(1) });
        // User profile creation was removed - now handled separately by auth flow
        // Verify both project and membership saved
        expect(queryRunner.manager.save).toHaveBeenCalledTimes(2);
        expect(templatePacks.assignTemplatePackToProject).not.toHaveBeenCalled();
    });

    it('create translates FK race deletion into org-not-found', async () => {
        const projectRepo = createMockRepository({
            create: vi.fn().mockReturnValue({ id: uuid(3), name: 'Proj3', organizationId: uuid(1) })
        });
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();

        const queryRunner = {
            connect: vi.fn(),
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
            manager: {
                findOne: vi.fn().mockResolvedValue({ id: uuid(1) }), // Org found initially
                save: vi.fn().mockRejectedValue(
                    new Error('insert or update on table "kb.projects" violates foreign key constraint "projects_organization_id_fkey"')
                )
            }
        };
        const dataSource = new FakeDataSource([]);
        (dataSource as any).createQueryRunner = vi.fn().mockReturnValue(queryRunner);

        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo, membershipRepo, orgRepo,
            dataSource, db,
            noopTemplatePacks(), configWithDefault()
        );

        await expect(svc.create('Proj3', uuid(1))).rejects.toMatchObject({
            response: { error: { code: 'org-not-found' } }
        });
    });

    it('create translates duplicate name into duplicate code', async () => {
        const projectRepo = createMockRepository({
            create: vi.fn().mockReturnValue({ id: uuid(4), name: 'Proj4', organizationId: uuid(1) })
        });
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();

        const queryRunner = {
            connect: vi.fn(),
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
            manager: {
                findOne: vi.fn().mockResolvedValue({ id: uuid(1) }), // Org found
                save: vi.fn().mockRejectedValue(
                    new Error('duplicate key value violates unique constraint')
                )
            }
        };
        const dataSource = new FakeDataSource([]);
        (dataSource as any).createQueryRunner = vi.fn().mockReturnValue(queryRunner);

        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo, membershipRepo, orgRepo,
            dataSource, db,
            noopTemplatePacks(), configWithDefault()
        );

        await expect(svc.create('Proj4', uuid(1))).rejects.toMatchObject({
            response: { error: { code: 'duplicate' } }
        });
    });

    it('delete returns false for invalid id shape', async () => {
        const projectRepo = createMockRepository();
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();
        const dataSource = new FakeDataSource([]);
        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo, membershipRepo, orgRepo,
            dataSource, db,
            noopTemplatePacks(), configWithDefault()
        );

        const res = await svc.delete('not-a-uuid');
        expect(res).toBe(false);
    });

    it('delete returns true when rowCount > 0', async () => {
        const projectRepo = createMockRepository({
            delete: vi.fn().mockResolvedValue({ affected: 1 })
        });
        const membershipRepo = createMockRepository();
        const orgRepo = createMockRepository();
        const dataSource = new FakeDataSource([]);
        const db = new FakeDb();
        const svc = new ProjectsService(
            projectRepo, membershipRepo, orgRepo,
            dataSource, db,
            noopTemplatePacks(), configWithDefault()
        );

        const res = await svc.delete(uuid(9));
        expect(res).toBe(true);
    });

    it('create installs default template pack when configured', async () => {
        const projectRepo = createMockRepository({
            create: vi.fn().mockReturnValue({ id: uuid(6), name: 'Proj-default', organizationId: uuid(5) })
        });
        const membershipRepo = createMockRepository({
            create: vi.fn().mockReturnValue({ id: uuid(11), projectId: uuid(6), userId: 'user-xyz' })
        });
        const orgRepo = createMockRepository();

        const queryRunner = {
            connect: vi.fn(),
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
            manager: {
                findOne: vi.fn().mockResolvedValue({ id: uuid(5) }), // Org found
                save: vi.fn()
                    .mockResolvedValueOnce({ id: uuid(6), name: 'Proj-default', organizationId: uuid(5), createdAt: new Date() }) // Project
                    .mockResolvedValueOnce({ id: uuid(11), projectId: uuid(6), userId: 'user-xyz' }) // Membership
            }
        };
        const dataSource = new FakeDataSource([]);
        (dataSource as any).createQueryRunner = vi.fn().mockReturnValue(queryRunner);

        const db = new FakeDb();
        const templatePacks = {
            assignTemplatePackToProject: vi.fn().mockResolvedValue(undefined),
        };
        const svc = new ProjectsService(
            projectRepo, membershipRepo, orgRepo,
            dataSource, db,
            templatePacks as any,
            configWithDefault(uuid(42))
        );

        const result = await svc.create('Proj-default', uuid(5), 'user-xyz');
        expect(result).toEqual({ id: uuid(6), name: 'Proj-default', orgId: uuid(5) });
        expect(templatePacks.assignTemplatePackToProject).toHaveBeenCalledWith(
            uuid(6),
            uuid(5),
            uuid(5),
            'user-xyz',
            { template_pack_id: uuid(42) },
        );
    });
});
