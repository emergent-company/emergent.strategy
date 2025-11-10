-- Migration: Add Row Level Security policies
-- Date: 2025-10-25
-- Purpose: Add critical RLS policies for multi-tenant isolation

-- Enable RLS on core tables
ALTER TABLE kb.graph_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.graph_relationships ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Graph Objects RLS Policies (4 policies)
-- ============================================================================

-- SELECT policy: Users can only see objects in their org/project context
CREATE POLICY graph_objects_select ON kb.graph_objects 
FOR SELECT 
USING (
    -- No context set = see all (for system operations)
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    -- Org set, no project = see all in org
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    -- Only project set = see project objects
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);

-- INSERT policy
CREATE POLICY graph_objects_insert ON kb.graph_objects 
FOR INSERT 
WITH CHECK (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);

-- UPDATE policy
CREATE POLICY graph_objects_update ON kb.graph_objects 
FOR UPDATE 
USING (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
)
WITH CHECK (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);

-- DELETE policy
CREATE POLICY graph_objects_delete ON kb.graph_objects 
FOR DELETE 
USING (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);

-- ============================================================================
-- Graph Relationships RLS Policies (4 policies)
-- ============================================================================

CREATE POLICY graph_relationships_select ON kb.graph_relationships 
FOR SELECT 
USING (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);

CREATE POLICY graph_relationships_insert ON kb.graph_relationships 
FOR INSERT 
WITH CHECK (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);

CREATE POLICY graph_relationships_update ON kb.graph_relationships 
FOR UPDATE 
USING (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
)
WITH CHECK (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);

CREATE POLICY graph_relationships_delete ON kb.graph_relationships 
FOR DELETE 
USING (
    (COALESCE(current_setting('app.current_organization_id', true), '') = '' 
     AND COALESCE(current_setting('app.current_project_id', true), '') = '')
    OR (COALESCE(current_setting('app.current_organization_id', true), '') <> ''
        AND (organization_id)::text = current_setting('app.current_organization_id', true)
        AND (COALESCE(current_setting('app.current_project_id', true), '') = ''
             OR (project_id)::text = current_setting('app.current_project_id', true)))
    OR (COALESCE(current_setting('app.current_organization_id', true), '') = ''
        AND COALESCE(current_setting('app.current_project_id', true), '') <> ''
        AND (project_id)::text = current_setting('app.current_project_id', true))
);
