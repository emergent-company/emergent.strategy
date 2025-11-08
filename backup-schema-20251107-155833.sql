--
-- PostgreSQL database dump
--

\restrict fyBUazyoDBRnOwxHcbDXLbB6zc26FfBIhkXW6IOplTVdxbDrhlUvgJ9OuT1OCWK

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
-- Name: kb; Type: SCHEMA; Schema: -; Owner: spec
--

CREATE SCHEMA kb;


ALTER SCHEMA kb OWNER TO spec;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: refresh_revision_counts(); Type: FUNCTION; Schema: kb; Owner: spec
--

CREATE FUNCTION kb.refresh_revision_counts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$ DECLARE refresh_start TIMESTAMPTZ;

refresh_end TIMESTAMPTZ;

refresh_duration INTERVAL;

is_populated BOOLEAN;

BEGIN refresh_start := clock_timestamp();

-- Check if the materialized view is populated
SELECT
    ispopulated INTO is_populated
FROM
    pg_matviews
WHERE
    schemaname = 'kb'
    AND matviewname = 'graph_object_revision_counts';

-- Use CONCURRENTLY only if already populated, otherwise do regular refresh
IF is_populated THEN REFRESH MATERIALIZED VIEW CONCURRENTLY kb.graph_object_revision_counts;

ELSE REFRESH MATERIALIZED VIEW kb.graph_object_revision_counts;

END IF;

refresh_end := clock_timestamp();

refresh_duration := refresh_end - refresh_start;

RAISE NOTICE 'Revision counts refreshed in % (concurrent: %)',
refresh_duration,
is_populated;

RETURN (
    SELECT
        COUNT(*) :: INTEGER
    FROM
        kb.graph_object_revision_counts
);

END;

$$;


ALTER FUNCTION kb.refresh_revision_counts() OWNER TO spec;

--
-- Name: update_tsv(); Type: FUNCTION; Schema: kb; Owner: spec
--

CREATE FUNCTION kb.update_tsv() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.tsv := to_tsvector('simple', NEW.text);
    RETURN NEW;
END;
$$;


ALTER FUNCTION kb.update_tsv() OWNER TO spec;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_introspection_cache; Type: TABLE; Schema: kb; Owner: spec
--

CREATE TABLE kb.auth_introspection_cache (
    token_hash character varying(128) NOT NULL,
    introspection_data jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE kb.auth_introspection_cache OWNER TO spec;

--
-- Name: TABLE auth_introspection_cache; Type: COMMENT; Schema: kb; Owner: spec
--

COMMENT ON TABLE kb.auth_introspection_cache IS 'Caches Zitadel OAuth2 token introspection results to reduce API calls and improve authentication performance';


--
-- Name: COLUMN auth_introspection_cache.token_hash; Type: COMMENT; Schema: kb; Owner: spec
--

COMMENT ON COLUMN kb.auth_introspection_cache.token_hash IS 'SHA-512 hash of the access token (used as cache key for security)';


--
-- Name: COLUMN auth_introspection_cache.introspection_data; Type: COMMENT; Schema: kb; Owner: spec
--

COMMENT ON COLUMN kb.auth_introspection_cache.introspection_data IS 'Full introspection response from Zitadel stored as JSONB (includes user info, roles, scopes)';


--
-- Name: COLUMN auth_introspection_cache.expires_at; Type: COMMENT; Schema: kb; Owner: spec
--

COMMENT ON COLUMN kb.auth_introspection_cache.expires_at IS 'Timestamp when cache entry expires (based on token expiry and configured TTL)';


--
-- Name: COLUMN auth_introspection_cache.created_at; Type: COMMENT; Schema: kb; Owner: spec
--

COMMENT ON COLUMN kb.auth_introspection_cache.created_at IS 'Timestamp when cache entry was created';


--
-- Name: chunks; Type: TABLE; Schema: kb; Owner: spec
--

CREATE TABLE kb.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    text text NOT NULL,
    embedding public.vector(768),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tsv tsvector
);


ALTER TABLE kb.chunks OWNER TO spec;

--
-- Name: documents; Type: TABLE; Schema: kb; Owner: spec
--

CREATE TABLE kb.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_url text,
    filename text,
    mime_type text,
    content text,
    content_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE kb.documents OWNER TO spec;

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
    CONSTRAINT graph_embedding_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'failed'::text, 'completed'::text])))
);


ALTER TABLE kb.graph_embedding_jobs OWNER TO spec;

--
-- Name: graph_objects; Type: TABLE; Schema: kb; Owner: spec
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


ALTER TABLE kb.graph_objects OWNER TO spec;

--
-- Name: graph_relationships; Type: TABLE; Schema: kb; Owner: spec
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


ALTER TABLE kb.graph_relationships OWNER TO spec;

