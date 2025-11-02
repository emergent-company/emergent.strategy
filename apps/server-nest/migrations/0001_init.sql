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
SET row_security = off;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;


--
-- Name: kb; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA kb;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: compute_document_content_hash(); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.compute_document_content_hash() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.content_hash := encode(digest(coalesce(NEW.content, ''), 'sha256'), 'hex'); RETURN NEW; END; $$;


--
-- Name: delete_old_cleared_notifications(); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.delete_old_cleared_notifications() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM kb.notifications
  WHERE cleared_at IS NOT NULL
    AND cleared_at < now() - interval '30 days';
END;
$$;


--
-- Name: get_object_revision_count(uuid); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.get_object_revision_count(p_object_id uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_canonical_id UUID;
    v_count INTEGER;
BEGIN
    -- Get canonical_id for the object
    SELECT canonical_id INTO v_canonical_id
    FROM kb.graph_objects
    WHERE id = p_object_id
    LIMIT 1;
    
    IF v_canonical_id IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Get count from materialized view (fast)
    SELECT revision_count INTO v_count
    FROM kb.graph_object_revision_counts
    WHERE canonical_id = v_canonical_id;
    
    -- Fallback to live count if not in materialized view
    IF v_count IS NULL THEN
        SELECT COUNT(*)::INTEGER INTO v_count
        FROM kb.graph_objects
        WHERE canonical_id = v_canonical_id
          AND deleted_at IS NULL;
    END IF;
    
    RETURN COALESCE(v_count, 0);
END;
$$;


--
-- Name: FUNCTION get_object_revision_count(p_object_id uuid); Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON FUNCTION kb.get_object_revision_count(p_object_id uuid) IS 'Returns the total number of versions for a given object ID. Uses materialized view when available, falls back to live count.';


--
-- Name: get_project_active_types(uuid); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.get_project_active_types(p_project_id uuid) RETURNS TABLE(type text, source text, json_schema jsonb, ui_config jsonb, extraction_config jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$ BEGIN RETURN QUERY
SELECT
    ptr.type,
    ptr.source,
    ptr.json_schema,
    ptr.ui_config,
    ptr.extraction_config
FROM
    kb.project_object_type_registry ptr
WHERE
    ptr.project_id = p_project_id
    AND ptr.enabled = true
ORDER BY
    ptr.type;

END;

$$;


--
-- Name: refresh_revision_counts(); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.refresh_revision_counts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    refresh_start TIMESTAMPTZ;
    refresh_end TIMESTAMPTZ;
    refresh_duration INTERVAL;
BEGIN
    refresh_start := clock_timestamp();
    
    REFRESH MATERIALIZED VIEW CONCURRENTLY kb.graph_object_revision_counts;
    
    refresh_end := clock_timestamp();
    refresh_duration := refresh_end - refresh_start;
    
    RAISE NOTICE 'Revision counts refreshed in %', refresh_duration;
    
    RETURN (SELECT COUNT(*)::INTEGER FROM kb.graph_object_revision_counts);
END;
$$;


--
-- Name: FUNCTION refresh_revision_counts(); Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON FUNCTION kb.refresh_revision_counts() IS 'Refreshes the materialized view of object revision counts. Call periodically via background job.';


--
-- Name: sync_document_org(); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.sync_document_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
                    BEGIN
                        IF NEW.project_id IS NOT NULL THEN
                            NEW.org_id := (SELECT org_id FROM kb.projects WHERE id = NEW.project_id);
                        END IF;
                        RETURN NEW;
                    END
                    $$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
                    BEGIN
                        NEW.updated_at := now();
                        RETURN NEW;
                    END$$;


--
-- Name: update_tsv(); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.update_tsv() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.tsv := to_tsvector('simple', NEW.text); RETURN NEW; END $$;


--
-- Name: wakeup_snoozed_notifications(); Type: FUNCTION; Schema: kb; Owner: -
--

CREATE FUNCTION kb.wakeup_snoozed_notifications() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE kb.notifications
  SET snoozed_until = NULL
  WHERE snoozed_until IS NOT NULL
    AND snoozed_until < now();
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: user_emails; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_emails (
    subject_id text NOT NULL,
    email text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_profiles (
    subject_id text NOT NULL,
    first_name text,
    last_name text,
    display_name text,
    phone_e164 text,
    avatar_object_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    outcome text NOT NULL,
    user_id uuid,
    user_email text,
    resource_type text,
    resource_id uuid,
    action text,
    endpoint text,
    http_method text,
    status_code integer,
    error_code text,
    error_message text,
    ip_address text,
    user_agent text,
    request_id text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE audit_log; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.audit_log IS 'Authorization and access audit trail for compliance and security analysis';


--
-- Name: COLUMN audit_log.event_type; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.audit_log.event_type IS 'Type of event: auth.*, authz.*, resource.*, search.*, graph.*';


--
-- Name: COLUMN audit_log.outcome; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.audit_log.outcome IS 'Result of operation: success, failure, denied';


--
-- Name: COLUMN audit_log.details; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.audit_log.details IS 'JSONB field containing scopes, missing_scopes, and custom metadata';


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: kb; Owner: -
--

CREATE SEQUENCE kb.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: kb; Owner: -
--

ALTER SEQUENCE kb.audit_log_id_seq OWNED BY kb.audit_log.id;


--
-- Name: branch_lineage; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.branch_lineage (
    branch_id uuid NOT NULL,
    ancestor_branch_id uuid NOT NULL,
    depth integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid,
    name text NOT NULL,
    parent_branch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_conversations; Type: TABLE; Schema: kb; Owner: -
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


--
-- Name: chat_messages; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    citations jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: chunks; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    text text,
    embedding public.vector(768),
    tsv tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clickup_import_logs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.clickup_import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    import_session_id text NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    step_index integer NOT NULL,
    operation_type text NOT NULL,
    operation_name text,
    status text NOT NULL,
    input_data jsonb,
    output_data jsonb,
    error_message text,
    error_stack text,
    duration_ms integer,
    items_processed integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_clickup_import_logs_operation CHECK ((operation_type = ANY (ARRAY['discovery'::text, 'fetch_spaces'::text, 'fetch_docs'::text, 'fetch_pages'::text, 'store_document'::text, 'create_extraction'::text, 'api_call'::text, 'error'::text]))),
    CONSTRAINT chk_clickup_import_logs_status CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'error'::text, 'warning'::text, 'info'::text])))
);


--
-- Name: TABLE clickup_import_logs; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.clickup_import_logs IS 'Logs for ClickUp import operations with detailed step tracking';


--
-- Name: COLUMN clickup_import_logs.import_session_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.clickup_import_logs.import_session_id IS 'Unique ID for each import run (UUID or timestamp-based)';


--
-- Name: COLUMN clickup_import_logs.step_index; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.clickup_import_logs.step_index IS 'Sequential step number within the import session';


--
-- Name: COLUMN clickup_import_logs.operation_type; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.clickup_import_logs.operation_type IS 'Type of operation: discovery, fetch_spaces, fetch_docs, fetch_pages, store_document, create_extraction, api_call, error';


--
-- Name: COLUMN clickup_import_logs.status; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.clickup_import_logs.status IS 'Status of the operation: pending, success, error, warning, info';


--
-- Name: COLUMN clickup_import_logs.items_processed; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.clickup_import_logs.items_processed IS 'Number of items processed in this step (e.g., number of docs, pages)';


--
-- Name: clickup_sync_state; Type: TABLE; Schema: kb; Owner: -
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


--
-- Name: TABLE clickup_sync_state; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.clickup_sync_state IS 'Tracks synchronization state for ClickUp integrations';


--
-- Name: COLUMN clickup_sync_state.sync_cursor; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.clickup_sync_state.sync_cursor IS 'Cursor for incremental sync (pagination token, timestamp, etc.)';


--
-- Name: COLUMN clickup_sync_state.workspace_cursor; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.clickup_sync_state.workspace_cursor IS 'Per-workspace sync cursors for parallel synchronization';


--
-- Name: discovery_jobs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.discovery_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    status text NOT NULL,
    progress jsonb DEFAULT '{"message": "Initializing...", "total_steps": 0, "current_step": 0}'::jsonb NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    kb_purpose text NOT NULL,
    discovered_types jsonb DEFAULT '[]'::jsonb,
    discovered_relationships jsonb DEFAULT '[]'::jsonb,
    template_pack_id uuid,
    error_message text,
    retry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discovery_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'analyzing_documents'::text, 'extracting_types'::text, 'refining_schemas'::text, 'creating_pack'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE discovery_jobs; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.discovery_jobs IS 'Background jobs for automatic discovery of object types and relationships from documents using LLM analysis. Each job analyzes a set of documents based on KB purpose and generates a custom template pack for review and installation.';


--
-- Name: COLUMN discovery_jobs.progress; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.discovery_jobs.progress IS 'Current progress state: {current_step: number, total_steps: number, message: string}';


--
-- Name: COLUMN discovery_jobs.config; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.discovery_jobs.config IS 'Job configuration including document_ids (array), batch_size (int), min_confidence (float 0-1), include_relationships (bool), max_iterations (int)';


--
-- Name: COLUMN discovery_jobs.discovered_types; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.discovery_jobs.discovered_types IS 'Array of discovered type candidates: [{type_name, description, confidence, properties, required_properties, examples, frequency}]';


--
-- Name: COLUMN discovery_jobs.discovered_relationships; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.discovery_jobs.discovered_relationships IS 'Array of discovered relationships: [{source_type, target_type, relation_type, description, confidence, cardinality}]';


--
-- Name: discovery_type_candidates; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.discovery_type_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    batch_number integer NOT NULL,
    type_name text NOT NULL,
    description text,
    confidence real NOT NULL,
    inferred_schema jsonb NOT NULL,
    example_instances jsonb DEFAULT '[]'::jsonb,
    frequency integer DEFAULT 1,
    proposed_relationships jsonb DEFAULT '[]'::jsonb,
    source_document_ids uuid[] DEFAULT '{}'::uuid[],
    extraction_context text,
    refinement_iteration integer DEFAULT 1,
    merged_from uuid[],
    status text DEFAULT 'candidate'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discovery_type_candidates_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT discovery_type_candidates_status_check CHECK ((status = ANY (ARRAY['candidate'::text, 'approved'::text, 'rejected'::text, 'merged'::text])))
);


