-- ============================================================================
-- Initial Schema Migration (Consolidated)
-- ============================================================================
-- This migration creates the complete initial database schema.
-- 
-- Key Standards:
-- - All organization references use 'organization_id' (not 'org_id')
-- - No 'tenant_id' columns (removed after migration to single tenant per org)
-- - Row Level Security (RLS) enabled on all multi-tenant tables
-- - RLS policies use app.current_organization_id session variable
--
-- Tables Created: 36
-- - Core: orgs, projects, organization_memberships, invites, users
-- - Documents: documents, chunks, document_versions
-- - Graph: graph_objects, graph_relationships, object_extraction_jobs
-- - Discovery: discovery_jobs, product_versions
-- - Chat: chat_conversations, chat_messages
-- - Templates: template_packs, project_template_packs, builtin_pack_sources
-- - Integrations: integrations
-- - Tags: tags (for product version tagging)
-- - System: system_process_logs, notifications, llm_call_logs, mcp_tool_calls
-- - Settings: kb.settings
--
-- Date: 2025-01-24 (Consolidated from 8 migrations)
-- ============================================================================
-- ============================================================================
-- Initial Schema Migration (Consolidated)
-- ============================================================================
-- This migration creates the complete initial database schema.
-- 
-- Key Standards:
-- - All organization references use 'organization_id' (not 'org_id')
-- - No 'tenant_id' columns (removed after migration to single tenant per org)
-- - Row Level Security (RLS) enabled on all multi-tenant tables
-- - RLS policies use app.current_organization_id session variable
--
-- Tables Created: 36
-- - Core: orgs, projects, organization_memberships, invites, users
-- - Documents: documents, chunks, document_versions
-- - Graph: graph_objects, graph_relationships, object_extraction_jobs
-- - Discovery: discovery_jobs, product_versions
-- - Chat: chat_conversations, chat_messages
-- - Templates: template_packs, project_template_packs, builtin_pack_sources
-- - Integrations: integrations
-- - Tags: tags (for product version tagging)
-- - System: system_process_logs, notifications, llm_call_logs, mcp_tool_calls
-- - Settings: kb.settings
--
-- Date: 2025-01-24 (Consolidated from 8 migrations)
-- ============================================================================
-- Migration: Complete Initial Schema
-- Description: Consolidated schema including all tables, functions, triggers, and RLS policies
-- Date: 2025-10-24
-- ============================================================================
-- 
-- This migration consolidates all previous migrations into a single complete schema.
-- It includes:
-- - All core tables (organizations, projects, documents, chunks, etc.)
-- - Graph system (objects, relationships, types)
-- - Integrations system
-- - Object extraction jobs with proper column names (organization_id, created_objects)
-- - Notifications with full schema (read_at, importance, cleared_at, etc.)
-- - Discovery jobs system
-- - Monitoring and logging tables
-- - All RLS policies for multi-tenancy
-- - All functions and triggers
--
-- Generated from: pg_dump of working database schema
-- ============================================================================
--
-- PostgreSQL database dump
--

-- Dumped from database version 16.10 (Debian 16.10-1.pgdg12+1)
-- Dumped by pg_dump version 16.10 (Debian 16.10-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

SELECT pg_catalog.set_config('search_path', '', false);

SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

SET
    row_security = off;

--
-- Name: kb; Type: SCHEMA; Schema: -; Owner: spec
--
CREATE SCHEMA kb;

ALTER SCHEMA kb OWNER TO spec;

--
-- Name: compute_document_content_hash(); Type: FUNCTION; Schema: kb; Owner: spec
--
CREATE FUNCTION kb.compute_document_content_hash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.content_hash := encode(
    digest(coalesce(NEW.content, ''), 'sha256'),
    'hex'
);

RETURN NEW;

END;

$$;

ALTER FUNCTION kb.compute_document_content_hash() OWNER TO spec;

--
-- Name: update_tsv(); Type: FUNCTION; Schema: kb; Owner: spec
--
CREATE FUNCTION kb.update_tsv() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.tsv := to_tsvector('simple', NEW.text);

RETURN NEW;

END;

$$;

ALTER FUNCTION kb.update_tsv() OWNER TO spec;

SET
    default_tablespace = '';

SET
    default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.audit_log (
    id bigint NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    outcome text NOT NULL,
    user_id text,
    user_email text,
    resource_type text,
    resource_id text,
    action text NOT NULL,
    endpoint text NOT NULL,
    http_method text NOT NULL,
    status_code integer,
    error_code text,
    error_message text,
    ip_address text,
    user_agent text,
    request_id text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.audit_log OWNER TO spec;

--
-- Name: TABLE audit_log; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.audit_log IS 'Authorization and access audit trail for compliance and security analysis';

--
-- Name: COLUMN audit_log.event_type; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.audit_log.event_type IS 'Type of event: auth.*, authz.*, resource.*, search.*, graph.*';

--
-- Name: COLUMN audit_log.outcome; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.audit_log.outcome IS 'Result of operation: success, failure, denied';

--
-- Name: COLUMN audit_log.details; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.audit_log.details IS 'JSONB field containing scopes, missing_scopes, and custom metadata';

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: kb; Owner: spec
--
CREATE SEQUENCE kb.audit_log_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE kb.audit_log_id_seq OWNER TO spec;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: kb; Owner: spec
--
ALTER SEQUENCE kb.audit_log_id_seq OWNED BY kb.audit_log.id;

--
-- Name: branch_lineage; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.branch_lineage (
    branch_id uuid NOT NULL,
    ancestor_branch_id uuid NOT NULL,
    depth integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.branch_lineage OWNER TO spec;

--
-- Name: branches; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid,
    name text NOT NULL,
    parent_branch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.branches OWNER TO spec;

--
-- Name: chat_conversations; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    owner_subject_id text,
    is_private boolean DEFAULT true NOT NULL,
    organization_id uuid,
    project_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.chat_conversations OWNER TO spec;

--
-- Name: chat_messages; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    citations jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK (
        (
            role = ANY (
                ARRAY ['user'::text, 'assistant'::text, 'system'::text]
            )
        )
    )
);

ALTER TABLE
    kb.chat_messages OWNER TO spec;

--
-- Name: chunks; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    text text NOT NULL,
    embedding public.vector(768),
    tsv tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.chunks OWNER TO spec;

--
-- Name: clickup_sync_state; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.clickup_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    last_full_import_at timestamp with time zone,
    last_workspace_sync_at timestamp with time zone,
    last_space_sync_at timestamp with time zone,
    last_folder_sync_at timestamp with time zone,
    last_list_sync_at timestamp with time zone,
    last_task_sync_at timestamp with time zone,
    sync_cursor text,
    workspace_cursor jsonb,
    active_import_job_id uuid,
    import_status character varying(50),
    total_imported_objects integer DEFAULT 0,
    total_synced_tasks integer DEFAULT 0,
    total_synced_lists integer DEFAULT 0,
    total_synced_spaces integer DEFAULT 0,
    last_error text,
    last_error_at timestamp with time zone,
    consecutive_failures integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.clickup_sync_state OWNER TO spec;

--
-- Name: TABLE clickup_sync_state; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.clickup_sync_state IS 'Tracks synchronization state for ClickUp integrations';

--
-- Name: COLUMN clickup_sync_state.sync_cursor; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.clickup_sync_state.sync_cursor IS 'Cursor for incremental sync (pagination token, timestamp, etc.)';

--
-- Name: COLUMN clickup_sync_state.workspace_cursor; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.clickup_sync_state.workspace_cursor IS 'Per-workspace sync cursors for parallel synchronization';

--
-- Name: discovery_jobs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.discovery_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    status text NOT NULL,
    progress jsonb DEFAULT '{"message": "Initializing...", "total_steps": 0, "current_step": 0}' :: jsonb NOT NULL,
    config jsonb DEFAULT '{}' :: jsonb NOT NULL,
    kb_purpose text NOT NULL,
    discovered_types jsonb DEFAULT '[]' :: jsonb,
    discovered_relationships jsonb DEFAULT '[]' :: jsonb,
    template_pack_id uuid,
    error_message text,
    retry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discovery_jobs_status_check CHECK (
        (
            status = ANY (
                ARRAY ['pending'::text, 'analyzing_documents'::text, 'extracting_types'::text, 'refining_schemas'::text, 'creating_pack'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]
            )
        )
    )
);

ALTER TABLE
    kb.discovery_jobs OWNER TO spec;

--
-- Name: TABLE discovery_jobs; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.discovery_jobs IS 'Background jobs for automatic discovery of object types and relationships from documents using LLM analysis. Each job analyzes a set of documents based on KB purpose and generates a custom template pack for review and installation.';

--
-- Name: COLUMN discovery_jobs.progress; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.discovery_jobs.progress IS 'Current progress state: {current_step: number, total_steps: number, message: string}';

--
-- Name: COLUMN discovery_jobs.config; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.discovery_jobs.config IS 'Job configuration including document_ids (array), batch_size (int), min_confidence (float 0-1), include_relationships (bool), max_iterations (int)';

--
-- Name: COLUMN discovery_jobs.discovered_types; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.discovery_jobs.discovered_types IS 'Array of discovered type candidates: [{type_name, description, confidence, properties, required_properties, examples, frequency}]';

--
-- Name: COLUMN discovery_jobs.discovered_relationships; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.discovery_jobs.discovered_relationships IS 'Array of discovered relationships: [{source_type, target_type, relation_type, description, confidence, cardinality}]';

--
-- Name: discovery_type_candidates; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.discovery_type_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    batch_number integer NOT NULL,
    type_name text NOT NULL,
    description text,
    confidence real NOT NULL,
    inferred_schema jsonb NOT NULL,
    example_instances jsonb DEFAULT '[]' :: jsonb,
    frequency integer DEFAULT 1,
    proposed_relationships jsonb DEFAULT '[]' :: jsonb,
    source_document_ids uuid [] DEFAULT '{}' :: uuid [],
    extraction_context text,
    refinement_iteration integer DEFAULT 1,
    merged_from uuid [],
    status text DEFAULT 'candidate' :: text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discovery_type_candidates_confidence_check CHECK (
        (
            (confidence >= (0) :: double precision)
            AND (confidence <= (1) :: double precision)
        )
    ),
    CONSTRAINT discovery_type_candidates_status_check CHECK (
        (
            status = ANY (
                ARRAY ['candidate'::text, 'approved'::text, 'rejected'::text, 'merged'::text]
            )
        )
    )
);

