-- Migration: Add zitadel_user_id column to user_profiles
-- This column stores the Zitadel subject ID for each user
-- Required for Phase 4 unified auth integration

-- Add the column (initially nullable to handle existing data)
ALTER TABLE core.user_profiles 
ADD COLUMN IF NOT EXISTS zitadel_user_id TEXT;

-- Copy existing subject_id values to zitadel_user_id
-- This preserves the existing user identities
UPDATE core.user_profiles 
SET zitadel_user_id = subject_id 
WHERE zitadel_user_id IS NULL;

-- Make it NOT NULL now that all rows have values
ALTER TABLE core.user_profiles 
ALTER COLUMN zitadel_user_id SET NOT NULL;

-- Add unique constraint to ensure one profile per Zitadel user
ALTER TABLE core.user_profiles 
ADD CONSTRAINT user_profiles_zitadel_user_id_key 
UNIQUE (zitadel_user_id);

-- Create index for faster lookups by zitadel_user_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_zitadel_user_id 
ON core.user_profiles(zitadel_user_id);

-- Add comment explaining the column
COMMENT ON COLUMN core.user_profiles.zitadel_user_id IS 
'Zitadel subject ID - unique identifier from the Zitadel auth provider';