--
-- Name: TABLE discovery_type_candidates; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.discovery_type_candidates IS 'Working memory for type candidates during the discovery process. Stores intermediate results from each batch analysis before refinement and merging into final discovered_types.';


--
-- Name: COLUMN discovery_type_candidates.inferred_schema; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.discovery_type_candidates.inferred_schema IS 'JSON Schema inferred from document analysis: {type: "object", properties: {...}, required: [...]}';


--
-- Name: COLUMN discovery_type_candidates.example_instances; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.discovery_type_candidates.example_instances IS 'Array of 2-5 sample instances extracted from documents, used for schema validation and user preview';


--
-- Name: COLUMN discovery_type_candidates.extraction_context; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.discovery_type_candidates.extraction_context IS 'Text snippet showing where this type was identified in the source documents, for provenance and debugging';


--
-- Name: documents; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid NOT NULL,
    source_url text,
    filename text,
    mime_type text,
    content text,
    content_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_document_id uuid,
    integration_metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: COLUMN documents.parent_document_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.documents.parent_document_id IS 'Reference to parent document for hierarchical structures (e.g., ClickUp page → parent page)';


--
-- Name: COLUMN documents.integration_metadata; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.documents.integration_metadata IS 'Source-specific metadata (ClickUp doc IDs, page hierarchy, creator info, etc.)';


--
-- Name: embedding_policies; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.embedding_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    object_type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    max_property_size integer DEFAULT 10000,
    required_labels text[] DEFAULT '{}'::text[] NOT NULL,
    excluded_labels text[] DEFAULT '{}'::text[] NOT NULL,
    relevant_paths text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    excluded_statuses text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: COLUMN embedding_policies.excluded_statuses; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.embedding_policies.excluded_statuses IS 'Status values that prevent embedding if present on the object (e.g., ["draft", "archived"])';


--
-- Name: extraction_jobs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.extraction_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    source_type character varying(50) NOT NULL,
    source_id uuid,
    source_metadata jsonb DEFAULT '{}'::jsonb,
    extraction_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_items integer DEFAULT 0,
    processed_items integer DEFAULT 0,
    successful_items integer DEFAULT 0,
    failed_items integer DEFAULT 0,
    discovered_types jsonb DEFAULT '[]'::jsonb,
    created_objects jsonb DEFAULT '[]'::jsonb,
    error_message text,
    error_details jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_progress_values CHECK (((processed_items >= 0) AND (successful_items >= 0) AND (failed_items >= 0) AND (processed_items = (successful_items + failed_items)))),
    CONSTRAINT check_timing_order CHECK ((((started_at IS NULL) OR (started_at >= created_at)) AND ((completed_at IS NULL) OR ((started_at IS NOT NULL) AND (completed_at >= started_at))))),
    CONSTRAINT extraction_jobs_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['document'::character varying, 'api'::character varying, 'manual'::character varying, 'bulk_import'::character varying])::text[]))),
    CONSTRAINT extraction_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE extraction_jobs; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.extraction_jobs IS 'Extraction job tracking table - tracks lifecycle of document extraction jobs (Phase 1 stub)';


--
-- Name: COLUMN extraction_jobs.source_type; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.source_type IS 'Type of extraction source: document (PDF/DOCX), api (external API), manual (user-triggered), bulk_import';


--
-- Name: COLUMN extraction_jobs.source_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.source_id IS 'Optional reference to source object (e.g., document object ID)';


--
-- Name: COLUMN extraction_jobs.extraction_config; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.extraction_config IS 'Extraction configuration: target types, filters, extraction rules, etc.';


--
-- Name: COLUMN extraction_jobs.status; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.status IS 'Job status: pending (queued), running (in progress), completed (success), failed (error), cancelled (user cancelled)';


--
-- Name: COLUMN extraction_jobs.discovered_types; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.discovered_types IS 'Array of type names discovered during extraction (for auto-discovery feature)';


--
-- Name: COLUMN extraction_jobs.created_objects; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.created_objects IS 'Array of object IDs created during extraction';


--
-- Name: COLUMN extraction_jobs.error_message; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.error_message IS 'Human-readable error message (if status=failed)';


--
-- Name: COLUMN extraction_jobs.error_details; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.extraction_jobs.error_details IS 'Detailed error information (stack trace, context) for debugging';


--
-- Name: graph_embedding_coverage; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.graph_embedding_coverage (
    model_version integer NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    objects_total integer DEFAULT 0 NOT NULL,
    objects_embedded integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: graph_embedding_jobs; Type: TABLE; Schema: kb; Owner: -
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
    CONSTRAINT graph_embedding_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'failed'::text, 'completed'::text])))
);


--
-- Name: graph_objects; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.graph_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    type text NOT NULL,
    key text NOT NULL,
    status text,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id uuid,
    canonical_id uuid NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    labels text[] DEFAULT '{}'::text[] NOT NULL,
    deleted_at timestamp with time zone,
    change_summary jsonb,
    content_hash bytea,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    fts tsvector,
    embedding bytea,
    embedding_updated_at timestamp with time zone,
    embedding_vec public.vector(32),
    extraction_job_id uuid,
    extraction_confidence real,
    needs_review boolean DEFAULT false,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    embedding_v1 public.vector(1536),
    embedding_v2 public.vector(1536),
    tsv tsvector,
    expires_at timestamp with time zone,
    CONSTRAINT graph_objects_extraction_confidence_check CHECK (((extraction_confidence IS NULL) OR ((extraction_confidence >= (0.0)::double precision) AND (extraction_confidence <= (1.0)::double precision))))
);

ALTER TABLE ONLY kb.graph_objects FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN graph_objects.status; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.graph_objects.status IS 'Optional status field for object lifecycle management (e.g., "draft", "active", "archived")';


--
-- Name: graph_object_revision_counts; Type: MATERIALIZED VIEW; Schema: kb; Owner: -
--

CREATE MATERIALIZED VIEW kb.graph_object_revision_counts AS
 SELECT canonical_id,
    project_id,
    count(*) AS revision_count,
    max(version) AS latest_version,
    min(created_at) AS first_created_at,
    max(created_at) AS last_updated_at
   FROM kb.graph_objects
  WHERE (deleted_at IS NULL)
  GROUP BY canonical_id, project_id
  WITH NO DATA;


--
-- Name: MATERIALIZED VIEW graph_object_revision_counts; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON MATERIALIZED VIEW kb.graph_object_revision_counts IS 'Pre-computed revision counts for graph objects. Refresh periodically to keep current.';


--
-- Name: graph_relationships; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.graph_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    type text NOT NULL,
    src_id uuid NOT NULL,
    dst_id uuid NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    weight real,
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    deleted_at timestamp with time zone,
    change_summary jsonb,
    content_hash bytea,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    canonical_id uuid NOT NULL,
    supersedes_id uuid,
    version integer DEFAULT 1 NOT NULL,
    branch_id uuid
);

ALTER TABLE ONLY kb.graph_relationships FORCE ROW LEVEL SECURITY;


--
-- Name: graph_template_packs; Type: TABLE; Schema: kb; Owner: -
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
    object_type_schemas jsonb DEFAULT '{}'::jsonb NOT NULL,
    relationship_type_schemas jsonb DEFAULT '{}'::jsonb NOT NULL,
    ui_configs jsonb DEFAULT '{}'::jsonb NOT NULL,
    extraction_prompts jsonb DEFAULT '{}'::jsonb NOT NULL,
    sql_views jsonb DEFAULT '[]'::jsonb,
    signature text,
    checksum text,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    deprecated_at timestamp with time zone,
    superseded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'manual'::text,
    discovery_job_id uuid,
    pending_review boolean DEFAULT false,
    CONSTRAINT graph_template_packs_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'discovered'::text, 'imported'::text, 'system'::text])))
);


--
-- Name: COLUMN graph_template_packs.source; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.graph_template_packs.source IS 'Origin of the template pack: manual (user-created), discovered (auto-discovery), imported (from file/marketplace), system (built-in)';


--
-- Name: COLUMN graph_template_packs.discovery_job_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.graph_template_packs.discovery_job_id IS 'Reference to the discovery job that created this pack (if source=discovered)';


--
-- Name: COLUMN graph_template_packs.pending_review; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.graph_template_packs.pending_review IS 'Whether this pack needs user review before installation. Set to true for discovered packs until reviewed and edited.';


--
-- Name: integrations; Type: TABLE; Schema: kb; Owner: -
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


--
-- Name: TABLE integrations; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.integrations IS 'Stores configuration for third-party integrations (ClickUp, Jira, etc.)';


--
-- Name: COLUMN integrations.settings_encrypted; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.integrations.settings_encrypted IS 'Encrypted JSON containing auth tokens, API keys, and configuration';


--
-- Name: COLUMN integrations.webhook_secret; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.integrations.webhook_secret IS 'Secret for validating webhook signatures from the integration provider';


--
-- Name: invites; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid,
    email text NOT NULL,
    role text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invites_role_check CHECK ((role = ANY (ARRAY['org_admin'::text, 'project_admin'::text, 'project_user'::text])))
);


--
-- Name: llm_call_logs; Type: TABLE; Schema: kb; Owner: -
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
    cost_usd numeric(10,6),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    organization_id text,
    project_id uuid,
    CONSTRAINT llm_call_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'timeout'::text, 'pending'::text])))
);


--
-- Name: TABLE llm_call_logs; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.llm_call_logs IS 'Tracks all LLM API calls with full request/response payloads, token usage, and cost calculation. Part of System Monitoring feature.';


--
-- Name: COLUMN llm_call_logs.usage_metrics; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.llm_call_logs.usage_metrics IS 'Raw usage data from LLM provider (tokens, model info, etc.)';


--
-- Name: COLUMN llm_call_logs.cost_usd; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.llm_call_logs.cost_usd IS 'Calculated cost in USD based on model pricing configuration';


--
-- Name: mcp_tool_calls; Type: TABLE; Schema: kb; Owner: -
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
    CONSTRAINT mcp_tool_calls_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'timeout'::text])))
);


