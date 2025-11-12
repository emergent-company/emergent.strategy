import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevisionTracking1762800582064 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================================
    // 1. CREATE MATERIALIZED VIEW FOR REVISION COUNTS
    // ============================================================================
    // This view pre-computes the number of versions for each canonical object
    // Useful for displaying in UI and filtering by revision count
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS kb.graph_object_revision_counts AS
      SELECT
          canonical_id,
          project_id,
          COUNT(*) as revision_count,
          MAX(version) as latest_version,
          MIN(created_at) as first_created_at,
          MAX(created_at) as last_updated_at
      FROM
          kb.graph_objects
      WHERE
          deleted_at IS NULL
      GROUP BY
          canonical_id,
          project_id
    `);

    // Index for fast lookups by canonical_id
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_revision_counts_canonical 
      ON kb.graph_object_revision_counts(canonical_id)
    `);

    // Index for filtering by revision count
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_revision_counts_count 
      ON kb.graph_object_revision_counts(revision_count DESC)
    `);

    await queryRunner.query(`
      COMMENT ON MATERIALIZED VIEW kb.graph_object_revision_counts IS 
      'Pre-computed revision counts for graph objects. Refresh periodically to keep current.'
    `);

    // ============================================================================
    // 2. CREATE FUNCTION TO REFRESH REVISION COUNTS
    // ============================================================================
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION kb.refresh_revision_counts() 
      RETURNS INTEGER 
      LANGUAGE plpgsql 
      SECURITY DEFINER 
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
      $$
    `);

    await queryRunner.query(`
      COMMENT ON FUNCTION kb.refresh_revision_counts() IS 
      'Refreshes the materialized view of object revision counts. Call periodically via background job.'
    `);

    // ============================================================================
    // 3. ADD HELPER FUNCTION TO GET REVISION COUNT FOR AN OBJECT
    // ============================================================================
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION kb.get_object_revision_count(p_object_id UUID) 
      RETURNS INTEGER 
      LANGUAGE plpgsql 
      STABLE 
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
      $$
    `);

    await queryRunner.query(`
      COMMENT ON FUNCTION kb.get_object_revision_count(UUID) IS 
      'Returns the total number of versions for a given object ID. Uses materialized view when available, falls back to live count.'
    `);

    // ============================================================================
    // 4. INITIAL REFRESH
    // ============================================================================
    // Populate the materialized view with initial data
    await queryRunner.query(`
      REFRESH MATERIALIZED VIEW kb.graph_object_revision_counts
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS kb.get_object_revision_count(UUID)`
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS kb.refresh_revision_counts()`
    );
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS kb.graph_object_revision_counts`
    );
  }
}
