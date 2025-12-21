import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from '../utils/test-app';
// Must import the same compiled class used by AppModule providers (dist path) so Nest can resolve it.
// Use source path; tests run after build but Nest container has provider tokens from source module metadata.
// We avoid resolving Nest's DatabaseService directly (class identity mismatch between src & dist under Vitest).
// Instead we create a dedicated pg Pool for fixture setup & cleanup after the app bootstraps.
import { Pool } from 'pg';
import crypto from 'node:crypto';
import { getTestDbConfig } from '../test-db-config';

export interface E2EContext {
  app: INestApplication;
  baseUrl: string;
  orgId: string;
  projectId: string;
  userSub: string;
  cleanup: () => Promise<void>;
  close: () => Promise<void>;
  /**
   * Cleanup chat + document artifacts for an additional project id created during a test.
   * Does NOT remove the project/org rows themselves (idempotent best‑effort).
   */
  cleanupProjectArtifacts: (projectId: string) => Promise<void>;
  /**
   * Delete an externally created org (and cascading projects) not the primary context org.
   * By default refuses to delete the primary org unless allowPrimary=true.
   */
  cleanupExternalOrg: (
    orgId: string,
    options?: { allowPrimary?: boolean }
  ) => Promise<void>;
  /**
   * Delete an externally created project (will cascade child rows). Will not delete primary context project unless allowPrimary=true.
   */
  cleanupExternalProject: (
    projectId: string,
    options?: { allowPrimary?: boolean }
  ) => Promise<void>;
}

function mapUserSubToUuid(sub: string): string {
  // Mirrors ChatService.mapUserId logic for non-uuid subs (sha1 -> uuid v5 style)
  const hash = crypto.createHash('sha1').update(sub).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 style nibble
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(
    12,
    16
  )}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

// Concurrency‑safe creation of shared base org/project used by many specs.
// Multiple workers may attempt to bootstrap simultaneously; we avoid race windows by
// using INSERT .. ON CONFLICT DO NOTHING and falling back to a SELECT when the row
// already exists. This prevents duplicate key violations crashing context startup.
async function ensureBaseFixtures(
  pool: Pool
): Promise<{ orgId: string; projectId: string }> {
  let orgId: string | undefined;
  {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO kb.orgs(name) VALUES($1)
             ON CONFLICT (name) DO NOTHING
             RETURNING id`,
      ['E2E Org']
    );
    if (ins.rowCount) {
      orgId = ins.rows[0].id;
    } else {
      const sel = await pool.query<{ id: string }>(
        `SELECT id FROM kb.orgs WHERE name = $1 LIMIT 1`,
        ['E2E Org']
      );
      if (!sel.rowCount)
        throw new Error('Failed to locate or create base E2E Org');
      orgId = sel.rows[0].id;
    }
  }

  let projectId: string | undefined;
  {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO kb.projects(organization_id, name) VALUES($1,$2)
             ON CONFLICT DO NOTHING
             RETURNING id`,
      [orgId, 'E2E Project']
    );
    if (ins.rowCount) {
      projectId = ins.rows[0].id;
    } else {
      const sel = await pool.query<{ id: string }>(
        `SELECT id FROM kb.projects WHERE organization_id = $1 AND name = $2 LIMIT 1`,
        [orgId, 'E2E Project']
      );
      if (!sel.rowCount)
        throw new Error('Failed to locate or create base E2E Project');
      projectId = sel.rows[0].id;
    }
  }

  return { orgId, projectId };
}

