import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

// Schema Indexes Meta Test
// Ensures critical indexes exist to preserve performance guarantees.
// Adjust expected index names to match actual migrations if they differ.
// We intentionally allow superset presence; we only assert required subset.

let pool: Pool;

const REQUIRED_INDEXES = [
  // Vector similarity (pgvector) index
  'idx_chunks_embedding',
  // Full-text search GIN index
  'idx_chunks_tsv',
  // Content hash uniqueness / ingestion dedup (proxy for ingestion integrity)
  // TypeORM generates index name from entity definition: @Index(['projectId', 'contentHash'])
  'IDX_3bbf4ea30357bf556110f034d4',
];

describe('Schema Index Presence', () => {
  beforeAll(async () => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || 'spec',
      password: process.env.POSTGRES_PASSWORD || 'spec',
      database: process.env.POSTGRES_DB || 'spec',
    });
  });
  afterAll(async () => {
    await pool.end();
  });

  it('contains required indexes', async () => {
    const { rows } = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'kb'`
    );
    const present = rows.map((r) => r.indexname);
    const missing = REQUIRED_INDEXES.filter((ix) => !present.includes(ix));
    if (missing.length) {
      // Provide diagnostics while failing.
      // eslint-disable-next-line no-console
      console.error('Missing required indexes:', missing);
    }
    expect(missing).toHaveLength(0);
  });
});
