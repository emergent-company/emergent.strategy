#!/usr/bin/env tsx
/**
 * full-reset-db.ts
 * ---------------------------------------------------------------
 * Hard drop + recreate the kb & core schemas and immediately (re)build
 * the "minimal" schema used by e2e tests without needing the NestJS
 * application bootstrap (DatabaseService.ensureSchema).
 *
 * This script intentionally mirrors (not imports) the SQL from the
 * minimal path in DatabaseService.ensureSchema to avoid pulling in the
 * Nest DI container just for schema setup. Keep the SQL blocks in sync
 * when the minimal schema evolves.
 *
 * Usage examples:
 *   # Uses env vars (DATABASE_URL or DB_* pieces) and rebuilds minimal schema
 *   npx tsx scripts/full-reset-db.ts
 *
 *
 * Environment variables:
 *   DATABASE_URL            - (preferred) standard Postgres URL
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME - fallback pieces
 *   (Demo seed removed)
 *
 * Safety:
 *   - Acquires advisory lock 4815162342 (same as minimal path) to avoid
 *     races with concurrent test workers or app bootstrap.
 *   - Drops schemas with CASCADE: ALL DATA IS LOST.
 */
import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';

// Load .env early (allow override via DOTENV_PATH); ignore if missing.
(() => {
  const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    // eslint-disable-next-line no-console
    console.log(`[full-reset-db] Loaded environment from ${envPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('[full-reset-db] No .env file found at', envPath, '(proceeding with existing environment)');
  }
})();

function buildPool(): Pool {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }
  const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
  const port = +(process.env.DB_PORT || process.env.PGPORT || 5432);
  const user = process.env.DB_USER || process.env.PGUSER || 'postgres';
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres';
  const database = process.env.DB_NAME || process.env.PGDATABASE || 'postgres';
  if (process.env.FULL_RESET_DB_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[full-reset-db] Using connection params', { host, port, user, database, password: password ? '***' : '(empty)' });
  }
  return new Pool({ host, port, user, password, database });
}

async function exec(pool: Pool, sql: string) {
  try {
    await pool.query(sql);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[full-reset-db] SQL failed:', sql, '\nError:', e);
    throw e;
  }
}

async function recreateMinimalSchema(pool: Pool) {
  console.log('[full-reset-db] Creating extensions & schemas');
  await exec(pool, 'CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await exec(pool, 'CREATE EXTENSION IF NOT EXISTS vector');
  await exec(pool, 'CREATE SCHEMA IF NOT EXISTS kb');
  await exec(pool, 'CREATE SCHEMA IF NOT EXISTS core');

  console.log('[full-reset-db] Core org/project tables');
  await exec(pool, `CREATE TABLE kb.orgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, `CREATE TABLE kb.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, 'CREATE UNIQUE INDEX idx_projects_org_lower_name ON kb.projects(organization_id, LOWER(name))');

  console.log('[full-reset-db] User profile + emails (core)');
  await exec(pool, `CREATE TABLE core.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zitadel_user_id TEXT UNIQUE NOT NULL,
    first_name TEXT NULL,
    last_name TEXT NULL,
    display_name TEXT NULL,
    phone_e164 TEXT NULL,
    avatar_object_key TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, `CREATE TABLE core.user_emails (
    user_id UUID NOT NULL REFERENCES core.user_profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, email)
  )`);

  console.log('[full-reset-db] Membership tables (user_id model)');
  await exec(pool, `CREATE TABLE kb.organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES core.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('org_admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, `CREATE TABLE kb.project_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES core.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, 'CREATE UNIQUE INDEX idx_project_membership_unique ON kb.project_memberships(project_id, user_id)');

  console.log('[full-reset-db] Invites');
  await exec(pool, `CREATE TABLE kb.invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
    project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('org_admin','project_admin','project_user')),
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NULL,
    accepted_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, 'CREATE INDEX idx_invites_token ON kb.invites(token)');

  console.log('[full-reset-db] Documents + chunks (minimal)');
  await exec(pool, `CREATE TABLE kb.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    source_url TEXT,
    filename TEXT,
    mime_type TEXT,
    content TEXT,
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, 'CREATE UNIQUE INDEX idx_documents_project_hash ON kb.documents(project_id, content_hash)');

  await exec(pool, `CREATE TABLE kb.chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    text TEXT,
    embedding vector(768),
    tsv tsvector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, 'CREATE INDEX idx_chunks_doc ON kb.chunks(document_id)');
  await exec(pool, 'CREATE INDEX idx_chunks_tsv ON kb.chunks USING GIN (tsv)');
  await exec(pool, 'CREATE INDEX idx_chunks_embedding ON kb.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)');
  await exec(pool, 'CREATE UNIQUE INDEX idx_chunks_doc_chunkindex ON kb.chunks(document_id, chunk_index)');
  await exec(pool, `DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'kb' AND p.proname = 'update_tsv' AND p.pronargs = 0) THEN
    CREATE FUNCTION kb.update_tsv() RETURNS trigger LANGUAGE plpgsql AS $func$ BEGIN NEW.tsv := to_tsvector('simple', NEW.text); RETURN NEW; END $func$;
  END IF; END $do$;`);
  await exec(pool, 'DROP TRIGGER IF EXISTS trg_chunks_tsv ON kb.chunks');
  await exec(pool, `CREATE TRIGGER trg_chunks_tsv BEFORE INSERT OR UPDATE ON kb.chunks FOR EACH ROW EXECUTE FUNCTION kb.update_tsv()`);

  console.log('[full-reset-db] Embedding policies');
  await exec(pool, `CREATE TABLE kb.embedding_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    max_property_size INT DEFAULT 10000,
    required_labels TEXT[] NOT NULL DEFAULT '{}',
    excluded_labels TEXT[] NOT NULL DEFAULT '{}',
    relevant_paths TEXT[] NOT NULL DEFAULT '{}',
    excluded_statuses TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  console.log('[full-reset-db] Chat tables (minimal subset)');
  await exec(pool, `CREATE TABLE kb.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    owner_id UUID NULL REFERENCES core.user_profiles(id) ON DELETE SET NULL,
    is_private BOOLEAN NOT NULL DEFAULT true,
    organization_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL,
    project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await exec(pool, `CREATE TABLE kb.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    citations JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // no seed
}

async function main() {
  const start = Date.now();
  const pool = buildPool();
  try {
    console.log('[full-reset-db] Acquiring advisory lock (minimal path id)');
    await exec(pool, 'SELECT pg_advisory_lock(4815162342)');
    console.log('[full-reset-db] Dropping schemas kb & core (CASCADE)');
    await exec(pool, 'DROP SCHEMA IF EXISTS kb CASCADE');
    await exec(pool, 'DROP SCHEMA IF EXISTS core CASCADE');
    await recreateMinimalSchema(pool);
    console.log('[full-reset-db] Releasing advisory lock');
    await exec(pool, 'SELECT pg_advisory_unlock(4815162342)');
    console.log(`[full-reset-db] Completed in ${Date.now() - start}ms`);
  } finally {
    await pool.end();
  }
}

// Run
main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('[full-reset-db] FAILED', err);
  process.exit(1);
});