--
-- Name: object_extraction_jobs; Type: TABLE; Schema: kb; Owner: spec
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
    CONSTRAINT object_extraction_jobs_retry_count_check CHECK ((retry_count >= 0)),
    CONSTRAINT object_extraction_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'processing'::text, 'completed'::text, 'requires_review'::text, 'failed'::text, 'cancelled'::text])))
);


ALTER TABLE kb.object_extraction_jobs OWNER TO spec;

--
-- Name: tags; Type: TABLE; Schema: kb; Owner: spec
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


ALTER TABLE kb.tags OWNER TO spec;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: spec
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO spec;

--
-- Name: auth_introspection_cache auth_introspection_cache_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--

ALTER TABLE ONLY kb.auth_introspection_cache
    ADD CONSTRAINT auth_introspection_cache_pkey PRIMARY KEY (token_hash);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--

ALTER TABLE ONLY kb.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--

ALTER TABLE ONLY kb.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: graph_embedding_jobs graph_embedding_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--

ALTER TABLE ONLY kb.graph_embedding_jobs
    ADD CONSTRAINT graph_embedding_jobs_pkey PRIMARY KEY (id);


--
-- Name: object_extraction_jobs object_extraction_jobs_pkey; Type: CONSTRAINT; Schema: kb; Owner: spec
--

ALTER TABLE ONLY kb.object_extraction_jobs
    ADD CONSTRAINT object_extraction_jobs_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: spec
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_auth_introspection_cache_expires_at; Type: INDEX; Schema: kb; Owner: spec
--

CREATE INDEX idx_auth_introspection_cache_expires_at ON kb.auth_introspection_cache USING btree (expires_at);


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

CREATE INDEX idx_chunks_embedding ON kb.chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_chunks_tsv; Type: INDEX; Schema: kb; Owner: spec
--

CREATE INDEX idx_chunks_tsv ON kb.chunks USING gin (tsv);


--
-- Name: idx_documents_content_hash; Type: INDEX; Schema: kb; Owner: spec
--

CREATE UNIQUE INDEX idx_documents_content_hash ON kb.documents USING btree (content_hash);


--
-- Name: idx_graph_embedding_jobs_object; Type: INDEX; Schema: kb; Owner: spec
--

CREATE INDEX idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs USING btree (object_id);


--
-- Name: idx_graph_embedding_jobs_status; Type: INDEX; Schema: kb; Owner: spec
--

CREATE INDEX idx_graph_embedding_jobs_status ON kb.graph_embedding_jobs USING btree (status);


--
-- Name: idx_object_extraction_jobs_organization; Type: INDEX; Schema: kb; Owner: spec
--

CREATE INDEX idx_object_extraction_jobs_organization ON kb.object_extraction_jobs USING btree (organization_id);


--
-- Name: idx_object_extraction_jobs_project; Type: INDEX; Schema: kb; Owner: spec
--

CREATE INDEX idx_object_extraction_jobs_project ON kb.object_extraction_jobs USING btree (project_id);


--
-- Name: idx_object_extraction_jobs_status; Type: INDEX; Schema: kb; Owner: spec
--

CREATE INDEX idx_object_extraction_jobs_status ON kb.object_extraction_jobs USING btree (status);


--
-- Name: idx_schema_migrations_applied; Type: INDEX; Schema: public; Owner: spec
--

CREATE INDEX idx_schema_migrations_applied ON public.schema_migrations USING btree (applied_at DESC);


--
-- Name: chunks trg_chunks_tsv; Type: TRIGGER; Schema: kb; Owner: spec
--

CREATE TRIGGER trg_chunks_tsv BEFORE INSERT OR UPDATE ON kb.chunks FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();


--
-- Name: chunks chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: kb; Owner: spec
--

ALTER TABLE ONLY kb.chunks
    ADD CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES kb.documents(id) ON DELETE CASCADE;


--
-- Name: SCHEMA kb; Type: ACL; Schema: -; Owner: spec
--

GRANT ALL ON SCHEMA kb TO app_rls;


--
-- Name: TABLE auth_introspection_cache; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.auth_introspection_cache TO app_rls;


--
-- Name: TABLE chunks; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.chunks TO app_rls;


--
-- Name: TABLE documents; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.documents TO app_rls;


--
-- Name: TABLE graph_embedding_jobs; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.graph_embedding_jobs TO app_rls;


--
-- Name: TABLE graph_objects; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.graph_objects TO app_rls;


--
-- Name: TABLE graph_relationships; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.graph_relationships TO app_rls;


--
-- Name: TABLE object_extraction_jobs; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.object_extraction_jobs TO app_rls;


--
-- Name: TABLE tags; Type: ACL; Schema: kb; Owner: spec
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE kb.tags TO app_rls;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: kb; Owner: spec
--

ALTER DEFAULT PRIVILEGES FOR ROLE spec IN SCHEMA kb GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO app_rls;


--
-- PostgreSQL database dump complete
--

\unrestrict fyBUazyoDBRnOwxHcbDXLbB6zc26FfBIhkXW6IOplTVdxbDrhlUvgJ9OuT1OCWK