ALTER TABLE
    kb.discovery_type_candidates OWNER TO spec;

--
-- Name: TABLE discovery_type_candidates; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.discovery_type_candidates IS 'Working memory for type candidates during the discovery process. Stores intermediate results from each batch analysis before refinement and merging into final discovered_types.';

--
-- Name: COLUMN discovery_type_candidates.inferred_schema; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.discovery_type_candidates.inferred_schema IS 'JSON Schema inferred from document analysis: {type: "object", properties: {...}, required: [...]}';

--
-- Name: COLUMN discovery_type_candidates.example_instances; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.discovery_type_candidates.example_instances IS 'Array of 2-5 sample instances extracted from documents, used for schema validation and user preview';

--
-- Name: COLUMN discovery_type_candidates.extraction_context; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.discovery_type_candidates.extraction_context IS 'Text snippet showing where this type was identified in the source documents, for provenance and debugging';

--
-- Name: documents; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid,
    source_url text,
    filename text,
    mime_type text,
    content text,
    content_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_document_id uuid,
    integration_metadata jsonb DEFAULT '{}' :: jsonb
);

ALTER TABLE
    kb.documents OWNER TO spec;

--
-- Name: COLUMN documents.parent_document_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.documents.parent_document_id IS 'Reference to parent document for hierarchical structures (e.g., ClickUp page → parent page)';

--
-- Name: COLUMN documents.integration_metadata; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.documents.integration_metadata IS 'Source-specific metadata (ClickUp doc IDs, page hierarchy, creator info, etc.)';

--
-- Name: embedding_policies; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.embedding_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    object_type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    max_property_size integer DEFAULT 10000,
    required_labels text [] DEFAULT '{}' :: text [] NOT NULL,
    excluded_labels text [] DEFAULT '{}' :: text [] NOT NULL,
    relevant_paths text [] DEFAULT '{}' :: text [] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    excluded_statuses text [] DEFAULT '{}' :: text [] NOT NULL
);

ALTER TABLE
    kb.embedding_policies OWNER TO spec;

--
-- Name: COLUMN embedding_policies.excluded_statuses; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.embedding_policies.excluded_statuses IS 'Status values that prevent embedding if present on the object (e.g., ["draft", "archived"])';

--
-- Name: graph_embedding_jobs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.graph_embedding_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    object_id uuid NOT NULL,
    status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    priority integer DEFAULT 0 NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT graph_embedding_jobs_status_check CHECK (
        (
            status = ANY (
                ARRAY ['pending'::text, 'processing'::text, 'failed'::text, 'completed'::text]
            )
        )
    )
);

ALTER TABLE
    kb.graph_embedding_jobs OWNER TO spec;

--
-- Name: graph_objects; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.graph_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid,
    branch_id uuid,
    type text NOT NULL,
    key text,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id uuid,
    canonical_id uuid,
    properties jsonb DEFAULT '{}' :: jsonb NOT NULL,
    labels text [] DEFAULT '{}' :: text [] NOT NULL,
    deleted_at timestamp with time zone,
    expires_at timestamp with time zone,
    change_summary jsonb,
    content_hash bytea,
    fts tsvector,
    embedding bytea,
    embedding_updated_at timestamp with time zone,
    embedding_vec public.vector(768),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    ONLY kb.graph_objects FORCE ROW LEVEL SECURITY;

ALTER TABLE
    kb.graph_objects OWNER TO spec;

--
-- Name: graph_relationships; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.graph_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid,
    branch_id uuid,
    type text NOT NULL,
    src_id uuid NOT NULL,
    dst_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id uuid,
    canonical_id uuid,
    properties jsonb DEFAULT '{}' :: jsonb NOT NULL,
    deleted_at timestamp with time zone,
    change_summary jsonb,
    content_hash bytea,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    ONLY kb.graph_relationships FORCE ROW LEVEL SECURITY;

ALTER TABLE
    kb.graph_relationships OWNER TO spec;

--
-- Name: graph_template_packs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.graph_template_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    version text NOT NULL,
    description text,
    author text,
    license text,
    repository_url text,
    documentation_url text,
    object_type_schemas jsonb DEFAULT '{}' :: jsonb NOT NULL,
    relationship_type_schemas jsonb DEFAULT '{}' :: jsonb NOT NULL,
    ui_configs jsonb DEFAULT '{}' :: jsonb NOT NULL,
    extraction_prompts jsonb DEFAULT '{}' :: jsonb NOT NULL,
    sql_views jsonb DEFAULT '[]' :: jsonb,
    signature text,
    checksum text,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    deprecated_at timestamp with time zone,
    superseded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'manual' :: text,
    discovery_job_id uuid,
    pending_review boolean DEFAULT false,
    CONSTRAINT graph_template_packs_source_check CHECK (
        (
            source = ANY (
                ARRAY ['manual'::text, 'discovered'::text, 'imported'::text, 'system'::text]
            )
        )
    )
);

ALTER TABLE
    kb.graph_template_packs OWNER TO spec;

--
-- Name: COLUMN graph_template_packs.source; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.graph_template_packs.source IS 'Origin of the template pack: manual (user-created), discovered (auto-discovery), imported (from file/marketplace), system (built-in)';

--
-- Name: COLUMN graph_template_packs.discovery_job_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.graph_template_packs.discovery_job_id IS 'Reference to the discovery job that created this pack (if source=discovered)';

--
-- Name: COLUMN graph_template_packs.pending_review; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.graph_template_packs.pending_review IS 'Whether this pack needs user review before installation. Set to true for discovered packs until reviewed and edited.';

--
-- Name: integrations; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    enabled boolean DEFAULT false NOT NULL,
    organization_id text NOT NULL,
    project_id uuid NOT NULL,
    settings_encrypted bytea,
    logo_url text,
    webhook_secret text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text
);

ALTER TABLE
    kb.integrations OWNER TO spec;

--
-- Name: TABLE integrations; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.integrations IS 'Stores configuration for third-party integrations (ClickUp, Jira, etc.)';

--
-- Name: COLUMN integrations.settings_encrypted; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.integrations.settings_encrypted IS 'Encrypted JSON containing auth tokens, API keys, and configuration';

--
-- Name: COLUMN integrations.webhook_secret; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.integrations.webhook_secret IS 'Secret for validating webhook signatures from the integration provider';

--
-- Name: invites; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid,
    email text NOT NULL,
    role text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending' :: text NOT NULL,
    expires_at timestamp with time zone,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invites_role_check CHECK (
        (
            role = ANY (
                ARRAY ['org_admin'::text, 'project_admin'::text, 'project_user'::text]
            )
        )
    )
);

ALTER TABLE
    kb.invites OWNER TO spec;

--
-- Name: llm_call_logs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.llm_call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id text NOT NULL,
    process_type text NOT NULL,
    request_payload jsonb NOT NULL,
    model_name text NOT NULL,
    response_payload jsonb,
    status text NOT NULL,
    error_message text,
    usage_metrics jsonb,
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    cost_usd numeric(10, 6),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    organization_id text,
    project_id uuid,
    CONSTRAINT llm_call_logs_status_check CHECK (
        (
            status = ANY (
                ARRAY ['success'::text, 'error'::text, 'timeout'::text, 'pending'::text]
            )
        )
    )
);

ALTER TABLE
    kb.llm_call_logs OWNER TO spec;

--
-- Name: TABLE llm_call_logs; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.llm_call_logs IS 'Tracks all LLM API calls with full request/response payloads, token usage, and cost calculation. Part of System Monitoring feature.';

--
-- Name: COLUMN llm_call_logs.usage_metrics; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.llm_call_logs.usage_metrics IS 'Raw usage data from LLM provider (tokens, model info, etc.)';

--
-- Name: COLUMN llm_call_logs.cost_usd; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.llm_call_logs.cost_usd IS 'Calculated cost in USD based on model pricing configuration';

--
-- Name: mcp_tool_calls; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.mcp_tool_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    conversation_id text,
    turn_number integer NOT NULL,
    tool_name text NOT NULL,
    tool_parameters jsonb,
    tool_result jsonb,
    execution_time_ms integer,
    status text NOT NULL,
    error_message text,
    final_llm_prompt text,
    "timestamp" timestamp with time zone DEFAULT now(),
    organization_id text,
    project_id uuid,
    CONSTRAINT mcp_tool_calls_status_check CHECK (
        (
            status = ANY (
                ARRAY ['success'::text, 'error'::text, 'timeout'::text]
            )
        )
    )
);

