-- Graph Search Initial Migration (placeholder)
-- NOTE: Adjust sequential number to match migration tooling conventions.
BEGIN;

-- Embedding versioned columns (initial v1)
ALTER TABLE
    graph_objects
ADD
    COLUMN IF NOT EXISTS embedding_v1 vector(1536),
ADD
    COLUMN IF NOT EXISTS embedding_v2 vector(1536),
ADD
    COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- Full text search tsvector column (composite weighting TBD)
ALTER TABLE
    graph_objects
ADD
    COLUMN IF NOT EXISTS tsv tsvector;

-- Coverage metrics table
CREATE TABLE IF NOT EXISTS graph_embedding_coverage (
    model_version int NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NULL,
    objects_total int NOT NULL DEFAULT 0,
    objects_embedded int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (model_version, org_id, project_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_graph_objects_tsv ON graph_objects USING GIN (tsv);

CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding_v1 ON graph_objects USING HNSW (embedding_v1 vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding_v2 ON graph_objects USING HNSW (embedding_v2 vector_cosine_ops);

COMMIT;