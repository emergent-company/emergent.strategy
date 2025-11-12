--
-- PostgreSQL database dump
--

\restrict Imn6PylVaMyPRhxnR1oaBj2UPfGEpmWBbvLN5uKNaf0LrtHH3ZzM5Wwycxhjpps

-- Dumped from database version 16.10 (Debian 16.10-1.pgdg12+1)
-- Dumped by pg_dump version 17.6 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
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
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


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
        
        -- Log the refresh (could be extended to store in a refresh_log table)
        RAISE NOTICE 'Revision counts refreshed in %', refresh_duration;
        
        RETURN (
          SELECT COUNT(*)::INTEGER
          FROM kb.graph_object_revision_counts
        );
      END;
      $$;


--
-- Name: FUNCTION refresh_revision_counts(); Type: COMMENT; Schema: kb; Owner: -
--

COMMENT ON FUNCTION kb.refresh_revision_counts() IS 'Refreshes the materialized view of object revision counts. Call periodically via background job.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: user_emails; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_emails (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    zitadel_user_id text NOT NULL,
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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    outcome text NOT NULL,
    user_id uuid,
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
    details jsonb
);


--
-- Name: auth_introspection_cache; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.auth_introspection_cache (
    token_hash character varying(128) NOT NULL,
    introspection_data jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    owner_user_id uuid,
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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    citations jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chunks; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.chunks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    text text NOT NULL,
    embedding public.vector(768),
    tsv tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clickup_import_logs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.clickup_import_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    integration_id uuid NOT NULL,
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clickup_sync_state; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.clickup_sync_state (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    integration_id uuid NOT NULL,
    last_sync_at timestamp with time zone,
    last_successful_sync_at timestamp with time zone,
    sync_status text,
    last_error text,
    documents_imported integer DEFAULT 0 NOT NULL,
    spaces_synced jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    project_id uuid,
    source_url text,
    filename text,
    mime_type text,
    content text,
    content_hash text,
    integration_metadata jsonb,
    parent_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: embedding_policies; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.embedding_policies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    object_type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    max_property_size integer,
    required_labels text[] DEFAULT '{}'::text[] NOT NULL,
    excluded_labels text[] DEFAULT '{}'::text[] NOT NULL,
    relevant_paths text[] DEFAULT '{}'::text[] NOT NULL,
    excluded_statuses text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: graph_embedding_jobs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.graph_embedding_jobs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    object_id uuid NOT NULL,
    status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    priority integer DEFAULT 0 NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: graph_objects; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.graph_objects (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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
    embedding_v1 public.vector(1536)
);


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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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


--
-- Name: graph_template_packs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.graph_template_packs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    version text NOT NULL,
    description text,
    author text,
    license text,
    repository_url text,
    documentation_url text,
    source text DEFAULT 'manual'::text,
    discovery_job_id uuid,
    pending_review boolean DEFAULT false NOT NULL,
    object_type_schemas jsonb NOT NULL,
    relationship_type_schemas jsonb DEFAULT '{}'::jsonb NOT NULL,
    ui_configs jsonb DEFAULT '{}'::jsonb NOT NULL,
    extraction_prompts jsonb DEFAULT '{}'::jsonb NOT NULL,
    sql_views jsonb DEFAULT '[]'::jsonb NOT NULL,
    signature text,
    checksum text,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    deprecated_at timestamp with time zone,
    superseded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integrations; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.integrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    enabled boolean DEFAULT false NOT NULL,
    org_id text NOT NULL,
    project_id uuid NOT NULL,
    settings_encrypted bytea,
    logo_url text,
    webhook_secret text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invites; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.invites (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid,
    email text NOT NULL,
    role text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: llm_call_logs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.llm_call_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    process_id text NOT NULL,
    process_type text NOT NULL,
    model_name text NOT NULL,
    request_payload jsonb,
    response_payload jsonb,
    status text NOT NULL,
    error_message text,
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    cost_usd numeric(10,6),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer
);


--
-- Name: merge_provenance; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.merge_provenance (
    child_version_id uuid NOT NULL,
    parent_version_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text,
    severity text DEFAULT 'info'::text NOT NULL,
    related_resource_type text,
    related_resource_id uuid,
    read boolean DEFAULT false NOT NULL,
    dismissed boolean DEFAULT false NOT NULL,
    dismissed_at timestamp with time zone,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    expires_at timestamp with time zone,
    read_at timestamp with time zone,
    importance text DEFAULT 'other'::text NOT NULL,
    cleared_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    category text,
    source_type text,
    source_id text,
    action_url text,
    action_label text,
    group_key text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: object_extraction_jobs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.object_extraction_jobs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    document_id uuid,
    chunk_id uuid,
    job_type text DEFAULT 'full_extraction'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    enabled_types text[] DEFAULT '{}'::text[] NOT NULL,
    extraction_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    objects_created integer DEFAULT 0 NOT NULL,
    relationships_created integer DEFAULT 0 NOT NULL,
    suggestions_created integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    created_by uuid,
    reprocessing_of uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_type text,
    source_id text,
    source_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    debug_info jsonb,
    total_items integer DEFAULT 0 NOT NULL,
    processed_items integer DEFAULT 0 NOT NULL,
    successful_items integer DEFAULT 0 NOT NULL,
    failed_items integer DEFAULT 0 NOT NULL,
    logs jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: object_extraction_logs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.object_extraction_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    extraction_job_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    step_index integer NOT NULL,
    operation_type text NOT NULL,
    operation_name text,
    step text NOT NULL,
    status text NOT NULL,
    message text,
    input_data jsonb,
    output_data jsonb,
    error_message text,
    error_stack text,
    error_details jsonb,
    duration_ms integer,
    tokens_used integer,
    entity_count integer,
    relationship_count integer
);


--
-- Name: object_type_schemas; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.object_type_schemas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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
-- Name: organization_memberships; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.organization_memberships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orgs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.orgs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_object_type_registry; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.project_object_type_registry (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    type_name text NOT NULL,
    source text NOT NULL,
    template_pack_id uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    json_schema jsonb NOT NULL,
    ui_config jsonb,
    extraction_config jsonb,
    enabled boolean DEFAULT true NOT NULL,
    discovery_confidence double precision,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_template_packs; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.project_template_packs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    template_pack_id uuid NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    installed_by uuid,
    active boolean DEFAULT true NOT NULL,
    customizations jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.projects (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    kb_purpose text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_extract_objects boolean DEFAULT false NOT NULL,
    auto_extract_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    chat_prompt_template text
);


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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    process_id text NOT NULL,
    process_type text NOT NULL,
    level text NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: kb; Owner: -
--

CREATE TABLE kb.tags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    project_id uuid NOT NULL,
    product_version_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: typeorm_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.typeorm_migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: typeorm_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.typeorm_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: typeorm_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.typeorm_migrations_id_seq OWNED BY public.typeorm_migrations.id;


--
-- Name: typeorm_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typeorm_migrations ALTER COLUMN id SET DEFAULT nextval('public.typeorm_migrations_id_seq'::regclass);


--
-- Name: user_profiles PK_1ec6662219f4605723f1e41b6cb; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_profiles
    ADD CONSTRAINT "PK_1ec6662219f4605723f1e41b6cb" PRIMARY KEY (id);


--
-- Name: user_emails PK_3ef6c4be97ba94ea3ba65362ad0; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_emails
    ADD CONSTRAINT "PK_3ef6c4be97ba94ea3ba65362ad0" PRIMARY KEY (id);


--
-- Name: graph_objects PK_078aacf1069493166009e2f1f5d; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_objects
    ADD CONSTRAINT "PK_078aacf1069493166009e2f1f5d" PRIMARY KEY (id);


--
-- Name: audit_log PK_07fefa57f7f5ab8fc3f52b3ed0b; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.audit_log
    ADD CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY (id);


--
-- Name: object_type_schemas PK_10b0ea5bce13b0404825a0c94cd; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_type_schemas
    ADD CONSTRAINT "PK_10b0ea5bce13b0404825a0c94cd" PRIMARY KEY (id);


--
-- Name: clickup_import_logs PK_13e7092bd89052a1db253d0a6af; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.clickup_import_logs
    ADD CONSTRAINT "PK_13e7092bd89052a1db253d0a6af" PRIMARY KEY (id);


--
-- Name: branch_lineage PK_1f87552be159d70c1e49bc394d4; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.branch_lineage
    ADD CONSTRAINT "PK_1f87552be159d70c1e49bc394d4" PRIMARY KEY (branch_id, ancestor_branch_id);


--
-- Name: graph_embedding_jobs PK_29374bc3691491e73c6170ff8e3; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_embedding_jobs
    ADD CONSTRAINT "PK_29374bc3691491e73c6170ff8e3" PRIMARY KEY (id);


--
-- Name: chat_messages PK_40c55ee0e571e268b0d3cd37d10; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_messages
    ADD CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY (id);


--
-- Name: graph_template_packs PK_5bdff6c04be4775e82f1cef130b; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_template_packs
    ADD CONSTRAINT "PK_5bdff6c04be4775e82f1cef130b" PRIMARY KEY (id);


--
-- Name: clickup_sync_state PK_623fe43bafbc630a829e51c0024; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.clickup_sync_state
    ADD CONSTRAINT "PK_623fe43bafbc630a829e51c0024" PRIMARY KEY (id);


--
-- Name: projects PK_6271df0a7aed1d6c0691ce6ac50; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.projects
    ADD CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY (id);


--
-- Name: notifications PK_6a72c3c0f683f6462415e653c3a; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.notifications
    ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id);


--
-- Name: system_process_logs PK_734385c231b8c9ce4b9157913ae; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.system_process_logs
    ADD CONSTRAINT "PK_734385c231b8c9ce4b9157913ae" PRIMARY KEY (id);


--
-- Name: project_object_type_registry PK_734eabf182ef87e9b747c864d71; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_object_type_registry
    ADD CONSTRAINT "PK_734eabf182ef87e9b747c864d71" PRIMARY KEY (id);


--
-- Name: branches PK_7f37d3b42defea97f1df0d19535; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.branches
    ADD CONSTRAINT "PK_7f37d3b42defea97f1df0d19535" PRIMARY KEY (id);


--
-- Name: project_memberships PK_856d7bae2d9bddc94861d41eded; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_memberships
    ADD CONSTRAINT "PK_856d7bae2d9bddc94861d41eded" PRIMARY KEY (id);


--
-- Name: embedding_policies PK_923c15ce099ae3991a1d1a6b6b0; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.embedding_policies
    ADD CONSTRAINT "PK_923c15ce099ae3991a1d1a6b6b0" PRIMARY KEY (id);


--
-- Name: object_extraction_jobs PK_946f0b690e0a0972ebd0e6222d5; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT "PK_946f0b690e0a0972ebd0e6222d5" PRIMARY KEY (id);


--
-- Name: auth_introspection_cache PK_95b04c40e975a4b426cd21a07f5; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.auth_introspection_cache
    ADD CONSTRAINT "PK_95b04c40e975a4b426cd21a07f5" PRIMARY KEY (token_hash);


--
-- Name: integrations PK_9adcdc6d6f3922535361ce641e8; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.integrations
    ADD CONSTRAINT "PK_9adcdc6d6f3922535361ce641e8" PRIMARY KEY (id);


--
-- Name: object_extraction_logs PK_9ea0a4d02ba4f16f7f390589503; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_logs
    ADD CONSTRAINT "PK_9ea0a4d02ba4f16f7f390589503" PRIMARY KEY (id);


--
-- Name: orgs PK_9eed8bfad4c9e0dc8648e090efe; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.orgs
    ADD CONSTRAINT "PK_9eed8bfad4c9e0dc8648e090efe" PRIMARY KEY (id);


--
-- Name: chunks PK_a306e60b8fdf6e7de1be4be1e6a; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chunks
    ADD CONSTRAINT "PK_a306e60b8fdf6e7de1be4be1e6a" PRIMARY KEY (id);


--
-- Name: invites PK_aa52e96b44a714372f4dd31a0af; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.invites
    ADD CONSTRAINT "PK_aa52e96b44a714372f4dd31a0af" PRIMARY KEY (id);


--
-- Name: documents PK_ac51aa5181ee2036f5ca482857c; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.documents
    ADD CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY (id);


--
-- Name: llm_call_logs PK_ad84866fef0164fcee07558a67d; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.llm_call_logs
    ADD CONSTRAINT "PK_ad84866fef0164fcee07558a67d" PRIMARY KEY (id);


--
-- Name: product_version_members PK_b5b8707471c0c5c16f64f95f75c; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.product_version_members
    ADD CONSTRAINT "PK_b5b8707471c0c5c16f64f95f75c" PRIMARY KEY (product_version_id, object_canonical_id);


--
-- Name: project_template_packs PK_c3edf237839b7a0dd374437a670; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_template_packs
    ADD CONSTRAINT "PK_c3edf237839b7a0dd374437a670" PRIMARY KEY (id);


--
-- Name: merge_provenance PK_c6759cdb97dce23f85bb11cb5c1; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.merge_provenance
    ADD CONSTRAINT "PK_c6759cdb97dce23f85bb11cb5c1" PRIMARY KEY (child_version_id, parent_version_id);


--
-- Name: settings PK_c8639b7626fa94ba8265628f214; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.settings
    ADD CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY (key);


--
-- Name: organization_memberships PK_cd7be805730a4c778a5f45364af; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.organization_memberships
    ADD CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY (id);


--
-- Name: product_versions PK_dbd6ab6ae9343c6c6f2df5e76db; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.product_versions
    ADD CONSTRAINT "PK_dbd6ab6ae9343c6c6f2df5e76db" PRIMARY KEY (id);


--
-- Name: tags PK_e7dc17249a1148a1970748eda99; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.tags
    ADD CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY (id);


--
-- Name: graph_relationships PK_e858a7876b4b8a382c481bded76; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.graph_relationships
    ADD CONSTRAINT "PK_e858a7876b4b8a382c481bded76" PRIMARY KEY (id);


--
-- Name: chat_conversations PK_ff117d9f57807c4f2e3034a39f3; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_conversations
    ADD CONSTRAINT "PK_ff117d9f57807c4f2e3034a39f3" PRIMARY KEY (id);


--
-- Name: clickup_sync_state UQ_9693cb36fc36f7f3f36d8ff53b0; Type: CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.clickup_sync_state
    ADD CONSTRAINT "UQ_9693cb36fc36f7f3f36d8ff53b0" UNIQUE (integration_id);


--
-- Name: typeorm_migrations PK_bb2f075707dd300ba86d0208923; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typeorm_migrations
    ADD CONSTRAINT "PK_bb2f075707dd300ba86d0208923" PRIMARY KEY (id);


--
-- Name: IDX_2e88b95787b903d46ab3cc3eb9; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX "IDX_2e88b95787b903d46ab3cc3eb9" ON core.user_emails USING btree (user_id);


--
-- Name: IDX_3ef997e65ad4f83f35356a1a6e; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX "IDX_3ef997e65ad4f83f35356a1a6e" ON core.user_profiles USING btree (zitadel_user_id);


--
-- Name: IDX_6594597afde633cfeab9a806e4; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX "IDX_6594597afde633cfeab9a806e4" ON core.user_emails USING btree (email);


--
-- Name: IDX_1c7f91f13d7e1a438519d37ec3; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_1c7f91f13d7e1a438519d37ec3" ON kb.object_extraction_jobs USING btree (project_id);


--
-- Name: IDX_26573c7e713682c72216747770; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX "IDX_26573c7e713682c72216747770" ON kb.embedding_policies USING btree (project_id, object_type);


--
-- Name: IDX_2927d35a99e3f8b3d443496525; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_2927d35a99e3f8b3d443496525" ON kb.graph_relationships USING btree (organization_id, project_id);


--
-- Name: IDX_3844c9efd6d2e06105a117f90c; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_3844c9efd6d2e06105a117f90c" ON kb.object_extraction_jobs USING btree (status);


--
-- Name: IDX_38a73cbcc58fbed8e62a66d79b; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_38a73cbcc58fbed8e62a66d79b" ON kb.project_memberships USING btree (project_id);


--
-- Name: IDX_5352fc550034d507d6c76dd290; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_5352fc550034d507d6c76dd290" ON kb.organization_memberships USING btree (user_id);


--
-- Name: IDX_587ec50ea3409700ba7299c3b0; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_587ec50ea3409700ba7299c3b0" ON kb.object_extraction_jobs USING btree (organization_id);


--
-- Name: IDX_69427761f37533ae7767601a64; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_69427761f37533ae7767601a64" ON kb.documents USING btree (organization_id);


--
-- Name: IDX_6f5a7e4467cdc44037f209122e; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX "IDX_6f5a7e4467cdc44037f209122e" ON kb.chunks USING btree (document_id, chunk_index);


--
-- Name: IDX_7cb6c36ad5bf1bd4a413823ace; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_7cb6c36ad5bf1bd4a413823ace" ON kb.project_memberships USING btree (user_id);


--
-- Name: IDX_86ae2efbb9ce84dd652e0c96a4; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_86ae2efbb9ce84dd652e0c96a4" ON kb.organization_memberships USING btree (organization_id);


--
-- Name: IDX_95464140d7dc04d7efb0afd6be; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_95464140d7dc04d7efb0afd6be" ON kb.notifications USING btree (project_id);


--
-- Name: IDX_9a8a82462cab47c73d25f49261; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_9a8a82462cab47c73d25f49261" ON kb.notifications USING btree (user_id);


--
-- Name: IDX_a62c6bec50c07764e19636a5a4; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX "IDX_a62c6bec50c07764e19636a5a4" ON kb.documents USING btree (project_id, content_hash) WHERE (content_hash IS NOT NULL);


--
-- Name: IDX_a970f04cced6336cb2b1ad1f4e; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_a970f04cced6336cb2b1ad1f4e" ON kb.graph_relationships USING btree (src_id);


--
-- Name: IDX_b877acbf8d466f2889a2eeb147; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX "IDX_b877acbf8d466f2889a2eeb147" ON kb.project_memberships USING btree (project_id, user_id);


--
-- Name: IDX_b8c7752534a444c2f16ebf3d91; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_b8c7752534a444c2f16ebf3d91" ON kb.graph_objects USING btree (type);


--
-- Name: IDX_c04db004625a1c8be8abb6c046; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_c04db004625a1c8be8abb6c046" ON kb.graph_objects USING btree (canonical_id);


--
-- Name: IDX_caa73db1b161fa6b3a042290fe; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX "IDX_caa73db1b161fa6b3a042290fe" ON kb.organization_memberships USING btree (organization_id, user_id);


--
-- Name: IDX_cb7b1fb018b296f2107e998b2f; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_cb7b1fb018b296f2107e998b2f" ON kb.notifications USING btree (organization_id);


--
-- Name: IDX_d05c07bafeabc0850f94db035b; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_d05c07bafeabc0850f94db035b" ON kb.auth_introspection_cache USING btree (expires_at);


--
-- Name: IDX_d2e1c350bb54247677a298ec6f; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX "IDX_d2e1c350bb54247677a298ec6f" ON kb.graph_objects USING btree (organization_id, project_id, type, key) WHERE (deleted_at IS NULL);


--
-- Name: IDX_d841de45a719fe1f35213d7920; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_d841de45a719fe1f35213d7920" ON kb.chunks USING btree (document_id);


--
-- Name: IDX_df895a2e1799c53ef660d0aae6; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_df895a2e1799c53ef660d0aae6" ON kb.graph_embedding_jobs USING btree (object_id);


--
-- Name: IDX_e156b298c20873e14c362e789b; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_e156b298c20873e14c362e789b" ON kb.documents USING btree (project_id);


--
-- Name: IDX_f0021c2230e47af51928f35975; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_f0021c2230e47af51928f35975" ON kb.graph_embedding_jobs USING btree (status);


--
-- Name: IDX_f35de415032037ea629b1772e4; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_f35de415032037ea629b1772e4" ON kb.graph_relationships USING btree (type);


--
-- Name: IDX_f8b7ed75170d2d7dca4477cc94; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_f8b7ed75170d2d7dca4477cc94" ON kb.notifications USING btree (read);


--
-- Name: IDX_f8d6b0b40d75cdabb27cf81084; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX "IDX_f8d6b0b40d75cdabb27cf81084" ON kb.graph_relationships USING btree (dst_id);


--
-- Name: idx_revision_counts_canonical; Type: INDEX; Schema: kb; Owner: -
--

CREATE UNIQUE INDEX idx_revision_counts_canonical ON kb.graph_object_revision_counts USING btree (canonical_id);


--
-- Name: idx_revision_counts_count; Type: INDEX; Schema: kb; Owner: -
--

CREATE INDEX idx_revision_counts_count ON kb.graph_object_revision_counts USING btree (revision_count DESC);


--
-- Name: user_emails FK_2e88b95787b903d46ab3cc3eb91; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_emails
    ADD CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;


--
-- Name: chat_conversations FK_14ad2d35eccbe22a4bc61a9a065; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_conversations
    ADD CONSTRAINT "FK_14ad2d35eccbe22a4bc61a9a065" FOREIGN KEY (owner_user_id) REFERENCES core.user_profiles(id) ON DELETE SET NULL;


--
-- Name: project_memberships FK_38a73cbcc58fbed8e62a66d79b8; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_memberships
    ADD CONSTRAINT "FK_38a73cbcc58fbed8e62a66d79b8" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: chat_messages FK_3d623662d4ee1219b23cf61e649; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chat_messages
    ADD CONSTRAINT "FK_3d623662d4ee1219b23cf61e649" FOREIGN KEY (conversation_id) REFERENCES kb.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: project_template_packs FK_440cc8aae6f630830193b703f54; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_template_packs
    ADD CONSTRAINT "FK_440cc8aae6f630830193b703f54" FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id);


--
-- Name: organization_memberships FK_5352fc550034d507d6c76dd2901; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.organization_memberships
    ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;


--
-- Name: object_extraction_jobs FK_543b356bd6204a84bc8c038d309; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT "FK_543b356bd6204a84bc8c038d309" FOREIGN KEY (document_id) REFERENCES kb.documents(id);


--
-- Name: project_memberships FK_7cb6c36ad5bf1bd4a413823acec; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_memberships
    ADD CONSTRAINT "FK_7cb6c36ad5bf1bd4a413823acec" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;


--
-- Name: organization_memberships FK_86ae2efbb9ce84dd652e0c96a49; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.organization_memberships
    ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;


--
-- Name: notifications FK_9a8a82462cab47c73d25f49261f; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.notifications
    ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;


--
-- Name: project_object_type_registry FK_b8a4633d03d7ce7bc67701f8efb; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.project_object_type_registry
    ADD CONSTRAINT "FK_b8a4633d03d7ce7bc67701f8efb" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;


--
-- Name: chunks FK_d841de45a719fe1f35213d79207; Type: FK CONSTRAINT; Schema: kb; Owner: -
--

ALTER TABLE ONLY kb.chunks
    ADD CONSTRAINT "FK_d841de45a719fe1f35213d79207" FOREIGN KEY (document_id) REFERENCES kb.documents(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Imn6PylVaMyPRhxnR1oaBj2UPfGEpmWBbvLN5uKNaf0LrtHH3ZzM5Wwycxhjpps