ALTER TABLE
    kb.mcp_tool_calls OWNER TO spec;

--
-- Name: merge_provenance; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.merge_provenance (
    child_version_id uuid NOT NULL,
    parent_version_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merge_provenance_role_check CHECK (
        (
            role = ANY (
                ARRAY ['source'::text, 'target'::text, 'base'::text]
            )
        )
    )
);

ALTER TABLE
    kb.merge_provenance OWNER TO spec;

--
-- Name: notifications; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id text,
    title text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text,
    severity text DEFAULT 'info' :: text,
    related_resource_type text,
    related_resource_id uuid,
    read boolean DEFAULT false,
    dismissed boolean DEFAULT false,
    dismissed_at timestamp with time zone,
    actions jsonb DEFAULT '[]' :: jsonb,
    expires_at timestamp with time zone,
    user_id text,
    read_at timestamp with time zone,
    importance text DEFAULT 'other' :: text,
    cleared_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    category text,
    CONSTRAINT notifications_importance_check CHECK (
        (
            importance = ANY (ARRAY ['important'::text, 'other'::text])
        )
    )
);

ALTER TABLE
    kb.notifications OWNER TO spec;

--
-- Name: TABLE notifications; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.notifications IS 'User notifications for extraction jobs, system events, and other activities (extended from original schema)';

--
-- Name: COLUMN notifications.organization_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.organization_id IS 'Organization this notification belongs to';

--
-- Name: COLUMN notifications.project_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.project_id IS 'Project this notification is related to';

--
-- Name: COLUMN notifications.subject_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.subject_id IS 'User who should receive this notification';

--
-- Name: COLUMN notifications.title; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.title IS 'Short notification title';

--
-- Name: COLUMN notifications.message; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.message IS 'Full notification message';

--
-- Name: COLUMN notifications.type; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.type IS 'Notification type for filtering and routing (extraction_complete, extraction_failed, review_required, etc.)';

--
-- Name: COLUMN notifications.actions; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.actions IS 'Array of action objects: [{label: string, url?: string, action?: string, data?: any}]';

--
-- Name: COLUMN notifications.user_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.user_id IS 'User ID who should receive this notification (migrated from subject_id)';

--
-- Name: COLUMN notifications.read_at; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.read_at IS 'Timestamp when notification was read (NULL = unread)';

--
-- Name: COLUMN notifications.importance; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.importance IS 'Notification importance level: important or other';

--
-- Name: COLUMN notifications.cleared_at; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.cleared_at IS 'Timestamp when notification was cleared/dismissed';

--
-- Name: COLUMN notifications.snoozed_until; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.snoozed_until IS 'Timestamp until which notification is snoozed';

--
-- Name: COLUMN notifications.category; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.notifications.category IS 'Notification category for filtering and routing';

--
-- Name: object_extraction_jobs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.object_extraction_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    source_type character varying(50) NOT NULL,
    source_id uuid,
    source_metadata jsonb DEFAULT '{}' :: jsonb,
    extraction_config jsonb DEFAULT '{}' :: jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending' :: character varying NOT NULL,
    total_items integer DEFAULT 0,
    processed_items integer DEFAULT 0,
    successful_items integer DEFAULT 0,
    failed_items integer DEFAULT 0,
    discovered_types jsonb DEFAULT '[]' :: jsonb,
    created_objects jsonb DEFAULT '[]' :: jsonb,
    error_message text,
    error_details jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT extraction_jobs_source_type_check CHECK (
        (
            (source_type) :: text = ANY (
                (
                    ARRAY ['document'::character varying, 'api'::character varying, 'manual'::character varying, 'bulk_import'::character varying]
                ) :: text []
            )
        )
    ),
    CONSTRAINT extraction_jobs_status_check CHECK (
        (
            (status) :: text = ANY (
                (
                    ARRAY ['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying]
                ) :: text []
            )
        )
    ),
    CONSTRAINT object_extraction_jobs_progress_check CHECK (
        (
            (processed_items >= 0)
            AND (successful_items >= 0)
            AND (failed_items >= 0)
            AND (
                processed_items = (successful_items + failed_items)
            )
        )
    ),
    CONSTRAINT object_extraction_jobs_timing_check CHECK (
        (
            (
                (started_at IS NULL)
                OR (started_at >= created_at)
            )
            AND (
                (completed_at IS NULL)
                OR (
                    (started_at IS NOT NULL)
                    AND (completed_at >= started_at)
                )
            )
        )
    )
);

ALTER TABLE
    kb.object_extraction_jobs OWNER TO spec;

--
-- Name: TABLE object_extraction_jobs; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.object_extraction_jobs IS 'Object extraction job tracking table - tracks lifecycle of document extraction jobs';

--
-- Name: COLUMN object_extraction_jobs.organization_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.organization_id IS 'Organization ID for multi-tenancy support';

--
-- Name: COLUMN object_extraction_jobs.source_type; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.source_type IS 'Type of extraction source: document (PDF/DOCX), api (external API), manual (user-triggered), bulk_import';

--
-- Name: COLUMN object_extraction_jobs.source_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.source_id IS 'Optional reference to source object (e.g., document object ID)';

--
-- Name: COLUMN object_extraction_jobs.extraction_config; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.extraction_config IS 'Extraction configuration: target types, filters, extraction rules, etc.';

--
-- Name: COLUMN object_extraction_jobs.status; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.status IS 'Job status: pending (queued), running (in progress), completed (success), failed (error), cancelled (user cancelled)';

--
-- Name: COLUMN object_extraction_jobs.discovered_types; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.discovered_types IS 'Array of type names discovered during extraction (for auto-discovery feature)';

--
-- Name: COLUMN object_extraction_jobs.created_objects; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.created_objects IS 'Array of object IDs created during extraction';

--
-- Name: COLUMN object_extraction_jobs.error_message; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.error_message IS 'Human-readable error message (if status=failed)';

--
-- Name: COLUMN object_extraction_jobs.error_details; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.object_extraction_jobs.error_details IS 'Detailed error information (stack trace, context) for debugging';

--
-- Name: object_type_schemas; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.object_type_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid,
    type text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id uuid,
    canonical_id uuid,
    json_schema jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.object_type_schemas OWNER TO spec;

--
-- Name: organization_memberships; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    subject_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_memberships_role_check CHECK ((role = 'org_admin' :: text))
);

ALTER TABLE
    kb.organization_memberships OWNER TO spec;

--
-- Name: orgs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.orgs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.orgs OWNER TO spec;

--
-- Name: product_version_members; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.product_version_members (
    product_version_id uuid NOT NULL,
    object_canonical_id uuid NOT NULL,
    object_version_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.product_version_members OWNER TO spec;

--
-- Name: product_versions; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.product_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    base_product_version_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.product_versions OWNER TO spec;

--
-- Name: project_memberships; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.project_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    subject_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_memberships_role_check CHECK (
        (
            role = ANY (
                ARRAY ['project_admin'::text, 'project_user'::text]
            )
        )
    )
);

ALTER TABLE
    kb.project_memberships OWNER TO spec;

--
-- Name: project_object_type_registry; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.project_object_type_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    type_name text NOT NULL,
    source text NOT NULL,
    template_pack_id uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    json_schema jsonb NOT NULL,
    ui_config jsonb DEFAULT '{}' :: jsonb,
    extraction_config jsonb DEFAULT '{}' :: jsonb,
    enabled boolean DEFAULT true NOT NULL,
    discovery_confidence real,
    description text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_object_type_registry_source_check CHECK (
        (
            source = ANY (
                ARRAY ['template'::text, 'custom'::text, 'discovered'::text]
            )
        )
    )
);

ALTER TABLE
    kb.project_object_type_registry OWNER TO spec;

--
-- Name: project_template_packs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.project_template_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    template_pack_id uuid NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    installed_by uuid,
    active boolean DEFAULT true NOT NULL,
    customizations jsonb DEFAULT '{}' :: jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.project_template_packs OWNER TO spec;

--
-- Name: projects; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    kb_purpose text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_extract_objects boolean DEFAULT false NOT NULL,
    auto_extract_config jsonb DEFAULT '{"enabled_types": null, "min_confidence": 0.7, "require_review": false, "notify_on_complete": true, "notification_channels": ["inbox"]}' :: jsonb,
    chat_prompt_template text
);

ALTER TABLE
    kb.projects OWNER TO spec;

--
-- Name: COLUMN projects.kb_purpose; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.projects.kb_purpose IS 'Markdown description of the knowledge base purpose, domain, and scope. Used by auto-discovery to understand context and guide type/relationship discovery.';

--
-- Name: COLUMN projects.auto_extract_objects; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.projects.auto_extract_objects IS 'When true, automatically create extraction jobs when documents are uploaded to this project. Default: false (opt-in)';

--
-- Name: COLUMN projects.auto_extract_config; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.projects.auto_extract_config IS 'Configuration for automatic extraction: enabled_types (string[] or null), min_confidence (0-1), require_review (bool), notify_on_complete (bool), notification_channels (string[])';