--
-- Name: merge_provenance; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.merge_provenance (
    child_version_id uuid NOT NULL,
    parent_version_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merge_provenance_role_check CHECK ((role = ANY (ARRAY['source'::text, 'target'::text, 'base'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id text NOT NULL,
    category text NOT NULL,
    importance text DEFAULT 'other'::text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    details jsonb,
    source_type text,
    source_id uuid,
    action_url text,
    action_label text,
    read_at timestamp with time zone,
    cleared_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    group_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text,
    severity text DEFAULT 'info'::text,
    related_resource_type text,
    related_resource_id uuid,
    read boolean DEFAULT false,
    dismissed boolean DEFAULT false,
    dismissed_at timestamp with time zone,
    actions jsonb DEFAULT '[]'::jsonb,
    expires_at timestamp with time zone,
    CONSTRAINT chk_notifications_importance CHECK ((importance = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.notifications IS 'User notifications for extraction jobs, system events, and other activities (extended from original schema)';


--
-- Name: COLUMN notifications.organization_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.organization_id IS 'Organization this notification belongs to';


--
-- Name: COLUMN notifications.project_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.project_id IS 'Project this notification is related to';


--
-- Name: COLUMN notifications.subject_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.subject_id IS 'UUID of the subject entity this notification references';


--
-- Name: COLUMN notifications.category; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.category IS 'Notification category for filtering and routing';


--
-- Name: COLUMN notifications.importance; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.importance IS 'Priority level: low, normal, high, urgent';


--
-- Name: COLUMN notifications.title; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.title IS 'Short notification title';


--
-- Name: COLUMN notifications.message; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.message IS 'Full notification message';


--
-- Name: COLUMN notifications.read_at; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.read_at IS 'Timestamp when the notification was marked as read';


--
-- Name: COLUMN notifications.cleared_at; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.cleared_at IS 'Timestamp when the notification was dismissed/cleared by user';


--
-- Name: COLUMN notifications.snoozed_until; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.snoozed_until IS 'Timestamp until which the notification is snoozed';


--
-- Name: COLUMN notifications.type; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.type IS 'Notification type for filtering and routing (extraction_complete, extraction_failed, review_required, etc.)';


--
-- Name: COLUMN notifications.actions; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.notifications.actions IS 'Array of action objects: [{label: string, url?: string, action?: string, data?: any}]';


--
-- Name: object_extraction_jobs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.object_extraction_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    document_id uuid,
    chunk_id uuid,
    job_type text DEFAULT 'full_extraction'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    enabled_types text[] DEFAULT '{}'::text[],
    extraction_config jsonb DEFAULT '{}'::jsonb,
    objects_created integer DEFAULT 0,
    relationships_created integer DEFAULT 0,
    suggestions_created integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    created_by uuid,
    reprocessing_of uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_type text,
    source_id text,
    source_metadata jsonb DEFAULT '{}'::jsonb,
    debug_info jsonb,
    total_items integer DEFAULT 0,
    processed_items integer DEFAULT 0,
    successful_items integer DEFAULT 0,
    failed_items integer DEFAULT 0,
    logs jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT check_progress_consistency CHECK (((processed_items >= 0) AND (total_items >= 0) AND (successful_items >= 0) AND (failed_items >= 0) AND (processed_items <= total_items) AND ((successful_items + failed_items) <= processed_items))),
    CONSTRAINT object_extraction_jobs_check CHECK ((retry_count <= max_retries)),
    CONSTRAINT object_extraction_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['full_extraction'::text, 'type_discovery'::text, 'reprocessing'::text]))),
    CONSTRAINT object_extraction_jobs_retry_count_check CHECK ((retry_count >= 0)),
    CONSTRAINT object_extraction_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'processing'::text, 'completed'::text, 'requires_review'::text, 'failed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY kb.object_extraction_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE object_extraction_jobs; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.object_extraction_jobs IS 'Object extraction job tracking table - tracks lifecycle of document extraction jobs';


--
-- Name: COLUMN object_extraction_jobs.organization_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.organization_id IS 'Organization ID for multi-tenancy support';


--
-- Name: COLUMN object_extraction_jobs.status; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.status IS 'Job status: pending (queued), running (in progress), completed (success), failed (error), cancelled (user cancelled)';


--
-- Name: COLUMN object_extraction_jobs.extraction_config; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.extraction_config IS 'Extraction configuration: target types, filters, extraction rules, etc.';


--
-- Name: COLUMN object_extraction_jobs.error_message; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.error_message IS 'Human-readable error message (if status=failed)';


--
-- Name: COLUMN object_extraction_jobs.source_type; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.source_type IS 'Type of extraction source: document (PDF/DOCX), api (external API), manual (user-triggered), bulk_import';


--
-- Name: COLUMN object_extraction_jobs.source_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.source_id IS 'Optional reference to source object (e.g., document object ID)';


--
-- Name: COLUMN object_extraction_jobs.debug_info; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.debug_info IS 'Structured debug information emitted by the extraction worker (timeline, provider payloads, counters)';


--
-- Name: COLUMN object_extraction_jobs.total_items; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.total_items IS 'Total number of entities to process (set when LLM returns extraction results)';


--
-- Name: COLUMN object_extraction_jobs.processed_items; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.processed_items IS 'Number of entities processed so far (incremented after each entity)';


--
-- Name: COLUMN object_extraction_jobs.successful_items; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.successful_items IS 'Number of entities successfully created as graph objects';


--
-- Name: COLUMN object_extraction_jobs.failed_items; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_jobs.failed_items IS 'Number of entities that failed to be created';


--
-- Name: object_extraction_logs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.object_extraction_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extraction_job_id uuid NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    step_index integer NOT NULL,
    operation_type text NOT NULL,
    operation_name text,
    status text DEFAULT 'success'::text NOT NULL,
    input_data jsonb,
    output_data jsonb,
    error_message text,
    error_stack text,
    duration_ms integer,
    tokens_used integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE object_extraction_logs; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.object_extraction_logs IS 'Detailed logging for each step of object extraction jobs';


--
-- Name: COLUMN object_extraction_logs.step_index; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.step_index IS 'Sequential index of this step within the extraction job';


--
-- Name: COLUMN object_extraction_logs.operation_type; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.operation_type IS 'Type of extraction operation (e.g., fetch, parse, extract, link)';


--
-- Name: COLUMN object_extraction_logs.operation_name; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.operation_name IS 'Specific name of the operation being performed';


--
-- Name: COLUMN object_extraction_logs.input_data; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.input_data IS 'Input parameters/data for this extraction step';


--
-- Name: COLUMN object_extraction_logs.output_data; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.output_data IS 'Results/output from this extraction step';


--
-- Name: COLUMN object_extraction_logs.error_message; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.error_message IS 'Short error description if step failed';


--
-- Name: COLUMN object_extraction_logs.error_stack; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.error_stack IS 'Full error stack trace if step failed';


--
-- Name: COLUMN object_extraction_logs.duration_ms; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.duration_ms IS 'Duration of the step in milliseconds';


--
-- Name: COLUMN object_extraction_logs.tokens_used; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.object_extraction_logs.tokens_used IS 'Number of AI tokens consumed in this step';


--
-- Name: object_type_schemas; Type: TABLE; Schema: kb; Owner: -
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


--
-- Name: object_type_suggestions; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.object_type_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    suggested_type text NOT NULL,
    description text,
    source text DEFAULT 'pattern_analysis'::text NOT NULL,
    confidence real NOT NULL,
    inferred_schema jsonb NOT NULL,
    example_instances jsonb DEFAULT '[]'::jsonb,
    frequency integer DEFAULT 1,
    source_document_ids uuid[] DEFAULT '{}'::uuid[],
    source_chunk_ids uuid[] DEFAULT '{}'::uuid[],
    similar_to_types text[],
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    accepted_as_type text,
    merged_into_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT object_type_suggestions_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT object_type_suggestions_frequency_check CHECK ((frequency >= 1)),
    CONSTRAINT object_type_suggestions_source_check CHECK ((source = ANY (ARRAY['pattern_analysis'::text, 'user_feedback'::text, 'import'::text]))),
    CONSTRAINT object_type_suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'merged'::text])))
);

ALTER TABLE ONLY kb.object_type_suggestions FORCE ROW LEVEL SECURITY;


--
-- Name: organization_memberships; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    subject_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_memberships_role_check CHECK ((role = 'org_admin'::text))
);


--
-- Name: orgs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.orgs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_version_members; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.product_version_members (
    product_version_id uuid NOT NULL,
    object_canonical_id uuid NOT NULL,
    object_version_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_versions; Type: TABLE; Schema: kb; Owner: -
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


--
-- Name: project_memberships; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.project_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    subject_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_memberships_role_check CHECK ((role = ANY (ARRAY['project_admin'::text, 'project_user'::text])))
);


--
-- Name: project_object_type_registry; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.project_object_type_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    type text NOT NULL,
    source text NOT NULL,
    template_pack_id uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    json_schema jsonb NOT NULL,
    ui_config jsonb DEFAULT '{}'::jsonb,
    extraction_config jsonb DEFAULT '{}'::jsonb,
    enabled boolean DEFAULT true NOT NULL,
    discovery_confidence real,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_object_type_registry_discovery_confidence_check CHECK (((discovery_confidence IS NULL) OR ((discovery_confidence >= (0.0)::double precision) AND (discovery_confidence <= (1.0)::double precision)))),
    CONSTRAINT project_object_type_registry_source_check CHECK ((source = ANY (ARRAY['template'::text, 'custom'::text, 'discovered'::text])))
);

ALTER TABLE ONLY kb.project_object_type_registry FORCE ROW LEVEL SECURITY;


--
-- Name: project_template_packs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.project_template_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    template_pack_id uuid NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    installed_by uuid,
    active boolean DEFAULT true NOT NULL,
    customizations jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY kb.project_template_packs FORCE ROW LEVEL SECURITY;


--
-- Name: projects; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_extract_objects boolean DEFAULT true NOT NULL,
    auto_extract_config jsonb DEFAULT '{"enabled_types": null, "min_confidence": 0.7, "require_review": false, "notify_on_complete": true, "notification_channels": ["inbox"]}'::jsonb,
    kb_purpose text,
    chat_prompt_template text
);


--
-- Name: COLUMN projects.auto_extract_objects; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.projects.auto_extract_objects IS 'When true, automatically create extraction jobs when documents are uploaded to this project. Default: false (opt-in)';


--
-- Name: COLUMN projects.auto_extract_config; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.projects.auto_extract_config IS 'Configuration for automatic extraction: enabled_types (string[] or null), min_confidence (0-1), require_review (bool), notify_on_complete (bool), notification_channels (string[])';


--
-- Name: COLUMN projects.kb_purpose; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.projects.kb_purpose IS 'Markdown description of the knowledge base purpose, domain, and scope. Used by auto-discovery to understand context and guide type/relationship discovery.';


