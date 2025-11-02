-- Migration: 0002_populate_materialized_views.sql
-- Purpose: Ensure materialized views are populated (safe to run multiple times)
-- Date: 2025-11-02
-- Populate the graph_object_revision_counts materialized view if not already populated
-- This is idempotent - if already populated, this will just update it
REFRESH MATERIALIZED VIEW kb.graph_object_revision_counts;