--
-- Name: COLUMN projects.chat_prompt_template; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.projects.chat_prompt_template IS 'Custom chat prompt template. Supports placeholders: {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, {{MESSAGE}}, {{MARKDOWN_RULES}}. If null, uses default template.';

--
-- Name: relationship_type_schemas; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.relationship_type_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid,
    type text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id uuid,
    canonical_id uuid,
    json_schema jsonb NOT NULL,
    multiplicity jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.relationship_type_schemas OWNER TO spec;

--
-- Name: schema_migrations; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.schema_migrations (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    applied_at timestamp without time zone DEFAULT now() NOT NULL,
    checksum character varying(64),
    execution_time_ms integer,
    success boolean DEFAULT true NOT NULL,
    error_message text
);

ALTER TABLE
    kb.schema_migrations OWNER TO spec;

--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.schema_migrations IS 'Tracks which database migrations have been applied';

--
-- Name: COLUMN schema_migrations.filename; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.schema_migrations.filename IS 'Name of the migration file (e.g., 0002_extraction_jobs.sql)';

--
-- Name: COLUMN schema_migrations.checksum; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.schema_migrations.checksum IS 'MD5 checksum of migration content for change detection';

--
-- Name: COLUMN schema_migrations.execution_time_ms; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.schema_migrations.execution_time_ms IS 'How long the migration took to execute';

--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: kb; Owner: spec
--
CREATE SEQUENCE kb.schema_migrations_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE kb.schema_migrations_id_seq OWNER TO spec;

--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: kb; Owner: spec
--
ALTER SEQUENCE kb.schema_migrations_id_seq OWNED BY kb.schema_migrations.id;

--
-- Name: settings; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.settings (
    key text NOT NULL,
    value jsonb DEFAULT '{}' :: jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE
    kb.settings OWNER TO spec;

--
-- Name: system_process_logs; Type: TABLE; Schema: kb; Owner: spec
--
CREATE TABLE kb.system_process_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id text NOT NULL,
    process_type text NOT NULL,
    level text NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    organization_id text,
    project_id uuid,
    CONSTRAINT system_process_logs_level_check CHECK (
        (
            level = ANY (
                ARRAY ['debug'::text, 'info'::text, 'warn'::text, 'error'::text, 'fatal'::text]
            )
        )
    )
);

ALTER TABLE
    kb.system_process_logs OWNER TO spec;

--
-- Name: TABLE system_process_logs; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON TABLE kb.system_process_logs IS 'General process logging for extraction jobs, syncs, and other background tasks. Part of System Monitoring feature.';

--
-- Name: COLUMN system_process_logs.process_id; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.system_process_logs.process_id IS 'Identifier of the process being logged (e.g., job_id, session_id)';

--
-- Name: COLUMN system_process_logs.process_type; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.system_process_logs.process_type IS 'Type of process: extraction_job, sync, chat_session, etc.';

--
-- Name: COLUMN system_process_logs.metadata; Type: COMMENT; Schema: kb; Owner: spec
--
COMMENT ON COLUMN kb.system_process_logs.metadata IS 'Additional structured data (e.g., step_name, entity_count, etc.)';

--
-- Name: audit_log id; Type: DEFAULT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.audit_log
ALTER COLUMN
    id
SET
    DEFAULT nextval('kb.audit_log_id_seq' :: regclass);

--
-- Name: schema_migrations id; Type: DEFAULT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.schema_migrations
ALTER COLUMN
    id
SET
    DEFAULT nextval('kb.schema_migrations_id_seq' :: regclass);

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.audit_log
ADD
    CONSTRAINT audit_log_pkey PRIMARY KEY (id);

--
-- Name: branch_lineage branch_lineage_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.branch_lineage
ADD
    CONSTRAINT branch_lineage_pkey PRIMARY KEY (branch_id, ancestor_branch_id);

--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.branches
ADD
    CONSTRAINT branches_pkey PRIMARY KEY (id);

--
-- Name: branches branches_project_id_name_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.branches
ADD
    CONSTRAINT branches_project_id_name_key UNIQUE (project_id, name);

--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chat_conversations
ADD
    CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);

--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chat_messages
ADD
    CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chunks
ADD
    CONSTRAINT chunks_pkey PRIMARY KEY (id);

--
-- Name: clickup_sync_state clickup_sync_state_integration_id_unique; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.clickup_sync_state
ADD
    CONSTRAINT clickup_sync_state_integration_id_unique UNIQUE (integration_id);

--
-- Name: clickup_sync_state clickup_sync_state_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.clickup_sync_state
ADD
    CONSTRAINT clickup_sync_state_pkey PRIMARY KEY (id);

--
-- Name: discovery_jobs discovery_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.discovery_jobs
ADD
    CONSTRAINT discovery_jobs_pkey PRIMARY KEY (id);

--
-- Name: discovery_type_candidates discovery_type_candidates_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.discovery_type_candidates
ADD
    CONSTRAINT discovery_type_candidates_pkey PRIMARY KEY (id);

--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.documents
ADD
    CONSTRAINT documents_pkey PRIMARY KEY (id);

--
-- Name: embedding_policies embedding_policies_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.embedding_policies
ADD
    CONSTRAINT embedding_policies_pkey PRIMARY KEY (id);

--
-- Name: embedding_policies embedding_policies_project_id_object_type_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.embedding_policies
ADD
    CONSTRAINT embedding_policies_project_id_object_type_key UNIQUE (project_id, object_type);

--
-- Name: object_extraction_jobs extraction_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.object_extraction_jobs
ADD
    CONSTRAINT extraction_jobs_pkey PRIMARY KEY (id);

--
-- Name: graph_embedding_jobs graph_embedding_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_embedding_jobs
ADD
    CONSTRAINT graph_embedding_jobs_pkey PRIMARY KEY (id);

--
-- Name: graph_objects graph_objects_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_objects
ADD
    CONSTRAINT graph_objects_pkey PRIMARY KEY (id);

--
-- Name: graph_relationships graph_relationships_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_relationships
ADD
    CONSTRAINT graph_relationships_pkey PRIMARY KEY (id);

--
-- Name: graph_template_packs graph_template_packs_name_version_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_template_packs
ADD
    CONSTRAINT graph_template_packs_name_version_key UNIQUE (name, version);

--
-- Name: graph_template_packs graph_template_packs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_template_packs
ADD
    CONSTRAINT graph_template_packs_pkey PRIMARY KEY (id);

--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.integrations
ADD
    CONSTRAINT integrations_pkey PRIMARY KEY (id);

--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.invites
ADD
    CONSTRAINT invites_pkey PRIMARY KEY (id);

--
-- Name: invites invites_token_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.invites
ADD
    CONSTRAINT invites_token_key UNIQUE (token);

--
-- Name: llm_call_logs llm_call_logs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.llm_call_logs
ADD
    CONSTRAINT llm_call_logs_pkey PRIMARY KEY (id);

--
-- Name: mcp_tool_calls mcp_tool_calls_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.mcp_tool_calls
ADD
    CONSTRAINT mcp_tool_calls_pkey PRIMARY KEY (id);

--
-- Name: merge_provenance merge_provenance_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.merge_provenance
ADD
    CONSTRAINT merge_provenance_pkey PRIMARY KEY (child_version_id, parent_version_id, role);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.notifications
ADD
    CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: object_type_schemas object_type_schemas_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.object_type_schemas
ADD
    CONSTRAINT object_type_schemas_pkey PRIMARY KEY (id);

--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.organization_memberships
ADD
    CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);

--
-- Name: orgs orgs_name_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.orgs
ADD
    CONSTRAINT orgs_name_key UNIQUE (name);

--
-- Name: orgs orgs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.orgs
ADD
    CONSTRAINT orgs_pkey PRIMARY KEY (id);

--
-- Name: product_version_members product_version_members_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.product_version_members
ADD
    CONSTRAINT product_version_members_pkey PRIMARY KEY (product_version_id, object_canonical_id);

--
-- Name: product_versions product_versions_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.product_versions
ADD
    CONSTRAINT product_versions_pkey PRIMARY KEY (id);

--
-- Name: project_memberships project_memberships_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_memberships
ADD
    CONSTRAINT project_memberships_pkey PRIMARY KEY (id);

--
-- Name: project_object_type_registry project_object_type_registry_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_object_type_registry
ADD
    CONSTRAINT project_object_type_registry_pkey PRIMARY KEY (id);

--
-- Name: project_object_type_registry project_object_type_registry_project_id_type_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_object_type_registry
ADD
    CONSTRAINT project_object_type_registry_project_id_type_key UNIQUE (project_id, type_name);

--
-- Name: project_template_packs project_template_packs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_template_packs
ADD
    CONSTRAINT project_template_packs_pkey PRIMARY KEY (id);

--
-- Name: project_template_packs project_template_packs_project_id_template_pack_id_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_template_packs
ADD
    CONSTRAINT project_template_packs_project_id_template_pack_id_key UNIQUE (project_id, template_pack_id);

--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.projects
ADD
    CONSTRAINT projects_pkey PRIMARY KEY (id);

--
-- Name: relationship_type_schemas relationship_type_schemas_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.relationship_type_schemas
ADD
    CONSTRAINT relationship_type_schemas_pkey PRIMARY KEY (id);

--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.schema_migrations
ADD
    CONSTRAINT schema_migrations_filename_key UNIQUE (filename);

--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.schema_migrations
ADD
    CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);