--
-- Name: COLUMN projects.chat_prompt_template; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.projects.chat_prompt_template IS 'Custom chat prompt template. Supports placeholders: {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, {{MESSAGE}}, {{MARKDOWN_RULES}}. If null, uses default template.';


--
-- Name: relationship_type_schemas; Type: TABLE; Schema: kb; Owner: -
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    multiplicity jsonb
);


--
-- Name: schema_migrations; Type: TABLE; Schema: kb; Owner: -
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


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.schema_migrations IS 'Tracks which database migrations have been applied';


--
-- Name: COLUMN schema_migrations.filename; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.schema_migrations.filename IS 'Name of the migration file (e.g., 0002_extraction_jobs.sql)';


--
-- Name: COLUMN schema_migrations.checksum; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.schema_migrations.checksum IS 'MD5 checksum of migration content for change detection';


--
-- Name: COLUMN schema_migrations.execution_time_ms; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.schema_migrations.execution_time_ms IS 'How long the migration took to execute';


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: kb; Owner: -
--

CREATE SEQUENCE kb.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: kb; Owner: -
--

ALTER SEQUENCE kb.schema_migrations_id_seq OWNED BY kb.schema_migrations.id;


--
-- Name: settings; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.settings (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_process_logs; Type: TABLE; Schema: kb; Owner: -
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
    CONSTRAINT chk_system_process_logs_level CHECK ((level = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text, 'fatal'::text]))),
    CONSTRAINT system_process_logs_level_check CHECK ((level = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text, 'fatal'::text])))
);


--
-- Name: TABLE system_process_logs; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.system_process_logs IS 'General process logging for extraction jobs, syncs, and other background tasks. Part of System Monitoring feature.';


--
-- Name: COLUMN system_process_logs.process_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.system_process_logs.process_id IS 'Reference ID to specific process instance (e.g., extraction_job_id)';


--
-- Name: COLUMN system_process_logs.process_type; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.system_process_logs.process_type IS 'Type of process: extraction_job, sync, chat_session, etc.';


--
-- Name: COLUMN system_process_logs.level; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.system_process_logs.level IS 'Log severity level: debug, info, warn, error, fatal';


--
-- Name: COLUMN system_process_logs.message; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.system_process_logs.message IS 'Log message text';


--
-- Name: COLUMN system_process_logs.metadata; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.system_process_logs.metadata IS 'Additional structured data (e.g., step_name, entity_count, etc.)';


--
-- Name: COLUMN system_process_logs."timestamp"; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.system_process_logs."timestamp" IS 'When the log entry was created';


--
-- Name: COLUMN system_process_logs.organization_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.system_process_logs.organization_id IS 'Organization this log belongs to (for multi-tenancy)';


--
-- Name: tags; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    project_id uuid NOT NULL,
    product_version_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE tags; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON TABLE kb.tags IS 'Tags for organizing and categorizing product versions';


--
-- Name: COLUMN tags.id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.tags.id IS 'Unique identifier for the tag';


--
-- Name: COLUMN tags.organization_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.tags.organization_id IS 'Organization this tag belongs to (for RLS)';


--
-- Name: COLUMN tags.project_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.tags.project_id IS 'Project this tag belongs to';


--
-- Name: COLUMN tags.product_version_id; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.tags.product_version_id IS 'Optional product version this tag is associated with';


--
-- Name: COLUMN tags.name; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.tags.name IS 'Tag name (unique per project, case-insensitive)';


--
-- Name: COLUMN tags.description; Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON COLUMN kb.tags.description IS 'Optional description of what this tag represents';


--
-- Name: user_notification_preferences; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.user_notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id text NOT NULL,
    category text NOT NULL,
    in_app_enabled boolean DEFAULT true,
    email_enabled boolean DEFAULT false,
    email_digest boolean DEFAULT false,
    force_important boolean DEFAULT false,
    force_other boolean DEFAULT false,
    auto_mark_read boolean DEFAULT false,
    auto_clear_after_days integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.schema_migrations ALTER COLUMN id SET DEFAULT nextval('kb.schema_migrations_id_seq'::regclass);


--
-- Name: user_emails user_emails_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_emails
    ADD CONSTRAINT user_emails_pkey PRIMARY KEY (subject_id, email);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (subject_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: branch_lineage branch_lineage_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.branch_lineage
    ADD CONSTRAINT branch_lineage_pkey PRIMARY KEY (branch_id, ancestor_branch_id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: branches branches_project_id_name_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.branches
    ADD CONSTRAINT branches_project_id_name_key UNIQUE (project_id, name);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: clickup_import_logs clickup_import_logs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.clickup_import_logs
    ADD CONSTRAINT clickup_import_logs_pkey PRIMARY KEY (id);


--
-- Name: clickup_sync_state clickup_sync_state_integration_id_unique; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.clickup_sync_state
    ADD CONSTRAINT clickup_sync_state_integration_id_unique UNIQUE (integration_id);


--
-- Name: clickup_sync_state clickup_sync_state_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.clickup_sync_state
    ADD CONSTRAINT clickup_sync_state_pkey PRIMARY KEY (id);


--
-- Name: discovery_jobs discovery_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.discovery_jobs
    ADD CONSTRAINT discovery_jobs_pkey PRIMARY KEY (id);


--
-- Name: discovery_type_candidates discovery_type_candidates_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.discovery_type_candidates
    ADD CONSTRAINT discovery_type_candidates_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: embedding_policies embedding_policies_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.embedding_policies
    ADD CONSTRAINT embedding_policies_pkey PRIMARY KEY (id);


--
-- Name: embedding_policies embedding_policies_project_id_object_type_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.embedding_policies
    ADD CONSTRAINT embedding_policies_project_id_object_type_key UNIQUE (project_id, object_type);


--
-- Name: extraction_jobs extraction_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.extraction_jobs
    ADD CONSTRAINT extraction_jobs_pkey PRIMARY KEY (id);


--
-- Name: graph_embedding_coverage graph_embedding_coverage_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_embedding_coverage
    ADD CONSTRAINT graph_embedding_coverage_pkey PRIMARY KEY (model_version, organization_id, project_id);


--
-- Name: graph_embedding_jobs graph_embedding_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_embedding_jobs
    ADD CONSTRAINT graph_embedding_jobs_pkey PRIMARY KEY (id);


--
-- Name: graph_objects graph_objects_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_objects
    ADD CONSTRAINT graph_objects_pkey PRIMARY KEY (id);


--
-- Name: graph_relationships graph_relationships_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_relationships
    ADD CONSTRAINT graph_relationships_pkey PRIMARY KEY (id);


--
-- Name: graph_template_packs graph_template_packs_name_version_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_template_packs
    ADD CONSTRAINT graph_template_packs_name_version_key UNIQUE (name, version);


--
-- Name: graph_template_packs graph_template_packs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_template_packs
    ADD CONSTRAINT graph_template_packs_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);


--
-- Name: invites invites_token_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.invites
    ADD CONSTRAINT invites_token_key UNIQUE (token);


--
-- Name: llm_call_logs llm_call_logs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.llm_call_logs
    ADD CONSTRAINT llm_call_logs_pkey PRIMARY KEY (id);


--
-- Name: mcp_tool_calls mcp_tool_calls_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_pkey PRIMARY KEY (id);


--
-- Name: merge_provenance merge_provenance_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.merge_provenance
    ADD CONSTRAINT merge_provenance_pkey PRIMARY KEY (child_version_id, parent_version_id, role);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: object_extraction_jobs object_extraction_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT object_extraction_jobs_pkey PRIMARY KEY (id);


--
-- Name: object_extraction_logs object_extraction_logs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_logs
    ADD CONSTRAINT object_extraction_logs_pkey PRIMARY KEY (id);


--
-- Name: object_type_schemas object_type_schemas_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_type_schemas
    ADD CONSTRAINT object_type_schemas_pkey PRIMARY KEY (id);


--
-- Name: object_type_suggestions object_type_suggestions_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_type_suggestions
    ADD CONSTRAINT object_type_suggestions_pkey PRIMARY KEY (id);


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: orgs orgs_name_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.orgs
    ADD CONSTRAINT orgs_name_key UNIQUE (name);


--
-- Name: orgs orgs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.orgs
    ADD CONSTRAINT orgs_pkey PRIMARY KEY (id);


--
-- Name: product_version_members product_version_members_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.product_version_members
    ADD CONSTRAINT product_version_members_pkey PRIMARY KEY (product_version_id, object_canonical_id);


--
-- Name: product_versions product_versions_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.product_versions
    ADD CONSTRAINT product_versions_pkey PRIMARY KEY (id);


--
-- Name: project_memberships project_memberships_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_memberships
    ADD CONSTRAINT project_memberships_pkey PRIMARY KEY (id);


--
-- Name: project_object_type_registry project_object_type_registry_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_object_type_registry
    ADD CONSTRAINT project_object_type_registry_pkey PRIMARY KEY (id);


--
-- Name: project_object_type_registry project_object_type_registry_project_id_type_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_object_type_registry
    ADD CONSTRAINT project_object_type_registry_project_id_type_key UNIQUE (project_id, type);


--
-- Name: project_template_packs project_template_packs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_template_packs
    ADD CONSTRAINT project_template_packs_pkey PRIMARY KEY (id);


--
-- Name: project_template_packs project_template_packs_project_id_template_pack_id_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_template_packs
    ADD CONSTRAINT project_template_packs_project_id_template_pack_id_key UNIQUE (project_id, template_pack_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: relationship_type_schemas relationship_type_schemas_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.relationship_type_schemas
    ADD CONSTRAINT relationship_type_schemas_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.schema_migrations
    ADD CONSTRAINT schema_migrations_filename_key UNIQUE (filename);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: system_process_logs system_process_logs_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.system_process_logs
    ADD CONSTRAINT system_process_logs_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tags tags_project_name_unique; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.tags
    ADD CONSTRAINT tags_project_name_unique UNIQUE (project_id, name);


--
-- Name: integrations uq_integration_project; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.integrations
    ADD CONSTRAINT uq_integration_project UNIQUE (name, project_id);


--
-- Name: user_notification_preferences user_notification_preferences_pkey; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_notification_preferences user_notification_preferences_subject_id_category_key; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_subject_id_category_key UNIQUE (subject_id, category);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_audit_log_compliance; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_compliance ON kb.audit_log USING btree (user_id, "timestamp" DESC, outcome);


--
-- Name: idx_audit_log_details; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_details ON kb.audit_log USING gin (details);


--
-- Name: idx_audit_log_endpoint; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_endpoint ON kb.audit_log USING btree (endpoint);


--
-- Name: idx_audit_log_event_type; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_event_type ON kb.audit_log USING btree (event_type);


--
-- Name: idx_audit_log_outcome; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_outcome ON kb.audit_log USING btree (outcome);


--
-- Name: idx_audit_log_resource; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_resource ON kb.audit_log USING btree (resource_type, resource_id);


--
-- Name: idx_audit_log_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_timestamp ON kb.audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_user ON kb.audit_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_audit_log_user_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_user_id ON kb.audit_log USING btree (user_id);


--
-- Name: idx_audit_log_user_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_audit_log_user_timestamp ON kb.audit_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_branch_lineage_ancestor_depth; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_branch_lineage_ancestor_depth ON kb.branch_lineage USING btree (ancestor_branch_id, depth);


--
-- Name: idx_chat_conversations_org_proj; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_chat_conversations_org_proj ON kb.chat_conversations USING btree (organization_id, project_id, updated_at DESC);


--
-- Name: idx_chat_conversations_owner; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_chat_conversations_owner ON kb.chat_conversations USING btree (owner_subject_id) WHERE (owner_subject_id IS NOT NULL);


--
-- Name: idx_chat_messages_conv; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_chat_messages_conv ON kb.chat_messages USING btree (conversation_id, created_at);


--
-- Name: idx_chunks_doc; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_chunks_doc ON kb.chunks USING btree (document_id);


--
-- Name: idx_chunks_doc_chunkindex; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_chunks_doc_chunkindex ON kb.chunks USING btree (document_id, chunk_index);


--
-- Name: idx_chunks_embedding; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_chunks_embedding ON kb.chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='10');


--
-- Name: idx_chunks_tsv; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_chunks_tsv ON kb.chunks USING gin (tsv);


--
-- Name: idx_clickup_import_logs_errors; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_clickup_import_logs_errors ON kb.clickup_import_logs USING btree (import_session_id, status) WHERE (status = 'error'::text);


--
-- Name: idx_clickup_import_logs_integration; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_clickup_import_logs_integration ON kb.clickup_import_logs USING btree (integration_id);


--
-- Name: idx_clickup_import_logs_operation; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_clickup_import_logs_operation ON kb.clickup_import_logs USING btree (import_session_id, operation_type);


--
-- Name: idx_clickup_import_logs_session; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_clickup_import_logs_session ON kb.clickup_import_logs USING btree (import_session_id);


--
-- Name: idx_clickup_import_logs_steps; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_clickup_import_logs_steps ON kb.clickup_import_logs USING btree (import_session_id, step_index, logged_at);


--
-- Name: idx_clickup_sync_integration; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_clickup_sync_integration ON kb.clickup_sync_state USING btree (integration_id);


--
-- Name: idx_clickup_sync_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_clickup_sync_status ON kb.clickup_sync_state USING btree (import_status);


--
-- Name: idx_discovery_candidates_batch; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_candidates_batch ON kb.discovery_type_candidates USING btree (job_id, batch_number);


--
-- Name: idx_discovery_candidates_confidence; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_candidates_confidence ON kb.discovery_type_candidates USING btree (job_id, confidence DESC);


--
-- Name: idx_discovery_candidates_job; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_candidates_job ON kb.discovery_type_candidates USING btree (job_id);


--
-- Name: idx_discovery_candidates_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_candidates_status ON kb.discovery_type_candidates USING btree (job_id, status);


--
-- Name: idx_discovery_jobs_created; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_jobs_created ON kb.discovery_jobs USING btree (created_at DESC);


--
-- Name: idx_discovery_jobs_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_jobs_project ON kb.discovery_jobs USING btree (project_id);


--
-- Name: idx_discovery_jobs_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_jobs_status ON kb.discovery_jobs USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'analyzing_documents'::text, 'extracting_types'::text, 'refining_schemas'::text]));


