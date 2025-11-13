import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1762882024243 implements MigrationInterface {
  name = 'InitialSchema1762882024243';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create extensions
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`
    );
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA public`
    );

    // Create schemas
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS core`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS kb`);

    // Create functions
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION kb.get_object_revision_count(p_object_id uuid) RETURNS integer
      LANGUAGE plpgsql STABLE
      AS $$
        DECLARE 
          v_canonical_id UUID;
          v_count INTEGER;
        BEGIN 
          SELECT canonical_id INTO v_canonical_id
          FROM kb.graph_objects
          WHERE id = p_object_id
          LIMIT 1;
          
          IF v_canonical_id IS NULL THEN 
            RETURN 0;
          END IF;
          
          SELECT revision_count INTO v_count
          FROM kb.graph_object_revision_counts
          WHERE canonical_id = v_canonical_id;
          
          IF v_count IS NULL THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM kb.graph_objects
            WHERE canonical_id = v_canonical_id
              AND deleted_at IS NULL;
          END IF;
          
          RETURN COALESCE(v_count, 0);
        END;
      $$
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION kb.refresh_revision_counts() RETURNS integer
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
          
          RETURN (
            SELECT COUNT(*)::INTEGER
            FROM kb.graph_object_revision_counts
          );
        END;
      $$
    `);

    // Core schema tables
    await queryRunner.query(`
      CREATE TABLE core.user_emails (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        user_id uuid NOT NULL,
        email text NOT NULL,
        verified boolean DEFAULT false NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_3ef6c4be97ba94ea3ba65362ad0" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE core.user_profiles (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        zitadel_user_id text NOT NULL,
        first_name text,
        last_name text,
        display_name text,
        phone_e164 text,
        avatar_object_key text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_1ec6662219f4605723f1e41b6cb" PRIMARY KEY (id)
      )
    `);

    // KB schema tables
    await queryRunner.query(`
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
        details jsonb,
        CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.auth_introspection_cache (
        token_hash character varying(128) NOT NULL,
        introspection_data jsonb NOT NULL,
        expires_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_95b04c40e975a4b426cd21a07f5" PRIMARY KEY (token_hash)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.branch_lineage (
        branch_id uuid NOT NULL,
        ancestor_branch_id uuid NOT NULL,
        depth integer NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_1f87552be159d70c1e49bc394d4" PRIMARY KEY (branch_id, ancestor_branch_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.branches (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        organization_id uuid,
        project_id uuid,
        name text NOT NULL,
        parent_branch_id uuid,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_7f37d3b42defea97f1df0d19535" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.chat_conversations (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        title text NOT NULL,
        owner_user_id uuid,
        is_private boolean DEFAULT true NOT NULL,
        organization_id uuid,
        project_id uuid,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_ff117d9f57807c4f2e3034a39f3" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.chat_messages (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        conversation_id uuid NOT NULL,
        role text NOT NULL,
        content text NOT NULL,
        citations jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.chunks (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        document_id uuid NOT NULL,
        chunk_index integer NOT NULL,
        text text NOT NULL,
        embedding public.vector(768),
        tsv tsvector,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_a306e60b8fdf6e7de1be4be1e6a" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_13e7092bd89052a1db253d0a6af" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_623fe43bafbc630a829e51c0024" PRIMARY KEY (id),
        CONSTRAINT "UQ_9693cb36fc36f7f3f36d8ff53b0" UNIQUE (integration_id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_923c15ce099ae3991a1d1a6b6b0" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_29374bc3691491e73c6170ff8e3" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        embedding_v1 public.vector(1536),
        CONSTRAINT "PK_078aacf1069493166009e2f1f5d" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
      WITH NO DATA
    `);

    await queryRunner.query(`
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
        branch_id uuid,
        CONSTRAINT "PK_e858a7876b4b8a382c481bded76" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_5bdff6c04be4775e82f1cef130b" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_9adcdc6d6f3922535361ce641e8" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_aa52e96b44a714372f4dd31a0af" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        duration_ms integer,
        CONSTRAINT "PK_ad84866fef0164fcee07558a67d" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.merge_provenance (
        child_version_id uuid NOT NULL,
        parent_version_id uuid NOT NULL,
        role text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_c6759cdb97dce23f85bb11cb5c1" PRIMARY KEY (child_version_id, parent_version_id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        logs jsonb DEFAULT '[]'::jsonb NOT NULL,
        CONSTRAINT "PK_946f0b690e0a0972ebd0e6222d5" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        relationship_count integer,
        CONSTRAINT "PK_9ea0a4d02ba4f16f7f390589503" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.object_type_schemas (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        organization_id uuid,
        project_id uuid,
        type text NOT NULL,
        version integer DEFAULT 1 NOT NULL,
        supersedes_id uuid,
        canonical_id uuid,
        json_schema jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_10b0ea5bce13b0404825a0c94cd" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.organization_memberships (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        organization_id uuid NOT NULL,
        user_id uuid NOT NULL,
        role text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.orgs (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        name text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_9eed8bfad4c9e0dc8648e090efe" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.product_version_members (
        product_version_id uuid NOT NULL,
        object_canonical_id uuid NOT NULL,
        object_version_id uuid NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_b5b8707471c0c5c16f64f95f75c" PRIMARY KEY (product_version_id, object_canonical_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.product_versions (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        organization_id uuid,
        project_id uuid NOT NULL,
        name text NOT NULL,
        description text,
        base_product_version_id uuid,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_dbd6ab6ae9343c6c6f2df5e76db" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.project_memberships (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        project_id uuid NOT NULL,
        user_id uuid NOT NULL,
        role text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_856d7bae2d9bddc94861d41eded" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
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
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_734eabf182ef87e9b747c864d71" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.project_template_packs (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        project_id uuid NOT NULL,
        template_pack_id uuid NOT NULL,
        installed_at timestamp with time zone DEFAULT now() NOT NULL,
        installed_by uuid,
        active boolean DEFAULT true NOT NULL,
        customizations jsonb DEFAULT '{}'::jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_c3edf237839b7a0dd374437a670" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.projects (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        organization_id uuid NOT NULL,
        name text NOT NULL,
        kb_purpose text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        auto_extract_objects boolean DEFAULT false NOT NULL,
        auto_extract_config jsonb DEFAULT '{}'::jsonb NOT NULL,
        chat_prompt_template text,
        CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.settings (
        key text NOT NULL,
        value jsonb DEFAULT '{}'::jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY (key)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.system_process_logs (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        process_id text NOT NULL,
        process_type text NOT NULL,
        level text NOT NULL,
        message text NOT NULL,
        metadata jsonb,
        "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_734385c231b8c9ce4b9157913ae" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE kb.tags (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        organization_id uuid,
        project_id uuid NOT NULL,
        product_version_id uuid NOT NULL,
        name text NOT NULL,
        description text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY (id)
      )
    `);

    // Create indexes for core schema
    await queryRunner.query(
      `CREATE INDEX "IDX_2e88b95787b903d46ab3cc3eb9" ON core.user_emails USING btree (user_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3ef997e65ad4f83f35356a1a6e" ON core.user_profiles USING btree (zitadel_user_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6594597afde633cfeab9a806e4" ON core.user_emails USING btree (email)`
    );

    // Create indexes for kb schema
    await queryRunner.query(
      `CREATE INDEX "IDX_1c7f91f13d7e1a438519d37ec3" ON kb.object_extraction_jobs USING btree (project_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_26573c7e713682c72216747770" ON kb.embedding_policies USING btree (project_id, object_type)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2927d35a99e3f8b3d443496525" ON kb.graph_relationships USING btree (organization_id, project_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3844c9efd6d2e06105a117f90c" ON kb.object_extraction_jobs USING btree (status)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_38a73cbcc58fbed8e62a66d79b" ON kb.project_memberships USING btree (project_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5352fc550034d507d6c76dd290" ON kb.organization_memberships USING btree (user_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_587ec50ea3409700ba7299c3b0" ON kb.object_extraction_jobs USING btree (organization_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_69427761f37533ae7767601a64" ON kb.documents USING btree (organization_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6f5a7e4467cdc44037f209122e" ON kb.chunks USING btree (document_id, chunk_index)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7cb6c36ad5bf1bd4a413823ace" ON kb.project_memberships USING btree (user_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_86ae2efbb9ce84dd652e0c96a4" ON kb.organization_memberships USING btree (organization_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95464140d7dc04d7efb0afd6be" ON kb.notifications USING btree (project_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9a8a82462cab47c73d25f49261" ON kb.notifications USING btree (user_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a62c6bec50c07764e19636a5a4" ON kb.documents USING btree (project_id, content_hash) WHERE (content_hash IS NOT NULL)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a970f04cced6336cb2b1ad1f4e" ON kb.graph_relationships USING btree (src_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b877acbf8d466f2889a2eeb147" ON kb.project_memberships USING btree (project_id, user_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b8c7752534a444c2f16ebf3d91" ON kb.graph_objects USING btree (type)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c04db004625a1c8be8abb6c046" ON kb.graph_objects USING btree (canonical_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_caa73db1b161fa6b3a042290fe" ON kb.organization_memberships USING btree (organization_id, user_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb7b1fb018b296f2107e998b2f" ON kb.notifications USING btree (organization_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d05c07bafeabc0850f94db035b" ON kb.auth_introspection_cache USING btree (expires_at)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d2e1c350bb54247677a298ec6f" ON kb.graph_objects USING btree (organization_id, project_id, type, key) WHERE (deleted_at IS NULL)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d841de45a719fe1f35213d7920" ON kb.chunks USING btree (document_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_df895a2e1799c53ef660d0aae6" ON kb.graph_embedding_jobs USING btree (object_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e156b298c20873e14c362e789b" ON kb.documents USING btree (project_id)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f0021c2230e47af51928f35975" ON kb.graph_embedding_jobs USING btree (status)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f35de415032037ea629b1772e4" ON kb.graph_relationships USING btree (type)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8b7ed75170d2d7dca4477cc94" ON kb.notifications USING btree (read)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8d6b0b40d75cdabb27cf81084" ON kb.graph_relationships USING btree (dst_id)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_revision_counts_canonical ON kb.graph_object_revision_counts USING btree (canonical_id)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_revision_counts_count ON kb.graph_object_revision_counts USING btree (revision_count DESC)`
    );

    // Create foreign keys for core schema
    await queryRunner.query(
      `ALTER TABLE ONLY core.user_emails ADD CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE`
    );

    // Create foreign keys for kb schema
    await queryRunner.query(
      `ALTER TABLE ONLY kb.chat_conversations ADD CONSTRAINT "FK_14ad2d35eccbe22a4bc61a9a065" FOREIGN KEY (owner_user_id) REFERENCES core.user_profiles(id) ON DELETE SET NULL`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.project_memberships ADD CONSTRAINT "FK_38a73cbcc58fbed8e62a66d79b8" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.chat_messages ADD CONSTRAINT "FK_3d623662d4ee1219b23cf61e649" FOREIGN KEY (conversation_id) REFERENCES kb.chat_conversations(id) ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.project_template_packs ADD CONSTRAINT "FK_440cc8aae6f630830193b703f54" FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id)`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.organization_memberships ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.object_extraction_jobs ADD CONSTRAINT "FK_543b356bd6204a84bc8c038d309" FOREIGN KEY (document_id) REFERENCES kb.documents(id)`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.project_memberships ADD CONSTRAINT "FK_7cb6c36ad5bf1bd4a413823acec" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.organization_memberships ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.notifications ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.project_object_type_registry ADD CONSTRAINT "FK_b8a4633d03d7ce7bc67701f8efb" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE ONLY kb.chunks ADD CONSTRAINT "FK_d841de45a719fe1f35213d79207" FOREIGN KEY (document_id) REFERENCES kb.documents(id) ON DELETE CASCADE`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(
      `ALTER TABLE kb.chunks DROP CONSTRAINT "FK_d841de45a719fe1f35213d79207"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.project_object_type_registry DROP CONSTRAINT "FK_b8a4633d03d7ce7bc67701f8efb"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.notifications DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.organization_memberships DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.project_memberships DROP CONSTRAINT "FK_7cb6c36ad5bf1bd4a413823acec"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.object_extraction_jobs DROP CONSTRAINT "FK_543b356bd6204a84bc8c038d309"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.organization_memberships DROP CONSTRAINT "FK_5352fc550034d507d6c76dd2901"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.project_template_packs DROP CONSTRAINT "FK_440cc8aae6f630830193b703f54"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.chat_messages DROP CONSTRAINT "FK_3d623662d4ee1219b23cf61e649"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.project_memberships DROP CONSTRAINT "FK_38a73cbcc58fbed8e62a66d79b8"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.chat_conversations DROP CONSTRAINT "FK_14ad2d35eccbe22a4bc61a9a065"`
    );
    await queryRunner.query(
      `ALTER TABLE core.user_emails DROP CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91"`
    );

    // Drop all tables
    await queryRunner.query(`DROP TABLE kb.tags`);
    await queryRunner.query(`DROP TABLE kb.system_process_logs`);
    await queryRunner.query(`DROP TABLE kb.settings`);
    await queryRunner.query(`DROP TABLE kb.projects`);
    await queryRunner.query(`DROP TABLE kb.project_template_packs`);
    await queryRunner.query(`DROP TABLE kb.project_object_type_registry`);
    await queryRunner.query(`DROP TABLE kb.project_memberships`);
    await queryRunner.query(`DROP TABLE kb.product_versions`);
    await queryRunner.query(`DROP TABLE kb.product_version_members`);
    await queryRunner.query(`DROP TABLE kb.orgs`);
    await queryRunner.query(`DROP TABLE kb.organization_memberships`);
    await queryRunner.query(`DROP TABLE kb.object_type_schemas`);
    await queryRunner.query(`DROP TABLE kb.object_extraction_logs`);
    await queryRunner.query(`DROP TABLE kb.object_extraction_jobs`);
    await queryRunner.query(`DROP TABLE kb.notifications`);
    await queryRunner.query(`DROP TABLE kb.merge_provenance`);
    await queryRunner.query(`DROP TABLE kb.llm_call_logs`);
    await queryRunner.query(`DROP TABLE kb.invites`);
    await queryRunner.query(`DROP TABLE kb.integrations`);
    await queryRunner.query(`DROP TABLE kb.graph_template_packs`);
    await queryRunner.query(`DROP TABLE kb.graph_relationships`);
    await queryRunner.query(
      `DROP MATERIALIZED VIEW kb.graph_object_revision_counts`
    );
    await queryRunner.query(`DROP TABLE kb.graph_objects`);
    await queryRunner.query(`DROP TABLE kb.graph_embedding_jobs`);
    await queryRunner.query(`DROP TABLE kb.embedding_policies`);
    await queryRunner.query(`DROP TABLE kb.documents`);
    await queryRunner.query(`DROP TABLE kb.clickup_sync_state`);
    await queryRunner.query(`DROP TABLE kb.clickup_import_logs`);
    await queryRunner.query(`DROP TABLE kb.chunks`);
    await queryRunner.query(`DROP TABLE kb.chat_messages`);
    await queryRunner.query(`DROP TABLE kb.chat_conversations`);
    await queryRunner.query(`DROP TABLE kb.branches`);
    await queryRunner.query(`DROP TABLE kb.branch_lineage`);
    await queryRunner.query(`DROP TABLE kb.auth_introspection_cache`);
    await queryRunner.query(`DROP TABLE kb.audit_log`);
    await queryRunner.query(`DROP TABLE core.user_profiles`);
    await queryRunner.query(`DROP TABLE core.user_emails`);

    // Drop functions
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS kb.refresh_revision_counts()`
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS kb.get_object_revision_count(uuid)`
    );

    // Drop schemas
    await queryRunner.query(`DROP SCHEMA IF EXISTS kb CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS core CASCADE`);

    // Drop extensions
    await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