--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.settings
ADD
    CONSTRAINT settings_pkey PRIMARY KEY (key);

--
-- Name: system_process_logs system_process_logs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.system_process_logs
ADD
    CONSTRAINT system_process_logs_pkey PRIMARY KEY (id);

--
-- Name: integrations uq_integration_project; Type: CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.integrations
ADD
    CONSTRAINT uq_integration_project UNIQUE (name, project_id);

--
-- Name: idx_audit_log_compliance; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_compliance ON kb.audit_log USING btree (user_id, "timestamp" DESC, outcome);

--
-- Name: idx_audit_log_details; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_details ON kb.audit_log USING gin (details);

--
-- Name: idx_audit_log_endpoint; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_endpoint ON kb.audit_log USING btree (endpoint);

--
-- Name: idx_audit_log_event_type; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_event_type ON kb.audit_log USING btree (event_type);

--
-- Name: idx_audit_log_outcome; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_outcome ON kb.audit_log USING btree (outcome);

--
-- Name: idx_audit_log_resource; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_resource ON kb.audit_log USING btree (resource_type, resource_id);

--
-- Name: idx_audit_log_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_timestamp ON kb.audit_log USING btree ("timestamp" DESC);

--
-- Name: idx_audit_log_user; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_user ON kb.audit_log USING btree (user_id, "timestamp" DESC);

--
-- Name: idx_audit_log_user_id; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_user_id ON kb.audit_log USING btree (user_id);

--
-- Name: idx_audit_log_user_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_audit_log_user_timestamp ON kb.audit_log USING btree (user_id, "timestamp" DESC);

--
-- Name: idx_branch_lineage_ancestor_depth; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_branch_lineage_ancestor_depth ON kb.branch_lineage USING btree (ancestor_branch_id, depth);

--
-- Name: idx_chat_conversations_org_proj; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_chat_conversations_org_proj ON kb.chat_conversations USING btree (organization_id, project_id, updated_at DESC);

--
-- Name: idx_chat_conversations_owner; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_chat_conversations_owner ON kb.chat_conversations USING btree (owner_subject_id)
WHERE
    (owner_subject_id IS NOT NULL);

--
-- Name: idx_chat_messages_conv; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_chat_messages_conv ON kb.chat_messages USING btree (conversation_id, created_at);

--
-- Name: idx_chunks_doc; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_chunks_doc ON kb.chunks USING btree (document_id);

--
-- Name: idx_chunks_doc_chunkindex; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_chunks_doc_chunkindex ON kb.chunks USING btree (document_id, chunk_index);

--
-- Name: idx_chunks_embedding; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_chunks_embedding ON kb.chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists = '100');

--
-- Name: idx_chunks_tsv; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_chunks_tsv ON kb.chunks USING gin (tsv);

--
-- Name: idx_clickup_sync_integration; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_clickup_sync_integration ON kb.clickup_sync_state USING btree (integration_id);

--
-- Name: idx_clickup_sync_status; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_clickup_sync_status ON kb.clickup_sync_state USING btree (import_status);

--
-- Name: idx_discovery_candidates_batch; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_candidates_batch ON kb.discovery_type_candidates USING btree (job_id, batch_number);

--
-- Name: idx_discovery_candidates_confidence; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_candidates_confidence ON kb.discovery_type_candidates USING btree (job_id, confidence DESC);

--
-- Name: idx_discovery_candidates_job; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_candidates_job ON kb.discovery_type_candidates USING btree (job_id);

--
-- Name: idx_discovery_candidates_status; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_candidates_status ON kb.discovery_type_candidates USING btree (job_id, status);

--
-- Name: idx_discovery_jobs_created; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_jobs_created ON kb.discovery_jobs USING btree (created_at DESC);

--
-- Name: idx_discovery_jobs_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_jobs_project ON kb.discovery_jobs USING btree (project_id);

--
-- Name: idx_discovery_jobs_status; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_jobs_status ON kb.discovery_jobs USING btree (status)
WHERE
    (
        status = ANY (
            ARRAY ['pending'::text, 'analyzing_documents'::text, 'extracting_types'::text, 'refining_schemas'::text]
        )
    );

--
-- Name: idx_discovery_jobs_template_pack; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_discovery_jobs_template_pack ON kb.discovery_jobs USING btree (template_pack_id)
WHERE
    (template_pack_id IS NOT NULL);

--
-- Name: idx_documents_integration_metadata; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_documents_integration_metadata ON kb.documents USING gin (integration_metadata);

--
-- Name: idx_documents_org; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_documents_org ON kb.documents USING btree (organization_id);

--
-- Name: idx_documents_parent; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_documents_parent ON kb.documents USING btree (parent_document_id)
WHERE
    (parent_document_id IS NOT NULL);

--
-- Name: idx_documents_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_documents_project ON kb.documents USING btree (project_id);

--
-- Name: idx_documents_project_hash; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_documents_project_hash ON kb.documents USING btree (project_id, content_hash);

--
-- Name: idx_embedding_policies_excluded_statuses; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_embedding_policies_excluded_statuses ON kb.embedding_policies USING gin (excluded_statuses);

--
-- Name: idx_embedding_policies_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_embedding_policies_project ON kb.embedding_policies USING btree (project_id);

--
-- Name: idx_graph_embedding_jobs_object; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs USING btree (object_id);

--
-- Name: idx_graph_embedding_jobs_object_pending; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_graph_embedding_jobs_object_pending ON kb.graph_embedding_jobs USING btree (object_id)
WHERE
    (
        status = ANY (ARRAY ['pending'::text, 'processing'::text])
    );

--
-- Name: idx_graph_embedding_jobs_status_sched; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_embedding_jobs_status_sched ON kb.graph_embedding_jobs USING btree (status, scheduled_at);

--
-- Name: idx_graph_objects_branch_canonical_version; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_branch_canonical_version ON kb.graph_objects USING btree (branch_id, canonical_id, version DESC);

--
-- Name: idx_graph_objects_branch_not_deleted; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_branch_not_deleted ON kb.graph_objects USING btree (project_id, branch_id)
WHERE
    (deleted_at IS NULL);

--
-- Name: idx_graph_objects_canonical; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_canonical ON kb.graph_objects USING btree (canonical_id);

--
-- Name: idx_graph_objects_canonical_version; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_canonical_version ON kb.graph_objects USING btree (canonical_id, version DESC);

--
-- Name: idx_graph_objects_embedding_vec; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_embedding_vec ON kb.graph_objects USING ivfflat (embedding_vec public.vector_cosine_ops) WITH (lists = '100');

--
-- Name: idx_graph_objects_fts; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_fts ON kb.graph_objects USING gin (fts);

--
-- Name: idx_graph_objects_head_identity_branch; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_graph_objects_head_identity_branch ON kb.graph_objects USING btree (project_id, branch_id, type, key)
WHERE
    (
        (supersedes_id IS NULL)
        AND (deleted_at IS NULL)
        AND (key IS NOT NULL)
    );

--
-- Name: idx_graph_objects_key; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_key ON kb.graph_objects USING btree (key)
WHERE
    (key IS NOT NULL);

--
-- Name: idx_graph_objects_not_deleted; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_objects_not_deleted ON kb.graph_objects USING btree (project_id)
WHERE
    (deleted_at IS NULL);

--
-- Name: idx_graph_rel_branch_canonical_version; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_rel_branch_canonical_version ON kb.graph_relationships USING btree (branch_id, canonical_id, version DESC);

--
-- Name: idx_graph_rel_branch_not_deleted; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_rel_branch_not_deleted ON kb.graph_relationships USING btree (project_id, branch_id)
WHERE
    (deleted_at IS NULL);

--
-- Name: idx_graph_rel_canonical; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_rel_canonical ON kb.graph_relationships USING btree (canonical_id);

--
-- Name: idx_graph_rel_canonical_version; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_rel_canonical_version ON kb.graph_relationships USING btree (canonical_id, version DESC);

--
-- Name: idx_graph_rel_not_deleted; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_graph_rel_not_deleted ON kb.graph_relationships USING btree (project_id)
WHERE
    (deleted_at IS NULL);

--
-- Name: idx_graph_relationships_head_identity_branch; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_graph_relationships_head_identity_branch ON kb.graph_relationships USING btree (project_id, branch_id, type, src_id, dst_id)
WHERE
    (
        (supersedes_id IS NULL)
        AND (deleted_at IS NULL)
    );

--
-- Name: idx_integrations_enabled; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_integrations_enabled ON kb.integrations USING btree (enabled)
WHERE
    (enabled = true);

--
-- Name: idx_integrations_name; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_integrations_name ON kb.integrations USING btree (name);

--
-- Name: idx_integrations_org; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_integrations_org ON kb.integrations USING btree (organization_id);

--
-- Name: idx_integrations_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_integrations_project ON kb.integrations USING btree (project_id);

--
-- Name: idx_invites_token; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_invites_token ON kb.invites USING btree (token);

--
-- Name: idx_llm_call_logs_model_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_llm_call_logs_model_timestamp ON kb.llm_call_logs USING btree (model_name, started_at DESC);

--
-- Name: idx_llm_call_logs_org_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_llm_call_logs_org_timestamp ON kb.llm_call_logs USING btree (organization_id, started_at DESC)
WHERE
    (organization_id IS NOT NULL);

