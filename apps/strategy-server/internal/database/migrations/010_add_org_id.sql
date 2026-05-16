-- +goose Up
-- Add org_id FK to workspaces for tenant isolation.
-- Existing workspaces will have NULL org_id until migrated.

ALTER TABLE workspaces ADD COLUMN org_id UUID REFERENCES orgs (id);
CREATE INDEX workspaces_org_id_idx ON workspaces (org_id);

-- +goose Down
DROP INDEX IF EXISTS workspaces_org_id_idx;
ALTER TABLE workspaces DROP COLUMN IF EXISTS org_id;
