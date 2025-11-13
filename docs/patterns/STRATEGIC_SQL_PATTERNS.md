# Strategic SQL Patterns Guide

**Purpose**: PostgreSQL-specific patterns that require raw SQL  
**Audience**: All developers working on backend services  
**Last Updated**: January 2025

---

## Table of Contents

1. [When to Use Strategic SQL](#when-to-use-strategic-sql)
2. [Pattern 1: PostgreSQL Advisory Locks](#pattern-1-postgresql-advisory-locks)
3. [Pattern 2: Recursive CTEs (WITH RECURSIVE)](#pattern-2-recursive-ctes-with-recursive)
4. [Pattern 3: Full-Text Search (ts_rank, ts_vector)](#pattern-3-full-text-search-ts_rank-ts_vector)
5. [Pattern 4: Vector Similarity (pgvector)](#pattern-4-vector-similarity-pgvector)
6. [Pattern 5: Queue Primitives (FOR UPDATE SKIP LOCKED)](#pattern-5-queue-primitives-for-update-skip-locked)
7. [Pattern 6: Database Encryption (pgcrypto)](#pattern-6-database-encryption-pgcrypto)
8. [Pattern 7: IS NOT DISTINCT FROM](#pattern-7-is-not-distinct-from)
9. [Pattern 8: COUNT FILTER Aggregations](#pattern-8-count-filter-aggregations)
10. [Pattern 9: LATERAL Subqueries](#pattern-9-lateral-subqueries)
11. [Pattern 10: JSON Path Queries (jsonb_path_query_array)](#pattern-10-json-path-queries-jsonb_path_query_array)
12. [Pattern 11: Custom Projections (row_to_json)](#pattern-11-custom-projections-row_to_json)
13. [Pattern 12: RLS Context Setup](#pattern-12-rls-context-setup)
14. [Best Practices](#best-practices)
15. [When to Use vs TypeORM](#when-to-use-vs-typeorm)

---

## When to Use Strategic SQL

Use Strategic SQL when:

- ✅ **PostgreSQL-specific features** - Advisory locks, recursive CTEs, full-text search
- ✅ **Performance-critical operations** - 10x-100x faster than ORM equivalent
- ✅ **Complex aggregations** - Window functions, COUNT FILTER, advanced GROUP BY
- ✅ **Database extensions** - pgvector, pgcrypto, custom functions
- ✅ **Batch processing** - LATERAL joins, bulk operations

**Don't use Strategic SQL when**:

- ❌ **Simple CRUD** - Use TypeORM Repository
- ❌ **Basic filtering** - Use TypeORM QueryBuilder
- ❌ **Standard SQL operations** - Use TypeORM for portability

See [TYPEORM_PATTERNS.md](./TYPEORM_PATTERNS.md) for TypeORM patterns.

---

## Pattern 1: PostgreSQL Advisory Locks

### Description

PostgreSQL advisory locks provide application-level mutual exclusion without using table locks.

### When to Use

- Preventing race conditions in concurrent operations
- Ensuring single-execution of critical sections
- DAG operations requiring cycle prevention
- Duplicate prevention in high-concurrency scenarios

### Services Using This Pattern

- GraphService (DAG operations)
- ProductVersionService (bulk member creation)
- TagService (duplicate tag prevention)
- MigrationService (schema migrations)

### Example: Preventing Duplicate Tag Creation

```typescript
// tag.service.ts
async create(projectId: string, name: string): Promise<Tag> {
  const lockKey = hashtext(`tag:${projectId}:${name}`);

  const result = await this.db.query(
    `
    -- Acquire advisory lock (released at transaction end)
    SELECT pg_advisory_xact_lock($1);

    -- Check if tag exists
    SELECT * FROM graph.tags
    WHERE project_id = $2 AND name = $3;
    `,
    [lockKey, projectId, name],
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Tag doesn't exist - create it
  const tag = await this.db.query(
    `
    INSERT INTO graph.tags (project_id, name)
    VALUES ($1, $2)
    RETURNING *;
    `,
    [projectId, name],
  );

  return tag.rows[0];
}
```

### Example: DAG Cycle Prevention

```typescript
// graph.service.ts
async addEdge(fromId: string, toId: string): Promise<void> {
  const lockKey = hashtext(`graph:${fromId}:${toId}`);

  await this.db.transaction(async (trx) => {
    // Acquire lock
    await trx.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    // Check for cycles using recursive CTE
    const cycleCheck = await trx.query(
      `
      WITH RECURSIVE path AS (
        SELECT $1::uuid as node, ARRAY[$1::uuid] as path
        UNION ALL
        SELECT e.to_id, path.path || e.to_id
        FROM graph.edges e
        JOIN path ON e.from_id = path.node
        WHERE NOT (e.to_id = ANY(path.path))
      )
      SELECT EXISTS(
        SELECT 1 FROM path WHERE node = $2
      ) as would_create_cycle;
      `,
      [toId, fromId],
    );

    if (cycleCheck.rows[0].would_create_cycle) {
      throw new Error('Cannot add edge: would create cycle');
    }

    // Safe to add edge
    await trx.query(
      `INSERT INTO graph.edges (from_id, to_id) VALUES ($1, $2)`,
      [fromId, toId],
    );
  });
}
```

### Advisory Lock Functions

| Function                         | Scope       | Behavior                                              |
| -------------------------------- | ----------- | ----------------------------------------------------- |
| `pg_advisory_lock(key)`          | Session     | Block until acquired, manual release                  |
| `pg_advisory_xact_lock(key)`     | Transaction | Block until acquired, auto-release on commit/rollback |
| `pg_try_advisory_lock(key)`      | Session     | Return immediately (true if acquired)                 |
| `pg_try_advisory_xact_lock(key)` | Transaction | Return immediately (true if acquired)                 |
| `pg_advisory_unlock(key)`        | Session     | Manually release lock                                 |

### Best Practices

1. **Prefer `pg_advisory_xact_lock()`** - Auto-releases on transaction end
2. **Use consistent lock keys** - Hash strings to integers for consistency
3. **Document lock purpose** - Explain what race condition is prevented
4. **Keep lock duration short** - Avoid long-running transactions with locks
5. **Handle lock contention** - Consider retry logic or timeouts

### Lock Key Generation

```typescript
// Good - Consistent hashing
import { createHash } from 'crypto';

function hashtext(text: string): number {
  const hash = createHash('md5').update(text).digest();
  return hash.readInt32BE(0);
}

const lockKey = hashtext(`resource:${resourceType}:${resourceId}`);
```

---

## Pattern 2: Recursive CTEs (WITH RECURSIVE)

### Description

Recursive Common Table Expressions (CTEs) enable graph traversal, tree operations, and hierarchical queries.

### When to Use

- Graph traversal (finding paths, ancestors, descendants)
- Tree operations (nested comments, org charts)
- Cycle detection
- Lineage tracking

### Services Using This Pattern

- PathSummaryService (graph traversal)
- BranchService (lineage population)
- GraphService (path finding)

### Example: Graph Traversal with Cycle Detection

```typescript
// path-summary.service.ts
async generatePathSummaries(startNodeId: string): Promise<PathSummary[]> {
  const result = await this.db.query(
    `
    WITH RECURSIVE path_traversal AS (
      -- Base case: Start node
      SELECT
        n.id,
        n.parent_id,
        ARRAY[n.id] as path,
        1 as depth,
        n.type
      FROM graph.nodes n
      WHERE n.id = $1

      UNION ALL

      -- Recursive case: Follow edges
      SELECT
        n.id,
        n.parent_id,
        pt.path || n.id,
        pt.depth + 1,
        n.type
      FROM graph.nodes n
      JOIN path_traversal pt ON n.parent_id = pt.id
      WHERE NOT (n.id = ANY(pt.path))  -- Cycle detection
        AND pt.depth < 100  -- Max depth limit
    )
    SELECT
      path,
      depth,
      array_agg(type) as types
    FROM path_traversal
    GROUP BY path, depth
    ORDER BY depth;
    `,
    [startNodeId],
  );

  return result.rows;
}
```

### Example: Tree Lineage Population

```typescript
// branch.service.ts
async ensureBranchLineage(branchId: string): Promise<void> {
  await this.db.query(
    `
    -- Populate branch_lineage table with all ancestors
    WITH RECURSIVE lineage AS (
      -- Base case: Current branch
      SELECT
        id,
        parent_id,
        1 as depth
      FROM graph.branches
      WHERE id = $1

      UNION ALL

      -- Recursive case: Follow parent chain
      SELECT
        b.id,
        b.parent_id,
        l.depth + 1
      FROM graph.branches b
      JOIN lineage l ON b.id = l.parent_id
      WHERE b.parent_id IS NOT NULL
    )
    INSERT INTO graph.branch_lineage (branch_id, ancestor_id, depth)
    SELECT
      $1,
      id,
      depth
    FROM lineage
    ON CONFLICT (branch_id, ancestor_id) DO NOTHING;
    `,
    [branchId],
  );
}
```

### Example: Find All Descendants

```typescript
async findDescendants(nodeId: string): Promise<Node[]> {
  const result = await this.db.query(
    `
    WITH RECURSIVE descendants AS (
      -- Base case
      SELECT * FROM graph.nodes WHERE id = $1

      UNION ALL

      -- Recursive case
      SELECT n.*
      FROM graph.nodes n
      JOIN descendants d ON n.parent_id = d.id
    )
    SELECT * FROM descendants
    WHERE id != $1;  -- Exclude starting node
    `,
    [nodeId],
  );

  return result.rows;
}
```

### Best Practices

1. **Always include cycle detection** - `WHERE NOT (id = ANY(path))`
2. **Limit recursion depth** - `AND depth < 100` to prevent infinite loops
3. **Use DISTINCT ON for unique paths** - Avoid duplicate results
4. **Index parent columns** - Critical for performance
5. **Consider materialized paths** - For frequently accessed hierarchies

### Performance Comparison

| Approach          | Complexity            | Performance                   |
| ----------------- | --------------------- | ----------------------------- |
| Recursive CTE     | O(depth)              | Optimal for sparse graphs     |
| Application-level | O(edges^depth)        | 10x-100x slower               |
| Materialized path | O(1) read, O(n) write | Best for read-heavy workloads |

---

## Pattern 3: Full-Text Search (ts_rank, ts_vector)

### Description

PostgreSQL full-text search provides linguistic search capabilities with ranking.

### When to Use

- Natural language search queries
- Weighted ranking (title more important than content)
- Stemming and stop word support
- Multi-language search

### Services Using This Pattern

- GraphService (node search)
- SearchService (document search)

### Example: Weighted Full-Text Search

```typescript
// search.service.ts
async searchDocuments(query: string): Promise<SearchResult[]> {
  const result = await this.db.query(
    `
    SELECT
      d.*,
      ts_rank(
        setweight(to_tsvector('english', d.title), 'A') ||
        setweight(to_tsvector('english', COALESCE(d.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(d.content, '')), 'C'),
        plainto_tsquery('english', $1)
      ) as rank
    FROM documents d
    WHERE
      setweight(to_tsvector('english', d.title), 'A') ||
      setweight(to_tsvector('english', COALESCE(d.description, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(d.content, '')), 'C')
      @@ plainto_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT 20;
    `,
    [query],
  );

  return result.rows;
}
```

### Example: Pre-computed ts_vector Column

```sql
-- Migration: Add search_vector column
ALTER TABLE documents
ADD COLUMN search_vector tsvector;

-- Create index
CREATE INDEX documents_search_vector_idx
ON documents USING gin(search_vector);

-- Update existing rows
UPDATE documents SET search_vector =
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C');

-- Trigger to keep it updated
CREATE TRIGGER documents_search_vector_update
BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(
    search_vector,
    'pg_catalog.english',
    title, description, content
  );
```

```typescript
// Query using pre-computed vector
async searchDocuments(query: string): Promise<SearchResult[]> {
  const result = await this.db.query(
    `
    SELECT
      d.*,
      ts_rank(d.search_vector, plainto_tsquery('english', $1)) as rank
    FROM documents d
    WHERE d.search_vector @@ plainto_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT 20;
    `,
    [query],
  );

  return result.rows;
}
```

### Weighting Scheme

| Weight | Label           | Use Case             | Multiplier |
| ------ | --------------- | -------------------- | ---------- |
| A      | Most important  | Title, name          | 1.0        |
| B      | Important       | Description, summary | 0.4        |
| C      | Normal          | Content, body        | 0.2        |
| D      | Least important | Metadata, tags       | 0.1        |

### Query Functions

| Function                 | Description                      | Example                                                    |
| ------------------------ | -------------------------------- | ---------------------------------------------------------- |
| `to_tsvector()`          | Convert text to search vector    | `to_tsvector('english', text)`                             |
| `plainto_tsquery()`      | Simple query (AND between words) | `plainto_tsquery('english', 'hello world')`                |
| `phraseto_tsquery()`     | Phrase query (exact order)       | `phraseto_tsquery('english', 'hello world')`               |
| `websearch_to_tsquery()` | Web-style query (quotes, OR)     | `websearch_to_tsquery('english', '"hello world" OR test')` |
| `ts_rank()`              | Rank results by relevance        | `ts_rank(vector, query)`                                   |
| `ts_headline()`          | Extract snippets with highlights | `ts_headline('english', content, query)`                   |

### Best Practices

1. **Use pre-computed ts_vector columns** - 10x faster than runtime conversion
2. **Create GIN indexes** - Essential for performance
3. **Use appropriate weights** - Title > description > content
4. **Choose correct language** - 'english', 'spanish', 'simple', etc.
5. **Consider ts_headline()** - For search result snippets

---

## Pattern 4: Vector Similarity (pgvector)

### Description

pgvector extension enables semantic search using embedding vectors.

### When to Use

- Semantic search (meaning-based, not keyword-based)
- Hybrid search (combining text + vector search)
- Similarity detection
- Recommendation systems

### Services Using This Pattern

- SearchService (semantic search, hybrid search)

### Example: Vector Similarity Search

```typescript
// search.service.ts
async semanticSearch(
  query: string,
  embedding: number[],
  limit = 20,
): Promise<SearchResult[]> {
  const result = await this.db.query(
    `
    SELECT
      d.*,
      1 - (d.embedding <=> $1::vector) as similarity
    FROM documents d
    WHERE d.embedding IS NOT NULL
    ORDER BY d.embedding <=> $1::vector
    LIMIT $2;
    `,
    [JSON.stringify(embedding), limit],
  );

  return result.rows;
}
```

### Example: Hybrid Search (Text + Vector)

```typescript
// search.service.ts
async hybridSearch(
  query: string,
  embedding: number[],
  limit = 20,
): Promise<SearchResult[]> {
  const result = await this.db.query(
    `
    WITH text_search AS (
      SELECT
        id,
        ts_rank(search_vector, plainto_tsquery('english', $1)) as text_score
      FROM documents
      WHERE search_vector @@ plainto_tsquery('english', $1)
    ),
    vector_search AS (
      SELECT
        id,
        1 - (embedding <=> $2::vector) as vector_score
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $2::vector
      LIMIT 100
    ),
    combined AS (
      SELECT
        COALESCE(ts.id, vs.id) as id,
        COALESCE(ts.text_score, 0) as text_score,
        COALESCE(vs.vector_score, 0) as vector_score
      FROM text_search ts
      FULL OUTER JOIN vector_search vs ON ts.id = vs.id
    ),
    normalized AS (
      SELECT
        id,
        -- Z-score normalization
        (text_score - AVG(text_score) OVER()) / NULLIF(STDDEV(text_score) OVER(), 0) as text_z,
        (vector_score - AVG(vector_score) OVER()) / NULLIF(STDDEV(vector_score) OVER(), 0) as vector_z
      FROM combined
    )
    SELECT
      d.*,
      (COALESCE(n.text_z, 0) + COALESCE(n.vector_z, 0)) / 2 as hybrid_score
    FROM normalized n
    JOIN documents d ON d.id = n.id
    ORDER BY hybrid_score DESC
    LIMIT $3;
    `,
    [query, JSON.stringify(embedding), limit],
  );

  return result.rows;
}
```

### Vector Operators

| Operator | Name                    | Description                                         |
| -------- | ----------------------- | --------------------------------------------------- |
| `<=>`    | Cosine distance         | 1 - cosine similarity (0 = identical, 2 = opposite) |
| `<->`    | Euclidean distance (L2) | Straight-line distance                              |
| `<#>`    | Inner product           | Dot product (negative = similar)                    |

### Index Types

```sql
-- HNSW index (faster queries, slower inserts)
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops);

-- IVFFlat index (faster inserts, requires training)
CREATE INDEX ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Best Practices

1. **Use cosine distance (`<=>`)** - Most common for embeddings
2. **Create HNSW indexes** - Best performance for most cases
3. **Normalize embeddings** - Ensure unit length for cosine similarity
4. **Use FULL OUTER JOIN for hybrid search** - Combines both result sets
5. **Apply z-score normalization** - Makes text and vector scores comparable

---

## Pattern 5: Queue Primitives (FOR UPDATE SKIP LOCKED)

### Description

`FOR UPDATE SKIP LOCKED` enables concurrent job processing without worker contention.

### When to Use

- Job queue implementations
- Worker pool patterns
- Concurrent task processing
- Avoiding lock contention

### Services Using This Pattern

- EmbeddingJobsService (embedding queue)
- ExtractionWorkerService (extraction queue)

### Example: Job Dequeue

```typescript
// embedding-jobs.service.ts
async dequeue(): Promise<EmbeddingJob | null> {
  const result = await this.db.query(
    `
    UPDATE embedding_jobs
    SET
      status = 'processing',
      started_at = NOW(),
      worker_id = $1
    WHERE id = (
      SELECT id
      FROM embedding_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
    `,
    [workerId],
  );

  return result.rows[0] || null;
}
```

### Example: Batch Dequeue

```typescript
async dequeueBatch(batchSize = 10): Promise<EmbeddingJob[]> {
  const result = await this.db.query(
    `
    UPDATE embedding_jobs
    SET
      status = 'processing',
      started_at = NOW(),
      worker_id = $1
    WHERE id IN (
      SELECT id
      FROM embedding_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
    `,
    [workerId, batchSize],
  );

  return result.rows;
}
```

### Example: Job Completion

```typescript
async markCompleted(jobId: string): Promise<void> {
  await this.db.query(
    `
    UPDATE embedding_jobs
    SET
      status = 'completed',
      completed_at = NOW()
    WHERE id = $1;
    `,
    [jobId],
  );
}

async markFailed(jobId: string, error: string): Promise<void> {
  await this.db.query(
    `
    UPDATE embedding_jobs
    SET
      status = 'failed',
      completed_at = NOW(),
      error = $2,
      retry_count = retry_count + 1
    WHERE id = $1;
    `,
    [jobId, error],
  );
}
```

### FOR UPDATE Variants

| Variant                  | Behavior                                            |
| ------------------------ | --------------------------------------------------- |
| `FOR UPDATE`             | Lock rows, block if already locked                  |
| `FOR UPDATE NOWAIT`      | Lock rows, error if already locked                  |
| `FOR UPDATE SKIP LOCKED` | Lock rows, skip if already locked (best for queues) |

### Best Practices

1. **Use SKIP LOCKED for queues** - Prevents worker contention
2. **Update status atomically** - SELECT + UPDATE in single query
3. **Order by priority + timestamp** - Fair queue processing
4. **Track worker_id** - Know which worker processed the job
5. **Implement retry logic** - Handle failed jobs with exponential backoff

### Complete Queue Pattern

```typescript
@Injectable()
export class QueueService {
  async enqueue(data: any): Promise<Job> {
    const result = await this.db.query(
      `INSERT INTO jobs (data, status) VALUES ($1, 'pending') RETURNING *`,
      [JSON.stringify(data)]
    );
    return result.rows[0];
  }

  async dequeue(workerId: string): Promise<Job | null> {
    const result = await this.db.query(
      `
      UPDATE jobs
      SET status = 'processing', started_at = NOW(), worker_id = $1
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
      `,
      [workerId]
    );
    return result.rows[0] || null;
  }

  async complete(jobId: string, result: any): Promise<void> {
    await this.db.query(
      `UPDATE jobs SET status = 'completed', completed_at = NOW(), result = $2 WHERE id = $1`,
      [jobId, JSON.stringify(result)]
    );
  }

  async fail(jobId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE jobs SET status = 'failed', completed_at = NOW(), error = $2, retry_count = retry_count + 1 WHERE id = $1`,
      [jobId, error]
    );
  }

  async retry(jobId: string): Promise<void> {
    await this.db.query(
      `UPDATE jobs SET status = 'pending', started_at = NULL, worker_id = NULL WHERE id = $1 AND retry_count < 3`,
      [jobId]
    );
  }
}
```

---

## Pattern 6: Database Encryption (pgcrypto)

### Description

pgcrypto extension provides encryption functions for storing sensitive data.

### When to Use

- Encrypting integration credentials
- Storing API keys and tokens
- Compliance requirements (credentials at rest)
- Database-level encryption

### Services Using This Pattern

- EncryptionService (integration credentials)

### Example: Symmetric Encryption

```typescript
// encryption.service.ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EncryptionService {
  private readonly encryptionKey: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService
  ) {
    this.encryptionKey = this.config.get('ENCRYPTION_KEY');
  }

  async encrypt(plaintext: string): Promise<string> {
    const result = await this.db.query(
      `SELECT pgp_sym_encrypt($1, $2) as encrypted`,
      [plaintext, this.encryptionKey]
    );

    // Convert bytea to base64 string
    return Buffer.from(result.rows[0].encrypted).toString('base64');
  }

  async decrypt(ciphertext: string): Promise<string> {
    // Convert base64 string to bytea
    const buffer = Buffer.from(ciphertext, 'base64');

    const result = await this.db.query(
      `SELECT pgp_sym_decrypt($1, $2) as decrypted`,
      [buffer, this.encryptionKey]
    );

    return result.rows[0].decrypted;
  }
}
```

### Example: Storing Encrypted Credentials

```typescript
async storeIntegrationCredentials(
  integrationId: string,
  apiKey: string,
  apiSecret: string,
): Promise<void> {
  await this.db.query(
    `
    INSERT INTO integration_credentials (integration_id, api_key, api_secret)
    VALUES (
      $1,
      pgp_sym_encrypt($2, $3),
      pgp_sym_encrypt($4, $3)
    )
    ON CONFLICT (integration_id) DO UPDATE SET
      api_key = pgp_sym_encrypt($2, $3),
      api_secret = pgp_sym_encrypt($4, $3);
    `,
    [integrationId, apiKey, this.encryptionKey, apiSecret],
  );
}

async getIntegrationCredentials(
  integrationId: string,
): Promise<{ apiKey: string; apiSecret: string }> {
  const result = await this.db.query(
    `
    SELECT
      pgp_sym_decrypt(api_key, $2) as api_key,
      pgp_sym_decrypt(api_secret, $2) as api_secret
    FROM integration_credentials
    WHERE integration_id = $1;
    `,
    [integrationId, this.encryptionKey],
  );

  if (result.rows.length === 0) {
    throw new Error('Credentials not found');
  }

  return {
    apiKey: result.rows[0].api_key,
    apiSecret: result.rows[0].api_secret,
  };
}
```

### pgcrypto Functions

| Function                             | Description                      |
| ------------------------------------ | -------------------------------- |
| `pgp_sym_encrypt(data, key)`         | Encrypt with AES-256             |
| `pgp_sym_decrypt(data, key)`         | Decrypt with AES-256             |
| `pgp_pub_encrypt(data, public_key)`  | Asymmetric encryption            |
| `pgp_pub_decrypt(data, private_key)` | Asymmetric decryption            |
| `digest(data, algorithm)`            | One-way hash (md5, sha256, etc.) |
| `hmac(data, key, algorithm)`         | HMAC signature                   |

### Best Practices

1. **Use AES-256 (default)** - Secure symmetric encryption
2. **Store keys in environment variables** - Never in code or database
3. **Rotate encryption keys periodically** - Implement key rotation strategy
4. **Encrypt at database level** - Keys never leave database server
5. **Store as bytea columns** - Use `bytea` type for encrypted data

### Schema

```sql
-- Table with encrypted columns
CREATE TABLE integration_credentials (
  integration_id UUID PRIMARY KEY,
  api_key BYTEA NOT NULL,  -- Encrypted
  api_secret BYTEA NOT NULL,  -- Encrypted
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## Pattern 7: IS NOT DISTINCT FROM

### Description

Null-safe equality operator for comparing values including NULL.

### When to Use

- Uniqueness constraints including NULL values
- Comparing optional fields
- Null-safe filtering

### Services Using This Pattern

- BranchService (parent_id can be NULL)
- ChatService (optional filtering)

### Example: Null-Safe Uniqueness

```typescript
// branch.service.ts
async create(
  projectId: string,
  name: string,
  parentId: string | null,
): Promise<Branch> {
  const result = await this.db.query(
    `
    INSERT INTO graph.branches (project_id, name, parent_id)
    SELECT $1, $2, $3
    WHERE NOT EXISTS (
      SELECT 1 FROM graph.branches
      WHERE project_id = $1
        AND name = $2
        AND (parent_id IS NOT DISTINCT FROM $3)
    )
    RETURNING *;
    `,
    [projectId, name, parentId],
  );

  if (result.rows.length === 0) {
    throw new Error('Branch already exists');
  }

  return result.rows[0];
}
```

### Example: Optional Filtering

```typescript
// chat.service.ts
async listConversations(
  userId: string,
  projectId?: string,
  archived?: boolean,
): Promise<Conversation[]> {
  const result = await this.db.query(
    `
    SELECT * FROM conversations
    WHERE user_id = $1
      AND (project_id IS NOT DISTINCT FROM $2)
      AND (archived IS NOT DISTINCT FROM $3)
    ORDER BY updated_at DESC;
    `,
    [userId, projectId || null, archived ?? null],
  );

  return result.rows;
}
```

### Comparison: IS NOT DISTINCT FROM vs =

```sql
-- Regular equality (NULL != NULL)
SELECT * FROM branches
WHERE parent_id = NULL;  -- Returns no rows (even if parent_id IS NULL)

-- IS NOT DISTINCT FROM (NULL = NULL)
SELECT * FROM branches
WHERE parent_id IS NOT DISTINCT FROM NULL;  -- Returns rows where parent_id IS NULL
```

### Truth Table

| Value A | Value B | `A = B` | `A IS NOT DISTINCT FROM B` |
| ------- | ------- | ------- | -------------------------- |
| 1       | 1       | TRUE    | TRUE                       |
| 1       | 2       | FALSE   | FALSE                      |
| 1       | NULL    | NULL    | FALSE                      |
| NULL    | NULL    | NULL    | TRUE                       |

### Best Practices

1. **Use for unique constraints with NULL** - Ensures uniqueness including NULL values
2. **Use for optional filtering** - Clean syntax for nullable parameters
3. **More readable than `(field = value OR (field IS NULL AND value IS NULL))`**
4. **Standard SQL** - Part of SQL:2003 standard

---

## Pattern 8: COUNT FILTER Aggregations

### Description

PostgreSQL 9.4+ syntax for conditional aggregations in a single query.

### When to Use

- Dashboard counts (unread, pending, completed)
- Badge counts (notifications, messages)
- Multiple conditional aggregations
- Status summaries

### Services Using This Pattern

- NotificationsService (unread counts)
- RevisionCountRefreshWorkerService (status counts)
- TypeRegistryService (type counts)
- BranchService (branch counts)
- ChatService (conversation counts)

### Example: Notification Counts

```typescript
// notifications.service.ts
async getUnreadCounts(userId: string): Promise<UnreadCounts> {
  const result = await this.db.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'unread') as unread_count,
      COUNT(*) FILTER (WHERE status = 'unread' AND type = 'mention') as mention_count,
      COUNT(*) FILTER (WHERE status = 'unread' AND priority = 'high') as high_priority_count,
      COUNT(*) as total_count
    FROM notifications
    WHERE user_id = $1
      AND deleted_at IS NULL;
    `,
    [userId],
  );

  return result.rows[0];
}
```

### Example: Status Summary

```typescript
// revision-count-refresh-worker.service.ts
async getRevisionCountsByStatus(projectId: string): Promise<StatusCounts> {
  const result = await this.db.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      COUNT(*) as total_count
    FROM revisions
    WHERE project_id = $1;
    `,
    [projectId],
  );

  return result.rows[0];
}
```

### Comparison: COUNT FILTER vs Multiple Queries

❌ **Bad - Multiple Queries**

```typescript
const unread = await this.db.query(
  `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND status = 'unread'`,
  [userId]
);
const mentions = await this.db.query(
  `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND status = 'unread' AND type = 'mention'`,
  [userId]
);
const highPriority = await this.db.query(
  `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND status = 'unread' AND priority = 'high'`,
  [userId]
);
// 3 queries
```

✅ **Good - Single Query with COUNT FILTER**

```typescript
const result = await this.db.query(
  `
  SELECT 
    COUNT(*) FILTER (WHERE status = 'unread') as unread_count,
    COUNT(*) FILTER (WHERE status = 'unread' AND type = 'mention') as mention_count,
    COUNT(*) FILTER (WHERE status = 'unread' AND priority = 'high') as high_priority_count
  FROM notifications
  WHERE user_id = $1;
  `,
  [userId]
);
// 1 query (90% faster)
```

### Aggregate Functions with FILTER

| Function                      | Description         | Example                                      |
| ----------------------------- | ------------------- | -------------------------------------------- |
| `COUNT(*) FILTER (...)`       | Conditional count   | `COUNT(*) FILTER (WHERE status = 'active')`  |
| `SUM(col) FILTER (...)`       | Conditional sum     | `SUM(amount) FILTER (WHERE type = 'sale')`   |
| `AVG(col) FILTER (...)`       | Conditional average | `AVG(rating) FILTER (WHERE verified = true)` |
| `MAX(col) FILTER (...)`       | Conditional maximum | `MAX(score) FILTER (WHERE passed = true)`    |
| `array_agg(col) FILTER (...)` | Conditional array   | `array_agg(id) FILTER (WHERE active = true)` |

### Best Practices

1. **Use for dashboard/badge counts** - Single query for multiple counts
2. **PostgreSQL 9.4+ standard** - Not a hack, official syntax
3. **More efficient than CASE WHEN** - Easier to read and maintain
4. **Combine with GROUP BY** - For per-group counts

### Advanced Example: Grouped Counts

```typescript
async getCountsByProject(): Promise<ProjectCounts[]> {
  const result = await this.db.query(
    `
    SELECT
      project_id,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
      COUNT(*) as total_count
    FROM tasks
    GROUP BY project_id
    ORDER BY total_count DESC;
    `,
  );

  return result.rows;
}
```

---

## Pattern 9: LATERAL Subqueries

### Description

LATERAL joins enable correlated subqueries that can reference previous FROM items.

### When to Use

- Batch processing with per-item subqueries
- Reducing N+1 queries to 1 query
- Complex correlated logic

### Services Using This Pattern

- DiscoveryJobService (batch type discovery)

### Example: Batch Processing

```typescript
// discovery-job.service.ts
async discoverTypesForBatch(items: string[]): Promise<DiscoveredType[]> {
  const result = await this.db.query(
    `
    SELECT
      item.name,
      result.*
    FROM unnest($1::text[]) AS item(name),
    LATERAL (
      -- Correlated subquery for each item
      SELECT
        t.id,
        t.schema,
        t.properties
      FROM graph.types t
      WHERE t.name = item.name
      LIMIT 1
    ) AS result;
    `,
    [items],
  );

  return result.rows;
}
```

### Example: Top N Per Group

```typescript
async getTopDocumentsPerProject(
  projectIds: string[],
  limit = 5,
): Promise<Document[]> {
  const result = await this.db.query(
    `
    SELECT
      p.project_id,
      d.*
    FROM unnest($1::uuid[]) AS p(project_id),
    LATERAL (
      SELECT * FROM documents
      WHERE project_id = p.project_id
      ORDER BY view_count DESC
      LIMIT $2
    ) AS d;
    `,
    [projectIds, limit],
  );

  return result.rows;
}
```

### Comparison: N+1 vs LATERAL

❌ **Bad - N+1 Queries**

```typescript
const results = [];
for (const item of items) {
  const result = await this.db.query(`SELECT * FROM process_item($1)`, [item]);
  results.push(result.rows[0]);
}
// N queries
```

✅ **Good - Single Query with LATERAL**

```typescript
const result = await this.db.query(
  `
  SELECT item.*, result.*
  FROM unnest($1::text[]) AS item,
  LATERAL (
    SELECT * FROM process_item(item)
  ) AS result;
  `,
  [items]
);
// 1 query (90% fewer database calls)
```

### Best Practices

1. **Use for batch processing** - Reduces N queries to 1
2. **Combine with unnest()** - Process arrays efficiently
3. **Can reference previous FROM items** - Unlike regular subqueries
4. **Use for top-N-per-group queries** - More efficient than window functions

---

## Pattern 10: JSON Path Queries (jsonb_path_query_array)

### Description

PostgreSQL 12+ JSON path syntax for extracting nested data from JSONB columns.

### When to Use

- Schema introspection
- Extracting nested arrays/objects
- Complex JSON filtering
- Avoiding application-level iteration

### Services Using This Pattern

- DiscoveryJobService (type schema introspection)

### Example: Extract Nested Types

```typescript
// discovery-job.service.ts
async discoverRelationships(typeId: string): Promise<Relationship[]> {
  const result = await this.db.query(
    `
    SELECT
      t.id,
      t.name,
      jsonb_path_query_array(
        t.schema,
        '$.properties[*] ? (@.type == "object").title'
      ) as nested_types
    FROM discovered_types t
    WHERE t.id = $1;
    `,
    [typeId],
  );

  return result.rows;
}
```

### Example: Filter JSONB Arrays

```typescript
async findDocumentsWithTag(tag: string): Promise<Document[]> {
  const result = await this.db.query(
    `
    SELECT * FROM documents
    WHERE jsonb_path_exists(
      metadata,
      '$.tags[*] ? (@ == $tag)'
    );
    `,
    [{ tag }],
  );

  return result.rows;
}
```

### JSON Path Operators

| Operator        | Description       | Example                        |
| --------------- | ----------------- | ------------------------------ |
| `$`             | Root object       | `$.user`                       |
| `.key`          | Object key        | `$.user.name`                  |
| `[*]`           | Array elements    | `$.items[*]`                   |
| `[0]`           | Array index       | `$.items[0]`                   |
| `? (condition)` | Filter            | `$.items[*] ? (@.price > 100)` |
| `@`             | Current element   | `@ > 10`                       |
| `**`            | Recursive descent | `$**.price`                    |

### Functions

| Function                             | Description                    | Returns     |
| ------------------------------------ | ------------------------------ | ----------- |
| `jsonb_path_exists(data, path)`      | Check if path exists           | boolean     |
| `jsonb_path_query(data, path)`       | Query path (one row per match) | setof jsonb |
| `jsonb_path_query_array(data, path)` | Query path (array of matches)  | jsonb       |
| `jsonb_path_query_first(data, path)` | Query path (first match)       | jsonb       |

### Best Practices

1. **Use for complex JSON queries** - More efficient than application-level parsing
2. **PostgreSQL 12+ required** - Older versions don't support JSON path
3. **Index JSONB columns** - Use GIN indexes for performance
4. **Prefer JSONB over JSON** - JSONB is binary format (faster)

---

## Pattern 11: Custom Projections (row_to_json)

### Description

Build custom JSON responses with nested data in a single query.

### When to Use

- API responses with nested structures
- Avoiding N+1 queries for related data
- Custom JSON formatting
- GraphQL-style data fetching

### Services Using This Pattern

- TemplatePackService (template pack details)

### Example: Nested JSON Response

```typescript
// template-pack.service.ts
async getTemplatePackDetails(packId: string): Promise<any> {
  const result = await this.db.query(
    `
    SELECT row_to_json((
      SELECT r FROM (
        SELECT
          tp.id,
          tp.name,
          tp.description,
          (
            SELECT array_agg(row_to_json(t.*))
            FROM templates t
            WHERE t.pack_id = tp.id
          ) as templates,
          (
            SELECT row_to_json(o.*)
            FROM organizations o
            WHERE o.id = tp.organization_id
          ) as organization
      ) r
    )) as result
    FROM template_packs tp
    WHERE tp.id = $1;
    `,
    [packId],
  );

  return result.rows[0]?.result || null;
}
```

### Example: Array Aggregation with JSON

```typescript
async getUsersWithProjects(): Promise<any[]> {
  const result = await this.db.query(
    `
    SELECT row_to_json((
      SELECT r FROM (
        SELECT
          u.id,
          u.name,
          u.email,
          (
            SELECT array_agg(row_to_json(p.*))
            FROM projects p
            WHERE p.owner_id = u.id
          ) as projects
      ) r
    )) as result
    FROM users u;
    `,
  );

  return result.rows.map(row => row.result);
}
```

### Related Functions

| Function                            | Description                                |
| ----------------------------------- | ------------------------------------------ |
| `row_to_json(record)`               | Convert row to JSON object                 |
| `array_to_json(array)`              | Convert array to JSON array                |
| `array_agg(value)`                  | Aggregate values into array                |
| `jsonb_build_object(key, val, ...)` | Build JSON object from key-value pairs     |
| `jsonb_build_array(val, ...)`       | Build JSON array from values               |
| `jsonb_object_agg(key, val)`        | Aggregate key-value pairs into JSON object |

### Best Practices

1. **Use for complex nested responses** - Single query vs multiple queries
2. **Combine with subqueries** - Build nested structures
3. **Use array_agg() for one-to-many** - Aggregate related records
4. **Consider performance** - Large nested structures can be slow

---

## Pattern 12: RLS Context Setup

### Description

Set PostgreSQL session variables for Row-Level Security (RLS) enforcement.

### When to Use

- Multi-tenant data isolation
- Row-Level Security enforcement
- Transaction-scoped context

### Services Using This Pattern

- TemplatePackService (template assignment)

### Example: RLS Context in Transaction

```typescript
// template-pack.service.ts
async assignTemplatePack(
  packId: string,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Set RLS context for transaction
    await queryRunner.query(
      `SET LOCAL app.project_id = $1`,
      [projectId],
    );
    await queryRunner.query(
      `SET LOCAL app.organization_id = $1`,
      [organizationId],
    );

    // Operations now respect RLS policies
    await queryRunner.query(
      `
      INSERT INTO project_template_packs (project_id, pack_id)
      VALUES ($1, $2);
      `,
      [projectId, packId],
    );

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
```

### Example: RLS Policy

```sql
-- Enable RLS on table
ALTER TABLE project_template_packs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy using session variable
CREATE POLICY project_isolation ON project_template_packs
FOR ALL
USING (
  project_id = current_setting('app.project_id')::uuid
);

-- Create policy for organization isolation
CREATE POLICY org_isolation ON project_template_packs
FOR ALL
USING (
  project_id IN (
    SELECT id FROM projects
    WHERE organization_id = current_setting('app.organization_id')::uuid
  )
);
```

### Session Variable Functions

| Function                       | Description                           |
| ------------------------------ | ------------------------------------- |
| `SET LOCAL var = val`          | Set transaction-scoped variable       |
| `SET SESSION var = val`        | Set session-scoped variable           |
| `SET var = val`                | Alias for SET SESSION                 |
| `current_setting('var')`       | Get variable value                    |
| `current_setting('var', true)` | Get variable (return NULL if missing) |

### Best Practices

1. **Use SET LOCAL in transactions** - Auto-resets after transaction
2. **Set context before operations** - Ensure RLS is enforced
3. **Use current_setting() in policies** - Reference session variables
4. **Handle missing variables gracefully** - Use `current_setting('var', true)`
5. **Document RLS policies** - Explain what isolation is enforced

---

## Best Practices

### General Guidelines

1. **Use Strategic SQL for PostgreSQL features** - Don't emulate in application code
2. **Document why Strategic SQL is used** - Explain the benefit over TypeORM
3. **Keep SQL readable** - Use formatting, comments, CTEs
4. **Use named parameters** - `$1`, `$2` with clear variable names
5. **Test edge cases** - NULL values, empty results, large datasets

### Performance

1. **Use EXPLAIN ANALYZE** - Profile queries before production
2. **Add indexes** - For columns used in WHERE, JOIN, ORDER BY
3. **Monitor slow queries** - Use pgBadger or slow query log
4. **Batch operations** - Process multiple items in single query
5. **Avoid N+1 queries** - Use JOINs or LATERAL

### Security

1. **Always use parameterized queries** - Never concatenate user input
2. **Validate input** - Check types, ranges, formats
3. **Use least privilege** - Database users should have minimal permissions
4. **Encrypt sensitive data** - Use pgcrypto for credentials
5. **Audit sensitive operations** - Log who accessed what data

### Maintainability

1. **Extract complex queries to service methods** - Don't inline in controllers
2. **Use TypeScript interfaces for results** - Type safety for query results
3. **Add JSDoc comments** - Explain what query does and why
4. **Version control migrations** - Track schema changes
5. **Write integration tests** - Test actual queries against database

---

## When to Use vs TypeORM

### Decision Matrix

| Requirement          | Use Strategic SQL | Use TypeORM     |
| -------------------- | ----------------- | --------------- |
| Simple CRUD          | ❌                | ✅ Repository   |
| Complex filtering    | ❌                | ✅ QueryBuilder |
| PostgreSQL-specific  | ✅ Raw SQL        | ❌              |
| Performance-critical | ✅ Raw SQL        | ❌              |
| Transactions         | ❌                | ✅ QueryRunner  |
| Portability needed   | ❌                | ✅ TypeORM      |

### Examples by Category

**TypeORM Repository**: `/docs/patterns/TYPEORM_PATTERNS.md#pattern-1`

- Create, read, update, delete single entities
- Simple queries without complex logic

**TypeORM QueryBuilder**: `/docs/patterns/TYPEORM_PATTERNS.md#pattern-2`

- Multiple WHERE conditions
- Dynamic filtering
- JOINs across relations

**TypeORM QueryRunner**: `/docs/patterns/TYPEORM_PATTERNS.md#pattern-3`

- Multi-step atomic operations
- Transactions with validation between steps

**Strategic SQL**: This document

- PostgreSQL-specific features
- Performance-critical operations
- Complex aggregations

---

## Summary

### Key Takeaways

1. **Use Strategic SQL for PostgreSQL features** - Advisory locks, recursive CTEs, full-text search
2. **Performance matters** - 10x-100x faster for complex operations
3. **Document why** - Explain why Strategic SQL is better than TypeORM
4. **Test thoroughly** - Integration tests against real database
5. **Monitor performance** - Use EXPLAIN ANALYZE and slow query logs

### Quick Reference

| Pattern                | Use Case                  | Service Example                   |
| ---------------------- | ------------------------- | --------------------------------- |
| Advisory Locks         | Race condition prevention | GraphService, TagService          |
| Recursive CTEs         | Graph/tree traversal      | PathSummaryService, BranchService |
| Full-Text Search       | Linguistic search         | SearchService, GraphService       |
| Vector Similarity      | Semantic search           | SearchService                     |
| FOR UPDATE SKIP LOCKED | Job queues                | EmbeddingJobsService              |
| pgcrypto               | Credential encryption     | EncryptionService                 |
| IS NOT DISTINCT FROM   | Null-safe comparison      | BranchService, ChatService        |
| COUNT FILTER           | Conditional aggregation   | NotificationsService              |
| LATERAL                | Batch processing          | DiscoveryJobService               |
| jsonb_path_query_array | JSON extraction           | DiscoveryJobService               |
| row_to_json            | Custom projections        | TemplatePackService               |
| RLS Context            | Multi-tenant isolation    | TemplatePackService               |

---

## Next Steps

- Read [TYPEORM_PATTERNS.md](./TYPEORM_PATTERNS.md) for TypeORM patterns
- Review [MIGRATION_TRACKING.md](../migrations/MIGRATION_TRACKING.md) for migration status
- See [TYPEORM_MIGRATION_SUMMARY.md](../migrations/TYPEORM_MIGRATION_SUMMARY.md) for overall statistics

---

**Questions or suggestions?** Open an issue or submit a PR to improve this guide!