--
-- Name: idx_llm_call_logs_process_id; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_llm_call_logs_process_id ON kb.llm_call_logs USING btree (process_id);

--
-- Name: idx_llm_call_logs_project_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_llm_call_logs_project_timestamp ON kb.llm_call_logs USING btree (project_id, started_at DESC)
WHERE
    (project_id IS NOT NULL);

--
-- Name: idx_llm_call_logs_status; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_llm_call_logs_status ON kb.llm_call_logs USING btree (status, started_at DESC);

--
-- Name: idx_mcp_tool_calls_org; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_mcp_tool_calls_org ON kb.mcp_tool_calls USING btree (organization_id, "timestamp");

--
-- Name: idx_mcp_tool_calls_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_mcp_tool_calls_project ON kb.mcp_tool_calls USING btree (project_id, "timestamp");

--
-- Name: idx_mcp_tool_calls_session; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_mcp_tool_calls_session ON kb.mcp_tool_calls USING btree (session_id, turn_number);

--
-- Name: idx_mcp_tool_calls_status; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_mcp_tool_calls_status ON kb.mcp_tool_calls USING btree (status, "timestamp");

--
-- Name: idx_mcp_tool_calls_tool_name; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_mcp_tool_calls_tool_name ON kb.mcp_tool_calls USING btree (tool_name, "timestamp");

--
-- Name: idx_notifications_category; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_category ON kb.notifications USING btree (category)
WHERE
    (category IS NOT NULL);

--
-- Name: idx_notifications_cleared_at; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_cleared_at ON kb.notifications USING btree (cleared_at)
WHERE
    (cleared_at IS NOT NULL);

--
-- Name: idx_notifications_created; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_created ON kb.notifications USING btree (created_at DESC);

--
-- Name: idx_notifications_expires; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_expires ON kb.notifications USING btree (expires_at)
WHERE
    (expires_at IS NOT NULL);

--
-- Name: idx_notifications_importance; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_importance ON kb.notifications USING btree (importance);

--
-- Name: idx_notifications_org_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_org_project ON kb.notifications USING btree (organization_id, project_id);

--
-- Name: idx_notifications_read_at; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_read_at ON kb.notifications USING btree (read_at)
WHERE
    (read_at IS NOT NULL);

--
-- Name: idx_notifications_related_resource; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_related_resource ON kb.notifications USING btree (related_resource_type, related_resource_id)
WHERE
    (
        (related_resource_type IS NOT NULL)
        AND (related_resource_id IS NOT NULL)
    );

--
-- Name: idx_notifications_snoozed_until; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_snoozed_until ON kb.notifications USING btree (snoozed_until)
WHERE
    (snoozed_until IS NOT NULL);

--
-- Name: idx_notifications_subject; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_subject ON kb.notifications USING btree (subject_id);

--
-- Name: idx_notifications_type; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_type ON kb.notifications USING btree (type)
WHERE
    (type IS NOT NULL);

--
-- Name: idx_notifications_unread_importance; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_unread_importance ON kb.notifications USING btree (user_id, importance, created_at DESC)
WHERE
    (
        (read_at IS NULL)
        AND (cleared_at IS NULL)
    );

--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_notifications_user_id ON kb.notifications USING btree (user_id)
WHERE
    (user_id IS NOT NULL);

--
-- Name: idx_object_extraction_jobs_created_by; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_object_extraction_jobs_created_by ON kb.object_extraction_jobs USING btree (created_by, created_at DESC)
WHERE
    (created_by IS NOT NULL);

--
-- Name: idx_object_extraction_jobs_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_object_extraction_jobs_project ON kb.object_extraction_jobs USING btree (project_id, created_at DESC);

--
-- Name: idx_object_extraction_jobs_project_status; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_object_extraction_jobs_project_status ON kb.object_extraction_jobs USING btree (project_id, status, created_at DESC);

--
-- Name: idx_object_extraction_jobs_source; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_object_extraction_jobs_source ON kb.object_extraction_jobs USING btree (source_type, source_id)
WHERE
    (source_id IS NOT NULL);

--
-- Name: idx_object_extraction_jobs_status; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_object_extraction_jobs_status ON kb.object_extraction_jobs USING btree (status, created_at DESC);

--
-- Name: idx_object_type_schemas_canonical_version; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_object_type_schemas_canonical_version ON kb.object_type_schemas USING btree (canonical_id, version DESC);

--
-- Name: idx_object_type_schemas_head_identity; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_object_type_schemas_head_identity ON kb.object_type_schemas USING btree (project_id, type)
WHERE
    (supersedes_id IS NULL);

--
-- Name: idx_org_membership_unique; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_org_membership_unique ON kb.organization_memberships USING btree (organization_id, subject_id);

--
-- Name: idx_orgs_name; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_orgs_name ON kb.orgs USING btree (lower(name));

--
-- Name: idx_product_version_members_version; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_product_version_members_version ON kb.product_version_members USING btree (product_version_id, object_version_id);

--
-- Name: idx_product_versions_project_name; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_product_versions_project_name ON kb.product_versions USING btree (project_id, lower(name));

--
-- Name: idx_project_membership_unique; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_project_membership_unique ON kb.project_memberships USING btree (project_id, subject_id);

--
-- Name: idx_project_template_packs_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_project_template_packs_project ON kb.project_template_packs USING btree (project_id, active);

--
-- Name: idx_project_type_registry_project; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_project_type_registry_project ON kb.project_object_type_registry USING btree (project_id, enabled);

--
-- Name: idx_projects_auto_extract; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_projects_auto_extract ON kb.projects USING btree (id, auto_extract_objects)
WHERE
    (auto_extract_objects = true);

--
-- Name: idx_projects_org_lower_name; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_projects_org_lower_name ON kb.projects USING btree (organization_id, lower(name));

--
-- Name: idx_relationship_type_schemas_canonical_version; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_relationship_type_schemas_canonical_version ON kb.relationship_type_schemas USING btree (canonical_id, version DESC);

--
-- Name: idx_relationship_type_schemas_head_identity; Type: INDEX; Schema: kb; Owner: spec
--
CREATE UNIQUE INDEX idx_relationship_type_schemas_head_identity ON kb.relationship_type_schemas USING btree (project_id, type)
WHERE
    (supersedes_id IS NULL);

--
-- Name: idx_settings_key; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_settings_key ON kb.settings USING btree (key);

--
-- Name: idx_system_process_logs_level_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_system_process_logs_level_timestamp ON kb.system_process_logs USING btree (level, "timestamp" DESC);

--
-- Name: idx_system_process_logs_org_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_system_process_logs_org_timestamp ON kb.system_process_logs USING btree (organization_id, "timestamp" DESC)
WHERE
    (organization_id IS NOT NULL);

--
-- Name: idx_system_process_logs_process_id; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_system_process_logs_process_id ON kb.system_process_logs USING btree (process_id);

--
-- Name: idx_system_process_logs_process_type_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_system_process_logs_process_type_timestamp ON kb.system_process_logs USING btree (process_type, "timestamp" DESC);

--
-- Name: idx_system_process_logs_project_timestamp; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_system_process_logs_project_timestamp ON kb.system_process_logs USING btree (project_id, "timestamp" DESC)
WHERE
    (project_id IS NOT NULL);

--
-- Name: idx_template_packs_discovery_job; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_template_packs_discovery_job ON kb.graph_template_packs USING btree (discovery_job_id)
WHERE
    (discovery_job_id IS NOT NULL);

--
-- Name: idx_template_packs_name; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_template_packs_name ON kb.graph_template_packs USING btree (name);

--
-- Name: idx_template_packs_pending_review; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_template_packs_pending_review ON kb.graph_template_packs USING btree (pending_review)
WHERE
    (pending_review = true);

--
-- Name: idx_template_packs_source; Type: INDEX; Schema: kb; Owner: spec
--
CREATE INDEX idx_template_packs_source ON kb.graph_template_packs USING btree (source);

--
-- Name: chunks trg_chunks_tsv; Type: TRIGGER; Schema: kb; Owner: spec
--
CREATE TRIGGER trg_chunks_tsv BEFORE
INSERT
    OR
UPDATE
    ON kb.chunks FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();

--
-- Name: documents trg_documents_content_hash; Type: TRIGGER; Schema: kb; Owner: spec
--
CREATE TRIGGER trg_documents_content_hash BEFORE
INSERT
    OR
UPDATE
    OF content ON kb.documents FOR EACH ROW EXECUTE FUNCTION kb.compute_document_content_hash();

--
-- Name: branch_lineage branch_lineage_ancestor_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.branch_lineage
ADD
    CONSTRAINT branch_lineage_ancestor_branch_id_fkey FOREIGN KEY (ancestor_branch_id) REFERENCES kb.branches(id) ON DELETE CASCADE;

--
-- Name: branch_lineage branch_lineage_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.branch_lineage
ADD
    CONSTRAINT branch_lineage_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES kb.branches(id) ON DELETE CASCADE;

--
-- Name: chat_conversations chat_conversations_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chat_conversations
ADD
    CONSTRAINT chat_conversations_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE
SET
    NULL;