async function cleanupUserData(pool: Pool, projectId: string, userSub: string) {
  const tableCheck = async (name: string) => {
    const r = await pool.query(`SELECT to_regclass($1) as exists`, [name]);
    return !!r.rows[0].exists;
  };

  // Map token to external Zitadel user ID (matches AuthService logic)
  const zitadelUserId = userSub.startsWith('test-user-')
    ? userSub
    : `test-user-${userSub}`;

  // Get internal UUID for the user
  const userResult = await pool
    .query<{ id: string }>(
      `SELECT id FROM core.user_profiles WHERE zitadel_user_id = $1`,
      [zitadelUserId]
    )
    .catch(() => ({ rows: [] }));

  if (userResult.rows.length === 0) {
    // User doesn't exist, nothing to clean
    return;
  }

  const userUuid = userResult.rows[0].id;

  if (await tableCheck('kb.chat_messages')) {
    await pool.query(
      `DELETE FROM kb.chat_messages WHERE conversation_id IN (SELECT id FROM kb.chat_conversations WHERE owner_user_id = $1)`,
      [userUuid]
    );
  }
  if (await tableCheck('kb.chat_conversations')) {
    await pool.query(
      `DELETE FROM kb.chat_conversations WHERE owner_user_id = $1`,
      [userUuid]
    );
  }
  if (await tableCheck('kb.chunks')) {
    await pool.query(
      `DELETE FROM kb.chunks WHERE document_id IN (SELECT id FROM kb.documents WHERE project_id = $1)`,
      [projectId]
    );
  }
  if (await tableCheck('kb.documents')) {
    await pool.query(`DELETE FROM kb.documents WHERE project_id = $1`, [
      projectId,
    ]);
  }
  if (await tableCheck('kb.external_sources')) {
    await pool.query(`DELETE FROM kb.external_sources WHERE project_id = $1`, [
      projectId,
    ]);
  }
  if (await tableCheck('kb.settings')) {
    await pool.query(`DELETE FROM kb.settings WHERE key LIKE 'e2e-%'`);
  }
  // Phase 1 table cleanup (template packs, type registry, extraction jobs)
  if (await tableCheck('kb.object_extraction_jobs')) {
    await pool.query(
      `DELETE FROM kb.object_extraction_jobs WHERE project_id = $1`,
      [projectId]
    );
  }
  if (await tableCheck('kb.project_object_type_registry')) {
    await pool.query(
      `DELETE FROM kb.project_object_type_registry WHERE project_id = $1`,
      [projectId]
    );
  }
  if (await tableCheck('kb.project_template_packs')) {
    await pool.query(
      `DELETE FROM kb.project_template_packs WHERE project_id = $1`,
      [projectId]
    );
  }
  if (await tableCheck('kb.graph_embedding_jobs')) {
    // graph_embedding_jobs doesn't have project_id, it has object_id
    // Delete jobs for objects in this project
    await pool.query(
      `
            DELETE FROM kb.graph_embedding_jobs 
            WHERE object_id IN (
                SELECT id FROM kb.graph_objects WHERE project_id = $1
            )
        `,
      [projectId]
    );
  }
  if (await tableCheck('kb.graph_relationships')) {
    await pool.query(
      `DELETE FROM kb.graph_relationships WHERE project_id = $1`,
      [projectId]
    );
  }
  if (await tableCheck('kb.graph_objects')) {
    await pool.query(`DELETE FROM kb.graph_objects WHERE project_id = $1`, [
      projectId,
    ]);
  }
  if (await tableCheck('kb.graph_embedding_coverage')) {
    await pool.query(
      `DELETE FROM kb.graph_embedding_coverage WHERE project_id = $1`,
      [projectId]
    );
  }
  // Template packs don't have project_id, but we can delete test packs by name pattern
  if (await tableCheck('kb.graph_template_packs')) {
    const packs = await pool.query<{ id: string }>(
      `SELECT id FROM kb.graph_template_packs WHERE name LIKE 'E2E%' OR name LIKE 'Test%' OR name LIKE '%Test%' OR name LIKE 'TOGAF%'`
    );
    if (packs.rowCount) {
      const ids = packs.rows.map((row) => row.id);
      if (await tableCheck('kb.project_template_packs')) {
        await pool.query(
          `DELETE FROM kb.project_template_packs WHERE template_pack_id = ANY($1::uuid[])`,
          [ids]
        );
      }
      await pool.query(
        `DELETE FROM kb.graph_template_packs WHERE id = ANY($1::uuid[])`,
        [ids]
      );
    }
  }
}

