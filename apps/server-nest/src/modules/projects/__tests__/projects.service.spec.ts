import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsService } from '../projects.service';
import { DatabaseService } from '../../../common/database/database.service';
import { TemplatePackService } from '../../template-packs/template-pack.service';
import { AppConfigService } from '../../../common/config/config.service';

interface MockQueryResult<T = unknown> {
    rows: T[];
    rowCount: number;
}

function createMockClient(projectId: string, projectName: string, orgId: string, includeUser = true) {
    const projectRow = { id: projectId, name: projectName, organization_id: orgId };
    const query = vi.fn(async (sql: string): Promise<MockQueryResult> => {
        const trimmed = sql.trim().toUpperCase();

        if (trimmed.startsWith('BEGIN')) {
            return { rows: [], rowCount: 0 };
        }

        if (trimmed.startsWith('SELECT ID FROM KB.ORGS')) {
            return { rows: [{ id: orgId }], rowCount: 1 };
        }

        if (trimmed.startsWith('INSERT INTO KB.PROJECTS')) {
            return { rows: [projectRow], rowCount: 1 };
        }

        if (includeUser && trimmed.startsWith('INSERT INTO CORE.USER_PROFILES')) {
            return { rows: [], rowCount: 1 };
        }

        if (includeUser && trimmed.startsWith('INSERT INTO KB.PROJECT_MEMBERSHIPS')) {
            return { rows: [], rowCount: 1 };
        }

        if (trimmed.startsWith('COMMIT')) {
            return { rows: [], rowCount: 0 };
        }

        if (trimmed.startsWith('ROLLBACK')) {
            return { rows: [], rowCount: 0 };
        }

        throw new Error(`Unexpected query in ProjectsService test: ${sql}`);
    });

    return {
        query,
        release: vi.fn(),
    };
}

function createServiceDependencies(options: {
    defaultPackId: string | null;
    projectId: string;
    projectName: string;
    orgId: string;
    userId?: string;
    templatePackImpl?: (projectId: string, orgId: string) => Promise<void>;
}) {
    const client = createMockClient(options.projectId, options.projectName, options.orgId, !!options.userId);

    const getClient = vi.fn().mockResolvedValue(client);
    const db = {
        getClient,
        query: vi.fn(),
    } as unknown as DatabaseService;

    const assignTemplatePackToProject = vi.fn(async () => ({
        success: true,
        assignment_id: 'assignment-id',
        installed_types: [],
        disabled_types: [],
    }));

    if (options.templatePackImpl) {
        assignTemplatePackToProject.mockImplementation(async () => {
            await options.templatePackImpl!(options.projectId, options.orgId);
            return {
                success: true,
                assignment_id: 'assignment-id',
                installed_types: [],
                disabled_types: [],
            };
        });
    }

    const templatePacks = {
        assignTemplatePackToProject,
    } as unknown as TemplatePackService;

    const config = {
        extractionDefaultTemplatePackId: options.defaultPackId,
    } as unknown as AppConfigService;

    const service = new ProjectsService(db, templatePacks, config);

    return {
        service,
        db,
        client,
        assignTemplatePackToProject,
    };
}

describe('ProjectsService', () => {
    const projectId = '11111111-1111-1111-1111-111111111111';
    const projectName = 'Auto Pack Project';
    const orgId = '22222222-2222-2222-2222-222222222222';
    const userId = '33333333-3333-3333-3333-333333333333';
    const defaultPackId = '44444444-4444-4444-4444-444444444444';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('assigns the default template pack after project creation', async () => {
        const { service, assignTemplatePackToProject } = createServiceDependencies({
            defaultPackId,
            projectId,
            projectName,
            orgId,
            userId,
        });

        const result = await service.create(projectName, orgId, userId);

        expect(result).toEqual({ id: projectId, name: projectName, orgId });
        expect(assignTemplatePackToProject).toHaveBeenCalledWith(
            projectId,
            orgId,
            orgId,
            userId,
            { template_pack_id: defaultPackId }
        );
    });

    it('swallows assignment conflicts so project creation still succeeds', async () => {
        const { service, assignTemplatePackToProject } = createServiceDependencies({
            defaultPackId,
            projectId,
            projectName,
            orgId,
            userId,
            templatePackImpl: async () => {
                throw new ConflictException('already installed');
            },
        });

        const result = await service.create(projectName, orgId, userId);

        expect(result.id).toBe(projectId);
        expect(assignTemplatePackToProject).toHaveBeenCalledTimes(1);
    });

    it('skips assignment when no default template pack is configured', async () => {
        const { service, assignTemplatePackToProject } = createServiceDependencies({
            defaultPackId: null,
            projectId,
            projectName,
            orgId,
            userId,
        });

        await service.create(projectName, orgId, userId);

        expect(assignTemplatePackToProject).not.toHaveBeenCalled();
    });
});