--
-- Name: idx_discovery_jobs_template_pack; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_discovery_jobs_template_pack ON kb.discovery_jobs USING btree (template_pack_id) WHERE (template_pack_id IS NOT NULL);


--
-- Name: idx_documents_integration_metadata; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_documents_integration_metadata ON kb.documents USING gin (integration_metadata);


--
-- Name: idx_documents_org; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_documents_org ON kb.documents USING btree (organization_id);


--
-- Name: idx_documents_parent; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_documents_parent ON kb.documents USING btree (parent_document_id) WHERE (parent_document_id IS NOT NULL);


--
-- Name: idx_documents_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_documents_project ON kb.documents USING btree (project_id);


--
-- Name: idx_documents_project_hash; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_documents_project_hash ON kb.documents USING btree (project_id, content_hash);


--
-- Name: idx_embedding_policies_excluded_statuses; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_embedding_policies_excluded_statuses ON kb.embedding_policies USING gin (excluded_statuses);


--
-- Name: idx_embedding_policies_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_embedding_policies_project ON kb.embedding_policies USING btree (project_id);


--
-- Name: idx_embedding_policies_project_object_type; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_embedding_policies_project_object_type ON kb.embedding_policies USING btree (project_id, object_type);


--
-- Name: idx_extraction_jobs_created_by; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_created_by ON kb.extraction_jobs USING btree (created_by, created_at DESC) WHERE (created_by IS NOT NULL);


--
-- Name: idx_extraction_jobs_document; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_document ON kb.object_extraction_jobs USING btree (document_id) WHERE (document_id IS NOT NULL);


--
-- Name: idx_extraction_jobs_progress; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_progress ON kb.object_extraction_jobs USING btree (status, processed_items, total_items) WHERE (status = ANY (ARRAY['running'::text, 'pending'::text]));


--
-- Name: idx_extraction_jobs_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_project ON kb.extraction_jobs USING btree (project_id, created_at DESC);


--
-- Name: idx_extraction_jobs_project_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_project_status ON kb.object_extraction_jobs USING btree (project_id, status);


--
-- Name: idx_extraction_jobs_source; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_source ON kb.extraction_jobs USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: idx_extraction_jobs_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_status ON kb.extraction_jobs USING btree (status, created_at DESC);


--
-- Name: idx_extraction_jobs_status_created; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_jobs_status_created ON kb.object_extraction_jobs USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_extraction_logs_errors; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_logs_errors ON kb.object_extraction_logs USING btree (extraction_job_id) WHERE (status = 'error'::text);


--
-- Name: idx_extraction_logs_job; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_logs_job ON kb.object_extraction_logs USING btree (extraction_job_id);


--
-- Name: idx_extraction_logs_job_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_logs_job_id ON kb.object_extraction_logs USING btree (extraction_job_id);


--
-- Name: idx_extraction_logs_job_step; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_logs_job_step ON kb.object_extraction_logs USING btree (extraction_job_id, step_index);


--
-- Name: idx_extraction_logs_operation; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_logs_operation ON kb.object_extraction_logs USING btree (extraction_job_id, operation_type);


--
-- Name: idx_extraction_logs_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_extraction_logs_status ON kb.object_extraction_logs USING btree (status);


--
-- Name: idx_graph_embedding_jobs_object; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs USING btree (object_id);


--
-- Name: idx_graph_embedding_jobs_object_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_embedding_jobs_object_id ON kb.graph_embedding_jobs USING btree (object_id);