async function waitForConnectivity(
  pool: Pool,
  attempts = 20,
  delayMs = 200
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function waitForRelation(
  pool: Pool,
  rel: string,
  attempts = 30,
  delayMs = 100
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const res = await pool.query<{ exists: string | null }>(
      'SELECT to_regclass($1) as exists',
      [rel]
    );
    if (res.rows[0]?.exists) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

export async function createE2EContext(
  userSuffix?: string
): Promise<E2EContext> {
  // Ensure required env for DatabaseService before NestFactory create
  // Explicitly disable SKIP_DB for scenario/e2e contexts; tests rely on minimal schema being created.
  if (process.env.SKIP_DB) delete process.env.SKIP_DB;
  // Enable static test tokens mode explicitly (Option 3) so fixtures like e2e-* are accepted
  // No fallbacks here - test-env.ts should have set defaults already
  process.env.AUTH_TEST_STATIC_TOKENS =
    process.env.AUTH_TEST_STATIC_TOKENS || '1';
  process.env.SCOPES_DISABLED = '0';

  // Use unified test database configuration
  const dbConfig = getTestDbConfig();

  // No fallback - test-env.ts should set DB_AUTOINIT=true by default
  // Set NODE_ENV to 'test' for consistent test behavior
  process.env.NODE_ENV = 'test';
  const boot = await bootstrapTestApp();
  // Create dedicated pool for direct SQL (schema already ensured by app bootstrap)
  const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
  });
  const online = await waitForConnectivity(pool);
  if (!online) throw new Error('Database connectivity failed for E2E tests');
  // Wait until minimal schema bootstrap (another worker may still be holding advisory lock rebuilding schema)
  for (const rel of [
    'core.user_profiles',
    'core.user_emails',
    'kb.orgs',
    'kb.projects',
    'kb.organization_memberships',
    'kb.project_memberships',
    'kb.documents',
    'kb.chunks',
    'kb.chat_conversations',
    'kb.chat_messages',
    'kb.embedding_policies',
  ]) {
    const ready = await waitForRelation(pool, rel);
    if (!ready) throw new Error(`Timed out waiting for ${rel} to be created`);
  }

  // NOTE: With ephemeral E2E database (npm run test:e2e), cleanup is automatic
  // Database container is destroyed and recreated between test runs
  // Keeping minimal cleanup for cases where tests are run directly against persistent DB

  // Default to isolation ON unless explicitly disabled. This reduces cross‑spec state leakage.
  const isolate = process.env.E2E_ISOLATE_ORGS !== '0';
  let createdIsolatedOrg = false;
  let createdIsolatedProject = false;
  let orgId: string;
  let projectId: string;
  if (isolate) {
    // Fully isolated org + project per context. Enables future migration away from shared base fixture.
    // Keeps naming deterministic for debugging while guaranteeing uniqueness.
    const orgName = `Isolated Org ${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;
    const orgIns = await pool.query<{ id: string }>(
      `INSERT INTO kb.orgs(name) VALUES($1) RETURNING id`,
      [orgName]
    );
    orgId = orgIns.rows[0].id;
    createdIsolatedOrg = true;
    const projName = `Isolated Project ${
      userSuffix || 'base'
    } ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const projIns = await pool.query<{ id: string }>(
      `INSERT INTO kb.projects(organization_id, name) VALUES($1,$2) RETURNING id`,
      [orgId, projName]
    );
    projectId = projIns.rows[0].id;
    createdIsolatedProject = true;
  } else {
    // Historical shared base org/project (more performant; stable cross-spec assumptions)
    ({ orgId, projectId } = await ensureBaseFixtures(pool));
    // Optionally create per-suffix isolated project inside shared org (legacy behavior)
    if (userSuffix) {
      const uniqueName = `E2E Project ${userSuffix} ${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      let attempts = 5;
      while (attempts--) {
        try {
          const projIns = await pool.query<{ id: string }>(
            `INSERT INTO kb.projects(organization_id, name) VALUES($1,$2) RETURNING id`,
            [orgId, uniqueName]
          );
          projectId = projIns.rows[0].id;
          break;
        } catch (e: any) {
          if (e.code === '40P01' && attempts > 0) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          throw e;
        }
      }
    }
  }
  // Derive per-context synthetic user sub to avoid cross-test interference when specs run in parallel.
  // Default remains the historical fixed UUID-like suffix for backward compatibility.
  const tokenSeed = userSuffix ? `e2e-${userSuffix}` : 'e2e-all';
  const contextUserLabel = userSuffix ?? 'all';
  // Map token to external Zitadel user ID (matches AuthService logic)
  const zitadelUserId = `test-user-${tokenSeed}`;
  const legacyWithScopeZitadelId = 'test-user-with-scope';

  // Ensure deterministic test user has a profile + memberships so org/project listings respect RLS policies.
  const client = await pool.connect();
  let userUuid: string;
  try {
    await client.query('BEGIN');
    const displayName = userSuffix ? `E2E User ${userSuffix}` : 'E2E User';
    const emailLocal = tokenSeed
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const email = `${emailLocal || 'e2e-user'}@example.test`;

    // Insert/update user profile using zitadel_user_id (external ID)
    const profileResult = await client.query<{ id: string }>(
      `INSERT INTO core.user_profiles(zitadel_user_id, display_name)
             VALUES($1,$2)
             ON CONFLICT (zitadel_user_id) DO UPDATE SET display_name = EXCLUDED.display_name
             RETURNING id`,
      [zitadelUserId, displayName]
    );
    userUuid = profileResult.rows[0].id;

    // Insert user email - use ON CONFLICT DO NOTHING to handle duplicates gracefully
    await client.query(
      `INSERT INTO core.user_emails(user_id, email, verified)
             VALUES($1,$2,true)
             ON CONFLICT (email) DO NOTHING`,
      [userUuid, email]
    );

    // Insert organization membership using internal UUID
    await client.query(
      `INSERT INTO kb.organization_memberships(organization_id, user_id, role)
             VALUES($1,$2,'org_admin')`,
      [orgId, userUuid]
    );

    // Insert project membership using internal UUID
    await client.query(
      `INSERT INTO kb.project_memberships(project_id, user_id, role)
             VALUES($1,$2,'project_admin')`,
      [projectId, userUuid]
    );
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }

  // Ensure legacy static token users (e.g. "with-scope") do not retain elevated memberships from prior runs.
  // Scope denial specs rely on that subject having no org/project roles so ScopesGuard enforces properly.
  // First get the UUID for the legacy user
  const legacyUserResult = await pool
    .query<{ id: string }>(
      `SELECT id FROM core.user_profiles WHERE zitadel_user_id = $1`,
      [legacyWithScopeZitadelId]
    )
    .catch(() => ({ rows: [] }));
  if (legacyUserResult.rows.length > 0) {
    const legacyUserUuid = legacyUserResult.rows[0].id;
    await pool
      .query(`DELETE FROM kb.organization_memberships WHERE user_id = $1`, [
        legacyUserUuid,
      ])
      .catch(() => {
        /* ignore */
      });
    await pool
      .query(`DELETE FROM kb.project_memberships WHERE user_id = $1`, [
        legacyUserUuid,
      ])
      .catch(() => {
        /* ignore */
      });
  }

  return {
    app: boot.app,
    baseUrl: boot.baseUrl,
    orgId,
    projectId,
    userSub: contextUserLabel,
    cleanup: async () => cleanupUserData(pool, projectId, tokenSeed),
    cleanupProjectArtifacts: async (extraProjectId: string) =>
      cleanupUserData(pool, extraProjectId, tokenSeed),
    cleanupExternalOrg: async (
      externalOrgId: string,
      options?: { allowPrimary?: boolean }
    ) => {
      if (!options?.allowPrimary && externalOrgId === orgId) return; // guard
      try {
        await pool.query('DELETE FROM kb.orgs WHERE id = $1', [externalOrgId]);
      } catch {
        /* ignore */
      }
    },
    cleanupExternalProject: async (
      externalProjectId: string,
      options?: { allowPrimary?: boolean }
    ) => {
      if (!options?.allowPrimary && externalProjectId === projectId) return;
      try {
        await pool.query('DELETE FROM kb.projects WHERE id = $1', [
          externalProjectId,
        ]);
      } catch {
        /* ignore */
      }
    },
    close: async () => {
      try {
        if (isolate) {
          // Best-effort cleanup of isolated project/org (child tables cascade via FKs)
          if (createdIsolatedProject) {
            try {
              await pool.query('DELETE FROM kb.projects WHERE id = $1', [
                projectId,
              ]);
            } catch {
              /* ignore */
            }
          }
          if (createdIsolatedOrg) {
            try {
              await pool.query('DELETE FROM kb.orgs WHERE id = $1', [orgId]);
            } catch {
              /* ignore */
            }
          }
        }
      } finally {
        await pool.end();
        await boot.close();
      }
    },
  };
}
