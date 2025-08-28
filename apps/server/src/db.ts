import 'dotenv/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}

export async function getClient() {
  return pool.connect();
}

export async function ensureSchema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query('CREATE SCHEMA IF NOT EXISTS kb');

  await pool.query(`
  CREATE TABLE IF NOT EXISTS kb.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT,
    filename TEXT,
    mime_type TEXT,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`);

  // Backfill columns if the table pre-existed without them
  await pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
  await pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();`);

  await pool.query(`
  CREATE TABLE IF NOT EXISTS kb.chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    text TEXT NOT NULL,
    embedding vector(768),
    tsv tsvector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_doc ON kb.chunks(document_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON kb.chunks USING GIN (tsv);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON kb.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_chunkindex ON kb.chunks(document_id, chunk_index);`);

  await pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS content_hash TEXT;`);
  await pool.query(`UPDATE kb.documents SET content_hash = encode(digest(coalesce(content, ''), 'sha256'), 'hex') WHERE content_hash IS NULL;`);
  await pool.query(`
    WITH ranked AS (
      SELECT id, content_hash,
             row_number() OVER (PARTITION BY content_hash ORDER BY created_at ASC, id ASC) AS rn
      FROM kb.documents
      WHERE content_hash IS NOT NULL
    )
    DELETE FROM kb.documents d
    USING ranked r
    WHERE d.id = r.id AND r.rn > 1;
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON kb.documents(content_hash);`);

  await pool.query(`
    CREATE OR REPLACE FUNCTION kb.touch_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END$$;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_documents_touch ON kb.documents;`);
  await pool.query(`
    CREATE TRIGGER trg_documents_touch BEFORE UPDATE ON kb.documents
    FOR EACH ROW EXECUTE FUNCTION kb.touch_updated_at();
  `);

  await pool.query(`
    DO $do$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'kb'
          AND p.proname = 'update_tsv'
          AND p.pronargs = 0
      ) THEN
        CREATE FUNCTION kb.update_tsv() RETURNS trigger LANGUAGE plpgsql AS $func$
        BEGIN
          NEW.tsv := to_tsvector('simple', NEW.text);
          RETURN NEW;
        END
        $func$;
      END IF;
    END
    $do$;
  `);

  await pool.query(`DROP TRIGGER IF EXISTS trg_chunks_tsv ON kb.chunks;`);
  await pool.query(`
    CREATE TRIGGER trg_chunks_tsv BEFORE INSERT OR UPDATE ON kb.chunks
    FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();
  `);

  // Chat persistence tables
  await pool.query(`
  CREATE TABLE IF NOT EXISTS kb.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    owner_user_id UUID NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT false
  );`);

  await pool.query(`
  CREATE TABLE IF NOT EXISTS kb.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    citations JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON kb.chat_messages(conversation_id, created_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON kb.chat_conversations(updated_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_privacy ON kb.chat_conversations(is_private, owner_user_id);`);
}
