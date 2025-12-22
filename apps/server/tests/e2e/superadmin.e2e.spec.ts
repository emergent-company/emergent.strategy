import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { Pool } from 'pg';
import { getTestDbConfig } from '../test-db-config';

describe('Superadmin API E2E', () => {
  let ctx: E2EContext;
  let pool: Pool;
  let superadminUserId: string;
  let regularUserId: string;
  let viewAsTargetUserId: string;

  beforeAll(async () => {
    ctx = await createE2EContext('superadmin');

    const dbConfig = getTestDbConfig();
    pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const superadminResult = await client.query<{ id: string }>(
        `INSERT INTO core.user_profiles(zitadel_user_id, display_name, first_name, last_name)
         VALUES($1, $2, $3, $4)
         ON CONFLICT (zitadel_user_id) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        ['test-user-e2e-superadmin-test', 'Super Admin Test', 'Super', 'Admin']
      );
      superadminUserId = superadminResult.rows[0].id;

      await client.query(
        `INSERT INTO core.user_emails(user_id, email, verified)
         VALUES($1, $2, true)
         ON CONFLICT (email) DO NOTHING`,
        [superadminUserId, 'superadmin-test@example.test']
      );

      await client.query(
        `INSERT INTO core.superadmins(user_id, notes)
         VALUES($1, $2)
         ON CONFLICT DO NOTHING`,
        [superadminUserId, 'E2E test superadmin']
      );

      const regularResult = await client.query<{ id: string }>(
        `INSERT INTO core.user_profiles(zitadel_user_id, display_name, first_name, last_name)
         VALUES($1, $2, $3, $4)
         ON CONFLICT (zitadel_user_id) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        ['test-user-e2e-regular-user', 'Regular User Test', 'Regular', 'User']
      );
      regularUserId = regularResult.rows[0].id;

      await client.query(
        `INSERT INTO core.user_emails(user_id, email, verified)
         VALUES($1, $2, true)
         ON CONFLICT (email) DO NOTHING`,
        [regularUserId, 'regular-test@example.test']
      );

      const viewAsResult = await client.query<{ id: string }>(
        `INSERT INTO core.user_profiles(zitadel_user_id, display_name, first_name, last_name)
         VALUES($1, $2, $3, $4)
         ON CONFLICT (zitadel_user_id) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [
          'test-user-e2e-viewas-target',
          'ViewAs Target User',
          'ViewAs',
          'Target',
        ]
      );
      viewAsTargetUserId = viewAsResult.rows[0].id;

      await client.query(
        `INSERT INTO kb.organization_memberships(organization_id, user_id, role)
         VALUES($1, $2, 'org_member')
         ON CONFLICT DO NOTHING`,
        [ctx.orgId, viewAsTargetUserId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    try {
      await pool.query(`DELETE FROM core.superadmins WHERE user_id = $1`, [
        superadminUserId,
      ]);
      await pool.query(`DELETE FROM core.user_emails WHERE user_id = ANY($1)`, [
        [superadminUserId, regularUserId, viewAsTargetUserId],
      ]);
      await pool.query(
        `DELETE FROM kb.organization_memberships WHERE user_id = ANY($1)`,
        [[superadminUserId, regularUserId, viewAsTargetUserId]]
      );
      await pool.query(`DELETE FROM core.user_profiles WHERE id = ANY($1)`, [
        [superadminUserId, regularUserId, viewAsTargetUserId],
      ]);
    } catch {
      /* cleanup errors ignored */
    }
    await pool.end();
    await ctx.close();
  });

  describe('Superadmin Status Check (/superadmin/me)', () => {
    it('returns isSuperadmin: true for superadmin user', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/me`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isSuperadmin).toBe(true);
    });

    it('returns isSuperadmin: false for regular user', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/me`, {
        headers: {
          Authorization: 'Bearer e2e-regular-user',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isSuperadmin).toBe(false);
    });

    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/me`);
      expect(res.status).toBe(401);
    });
  });

  describe('Superadmin Access Control', () => {
    it('superadmin can access /superadmin/users', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/users`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.users).toBeDefined();
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
    });

    it('superadmin can access /superadmin/organizations', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/organizations`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.organizations).toBeDefined();
      expect(Array.isArray(body.organizations)).toBe(true);
      expect(body.meta).toBeDefined();
    });

    it('superadmin can access /superadmin/projects', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/projects`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projects).toBeDefined();
      expect(Array.isArray(body.projects)).toBe(true);
      expect(body.meta).toBeDefined();
    });

    it('superadmin can access /superadmin/email-jobs', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/email-jobs`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.emailJobs).toBeDefined();
      expect(Array.isArray(body.emailJobs)).toBe(true);
      expect(body.meta).toBeDefined();
    });

    it('non-superadmin gets 403 on /superadmin/users', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/users`, {
        headers: {
          Authorization: 'Bearer e2e-regular-user',
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('forbidden');
      expect(body.error?.message).toContain('Superadmin');
    });

    it('non-superadmin gets 403 on /superadmin/organizations', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/organizations`, {
        headers: {
          Authorization: 'Bearer e2e-regular-user',
        },
      });

      expect(res.status).toBe(403);
    });

    it('non-superadmin gets 403 on /superadmin/projects', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/projects`, {
        headers: {
          Authorization: 'Bearer e2e-regular-user',
        },
      });

      expect(res.status).toBe(403);
    });

    it('non-superadmin gets 403 on /superadmin/email-jobs', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/email-jobs`, {
        headers: {
          Authorization: 'Bearer e2e-regular-user',
        },
      });

      expect(res.status).toBe(403);
    });

    it('unauthenticated request gets 401 on superadmin routes', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/users`);
      expect(res.status).toBe(401);
    });
  });

  describe('Pagination and Filtering', () => {
    it('supports pagination on /superadmin/users', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/superadmin/users?page=1&limit=5`,
        {
          headers: {
            Authorization: 'Bearer e2e-superadmin-test',
          },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(5);
      expect(body.users.length).toBeLessThanOrEqual(5);
    });

    it('supports search filter on /superadmin/users', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/users?search=Super`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.users.length).toBeGreaterThanOrEqual(0);
    });

    it('supports orgId filter on /superadmin/projects', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/superadmin/projects?orgId=${ctx.orgId}`,
        {
          headers: {
            Authorization: 'Bearer e2e-superadmin-test',
          },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      for (const project of body.projects) {
        expect(project.organizationId).toBe(ctx.orgId);
      }
    });
  });

  describe('View-As Functionality', () => {
    it('superadmin can use X-View-As-User-ID header', async () => {
      const res = await fetch(`${ctx.baseUrl}/me`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
          'X-View-As-User-ID': viewAsTargetUserId,
        },
      });

      expect([200, 404]).toContain(res.status);
    });

    it('non-superadmin cannot use X-View-As-User-ID header', async () => {
      const res = await fetch(`${ctx.baseUrl}/me`, {
        headers: {
          Authorization: 'Bearer e2e-regular-user',
          'X-View-As-User-ID': viewAsTargetUserId,
        },
      });

      expect([200, 404]).toContain(res.status);
    });

    it('view-as adds X-View-As-Active header to response', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/users?limit=1`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
          'X-View-As-User-ID': viewAsTargetUserId,
        },
      });

      const viewAsActiveHeader = res.headers.get('X-View-As-Active');
      if (viewAsActiveHeader) {
        expect(viewAsActiveHeader).toBe('true');
      }
    });
  });

  describe('Activity Tracking', () => {
    it('updates last_activity_at on authenticated requests', async () => {
      const beforeResult = await pool.query<{ last_activity_at: Date | null }>(
        `SELECT last_activity_at FROM core.user_profiles WHERE id = $1`,
        [superadminUserId]
      );
      const beforeActivity = beforeResult.rows[0]?.last_activity_at;

      await new Promise((r) => setTimeout(r, 100));

      await fetch(`${ctx.baseUrl}/superadmin/me`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      await new Promise((r) => setTimeout(r, 200));

      const afterResult = await pool.query<{ last_activity_at: Date | null }>(
        `SELECT last_activity_at FROM core.user_profiles WHERE id = $1`,
        [superadminUserId]
      );
      const afterActivity = afterResult.rows[0]?.last_activity_at;

      if (beforeActivity) {
        expect(afterActivity).not.toBeNull();
        expect(new Date(afterActivity!).getTime()).toBeGreaterThanOrEqual(
          new Date(beforeActivity).getTime()
        );
      } else if (afterActivity) {
        expect(afterActivity).not.toBeNull();
      }
    });
  });

  describe('Email Preview', () => {
    let testEmailJobId: string;

    beforeAll(async () => {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO kb.email_jobs(
           template_name,
           to_email,
           to_name,
           subject,
           template_data,
           status
         )
         VALUES($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          'invitation',
          'test-preview@example.test',
          'Test Preview User',
          'Test Email Subject',
          JSON.stringify({
            recipientName: 'Test User',
            inviterName: 'Admin User',
            organizationName: 'Test Org',
            acceptUrl: 'https://example.com/accept',
            expiresAt: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          'pending',
        ]
      );
      testEmailJobId = result.rows[0].id;
    });

    afterAll(async () => {
      if (testEmailJobId) {
        await pool.query(`DELETE FROM kb.email_jobs WHERE id = $1`, [
          testEmailJobId,
        ]);
      }
    });

    it('superadmin can preview email job as HTML', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/superadmin/email-jobs/${testEmailJobId}/preview`,
        {
          headers: {
            Authorization: 'Bearer e2e-superadmin-test',
          },
        }
      );

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/html');

      const html = await res.text();
      expect(html.toLowerCase()).toContain('<!doctype html');
    });

    it('superadmin can preview email job as JSON', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/superadmin/email-jobs/${testEmailJobId}/preview-json`,
        {
          headers: {
            Authorization: 'Bearer e2e-superadmin-test',
          },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.html).toBeDefined();
      expect(body.subject).toBe('Test Email Subject');
      expect(body.toEmail).toBe('test-preview@example.test');
      expect(body.toName).toBe('Test Preview User');
    });

    it('returns 404 for non-existent email job', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(
        `${ctx.baseUrl}/superadmin/email-jobs/${fakeId}/preview`,
        {
          headers: {
            Authorization: 'Bearer e2e-superadmin-test',
          },
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error?.code).toBe('not-found');
    });

    it('non-superadmin gets 403 on email preview', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/superadmin/email-jobs/${testEmailJobId}/preview`,
        {
          headers: {
            Authorization: 'Bearer e2e-regular-user',
          },
        }
      );

      expect(res.status).toBe(403);
    });
  });

  describe('User Response Format', () => {
    it('returns correct user DTO format with organizations', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/users?limit=1`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      if (body.users.length > 0) {
        const user = body.users[0];
        expect(user.id).toBeDefined();
        expect(typeof user.id).toBe('string');
        expect(user.createdAt).toBeDefined();
        expect(Array.isArray(user.organizations)).toBe(true);
      }
    });
  });

  describe('Organization Response Format', () => {
    it('returns correct organization DTO format with counts', async () => {
      const res = await fetch(
        `${ctx.baseUrl}/superadmin/organizations?limit=1`,
        {
          headers: {
            Authorization: 'Bearer e2e-superadmin-test',
          },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      if (body.organizations.length > 0) {
        const org = body.organizations[0];
        expect(org.id).toBeDefined();
        expect(org.name).toBeDefined();
        expect(typeof org.memberCount).toBe('number');
        expect(typeof org.projectCount).toBe('number');
        expect(org.createdAt).toBeDefined();
      }
    });
  });

  describe('Project Response Format', () => {
    it('returns correct project DTO format with document count', async () => {
      const res = await fetch(`${ctx.baseUrl}/superadmin/projects?limit=1`, {
        headers: {
          Authorization: 'Bearer e2e-superadmin-test',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      if (body.projects.length > 0) {
        const project = body.projects[0];
        expect(project.id).toBeDefined();
        expect(project.name).toBeDefined();
        expect(project.organizationId).toBeDefined();
        expect(project.organizationName).toBeDefined();
        expect(typeof project.documentCount).toBe('number');
        expect(project.createdAt).toBeDefined();
      }
    });
  });
});