--
-- Name: idx_graph_embedding_jobs_object_pending; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_graph_embedding_jobs_object_pending ON kb.graph_embedding_jobs USING btree (object_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_graph_embedding_jobs_priority; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_embedding_jobs_priority ON kb.graph_embedding_jobs USING btree (priority DESC, scheduled_at);


--
-- Name: idx_graph_embedding_jobs_status_sched; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_embedding_jobs_status_sched ON kb.graph_embedding_jobs USING btree (status, scheduled_at);


--
-- Name: idx_graph_objects_branch_canonical_version; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_branch_canonical_version ON kb.graph_objects USING btree (branch_id, canonical_id, version DESC);


--
-- Name: idx_graph_objects_branch_not_deleted; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_branch_not_deleted ON kb.graph_objects USING btree (project_id, branch_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_graph_objects_canonical; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_canonical ON kb.graph_objects USING btree (canonical_id);


--
-- Name: idx_graph_objects_canonical_version; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_canonical_version ON kb.graph_objects USING btree (canonical_id, version DESC);


--
-- Name: idx_graph_objects_confidence; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_confidence ON kb.graph_objects USING btree (extraction_confidence DESC) WHERE (extraction_confidence IS NOT NULL);


--
-- Name: idx_graph_objects_embedding_v1; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_embedding_v1 ON kb.graph_objects USING hnsw (embedding_v1 public.vector_cosine_ops);


--
-- Name: idx_graph_objects_embedding_v2; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_embedding_v2 ON kb.graph_objects USING hnsw (embedding_v2 public.vector_cosine_ops);


--
-- Name: idx_graph_objects_embedding_vec; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_embedding_vec ON kb.graph_objects USING ivfflat (embedding_vec public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_graph_objects_extraction_job; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_extraction_job ON kb.graph_objects USING btree (extraction_job_id) WHERE (extraction_job_id IS NOT NULL);


--
-- Name: idx_graph_objects_fts; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_fts ON kb.graph_objects USING gin (fts);


--
-- Name: idx_graph_objects_head_identity_branch; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_graph_objects_head_identity_branch ON kb.graph_objects USING btree (project_id, branch_id, type, key) WHERE ((supersedes_id IS NULL) AND (deleted_at IS NULL) AND (key IS NOT NULL));


--
-- Name: idx_graph_objects_key; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_key ON kb.graph_objects USING btree (key) WHERE (key IS NOT NULL);


--
-- Name: idx_graph_objects_labels; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_labels ON kb.graph_objects USING gin (labels);


--
-- Name: idx_graph_objects_needs_review; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_needs_review ON kb.graph_objects USING btree (project_id, needs_review) WHERE (needs_review = true);


--
-- Name: idx_graph_objects_not_deleted; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_not_deleted ON kb.graph_objects USING btree (project_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_graph_objects_project_type; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_project_type ON kb.graph_objects USING btree (project_id, type);


--
-- Name: idx_graph_objects_props; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_props ON kb.graph_objects USING gin (properties jsonb_path_ops);


--
-- Name: idx_graph_objects_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_status ON kb.graph_objects USING btree (status) WHERE (status IS NOT NULL);


--
-- Name: idx_graph_objects_tsv; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_objects_tsv ON kb.graph_objects USING gin (tsv);


--
-- Name: idx_graph_rel_branch_canonical_version; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_branch_canonical_version ON kb.graph_relationships USING btree (branch_id, canonical_id, version DESC);


--
-- Name: idx_graph_rel_branch_not_deleted; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_branch_not_deleted ON kb.graph_relationships USING btree (project_id, branch_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_graph_rel_canonical; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_canonical ON kb.graph_relationships USING btree (canonical_id);


--
-- Name: idx_graph_rel_canonical_version; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_canonical_version ON kb.graph_relationships USING btree (canonical_id, version DESC);


--
-- Name: idx_graph_rel_dst; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_dst ON kb.graph_relationships USING btree (dst_id);


--
-- Name: idx_graph_rel_not_deleted; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_not_deleted ON kb.graph_relationships USING btree (project_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_graph_rel_project_type; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_project_type ON kb.graph_relationships USING btree (project_id, type);


--
-- Name: idx_graph_rel_src; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_src ON kb.graph_relationships USING btree (src_id);


--
-- Name: idx_graph_rel_valid_to; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_graph_rel_valid_to ON kb.graph_relationships USING btree (valid_to) WHERE (valid_to IS NULL);


--
-- Name: idx_graph_relationships_head_identity_branch; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_graph_relationships_head_identity_branch ON kb.graph_relationships USING btree (project_id, branch_id, type, src_id, dst_id) WHERE ((supersedes_id IS NULL) AND (deleted_at IS NULL));


--
-- Name: idx_integrations_enabled; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_integrations_enabled ON kb.integrations USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_integrations_name; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_integrations_name ON kb.integrations USING btree (name);


--
-- Name: idx_integrations_org; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_integrations_org ON kb.integrations USING btree (organization_id);


--
-- Name: idx_integrations_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_integrations_project ON kb.integrations USING btree (project_id);


--
-- Name: idx_invites_token; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_invites_token ON kb.invites USING btree (token);


--
-- Name: idx_llm_call_logs_model_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_llm_call_logs_model_timestamp ON kb.llm_call_logs USING btree (model_name, started_at DESC);


--
-- Name: idx_llm_call_logs_org_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_llm_call_logs_org_timestamp ON kb.llm_call_logs USING btree (organization_id, started_at DESC) WHERE (organization_id IS NOT NULL);


--
-- Name: idx_llm_call_logs_process_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_llm_call_logs_process_id ON kb.llm_call_logs USING btree (process_id);


--
-- Name: idx_llm_call_logs_project_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_llm_call_logs_project_timestamp ON kb.llm_call_logs USING btree (project_id, started_at DESC) WHERE (project_id IS NOT NULL);


--
-- Name: idx_llm_call_logs_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_llm_call_logs_status ON kb.llm_call_logs USING btree (status, started_at DESC);


--
-- Name: idx_mcp_tool_calls_org; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_mcp_tool_calls_org ON kb.mcp_tool_calls USING btree (organization_id, "timestamp");


--
-- Name: idx_mcp_tool_calls_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_mcp_tool_calls_project ON kb.mcp_tool_calls USING btree (project_id, "timestamp");


--
-- Name: idx_mcp_tool_calls_session; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_mcp_tool_calls_session ON kb.mcp_tool_calls USING btree (session_id, turn_number);


--
-- Name: idx_mcp_tool_calls_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_mcp_tool_calls_status ON kb.mcp_tool_calls USING btree (status, "timestamp");


--
-- Name: idx_mcp_tool_calls_tool_name; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_mcp_tool_calls_tool_name ON kb.mcp_tool_calls USING btree (tool_name, "timestamp");


--
-- Name: idx_notif_prefs_user; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notif_prefs_user ON kb.user_notification_preferences USING btree (subject_id);


--
-- Name: idx_notifications_active; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_active ON kb.notifications USING btree (subject_id, importance, read_at, cleared_at) WHERE ((read_at IS NULL) AND (cleared_at IS NULL));


--
-- Name: idx_notifications_category; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_category ON kb.notifications USING btree (subject_id, category);


--
-- Name: idx_notifications_cleared; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_cleared ON kb.notifications USING btree (subject_id, cleared_at) WHERE (cleared_at IS NOT NULL);


--
-- Name: idx_notifications_cleared_at; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_cleared_at ON kb.notifications USING btree (cleared_at) WHERE (cleared_at IS NOT NULL);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_created ON kb.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_expires; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_expires ON kb.notifications USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_notifications_group; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_group ON kb.notifications USING btree (group_key, created_at DESC);


--
-- Name: idx_notifications_importance; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_importance ON kb.notifications USING btree (importance);


--
-- Name: idx_notifications_important; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_important ON kb.notifications USING btree (subject_id, importance) WHERE (cleared_at IS NULL);


--
-- Name: idx_notifications_org_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_org_project ON kb.notifications USING btree (organization_id, project_id);


--
-- Name: idx_notifications_read_at; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_read_at ON kb.notifications USING btree (read_at) WHERE (read_at IS NOT NULL);


--
-- Name: idx_notifications_related_resource; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_related_resource ON kb.notifications USING btree (related_resource_type, related_resource_id) WHERE ((related_resource_type IS NOT NULL) AND (related_resource_id IS NOT NULL));


--
-- Name: idx_notifications_snoozed; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_snoozed ON kb.notifications USING btree (snoozed_until) WHERE (snoozed_until IS NOT NULL);


--
-- Name: idx_notifications_snoozed_until; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_snoozed_until ON kb.notifications USING btree (snoozed_until) WHERE (snoozed_until IS NOT NULL);


--
-- Name: idx_notifications_subject; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_subject ON kb.notifications USING btree (subject_id);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_type ON kb.notifications USING btree (type) WHERE (type IS NOT NULL);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_unread ON kb.notifications USING btree (subject_id) WHERE (read_at IS NULL);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_notifications_user ON kb.notifications USING btree (subject_id, created_at DESC);


--
-- Name: idx_object_extraction_jobs_created_by; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_object_extraction_jobs_created_by ON kb.object_extraction_jobs USING btree (created_by, created_at DESC) WHERE (created_by IS NOT NULL);


--
-- Name: idx_object_extraction_jobs_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_object_extraction_jobs_project ON kb.object_extraction_jobs USING btree (project_id, created_at DESC);


--
-- Name: idx_object_extraction_jobs_project_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_object_extraction_jobs_project_status ON kb.object_extraction_jobs USING btree (project_id, status, created_at DESC);


--
-- Name: idx_object_extraction_jobs_source; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_object_extraction_jobs_source ON kb.object_extraction_jobs USING btree (source_type, source_id);


--
-- Name: idx_object_extraction_jobs_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_object_extraction_jobs_status ON kb.object_extraction_jobs USING btree (status, created_at DESC);


--
-- Name: idx_object_type_schemas_canonical_version; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_object_type_schemas_canonical_version ON kb.object_type_schemas USING btree (canonical_id, version DESC);


--
-- Name: idx_object_type_schemas_head_identity; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_object_type_schemas_head_identity ON kb.object_type_schemas USING btree (project_id, type) WHERE (supersedes_id IS NULL);


--
-- Name: idx_org_membership_unique; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_org_membership_unique ON kb.organization_memberships USING btree (organization_id, subject_id);


--
-- Name: idx_orgs_name; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_orgs_name ON kb.orgs USING btree (lower(name));


--
-- Name: idx_product_version_members_version; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_product_version_members_version ON kb.product_version_members USING btree (product_version_id, object_version_id);


--
-- Name: idx_product_versions_project_name; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_product_versions_project_name ON kb.product_versions USING btree (project_id, lower(name));


--
-- Name: idx_project_membership_unique; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_project_membership_unique ON kb.project_memberships USING btree (project_id, subject_id);


--
-- Name: idx_project_template_packs_org; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_project_template_packs_org ON kb.project_template_packs USING btree (organization_id, project_id);


--
-- Name: idx_project_template_packs_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_project_template_packs_project ON kb.project_template_packs USING btree (project_id, active);


--
-- Name: idx_project_template_packs_template; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_project_template_packs_template ON kb.project_template_packs USING btree (template_pack_id);


--
-- Name: idx_project_type_registry_project; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_project_type_registry_project ON kb.project_object_type_registry USING btree (project_id, enabled);


--
-- Name: idx_project_type_registry_source; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_project_type_registry_source ON kb.project_object_type_registry USING btree (source);


--
-- Name: idx_project_type_registry_template; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_project_type_registry_template ON kb.project_object_type_registry USING btree (template_pack_id) WHERE (template_pack_id IS NOT NULL);


--
-- Name: idx_project_type_registry_template_pack; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_project_type_registry_template_pack ON kb.project_object_type_registry USING btree (template_pack_id);


--
-- Name: idx_projects_auto_extract; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_projects_auto_extract ON kb.projects USING btree (id, auto_extract_objects) WHERE (auto_extract_objects = true);


--
-- Name: idx_projects_org; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_projects_org ON kb.projects USING btree (organization_id);


--
-- Name: idx_projects_org_lower_name; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_projects_org_lower_name ON kb.projects USING btree (organization_id, lower(name));


--
-- Name: idx_relationship_type_schemas_canonical_version; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_relationship_type_schemas_canonical_version ON kb.relationship_type_schemas USING btree (canonical_id, version DESC);


--
-- Name: idx_relationship_type_schemas_head_identity; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_relationship_type_schemas_head_identity ON kb.relationship_type_schemas USING btree (project_id, type) WHERE (supersedes_id IS NULL);


--
-- Name: idx_revision_counts_canonical; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_revision_counts_canonical ON kb.graph_object_revision_counts USING btree (canonical_id);


--
-- Name: idx_revision_counts_count; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_revision_counts_count ON kb.graph_object_revision_counts USING btree (revision_count DESC);


--
-- Name: idx_settings_key; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_settings_key ON kb.settings USING btree (key);


--
-- Name: idx_system_process_logs_level; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_level ON kb.system_process_logs USING btree (level);


--
-- Name: idx_system_process_logs_level_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_level_timestamp ON kb.system_process_logs USING btree (level, "timestamp" DESC);


--
-- Name: idx_system_process_logs_org; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_org ON kb.system_process_logs USING btree (organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: idx_system_process_logs_org_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_org_timestamp ON kb.system_process_logs USING btree (organization_id, "timestamp" DESC) WHERE (organization_id IS NOT NULL);


--
-- Name: idx_system_process_logs_process; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_process ON kb.system_process_logs USING btree (process_id) WHERE (process_id IS NOT NULL);


--
-- Name: idx_system_process_logs_process_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_process_id ON kb.system_process_logs USING btree (process_id);


--
-- Name: idx_system_process_logs_process_type_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_process_type_timestamp ON kb.system_process_logs USING btree (process_type, "timestamp" DESC);


--
-- Name: idx_system_process_logs_project_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_project_timestamp ON kb.system_process_logs USING btree (project_id, "timestamp" DESC) WHERE (project_id IS NOT NULL);


--
-- Name: idx_system_process_logs_timestamp; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_system_process_logs_timestamp ON kb.system_process_logs USING btree ("timestamp" DESC);


--
-- Name: idx_tags_created_at; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_tags_created_at ON kb.tags USING btree (created_at DESC);


--
-- Name: idx_tags_name; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_tags_name ON kb.tags USING btree (name);


--
-- Name: idx_tags_organization_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_tags_organization_id ON kb.tags USING btree (organization_id);


--
-- Name: idx_tags_product_version_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_tags_product_version_id ON kb.tags USING btree (product_version_id);


--
-- Name: idx_tags_project_id; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_tags_project_id ON kb.tags USING btree (project_id);


--
-- Name: idx_tags_project_name_lower; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_tags_project_name_lower ON kb.tags USING btree (project_id, lower(name));


--
-- Name: idx_tags_project_name_unique; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_tags_project_name_unique ON kb.tags USING btree (project_id, lower(name));


--
-- Name: idx_template_packs_discovery_job; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_template_packs_discovery_job ON kb.graph_template_packs USING btree (discovery_job_id) WHERE (discovery_job_id IS NOT NULL);


--
-- Name: idx_template_packs_name; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_template_packs_name ON kb.graph_template_packs USING btree (name);


--
-- Name: idx_template_packs_pending_review; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_template_packs_pending_review ON kb.graph_template_packs USING btree (pending_review) WHERE (pending_review = true);


--
-- Name: idx_template_packs_published; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_template_packs_published ON kb.graph_template_packs USING btree (published_at DESC) WHERE (deprecated_at IS NULL);


--
-- Name: idx_template_packs_source; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_template_packs_source ON kb.graph_template_packs USING btree (source);


--
-- Name: idx_type_suggestions_confidence; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_type_suggestions_confidence ON kb.object_type_suggestions USING btree (confidence DESC) WHERE (status = 'pending'::text);


--
-- Name: idx_type_suggestions_created; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_type_suggestions_created ON kb.object_type_suggestions USING btree (created_at DESC);


--
-- Name: idx_type_suggestions_project_status; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_type_suggestions_project_status ON kb.object_type_suggestions USING btree (project_id, status);


--
-- Name: idx_schema_migrations_applied; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schema_migrations_applied ON public.schema_migrations USING btree (applied_at DESC);


--
-- Name: chunks trg_chunks_tsv; Type: TRIGGER; Schema: kb; Owner: -
--

CREATE TRIGGER trg_chunks_tsv BEFORE INSERT OR UPDATE ON kb.chunks FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();


--
-- Name: documents trg_documents_content_hash; Type: TRIGGER; Schema: kb; Owner: -
--

CREATE TRIGGER trg_documents_content_hash BEFORE INSERT OR UPDATE OF content ON kb.documents FOR EACH ROW EXECUTE FUNCTION kb.compute_document_content_hash();


--
-- Name: documents trg_documents_sync_org; Type: TRIGGER; Schema: kb; Owner: -
--

CREATE TRIGGER trg_documents_sync_org BEFORE INSERT OR UPDATE ON kb.documents FOR EACH ROW EXECUTE FUNCTION kb.sync_document_org();


--
-- Name: documents trg_documents_touch; Type: TRIGGER; Schema: kb; Owner: -
--

CREATE TRIGGER trg_documents_touch BEFORE UPDATE ON kb.documents FOR EACH ROW EXECUTE FUNCTION kb.touch_updated_at();


--
-- Name: graph_objects trg_graph_objects_touch; Type: TRIGGER; Schema: kb; Owner: -
--

CREATE TRIGGER trg_graph_objects_touch BEFORE UPDATE ON kb.graph_objects FOR EACH ROW EXECUTE FUNCTION kb.touch_updated_at();


--
-- Name: settings trg_settings_touch; Type: TRIGGER; Schema: kb; Owner: -
--

CREATE TRIGGER trg_settings_touch BEFORE UPDATE ON kb.settings FOR EACH ROW EXECUTE FUNCTION kb.touch_updated_at();


--
-- Name: user_emails user_emails_subject_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_emails
    ADD CONSTRAINT user_emails_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;


--
-- Name: branch_lineage branch_lineage_ancestor_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.branch_lineage
    ADD CONSTRAINT branch_lineage_ancestor_branch_id_fkey FOREIGN KEY (ancestor_branch_id) REFERENCES kb.branches(id) ON DELETE CASCADE;


--
-- Name: branch_lineage branch_lineage_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.branch_lineage
    ADD CONSTRAINT branch_lineage_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES kb.branches(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_conversations
    ADD CONSTRAINT chat_conversations_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_owner_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_conversations
    ADD CONSTRAINT chat_conversations_owner_subject_id_fkey FOREIGN KEY (owner_subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_conversations
    ADD CONSTRAINT chat_conversations_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES kb.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chunks chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chunks
    ADD CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES kb.documents(id) ON DELETE CASCADE;


--
-- Name: clickup_sync_state clickup_sync_state_integration_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.clickup_sync_state
    ADD CONSTRAINT clickup_sync_state_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES kb.integrations(id) ON DELETE CASCADE;


--
-- Name: discovery_jobs discovery_jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.discovery_jobs
    ADD CONSTRAINT discovery_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: discovery_jobs discovery_jobs_template_pack_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.discovery_jobs
    ADD CONSTRAINT discovery_jobs_template_pack_id_fkey FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE SET NULL;


--
-- Name: discovery_type_candidates discovery_type_candidates_job_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.discovery_type_candidates
    ADD CONSTRAINT discovery_type_candidates_job_id_fkey FOREIGN KEY (job_id) REFERENCES kb.discovery_jobs(id) ON DELETE CASCADE;


--
-- Name: documents documents_parent_document_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.documents
    ADD CONSTRAINT documents_parent_document_id_fkey FOREIGN KEY (parent_document_id) REFERENCES kb.documents(id) ON DELETE SET NULL;


--
-- Name: documents documents_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.documents
    ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: embedding_policies embedding_policies_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.embedding_policies
    ADD CONSTRAINT embedding_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: extraction_jobs fk_extraction_jobs_org; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.extraction_jobs
    ADD CONSTRAINT fk_extraction_jobs_org FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: extraction_jobs fk_extraction_jobs_project; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.extraction_jobs
    ADD CONSTRAINT fk_extraction_jobs_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: graph_embedding_jobs fk_graph_embedding_jobs_object; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_embedding_jobs
    ADD CONSTRAINT fk_graph_embedding_jobs_object FOREIGN KEY (object_id) REFERENCES kb.graph_objects(id) ON DELETE CASCADE;


--
-- Name: object_extraction_jobs fk_object_extraction_jobs_org; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT fk_object_extraction_jobs_org FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: object_extraction_jobs fk_object_extraction_jobs_project; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT fk_object_extraction_jobs_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: system_process_logs fk_project; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.system_process_logs
    ADD CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: llm_call_logs fk_project; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.llm_call_logs
    ADD CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: project_object_type_registry fk_project_type_registry_template_pack; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_object_type_registry
    ADD CONSTRAINT fk_project_type_registry_template_pack FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE SET NULL;


--
-- Name: graph_embedding_jobs graph_embedding_jobs_object_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_embedding_jobs
    ADD CONSTRAINT graph_embedding_jobs_object_id_fkey FOREIGN KEY (object_id) REFERENCES kb.graph_objects(id) ON DELETE CASCADE;


--
-- Name: graph_objects graph_objects_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_objects
    ADD CONSTRAINT graph_objects_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES kb.branches(id) ON DELETE SET NULL;


--
-- Name: graph_objects graph_objects_extraction_job_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_objects
    ADD CONSTRAINT graph_objects_extraction_job_id_fkey FOREIGN KEY (extraction_job_id) REFERENCES kb.object_extraction_jobs(id) ON DELETE SET NULL;


--
-- Name: graph_objects graph_objects_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_objects
    ADD CONSTRAINT graph_objects_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: graph_objects graph_objects_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_objects
    ADD CONSTRAINT graph_objects_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: graph_objects graph_objects_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_objects
    ADD CONSTRAINT graph_objects_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES kb.graph_objects(id) ON DELETE SET NULL;


--
-- Name: graph_relationships graph_relationships_branch_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_relationships
    ADD CONSTRAINT graph_relationships_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES kb.branches(id) ON DELETE SET NULL;


--
-- Name: graph_relationships graph_relationships_dst_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_relationships
    ADD CONSTRAINT graph_relationships_dst_id_fkey FOREIGN KEY (dst_id) REFERENCES kb.graph_objects(id) ON DELETE CASCADE;


--
-- Name: graph_relationships graph_relationships_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_relationships
    ADD CONSTRAINT graph_relationships_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: graph_relationships graph_relationships_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_relationships
    ADD CONSTRAINT graph_relationships_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: graph_relationships graph_relationships_src_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_relationships
    ADD CONSTRAINT graph_relationships_src_id_fkey FOREIGN KEY (src_id) REFERENCES kb.graph_objects(id) ON DELETE CASCADE;


--
-- Name: graph_template_packs graph_template_packs_discovery_job_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_template_packs
    ADD CONSTRAINT graph_template_packs_discovery_job_id_fkey FOREIGN KEY (discovery_job_id) REFERENCES kb.discovery_jobs(id) ON DELETE SET NULL;


--
-- Name: graph_template_packs graph_template_packs_superseded_by_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_template_packs
    ADD CONSTRAINT graph_template_packs_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES kb.graph_template_packs(id);


--
-- Name: invites invites_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.invites
    ADD CONSTRAINT invites_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: invites invites_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.invites
    ADD CONSTRAINT invites_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.notifications
    ADD CONSTRAINT notifications_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;


--
-- Name: object_extraction_jobs object_extraction_jobs_chunk_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT object_extraction_jobs_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES kb.chunks(id) ON DELETE CASCADE;


--
-- Name: object_extraction_jobs object_extraction_jobs_document_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT object_extraction_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES kb.documents(id) ON DELETE CASCADE;


--
-- Name: object_extraction_jobs object_extraction_jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT object_extraction_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: object_extraction_jobs object_extraction_jobs_reprocessing_of_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT object_extraction_jobs_reprocessing_of_fkey FOREIGN KEY (reprocessing_of) REFERENCES kb.object_extraction_jobs(id);


--
-- Name: object_extraction_logs object_extraction_logs_extraction_job_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_logs
    ADD CONSTRAINT object_extraction_logs_extraction_job_id_fkey FOREIGN KEY (extraction_job_id) REFERENCES kb.object_extraction_jobs(id) ON DELETE CASCADE;


--
-- Name: object_type_suggestions object_type_suggestions_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_type_suggestions
    ADD CONSTRAINT object_type_suggestions_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.organization_memberships
    ADD CONSTRAINT organization_memberships_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.organization_memberships
    ADD CONSTRAINT organization_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;


--
-- Name: product_version_members product_version_members_product_version_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.product_version_members
    ADD CONSTRAINT product_version_members_product_version_id_fkey FOREIGN KEY (product_version_id) REFERENCES kb.product_versions(id) ON DELETE CASCADE;


--
-- Name: product_versions product_versions_base_product_version_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.product_versions
    ADD CONSTRAINT product_versions_base_product_version_id_fkey FOREIGN KEY (base_product_version_id) REFERENCES kb.product_versions(id) ON DELETE SET NULL;


--
-- Name: product_versions product_versions_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.product_versions
    ADD CONSTRAINT product_versions_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: project_memberships project_memberships_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_memberships
    ADD CONSTRAINT project_memberships_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: project_memberships project_memberships_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_memberships
    ADD CONSTRAINT project_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;


--
-- Name: project_object_type_registry project_object_type_registry_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_object_type_registry
    ADD CONSTRAINT project_object_type_registry_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: project_object_type_registry project_object_type_registry_template_pack_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_object_type_registry
    ADD CONSTRAINT project_object_type_registry_template_pack_id_fkey FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE CASCADE;


--
-- Name: project_template_packs project_template_packs_project_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_template_packs
    ADD CONSTRAINT project_template_packs_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: project_template_packs project_template_packs_template_pack_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_template_packs
    ADD CONSTRAINT project_template_packs_template_pack_id_fkey FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE RESTRICT;


--
-- Name: projects projects_org_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.projects
    ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: tags tags_product_version_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.tags
    ADD CONSTRAINT tags_product_version_id_fkey FOREIGN KEY (product_version_id) REFERENCES kb.product_versions(id) ON DELETE CASCADE;


--
-- Name: user_notification_preferences user_notification_preferences_subject_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;


--
-- Name: extraction_jobs; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.extraction_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: extraction_jobs extraction_jobs_delete_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_delete_policy ON kb.extraction_jobs FOR DELETE USING ((project_id IN ( SELECT p.id
   FROM (kb.projects p
     JOIN kb.orgs o ON ((p.organization_id = o.id)))
  WHERE (p.id = extraction_jobs.project_id))));


--
-- Name: object_extraction_jobs extraction_jobs_delete_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_delete_policy ON kb.object_extraction_jobs FOR DELETE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: extraction_jobs extraction_jobs_insert_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_insert_policy ON kb.extraction_jobs FOR INSERT WITH CHECK ((project_id IN ( SELECT p.id
   FROM (kb.projects p
     JOIN kb.orgs o ON ((p.organization_id = o.id))))));


--
-- Name: object_extraction_jobs extraction_jobs_insert_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_insert_policy ON kb.object_extraction_jobs FOR INSERT WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: extraction_jobs extraction_jobs_select_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_select_policy ON kb.extraction_jobs FOR SELECT USING ((project_id IN ( SELECT p.id
   FROM (kb.projects p
     JOIN kb.orgs o ON ((p.organization_id = o.id)))
  WHERE (p.id = extraction_jobs.project_id))));


--
-- Name: object_extraction_jobs extraction_jobs_select_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs FOR SELECT USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: extraction_jobs extraction_jobs_update_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_update_policy ON kb.extraction_jobs FOR UPDATE USING ((project_id IN ( SELECT p.id
   FROM (kb.projects p
     JOIN kb.orgs o ON ((p.organization_id = o.id)))
  WHERE (p.id = extraction_jobs.project_id))));


--
-- Name: object_extraction_jobs extraction_jobs_update_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY extraction_jobs_update_policy ON kb.object_extraction_jobs FOR UPDATE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_objects; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.graph_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: graph_objects graph_objects_delete; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_objects_delete ON kb.graph_objects FOR DELETE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_objects graph_objects_insert; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_objects_insert ON kb.graph_objects FOR INSERT WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_objects graph_objects_select; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_objects_select ON kb.graph_objects FOR SELECT USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_objects graph_objects_update; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_objects_update ON kb.graph_objects FOR UPDATE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true))))) WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_relationships; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.graph_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: graph_relationships graph_relationships_delete; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_relationships_delete ON kb.graph_relationships FOR DELETE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_relationships graph_relationships_insert; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_relationships_insert ON kb.graph_relationships FOR INSERT WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_relationships graph_relationships_select; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_relationships_select ON kb.graph_relationships FOR SELECT USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: graph_relationships graph_relationships_update; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY graph_relationships_update ON kb.graph_relationships FOR UPDATE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true))))) WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) <> ''::text) AND ((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text) OR ((project_id)::text = current_setting('app.current_project_id'::text, true)))) OR ((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) <> ''::text) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: llm_call_logs; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.llm_call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_call_logs llm_call_logs_insert_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY llm_call_logs_insert_policy ON kb.llm_call_logs FOR INSERT TO app_rls WITH CHECK (true);


