-- Add id column to core.user_profiles for compatibility with new authentication system
-- The table currently uses zitadel_user_id as primary key, but code expects id uuid column

-- Add id column with default UUID generation
ALTER TABLE core.user_profiles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;

-- Create unique constraint on id (will be used by foreign keys)
ALTER TABLE core.user_profiles ADD CONSTRAINT user_profiles_id_unique UNIQUE (id);

-- Note: We keep zitadel_user_id as the primary key for backward compatibility
-- with existing foreign key references throughout the database
