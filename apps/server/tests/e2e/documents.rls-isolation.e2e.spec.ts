/**
 * E2E Test: Document RLS Multi-Tenant Isolation
 *
 * Tests that Row-Level Security policies on kb.documents correctly enforce
 * project-level isolation, preventing cross-project data leakage.
 *
 * @group e2e
 * @group documents
 * @group rls
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import { DatabaseService } from '../../src/common/database/database.service';

describe('Documents RLS Isolation (E2E)', () => {
  let app: INestApplication;
  let db: DatabaseService;

  // Test data
  let org1Id: string;
  let org2Id: string;
  let project1Id: string;
  let project2Id: string;
  let doc1Id: string;
  let doc2Id: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    db = moduleRef.get(DatabaseService);
  });

  afterAll(async () => {
    // Cleanup: Delete test documents
    if (doc1Id) {
      await db.query('DELETE FROM kb.documents WHERE id = $1', [doc1Id]);
    }
    if (doc2Id) {
      await db.query('DELETE FROM kb.documents WHERE id = $1', [doc2Id]);
    }

    // Cleanup: Delete test projects
    if (project1Id) {
      await db.query('DELETE FROM kb.projects WHERE id = $1', [project1Id]);
    }
    if (project2Id) {
      await db.query('DELETE FROM kb.projects WHERE id = $1', [project2Id]);
    }

    // Cleanup: Delete test orgs
    if (org1Id) {
      await db.query('DELETE FROM kb.organizations WHERE id = $1', [org1Id]);
    }
    if (org2Id) {
      await db.query('DELETE FROM kb.organizations WHERE id = $1', [org2Id]);
    }

    await app.close();
  });

  describe('Row-Level Security Policies', () => {
    it('should create test organizations and projects', async () => {
      // Create Org 1
      const org1Result = await db.query(
        `INSERT INTO kb.organizations (name) VALUES ($1) RETURNING id`,
        ['E2E Test Org 1']
      );
      org1Id = org1Result.rows[0].id;
      expect(org1Id).toBeDefined();

      // Create Org 2
      const org2Result = await db.query(
        `INSERT INTO kb.organizations (name) VALUES ($1) RETURNING id`,
        ['E2E Test Org 2']
      );
      org2Id = org2Result.rows[0].id;
      expect(org2Id).toBeDefined();

      // Create Project 1 (Org 1)
      const project1Result = await db.query(
        `INSERT INTO kb.projects (organization_id, name) VALUES ($1, $2) RETURNING id`,
        [org1Id, 'E2E Test Project 1']
      );
      project1Id = project1Result.rows[0].id;
      expect(project1Id).toBeDefined();

      // Create Project 2 (Org 2)
      const project2Result = await db.query(
        `INSERT INTO kb.projects (organization_id, name) VALUES ($1, $2) RETURNING id`,
        [org2Id, 'E2E Test Project 2']
      );
      project2Id = project2Result.rows[0].id;
      expect(project2Id).toBeDefined();
    });

    it('should create documents in different projects', async () => {
      // Create Document 1 in Project 1
      const doc1Result = await db.runWithTenantContext(project1Id, async () => {
        return await db.query(
          `INSERT INTO kb.documents (project_id, filename, content) 
           VALUES ($1, $2, $3) RETURNING id`,
          [project1Id, 'project1-doc.txt', 'Content for project 1']
        );
      });
      doc1Id = doc1Result.rows[0].id;
      expect(doc1Id).toBeDefined();

      // Create Document 2 in Project 2
      const doc2Result = await db.runWithTenantContext(project2Id, async () => {
        return await db.query(
          `INSERT INTO kb.documents (project_id, filename, content) 
           VALUES ($1, $2, $3) RETURNING id`,
          [project2Id, 'project2-doc.txt', 'Content for project 2']
        );
      });
      doc2Id = doc2Result.rows[0].id;
      expect(doc2Id).toBeDefined();
    });

    it('should only see documents from Project 1 when scoped to Project 1', async () => {
      const result = await db.runWithTenantContext(project1Id, async () => {
        return await db.query('SELECT id, filename FROM kb.documents');
      });

      const docIds = result.rows.map((r) => r.id);

      expect(docIds).toContain(doc1Id);
      expect(docIds).not.toContain(doc2Id);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].filename).toBe('project1-doc.txt');
    });

    it('should only see documents from Project 2 when scoped to Project 2', async () => {
      const result = await db.runWithTenantContext(project2Id, async () => {
        return await db.query('SELECT id, filename FROM kb.documents');
      });

      const docIds = result.rows.map((r) => r.id);

      expect(docIds).toContain(doc2Id);
      expect(docIds).not.toContain(doc1Id);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].filename).toBe('project2-doc.txt');
    });

    it('should see all documents when no tenant context is set (wildcard mode)', async () => {
      // Query without tenant context (system/admin mode)
      const result = await db.query(
        'SELECT id, filename FROM kb.documents WHERE id IN ($1, $2)',
        [doc1Id, doc2Id]
      );

      const docIds = result.rows.map((r) => r.id);

      expect(docIds).toContain(doc1Id);
      expect(docIds).toContain(doc2Id);
      expect(result.rows.length).toBeGreaterThanOrEqual(2);
    });

    it('should not allow accessing Project 2 document when scoped to Project 1', async () => {
      const result = await db.runWithTenantContext(project1Id, async () => {
        return await db.query(
          'SELECT id, filename FROM kb.documents WHERE id = $1',
          [doc2Id]
        );
      });

      expect(result.rows).toHaveLength(0);
    });

    it('should not allow accessing Project 1 document when scoped to Project 2', async () => {
      const result = await db.runWithTenantContext(project2Id, async () => {
        return await db.query(
          'SELECT id, filename FROM kb.documents WHERE id = $1',
          [doc1Id]
        );
      });

      expect(result.rows).toHaveLength(0);
    });

    it('should prevent UPDATE of documents from other projects', async () => {
      // Try to update Project 2's document while scoped to Project 1
      const result = await db.runWithTenantContext(project1Id, async () => {
        return await db.query(
          `UPDATE kb.documents SET filename = $1 WHERE id = $2 RETURNING id`,
          ['hacked-filename.txt', doc2Id]
        );
      });

      expect(result.rows).toHaveLength(0);

      // Verify document was not modified
      const checkResult = await db.runWithTenantContext(
        project2Id,
        async () => {
          return await db.query(
            'SELECT filename FROM kb.documents WHERE id = $1',
            [doc2Id]
          );
        }
      );

      expect(checkResult.rows[0].filename).toBe('project2-doc.txt');
    });

    it('should prevent DELETE of documents from other projects', async () => {
      // Try to delete Project 2's document while scoped to Project 1
      const result = await db.runWithTenantContext(project1Id, async () => {
        return await db.query(
          `DELETE FROM kb.documents WHERE id = $1 RETURNING id`,
          [doc2Id]
        );
      });

      expect(result.rows).toHaveLength(0);

      // Verify document still exists
      const checkResult = await db.runWithTenantContext(
        project2Id,
        async () => {
          return await db.query('SELECT id FROM kb.documents WHERE id = $1', [
            doc2Id,
          ]);
        }
      );

      expect(checkResult.rows).toHaveLength(1);
    });
  });
});
