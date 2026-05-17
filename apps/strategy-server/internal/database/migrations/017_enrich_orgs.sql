-- +goose Up
-- Enrich orgs table with 21st ecosystem identity fields and make
-- workspaces.org_id mandatory (every workspace must belong to an org).

-- 1. Add identity columns to orgs.
ALTER TABLE orgs ADD COLUMN org_number TEXT NOT NULL DEFAULT '';
ALTER TABLE orgs ADD COLUMN country   TEXT NOT NULL DEFAULT 'NO';
ALTER TABLE orgs ADD COLUMN website   TEXT NOT NULL DEFAULT '';
ALTER TABLE orgs ADD COLUMN logo_url  TEXT NOT NULL DEFAULT '';
ALTER TABLE orgs ADD COLUMN twentyfirst_id INTEGER;

-- Unique index on twentyfirst_id (sparse — only set when linked to 21st-ID).
CREATE UNIQUE INDEX orgs_twentyfirst_id_idx
    ON orgs (twentyfirst_id)
    WHERE twentyfirst_id IS NOT NULL;

-- Unique index on (org_number, country) for business registry deduplication.
CREATE UNIQUE INDEX orgs_org_number_country_idx
    ON orgs (org_number, country)
    WHERE org_number != '' AND deleted_at IS NULL;

-- 2. Backfill workspaces.org_id: create a Default org for any orphan workspaces,
--    then make the column NOT NULL.

-- Insert Default org only if orphan workspaces exist.
INSERT INTO orgs (id, name, slug, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000099'::uuid,
       'Default',
       'default',
       NOW(),
       NOW()
WHERE EXISTS (SELECT 1 FROM workspaces WHERE org_id IS NULL AND deleted_at IS NULL)
ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING;

-- Assign orphan workspaces to the Default org.
UPDATE workspaces
SET    org_id     = '00000000-0000-0000-0000-000000000099'::uuid,
       updated_at = NOW()
WHERE  org_id IS NULL;

-- Now safe to enforce NOT NULL.
ALTER TABLE workspaces ALTER COLUMN org_id SET NOT NULL;

-- +goose Down
-- Reverse in opposite order.
ALTER TABLE workspaces ALTER COLUMN org_id DROP NOT NULL;

DROP INDEX IF EXISTS orgs_org_number_country_idx;
DROP INDEX IF EXISTS orgs_twentyfirst_id_idx;

ALTER TABLE orgs DROP COLUMN IF EXISTS twentyfirst_id;
ALTER TABLE orgs DROP COLUMN IF EXISTS logo_url;
ALTER TABLE orgs DROP COLUMN IF EXISTS website;
ALTER TABLE orgs DROP COLUMN IF EXISTS country;
ALTER TABLE orgs DROP COLUMN IF EXISTS org_number;

-- Clean up the Default org if it was created by the Up migration.
DELETE FROM orgs WHERE id = '00000000-0000-0000-0000-000000000099'::uuid;
