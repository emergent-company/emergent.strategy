-- Enable pgvector and create base schema for documents and chunks
CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS kb;

-- Documents table stores raw sources
CREATE TABLE IF NOT EXISTS kb.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT,
    filename TEXT,
    mime_type TEXT,
    content TEXT,
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chunks table with embedding vector and FTS
CREATE TABLE IF NOT EXISTS kb.chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    text TEXT NOT NULL,
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FTS configuration using a materialized tsvector column for chunks
ALTER TABLE
    kb.chunks
ADD
    COLUMN IF NOT EXISTS tsv tsvector;

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON kb.chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON kb.chunks USING GIN (tsv);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON kb.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Trigger function to keep tsvector updated (idempotent)
CREATE OR REPLACE FUNCTION kb.update_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.tsv := to_tsvector('simple', NEW.text);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chunks_tsv ON kb.chunks;

CREATE TRIGGER trg_chunks_tsv BEFORE
INSERT
    OR
UPDATE
    ON kb.chunks FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();

-- Unique constraints and helpful indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_chunkindex ON kb.chunks(document_id, chunk_index);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON kb.documents(content_hash);

-- Zitadel user and database creation moved to 01-init-zitadel.sh
-- (allows using ZITADEL_DB_PASSWORD environment variable)