--
-- Name: llm_call_logs llm_call_logs_select_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY llm_call_logs_select_policy ON kb.llm_call_logs FOR SELECT TO app_rls USING (true);


--
-- Name: llm_call_logs llm_call_logs_update_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY llm_call_logs_update_policy ON kb.llm_call_logs FOR UPDATE TO app_rls USING (true) WITH CHECK (true);


--
-- Name: mcp_tool_calls; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_calls mcp_tool_calls_tenant_isolation; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY mcp_tool_calls_tenant_isolation ON kb.mcp_tool_calls USING ((((project_id)::text = current_setting('app.current_project_id'::text, true)) OR (organization_id = current_setting('app.current_org_id'::text, true))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_insert_system; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY notifications_insert_system ON kb.notifications FOR INSERT WITH CHECK (true);


--
-- Name: object_extraction_jobs; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.object_extraction_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: object_type_suggestions; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.object_type_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: project_object_type_registry; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.project_object_type_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: project_template_packs; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.project_template_packs ENABLE ROW LEVEL SECURITY;

--
-- Name: project_template_packs project_template_packs_delete_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_template_packs_delete_policy ON kb.project_template_packs FOR DELETE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: project_template_packs project_template_packs_insert_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_template_packs_insert_policy ON kb.project_template_packs FOR INSERT WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: project_template_packs project_template_packs_select_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_template_packs_select_policy ON kb.project_template_packs FOR SELECT USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: project_template_packs project_template_packs_update_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_template_packs_update_policy ON kb.project_template_packs FOR UPDATE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: project_object_type_registry project_type_registry_delete_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_type_registry_delete_policy ON kb.project_object_type_registry FOR DELETE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: project_object_type_registry project_type_registry_insert_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_type_registry_insert_policy ON kb.project_object_type_registry FOR INSERT WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: project_object_type_registry project_type_registry_select_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_type_registry_select_policy ON kb.project_object_type_registry FOR SELECT USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: project_object_type_registry project_type_registry_update_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY project_type_registry_update_policy ON kb.project_object_type_registry FOR UPDATE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: system_process_logs; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.system_process_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: system_process_logs system_process_logs_insert_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY system_process_logs_insert_policy ON kb.system_process_logs FOR INSERT TO app_rls WITH CHECK (true);


--
-- Name: system_process_logs system_process_logs_select_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY system_process_logs_select_policy ON kb.system_process_logs FOR SELECT TO app_rls USING (true);


--
-- Name: tags; Type: ROW SECURITY; Schema: kb; Owner: -
--

ALTER TABLE kb.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_delete; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY tags_delete ON kb.tags FOR DELETE USING (((organization_id)::text = current_setting('app.current_organization_id'::text, true)));


--
-- Name: tags tags_insert; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY tags_insert ON kb.tags FOR INSERT WITH CHECK (((organization_id)::text = current_setting('app.current_organization_id'::text, true)));


--
-- Name: tags tags_isolation; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY tags_isolation ON kb.tags USING (((organization_id)::text = current_setting('app.current_organization_id'::text, true)));


--
-- Name: tags tags_read; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY tags_read ON kb.tags FOR SELECT USING (((organization_id)::text = current_setting('app.current_organization_id'::text, true)));


--
-- Name: tags tags_update; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY tags_update ON kb.tags FOR UPDATE USING (((organization_id)::text = current_setting('app.current_organization_id'::text, true)));


--
-- Name: object_type_suggestions type_suggestions_delete_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY type_suggestions_delete_policy ON kb.object_type_suggestions FOR DELETE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: object_type_suggestions type_suggestions_insert_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY type_suggestions_insert_policy ON kb.object_type_suggestions FOR INSERT WITH CHECK ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: object_type_suggestions type_suggestions_select_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY type_suggestions_select_policy ON kb.object_type_suggestions FOR SELECT USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- Name: object_type_suggestions type_suggestions_update_policy; Type: POLICY; Schema: kb; Owner: -
--

CREATE POLICY type_suggestions_update_policy ON kb.object_type_suggestions FOR UPDATE USING ((((COALESCE(current_setting('app.current_organization_id'::text, true), ''::text) = ''::text) AND (COALESCE(current_setting('app.current_project_id'::text, true), ''::text) = ''::text)) OR (((organization_id)::text = current_setting('app.current_organization_id'::text, true)) AND ((project_id)::text = current_setting('app.current_project_id'::text, true)))));


--
-- PostgreSQL database dump complete
--