--
-- Name: chat_conversations chat_conversations_owner_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chat_conversations
ADD
    CONSTRAINT chat_conversations_owner_subject_id_fkey FOREIGN KEY (owner_subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE
SET
    NULL;

--
-- Name: chat_conversations chat_conversations_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chat_conversations
ADD
    CONSTRAINT chat_conversations_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chat_messages
ADD
    CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES kb.chat_conversations(id) ON DELETE CASCADE;

--
-- Name: chunks chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.chunks
ADD
    CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES kb.documents(id) ON DELETE CASCADE;

--
-- Name: clickup_sync_state clickup_sync_state_integration_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.clickup_sync_state
ADD
    CONSTRAINT clickup_sync_state_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES kb.integrations(id) ON DELETE CASCADE;

--
-- Name: discovery_jobs discovery_jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.discovery_jobs
ADD
    CONSTRAINT discovery_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: discovery_jobs discovery_jobs_template_pack_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.discovery_jobs
ADD
    CONSTRAINT discovery_jobs_template_pack_id_fkey FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE
SET
    NULL;

--
-- Name: discovery_type_candidates discovery_type_candidates_job_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.discovery_type_candidates
ADD
    CONSTRAINT discovery_type_candidates_job_id_fkey FOREIGN KEY (job_id) REFERENCES kb.discovery_jobs(id) ON DELETE CASCADE;

--
-- Name: documents documents_parent_document_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.documents
ADD
    CONSTRAINT documents_parent_document_id_fkey FOREIGN KEY (parent_document_id) REFERENCES kb.documents(id) ON DELETE
SET
    NULL;

--
-- Name: documents documents_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.documents
ADD
    CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: embedding_policies embedding_policies_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.embedding_policies
ADD
    CONSTRAINT embedding_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: object_extraction_jobs fk_object_extraction_jobs_org; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.object_extraction_jobs
ADD
    CONSTRAINT fk_object_extraction_jobs_org FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

--
-- Name: object_extraction_jobs fk_object_extraction_jobs_project; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.object_extraction_jobs
ADD
    CONSTRAINT fk_object_extraction_jobs_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: system_process_logs fk_project; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.system_process_logs
ADD
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: llm_call_logs fk_project; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.llm_call_logs
ADD
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: graph_embedding_jobs graph_embedding_jobs_object_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_embedding_jobs
ADD
    CONSTRAINT graph_embedding_jobs_object_id_fkey FOREIGN KEY (object_id) REFERENCES kb.graph_objects(id) ON DELETE CASCADE;

--
-- Name: graph_objects graph_objects_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_objects
ADD
    CONSTRAINT graph_objects_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES kb.branches(id) ON DELETE
SET
    NULL;

--
-- Name: graph_relationships graph_relationships_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_relationships
ADD
    CONSTRAINT graph_relationships_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES kb.branches(id) ON DELETE
SET
    NULL;

--
-- Name: graph_template_packs graph_template_packs_discovery_job_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_template_packs
ADD
    CONSTRAINT graph_template_packs_discovery_job_id_fkey FOREIGN KEY (discovery_job_id) REFERENCES kb.discovery_jobs(id) ON DELETE
SET
    NULL;

--
-- Name: graph_template_packs graph_template_packs_superseded_by_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.graph_template_packs
ADD
    CONSTRAINT graph_template_packs_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES kb.graph_template_packs(id);

--
-- Name: invites invites_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.invites
ADD
    CONSTRAINT invites_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

--
-- Name: invites invites_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.invites
ADD
    CONSTRAINT invites_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: organization_memberships organization_memberships_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.organization_memberships
ADD
    CONSTRAINT organization_memberships_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

--
-- Name: organization_memberships organization_memberships_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.organization_memberships
ADD
    CONSTRAINT organization_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

--
-- Name: product_version_members product_version_members_product_version_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.product_version_members
ADD
    CONSTRAINT product_version_members_product_version_id_fkey FOREIGN KEY (product_version_id) REFERENCES kb.product_versions(id) ON DELETE CASCADE;

--
-- Name: product_versions product_versions_base_product_version_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.product_versions
ADD
    CONSTRAINT product_versions_base_product_version_id_fkey FOREIGN KEY (base_product_version_id) REFERENCES kb.product_versions(id) ON DELETE
SET
    NULL;

--
-- Name: product_versions product_versions_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.product_versions
ADD
    CONSTRAINT product_versions_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: project_memberships project_memberships_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_memberships
ADD
    CONSTRAINT project_memberships_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: project_memberships project_memberships_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_memberships
ADD
    CONSTRAINT project_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

--
-- Name: project_object_type_registry project_object_type_registry_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_object_type_registry
ADD
    CONSTRAINT project_object_type_registry_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: project_object_type_registry project_object_type_registry_template_pack_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_object_type_registry
ADD
    CONSTRAINT project_object_type_registry_template_pack_id_fkey FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE CASCADE;

--
-- Name: project_template_packs project_template_packs_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_template_packs
ADD
    CONSTRAINT project_template_packs_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

--
-- Name: project_template_packs project_template_packs_template_pack_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.project_template_packs
ADD
    CONSTRAINT project_template_packs_template_pack_id_fkey FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE RESTRICT;

--
-- Name: projects projects_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--
ALTER TABLE
    ONLY kb.projects
ADD
    CONSTRAINT projects_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

--
-- Name: object_extraction_jobs extraction_jobs_delete_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY extraction_jobs_delete_policy ON kb.object_extraction_jobs FOR DELETE USING (
    (
        project_id IN (
            SELECT
                p.id
            FROM
                (
                    kb.projects p
                    JOIN kb.orgs o ON ((p.org_id = o.id))
                )
            WHERE
                (p.id = object_extraction_jobs.project_id)
        )
    )
);

--
-- Name: object_extraction_jobs extraction_jobs_insert_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY extraction_jobs_insert_policy ON kb.object_extraction_jobs FOR
INSERT
    WITH CHECK (
        (
            project_id IN (
                SELECT
                    p.id
                FROM
                    (
                        kb.projects p
                        JOIN kb.orgs o ON ((p.org_id = o.id))
                    )
            )
        )
    );

--
-- Name: object_extraction_jobs extraction_jobs_select_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs FOR
SELECT
    USING (
        (
            project_id IN (
                SELECT
                    p.id
                FROM
                    (
                        kb.projects p
                        JOIN kb.orgs o ON ((p.org_id = o.id))
                    )
                WHERE
                    (p.id = object_extraction_jobs.project_id)
            )
        )
    );

--
-- Name: object_extraction_jobs extraction_jobs_update_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY extraction_jobs_update_policy ON kb.object_extraction_jobs FOR
UPDATE
    USING (
        (
            project_id IN (
                SELECT
                    p.id
                FROM
                    (
                        kb.projects p
                        JOIN kb.orgs o ON ((p.org_id = o.id))
                    )
                WHERE
                    (p.id = object_extraction_jobs.project_id)
            )
        )
    );

--
-- Name: graph_objects; Type: ROW SECURITY; Schema: kb; Owner: spec
--
ALTER TABLE
    kb.graph_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: graph_objects graph_objects_delete; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_objects_delete ON kb.graph_objects FOR DELETE USING (
    (
        (
            (
                COALESCE(
                    current_setting('app.current_organization_id' :: text, true),
                    '' :: text
                ) = '' :: text
            )
            AND (
                COALESCE(
                    current_setting('app.current_project_id' :: text, true),
                    '' :: text
                ) = '' :: text
            )
        )
        OR (
            (
                COALESCE(
                    current_setting('app.current_organization_id' :: text, true),
                    '' :: text
                ) <> '' :: text
            )
            AND (
                (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
            )
            AND (
                (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                OR (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
        OR (
            (
                COALESCE(
                    current_setting('app.current_organization_id' :: text, true),
                    '' :: text
                ) = '' :: text
            )
            AND (
                COALESCE(
                    current_setting('app.current_project_id' :: text, true),
                    '' :: text
                ) <> '' :: text
            )
            AND (
                (project_id) :: text = current_setting('app.current_project_id' :: text, true)
            )
        )
    )
);

--
-- Name: graph_objects graph_objects_insert; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_objects_insert ON kb.graph_objects FOR
INSERT
    WITH CHECK (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    );

--
-- Name: graph_objects graph_objects_select; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_objects_select ON kb.graph_objects FOR
SELECT
    USING (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    );

--
-- Name: graph_objects graph_objects_update; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_objects_update ON kb.graph_objects FOR
UPDATE
    USING (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    ) WITH CHECK (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    );

--
-- Name: graph_relationships; Type: ROW SECURITY; Schema: kb; Owner: spec
--
ALTER TABLE
    kb.graph_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: graph_relationships graph_relationships_delete; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_relationships_delete ON kb.graph_relationships FOR DELETE USING (
    (
        (
            (
                COALESCE(
                    current_setting('app.current_organization_id' :: text, true),
                    '' :: text
                ) = '' :: text
            )
            AND (
                COALESCE(
                    current_setting('app.current_project_id' :: text, true),
                    '' :: text
                ) = '' :: text
            )
        )
        OR (
            (
                COALESCE(
                    current_setting('app.current_organization_id' :: text, true),
                    '' :: text
                ) <> '' :: text
            )
            AND (
                (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
            )
            AND (
                (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                OR (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
        OR (
            (
                COALESCE(
                    current_setting('app.current_organization_id' :: text, true),
                    '' :: text
                ) = '' :: text
            )
            AND (
                COALESCE(
                    current_setting('app.current_project_id' :: text, true),
                    '' :: text
                ) <> '' :: text
            )
            AND (
                (project_id) :: text = current_setting('app.current_project_id' :: text, true)
            )
        )
    )
);

--
-- Name: graph_relationships graph_relationships_insert; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_relationships_insert ON kb.graph_relationships FOR
INSERT
    WITH CHECK (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    );

--
-- Name: graph_relationships graph_relationships_select; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_relationships_select ON kb.graph_relationships FOR
SELECT
    USING (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    );

--
-- Name: graph_relationships graph_relationships_update; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY graph_relationships_update ON kb.graph_relationships FOR
UPDATE
    USING (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    ) WITH CHECK (
        (
            (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (organization_id) :: text = current_setting('app.current_organization_id' :: text, true)
                )
                AND (
                    (
                        COALESCE(
                            current_setting('app.current_project_id' :: text, true),
                            '' :: text
                        ) = '' :: text
                    )
                    OR (
                        (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                    )
                )
            )
            OR (
                (
                    COALESCE(
                        current_setting('app.current_organization_id' :: text, true),
                        '' :: text
                    ) = '' :: text
                )
                AND (
                    COALESCE(
                        current_setting('app.current_project_id' :: text, true),
                        '' :: text
                    ) <> '' :: text
                )
                AND (
                    (project_id) :: text = current_setting('app.current_project_id' :: text, true)
                )
            )
        )
    );

--
-- Name: llm_call_logs; Type: ROW SECURITY; Schema: kb; Owner: spec
--
ALTER TABLE
    kb.llm_call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_call_logs llm_call_logs_insert_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY llm_call_logs_insert_policy ON kb.llm_call_logs FOR
INSERT
    TO app_rls WITH CHECK (true);

--
-- Name: llm_call_logs llm_call_logs_select_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY llm_call_logs_select_policy ON kb.llm_call_logs FOR
SELECT
    TO app_rls USING (true);

--
-- Name: llm_call_logs llm_call_logs_update_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY llm_call_logs_update_policy ON kb.llm_call_logs FOR
UPDATE
    TO app_rls USING (true) WITH CHECK (true);

--
-- Name: mcp_tool_calls; Type: ROW SECURITY; Schema: kb; Owner: spec
--
ALTER TABLE
    kb.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_calls mcp_tool_calls_tenant_isolation; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY mcp_tool_calls_tenant_isolation ON kb.mcp_tool_calls USING (
    (
        (
            (project_id) :: text = current_setting('app.current_project_id' :: text, true)
        )
        OR (
            organization_id = current_setting('app.current_org_id' :: text, true)
        )
    )
);

--
-- Name: notifications; Type: ROW SECURITY; Schema: kb; Owner: spec
--
ALTER TABLE
    kb.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_insert_system; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY notifications_insert_system ON kb.notifications FOR
INSERT
    WITH CHECK (true);

--
-- Name: object_extraction_jobs; Type: ROW SECURITY; Schema: kb; Owner: spec
--
ALTER TABLE
    kb.object_extraction_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: system_process_logs; Type: ROW SECURITY; Schema: kb; Owner: spec
--
ALTER TABLE
    kb.system_process_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: system_process_logs system_process_logs_insert_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY system_process_logs_insert_policy ON kb.system_process_logs FOR
INSERT
    TO app_rls WITH CHECK (true);

--
-- Name: system_process_logs system_process_logs_select_policy; Type: POLICY; Schema: kb; Owner: spec
--
CREATE POLICY system_process_logs_select_policy ON kb.system_process_logs FOR
SELECT
    TO app_rls USING (true);

--
-- Name: SCHEMA kb; Type: ACL; Schema: -; Owner: spec
--
GRANT ALL ON SCHEMA kb TO app_rls;

--
-- Name: TABLE audit_log; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.audit_log TO app_rls;

--
-- Name: TABLE branch_lineage; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.branch_lineage TO app_rls;

--
-- Name: TABLE branches; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.branches TO app_rls;

--
-- Name: TABLE chat_conversations; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.chat_conversations TO app_rls;

--
-- Name: TABLE chat_messages; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.chat_messages TO app_rls;

--
-- Name: TABLE chunks; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.chunks TO app_rls;

--
-- Name: TABLE clickup_sync_state; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.clickup_sync_state TO app_rls;

--
-- Name: TABLE discovery_jobs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.discovery_jobs TO app_rls;

--
-- Name: TABLE discovery_type_candidates; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.discovery_type_candidates TO app_rls;

--
-- Name: TABLE documents; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.documents TO app_rls;

--
-- Name: TABLE embedding_policies; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.embedding_policies TO app_rls;

--
-- Name: TABLE graph_embedding_jobs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.graph_embedding_jobs TO app_rls;

--
-- Name: TABLE graph_objects; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.graph_objects TO app_rls;

--
-- Name: TABLE graph_relationships; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.graph_relationships TO app_rls;

--
-- Name: TABLE graph_template_packs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.graph_template_packs TO app_rls;

--
-- Name: TABLE integrations; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.integrations TO app_rls;

--
-- Name: TABLE invites; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.invites TO app_rls;

--
-- Name: TABLE llm_call_logs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.llm_call_logs TO app_rls;

--
-- Name: TABLE mcp_tool_calls; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.mcp_tool_calls TO app_rls;

--
-- Name: TABLE merge_provenance; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.merge_provenance TO app_rls;

--
-- Name: TABLE notifications; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.notifications TO app_rls;

--
-- Name: TABLE object_extraction_jobs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.object_extraction_jobs TO app_rls;

--
-- Name: TABLE object_type_schemas; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.object_type_schemas TO app_rls;

--
-- Name: TABLE organization_memberships; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.organization_memberships TO app_rls;

--
-- Name: TABLE orgs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.orgs TO app_rls;

--
-- Name: TABLE product_version_members; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.product_version_members TO app_rls;

--
-- Name: TABLE product_versions; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.product_versions TO app_rls;

--
-- Name: TABLE project_memberships; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.project_memberships TO app_rls;

--
-- Name: TABLE project_object_type_registry; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.project_object_type_registry TO app_rls;

--
-- Name: TABLE project_template_packs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.project_template_packs TO app_rls;

--
-- Name: TABLE projects; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.projects TO app_rls;

--
-- Name: TABLE relationship_type_schemas; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.relationship_type_schemas TO app_rls;

--
-- Name: TABLE schema_migrations; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.schema_migrations TO app_rls;

--
-- Name: TABLE settings; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.settings TO app_rls;

--
-- Name: TABLE system_process_logs; Type: ACL; Schema: kb; Owner: spec
--
GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLE kb.system_process_logs TO app_rls;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: kb; Owner: spec
--
ALTER DEFAULT PRIVILEGES FOR ROLE spec IN SCHEMA kb GRANT
SELECT
,
INSERT
,
    DELETE,
UPDATE
    ON TABLES TO app_rls;

--
-- PostgreSQL database dump complete
--

-- ============================================================================
-- Tags Table
-- ============================================================================
CREATE TABLE kb.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    product_version_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tags_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_tags_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE,
    CONSTRAINT fk_tags_product_version FOREIGN KEY (product_version_id) REFERENCES kb.product_versions(id) ON DELETE CASCADE,
    CONSTRAINT check_tags_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX idx_tags_project_id ON kb.tags(project_id);

CREATE INDEX idx_tags_organization_id ON kb.tags(organization_id);

CREATE INDEX idx_tags_product_version_id ON kb.tags(product_version_id);

CREATE INDEX idx_tags_name ON kb.tags(name);

CREATE INDEX idx_tags_created_at ON kb.tags(created_at DESC);

CREATE UNIQUE INDEX idx_tags_project_name_unique ON kb.tags(project_id, LOWER(name));

ALTER TABLE
    kb.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_isolation ON kb.tags USING (
    organization_id :: text = current_setting('app.current_organization_id', TRUE)
);

CREATE POLICY tags_read ON kb.tags FOR
SELECT
    USING (
        organization_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_insert ON kb.tags FOR
INSERT
    WITH CHECK (
        organization_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_update ON kb.tags FOR
UPDATE
    USING (
        organization_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_delete ON kb.tags FOR DELETE USING (
    organization_id :: text = current_setting('app.current_organization_id', TRUE)
);

CREATE TRIGGER tags_updated_at_trigger BEFORE
UPDATE
    ON kb.tags FOR EACH ROW EXECUTE FUNCTION kb.update_updated_at_column();

COMMENT ON TABLE kb.tags IS 'Tags for organizing and categorizing product versions';

COMMENT ON COLUMN kb.tags.id IS 'Unique identifier for the tag';

COMMENT ON COLUMN kb.tags.project_id IS 'Project this tag belongs to';

COMMENT ON COLUMN kb.tags.organization_id IS 'Organization this tag belongs to (for RLS)';

COMMENT ON COLUMN kb.tags.product_version_id IS 'Optional product version this tag is associated with';

COMMENT ON COLUMN kb.tags.name IS 'Tag name (unique per project, case-insensitive)';

COMMENT ON COLUMN kb.tags.description IS 'Optional description of what this tag represents';

-- ============================================================================
-- Status Column for Graph Objects
-- ============================================================================
ALTER TABLE
    kb.graph_objects
ADD
    COLUMN IF NOT EXISTS status text;

COMMENT ON COLUMN kb.graph_objects.status IS 'Optional status field for object lifecycle management (e.g., "draft", "active", "archived")';