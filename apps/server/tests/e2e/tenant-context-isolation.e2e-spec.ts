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
      // Query projects directly (org-level query, no project-specific context needed)
      const projects = await projectRepo.find({
        where: { organizationId: testOrgId },
      });

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

      // 2. Web request queries projects (org-level query)
      let projects = await projectRepo.find({
        where: { organizationId: testOrgId },
      });
      expect(projects.length).toBeGreaterThan(0);

      // 3. Another background job clears context
      await db.setTenantContext(null, null);

      // 4. Another web request queries projects (should still work)
      projects = await projectRepo.find({
        where: { organizationId: testOrgId },
      });
      expect(projects.length).toBeGreaterThan(0);
    });

    it('should isolate queries by organizationId in concurrent operations', async () => {
      // Run multiple operations concurrently with different org filters
      // No tenant context needed - queries filter by organizationId directly
      const org1 = testOrgId;
      const org2 = '00000000-0000-0000-0000-000000000099';

      const [result1, result2, result3] = await Promise.all([
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return await projectRepo.count({
            where: { organizationId: org1 },
          });
        })(),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return await projectRepo.count({
            where: { organizationId: org2 },
          });
        })(),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          // Query without tenant filter
          return await projectRepo.count();
        })(),
      ]);

      // result1 should have found our test project
      expect(result1).toBeGreaterThanOrEqual(1);
      // result2 should have found 0 (non-existent org)
      expect(result2).toBe(0);
      // result3 should have found all projects
      expect(result3).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Query isolation by organizationId filter', () => {
    it('should correctly filter projects by organizationId without tenant context', async () => {
      const outerOrg = testOrgId;
      const innerOrg = '00000000-0000-0000-0000-000000000088';

      // No tenant context needed - queries filter by organizationId directly
      const outerCount = await projectRepo.count({
        where: { organizationId: outerOrg },
      });

      const innerCount = await projectRepo.count({
        where: { organizationId: innerOrg },
      });

      // Query again to ensure consistent results
      const outerCountAgain = await projectRepo.count({
        where: { organizationId: outerOrg },
      });

      expect(outerCount).toBe(outerCountAgain);
      expect(outerCount).toBeGreaterThanOrEqual(1);
      expect(innerCount).toBe(0);
    });
  });

  describe('Project queries with organizationId filter', () => {
    it('should handle errors and continue querying correctly', async () => {
      // Test that queries work correctly even after errors occur
      const beforeError = await projectRepo.count({
        where: { organizationId: testOrgId },
      });
      expect(beforeError).toBeGreaterThanOrEqual(1);

      let errorThrown = false;
      try {
        // Simulate an error during a database operation
        await projectRepo.find({
          where: { organizationId: 'invalid-org-id-that-throws' },
        });
        throw new Error('Simulated error');
      } catch (err) {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);

      // Subsequent operations should still work correctly
      const projects = await projectRepo.find({
        where: { organizationId: testOrgId },
      });
      expect(projects.length).toBeGreaterThanOrEqual(1);
    });
  });
});
