-- Migration: Rename subject_id to zitadel_user_id in user_profiles
-- This is the correct approach - subject_id and zitadel_user_id are the same thing
-- We're just renaming the column to match our Phase 4 naming conventions

-- First, drop the constraint that was added by migration 0005 if it exists
ALTER TABLE core.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_zitadel_user_id_key;

-- Drop the index created by migration 0005 if it exists
DROP INDEX IF EXISTS core.idx_user_profiles_zitadel_user_id;

-- Drop the zitadel_user_id column if it was added by migration 0005
ALTER TABLE core.user_profiles 
DROP COLUMN IF EXISTS zitadel_user_id;

-- Now rename subject_id to zitadel_user_id
ALTER TABLE core.user_profiles 
RENAME COLUMN subject_id TO zitadel_user_id;

-- Rename the primary key constraint to match the new column name
ALTER TABLE core.user_profiles 
RENAME CONSTRAINT user_profiles_pkey TO user_profiles_zitadel_user_id_pkey;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_zitadel_user_id 
ON core.user_profiles(zitadel_user_id);

-- Add comment explaining the column
COMMENT ON COLUMN core.user_profiles.zitadel_user_id IS 
'Zitadel subject ID - unique identifier from the Zitadel auth provider (renamed from subject_id)';
