import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { AppModule } from '../../src/modules/app.module';
import { DatabaseService } from '../../src/common/database/database.service';
import { Repository, DataSource } from 'typeorm';
import { Project } from '../../src/entities/project.entity';

/**
 * E2E tests for tenant context isolation bug fix.
 *
 * This test reproduces the real-world scenario where:
 * 1. Background jobs clear tenant context (setTenantContext(null, null))
 * 2. Web requests try to query projects for a specific organization
 * 3. Connection pool reuse could cause queries to return 0 results if using session-scoped variables
 *
 * The fix ensures transaction-scoped set_config (true) prevents pollution.
 */

describe('Tenant Context Isolation - Projects API (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let dataSource: DataSource;
  let projectRepo: Repository<Project>;
  let testOrgId: string;
  let testProjectId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    );
    await app.init();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    dataSource = moduleRef.get<DataSource>(DataSource);
    projectRepo = dataSource.getRepository(Project);

    // Create test data
    testOrgId = '00000000-0000-0000-0000-000000000001';
    testProjectId = '00000000-0000-0000-0000-000000000002';

    try {
      // Clean up any existing test data
      await projectRepo.delete({ id: testProjectId });

      // Create a test project
      await projectRepo.save({
        id: testProjectId,
        name: 'Test Project for Isolation',
        organizationId: testOrgId,
        kbPurpose: 'Testing tenant context isolation',
      });
    } catch (err) {
      console.error('Setup error:', err);
    }
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await projectRepo.delete({ id: testProjectId });
    } catch (err) {
      console.error('Cleanup error:', err);
    }
    await app.close();
  });

  describe('Project queries with tenant context switching', () => {
    it('should retrieve projects after background job clears context', async () => {
      // Step 1: Simulate background job clearing tenant context
      // This happens in production with extraction jobs
      await db.setTenantContext(null, null);

      // Step 2: Simulate a web request querying projects for an organization
      // This should work correctly despite the previous context clearing
      const projects = await db.runWithTenantContext(
        testOrgId,
        null,
        async () => {
          return await projectRepo.find({
            where: { organizationId: testOrgId },
          });
        }
      );

      // Should find our test project
      expect(projects.length).toBeGreaterThan(0);
      const testProject = projects.find((p) => p.id === testProjectId);
      expect(testProject).toBeDefined();
      expect(testProject?.name).toBe('Test Project for Isolation');
    });

    it('should handle multiple sequential context switches', async () => {
      // Simulate the real production scenario:
      // Background job -> Web request -> Background job -> Web request

      // 1. Background job clears context
      await db.setTenantContext(null, null);

      // 2. Web request queries projects
      let projects = await db.runWithTenantContext(
        testOrgId,
        null,
        async () => {
          return await projectRepo.find({
            where: { organizationId: testOrgId },
          });
        }
      );
      expect(projects.length).toBeGreaterThan(0);

      // 3. Another background job clears context
      await db.setTenantContext(null, null);

      // 4. Another web request queries projects (should still work)
      projects = await db.runWithTenantContext(testOrgId, null, async () => {
        return await projectRepo.find({
          where: { organizationId: testOrgId },
        });
      });
      expect(projects.length).toBeGreaterThan(0);
    });

    it('should isolate tenant context in concurrent operations', async () => {
      // Run multiple operations concurrently with different tenant contexts
      const org1 = testOrgId;
      const org2 = '00000000-0000-0000-0000-000000000099';

      const [result1, result2, result3] = await Promise.all([
        db.runWithTenantContext(org1, null, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return await projectRepo.count({
            where: { organizationId: org1 },
          });
        }),
        db.runWithTenantContext(org2, null, async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return await projectRepo.count({
            where: { organizationId: org2 },
          });
        }),
        db.runWithTenantContext(null, null, async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          // Query without tenant filter
          return await projectRepo.count();
        }),
      ]);

      // result1 should have found our test project
      expect(result1).toBeGreaterThanOrEqual(1);
      // result2 should have found 0 (non-existent org)
      expect(result2).toBe(0);
      // result3 should have found all projects
      expect(result3).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Nested tenant context operations', () => {
    it('should maintain correct context in nested runWithTenantContext calls', async () => {
      const outerOrg = testOrgId;
      const innerOrg = '00000000-0000-0000-0000-000000000088';

      const result = await db.runWithTenantContext(outerOrg, null, async () => {
        const outerCount = await projectRepo.count({
          where: { organizationId: outerOrg },
        });

        const innerCount = await db.runWithTenantContext(
          innerOrg,
          null,
          async () => {
            return await projectRepo.count({
              where: { organizationId: innerOrg },
            });
          }
        );

        // After inner context, should be back to outer context
        const outerCountAgain = await projectRepo.count({
          where: { organizationId: outerOrg },
        });

        return { outerCount, innerCount, outerCountAgain };
      });

      expect(result.outerCount).toBe(result.outerCountAgain);
      expect(result.outerCount).toBeGreaterThanOrEqual(1);
      expect(result.innerCount).toBe(0);
    });
  });

  describe('Error handling with tenant context', () => {
    it('should restore parent context after error in nested operation', async () => {
      let errorThrown = false;

      try {
        await db.runWithTenantContext(testOrgId, null, async () => {
          const beforeError = await projectRepo.count({
            where: { organizationId: testOrgId },
          });
          expect(beforeError).toBeGreaterThanOrEqual(1);

          // Nested operation that throws
          await db.runWithTenantContext(testOrgId, null, async () => {
            throw new Error('Simulated error');
          });
        });
      } catch (err) {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);

      // Context should be cleared/restored correctly
      // Test that subsequent operations still work
      const projects = await db.runWithTenantContext(
        testOrgId,
        null,
        async () => {
          return await projectRepo.find({
            where: { organizationId: testOrgId },
          });
        }
      );
      expect(projects.length).toBeGreaterThanOrEqual(1);
    });
  });
});
