-- Migration: Initial base schema (replaces ensureSchema())
-- Date: 2025-10-24
-- Purpose: Create all base tables that applications depend on.
--          This migration replaces the dynamic ensureSchema() method with
--          a single source of truth for schema definition.
--
-- CRITICAL: subject_id columns are TEXT not UUID to support non-UUID auth providers

BEGIN;

-- Extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Schemas
CREATE SCHEMA IF NOT EXISTS kb;
CREATE SCHEMA IF NOT EXISTS core;

-- ============================================================================
-- Core Schema: User Management
-- ============================================================================

-- User profiles with TEXT subject_id (NOT UUID)
CREATE TABLE IF NOT EXISTS core.user_profiles (
    subject_id TEXT PRIMARY KEY,
    first_name TEXT NULL,
    last_name TEXT NULL,
    display_name TEXT NULL,
    phone_e164 TEXT NULL,
    avatar_object_key TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User emails
CREATE TABLE IF NOT EXISTS core.user_emails (
    subject_id TEXT NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(subject_id, email)
);

-- ============================================================================
-- KB Schema: Organization & Project Management
-- ============================================================================

-- Organizations
CREATE TABLE IF NOT EXISTS kb.orgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orgs_name ON kb.orgs(LOWER(name));

-- Projects
CREATE TABLE IF NOT EXISTS kb.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kb_purpose TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_lower_name ON kb.projects(org_id, LOWER(name));

-- Organization memberships (TEXT subject_id)
CREATE TABLE IF NOT EXISTS kb.organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('org_admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_unique ON kb.organization_memberships(org_id, subject_id);

-- Project memberships (TEXT subject_id)
CREATE TABLE IF NOT EXISTS kb.project_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_membership_unique ON kb.project_memberships(project_id, subject_id);

-- Invites
CREATE TABLE IF NOT EXISTS kb.invites (
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
);
CREATE INDEX IF NOT EXISTS idx_invites_token ON kb.invites(token);

-- ============================================================================
-- KB Schema: Documents & Search
-- ============================================================================

-- Documents
CREATE TABLE IF NOT EXISTS kb.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    source_url TEXT,
    filename TEXT,
    mime_type TEXT,
    content TEXT,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_org ON kb.documents(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON kb.documents(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_project_hash ON kb.documents(project_id, content_hash);

-- Trigger for automatic content_hash computation
CREATE OR REPLACE FUNCTION kb.compute_document_content_hash()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_hash := encode(digest(coalesce(NEW.content, ''), 'sha256'), 'hex');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_content_hash ON kb.documents;
CREATE TRIGGER trg_documents_content_hash
    BEFORE INSERT OR UPDATE OF content ON kb.documents
    FOR EACH ROW EXECUTE FUNCTION kb.compute_document_content_hash();

-- Chunks (embeddings vector dimension 768 by default)
CREATE TABLE IF NOT EXISTS kb.chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    text TEXT NOT NULL,
    embedding vector(768),
    tsv tsvector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON kb.chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON kb.chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON kb.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_chunkindex ON kb.chunks(document_id, chunk_index);

-- Trigger for automatic tsvector computation
CREATE OR REPLACE FUNCTION kb.update_tsv()
RETURNS trigger AS $$
BEGIN
    NEW.tsv := to_tsvector('simple', NEW.text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chunks_tsv ON kb.chunks;
CREATE TRIGGER trg_chunks_tsv
    BEFORE INSERT OR UPDATE ON kb.chunks
    FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();

-- ============================================================================
-- KB Schema: Chat
-- ============================================================================

-- Chat conversations (TEXT owner_subject_id)
CREATE TABLE IF NOT EXISTS kb.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    owner_subject_id TEXT NULL REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL,
    is_private BOOLEAN NOT NULL DEFAULT true,
    org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL,
    project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON kb.chat_conversations(owner_subject_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_org_proj ON kb.chat_conversations(org_id, project_id, updated_at DESC);

-- Chat messages
CREATE TABLE IF NOT EXISTS kb.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    citations JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON kb.chat_messages(conversation_id, created_at ASC);

-- ============================================================================
-- KB Schema: Graph & Branches
-- ============================================================================

-- Branches
CREATE TABLE IF NOT EXISTS kb.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NULL,
    name TEXT NOT NULL,
    parent_branch_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, name)
);

-- Branch lineage (ancestor relationships)
CREATE TABLE IF NOT EXISTS kb.branch_lineage (
    branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE,
    ancestor_branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE,
    depth INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(branch_id, ancestor_branch_id)
);
CREATE INDEX IF NOT EXISTS idx_branch_lineage_ancestor_depth ON kb.branch_lineage(ancestor_branch_id, depth);

-- Merge provenance (version merge tracking)
CREATE TABLE IF NOT EXISTS kb.merge_provenance (
    child_version_id UUID NOT NULL,
    parent_version_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('source','target','base')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(child_version_id, parent_version_id, role)
);

-- Product versions (release snapshots)
CREATE TABLE IF NOT EXISTS kb.product_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NULL,
    base_product_version_id UUID NULL REFERENCES kb.product_versions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_versions_project_name ON kb.product_versions(project_id, LOWER(name));

-- Product version members
CREATE TABLE IF NOT EXISTS kb.product_version_members (
    product_version_id UUID NOT NULL REFERENCES kb.product_versions(id) ON DELETE CASCADE,
    object_canonical_id UUID NOT NULL,
    object_version_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(product_version_id, object_canonical_id)
);
CREATE INDEX IF NOT EXISTS idx_product_version_members_version ON kb.product_version_members(product_version_id, object_version_id);

-- Graph objects (vector dimension 768 by default)
CREATE TABLE IF NOT EXISTS kb.graph_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NULL,
    branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    key TEXT NULL,
    version INT NOT NULL DEFAULT 1,
    supersedes_id UUID NULL,
    canonical_id UUID NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    labels TEXT[] NOT NULL DEFAULT '{}',
    deleted_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    change_summary JSONB NULL,
    content_hash BYTEA NULL,
    fts tsvector NULL,
    embedding BYTEA NULL,
    embedding_updated_at TIMESTAMPTZ NULL,
    embedding_vec vector(768) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical ON kb.graph_objects(canonical_id);
CREATE INDEX IF NOT EXISTS idx_graph_objects_key ON kb.graph_objects(key) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_objects_not_deleted ON kb.graph_objects(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical_version ON kb.graph_objects(canonical_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_graph_objects_fts ON kb.graph_objects USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_graph_objects_branch_canonical_version ON kb.graph_objects(branch_id, canonical_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_graph_objects_branch_not_deleted ON kb.graph_objects(project_id, branch_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_objects_head_identity_branch ON kb.graph_objects(project_id, branch_id, type, key) WHERE supersedes_id IS NULL AND deleted_at IS NULL AND key IS NOT NULL;

-- Attempt ivfflat index (may fail if pgvector not available)
DO $$ BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding_vec ON kb.graph_objects USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists=100)';
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Vector index creation skipped (pgvector not available)';
END $$;

-- Graph relationships
CREATE TABLE IF NOT EXISTS kb.graph_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NULL,
    branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    src_id UUID NOT NULL,
    dst_id UUID NOT NULL,
    version INT NOT NULL DEFAULT 1,
    supersedes_id UUID NULL,
    canonical_id UUID NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    deleted_at TIMESTAMPTZ NULL,
    change_summary JSONB NULL,
    content_hash BYTEA NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical ON kb.graph_relationships(canonical_id);
CREATE INDEX IF NOT EXISTS idx_graph_rel_not_deleted ON kb.graph_relationships(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical_version ON kb.graph_relationships(canonical_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_graph_rel_branch_canonical_version ON kb.graph_relationships(branch_id, canonical_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_graph_rel_branch_not_deleted ON kb.graph_relationships(project_id, branch_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_relationships_head_identity_branch ON kb.graph_relationships(project_id, branch_id, type, src_id, dst_id) WHERE supersedes_id IS NULL AND deleted_at IS NULL;

-- Object type schemas
CREATE TABLE IF NOT EXISTS kb.object_type_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NULL,
    type TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    supersedes_id UUID NULL,
    canonical_id UUID NULL,
    json_schema JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_object_type_schemas_head_identity ON kb.object_type_schemas(project_id, type) WHERE supersedes_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_object_type_schemas_canonical_version ON kb.object_type_schemas(canonical_id, version DESC);

-- Relationship type schemas
CREATE TABLE IF NOT EXISTS kb.relationship_type_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NULL,
    type TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    supersedes_id UUID NULL,
    canonical_id UUID NULL,
    json_schema JSONB NOT NULL,
    multiplicity JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_type_schemas_head_identity ON kb.relationship_type_schemas(project_id, type) WHERE supersedes_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_relationship_type_schemas_canonical_version ON kb.relationship_type_schemas(canonical_id, version DESC);

-- Graph embedding jobs
CREATE TABLE IF NOT EXISTS kb.graph_embedding_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending','processing','failed','completed')),
    attempt_count INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    priority INT NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_status_sched ON kb.graph_embedding_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs(object_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object_pending ON kb.graph_embedding_jobs(object_id) WHERE status IN ('pending','processing');

-- Embedding policies
CREATE TABLE IF NOT EXISTS kb.embedding_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    max_property_size INT DEFAULT 10000,
    required_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
    excluded_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
    relevant_paths TEXT[] NOT NULL DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, object_type)
);
CREATE INDEX IF NOT EXISTS idx_embedding_policies_project ON kb.embedding_policies(project_id);

-- ============================================================================
-- KB Schema: Template Packs
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb.graph_template_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    author TEXT,
    license TEXT,
    repository_url TEXT,
    documentation_url TEXT,
    object_type_schemas JSONB NOT NULL DEFAULT '{}',
    relationship_type_schemas JSONB NOT NULL DEFAULT '{}',
    ui_configs JSONB NOT NULL DEFAULT '{}',
    extraction_prompts JSONB NOT NULL DEFAULT '{}',
    sql_views JSONB DEFAULT '[]',
    signature TEXT,
    checksum TEXT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deprecated_at TIMESTAMPTZ,
    superseded_by UUID REFERENCES kb.graph_template_packs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, version)
);
CREATE INDEX IF NOT EXISTS idx_template_packs_name ON kb.graph_template_packs(name);

CREATE TABLE IF NOT EXISTS kb.project_template_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    template_pack_id UUID NOT NULL REFERENCES kb.graph_template_packs(id) ON DELETE RESTRICT,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    installed_by UUID NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    customizations JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, template_pack_id)
);
CREATE INDEX IF NOT EXISTS idx_project_template_packs_project ON kb.project_template_packs(project_id, active);

CREATE TABLE IF NOT EXISTS kb.project_object_type_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('template', 'custom', 'discovered')),
    template_pack_id UUID REFERENCES kb.graph_template_packs(id) ON DELETE CASCADE,
    schema_version INT NOT NULL DEFAULT 1,
    json_schema JSONB NOT NULL,
    ui_config JSONB DEFAULT '{}',
    extraction_config JSONB DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    discovery_confidence REAL,
    description TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, type)
);
CREATE INDEX IF NOT EXISTS idx_project_type_registry_project ON kb.project_object_type_registry(project_id, enabled);

-- ============================================================================
-- KB Schema: Settings & System
-- ============================================================================

-- Settings
CREATE TABLE IF NOT EXISTS kb.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settings_key ON kb.settings(key);

-- Set default canonical_id values for existing rows
UPDATE kb.graph_objects SET canonical_id = id WHERE canonical_id IS NULL;
UPDATE kb.graph_relationships SET canonical_id = id WHERE canonical_id IS NULL;
UPDATE kb.object_type_schemas SET canonical_id = id WHERE canonical_id IS NULL;
UPDATE kb.relationship_type_schemas SET canonical_id = id WHERE canonical_id IS NULL;
UPDATE kb.relationship_type_schemas SET multiplicity = jsonb_build_object('src','many','dst','many') WHERE multiplicity IS NULL;

COMMIT;
