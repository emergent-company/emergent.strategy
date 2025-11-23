import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { setupTestEnvironment } from './test-env';

// Note: setupTestEnvironment() is called lazily by getTestDbConfig()
// This allows vitest's env config to set POSTGRES_PORT/POSTGRES_DB first
// (vitest applies env config after module imports but before test execution)

// IMPORTANT: Do NOT import providers from src/ when using the dist AppModule – class identity mismatch
// will cause app.get(ProviderClass) lookups to fail. Always import from the same compiled output tree.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - resolve compiled DatabaseService alongside dist AppModule
// We cannot safely import DatabaseService class directly (dist path may differ / identity mismatch). Use string token lookup.
// The provider is decorated with @Injectable() so the class name is 'DatabaseService'. We'll fallback to scanning providers if needed.
// IMPORTANT: Use compiled dist AppModule to retain decorator metadata for DI.
// Vitest + esbuild can strip design:paramtypes when importing TS source directly, leading to undefined injected controller deps.
// Mirrors pattern in tests/e2e bootstrap.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dist build output path
import { AppModule } from '../dist/modules/app.module';

let app: INestApplication | undefined;
let seededOrgId: string | undefined;
let seededProjectId: string | undefined;
let seeding: Promise<void> | null = null;

export async function getTestApp(): Promise<INestApplication> {
  if (app) return app;
  // Ensure deterministic test bootstrap for integration tests.
  // Test environment already configured by setupTestEnvironment()
  process.env.NODE_ENV = 'test';
  // Never skip DB in these integration tests.
  if (process.env.SKIP_DB) delete process.env.SKIP_DB;
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  await seedOrgProject();
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = undefined;
  }
}

// Vitest lifecycle hooks (if imported in tests)
if (typeof afterAll === 'function') {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  afterAll(async () => {
    await closeTestApp();
  }, 30000);
}

async function seedOrgProject() {
  if (seededOrgId && seededProjectId) return;
  if (seeding) return seeding;
  seeding = (async () => {
    // Ensure schema has been created by AppModule initialization first
    // Use validated env vars (no fallbacks)
    const pool = new Pool({
      host: process.env.POSTGRES_HOST!,
      port: Number(process.env.POSTGRES_PORT!),
      user: process.env.POSTGRES_USER!,
      password: process.env.POSTGRES_PASSWORD!,
      database: process.env.POSTGRES_DB!,
    });
    try {
      const orgRes = await pool.query<{ id: string }>(
        `INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`,
        ['merge-org-' + Date.now()]
      );
      seededOrgId = orgRes.rows[0].id;
      const projRes = await pool.query<{ id: string }>(
        `INSERT INTO kb.projects(organization_id, name) VALUES ($1,$2) RETURNING id`,
        [seededOrgId, 'merge-proj-' + Date.now()]
      );
      seededProjectId = projRes.rows[0].id;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[test-setup] raw pg seeding failed', (e as Error).message);
      throw e;
    } finally {
      await pool.end().catch(() => {});
      seeding = null;
    }
  })();
  return seeding;
}

export async function getSeededOrgProject() {
  await seedOrgProject();
  if (!seededOrgId || !seededProjectId)
    throw new Error('Org/project not seeded');
  return { orgId: seededOrgId, projectId: seededProjectId } as const;
}

export default getTestApp;
