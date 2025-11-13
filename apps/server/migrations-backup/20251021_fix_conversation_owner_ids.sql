-- Fix conversation owner_subject_id from UUID type to TEXT to support non-UUID subs
-- This migration changes the column type and updates existing hashed UUIDs to original sub values
-- 
-- Background: The mapUserId function was converting numeric subs (e.g., "335517149097361411")
-- into deterministic UUIDs (e.g., "89085f3d-0531-537a-96f6-e19eebd43770") using SHA1 hashing.
-- This broke frontend ownership checks because user.sub !== conversation.ownerUserId.
-- The column was also constrained to UUID type, preventing storage of raw sub values.
--
-- Solution: 
-- 1. Drop foreign key constraint temporarily
-- 2. Change both user_profiles.subject_id and chat_conversations.owner_subject_id to TEXT
-- 3. Update known user conversations from hashed UUID to original sub
-- 4. Re-add foreign key constraint
-- 5. Remove the UUID conversion from mapUserId function (already done in code)
-- Step 1: Drop foreign key constraint
ALTER TABLE
  kb.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_owner_subject_id_fkey;

-- Step 2: Change user_profiles.subject_id type from UUID to TEXT
ALTER TABLE
  core.user_profiles
ALTER COLUMN
  subject_id TYPE TEXT USING subject_id :: TEXT;

-- Step 3: Change chat_conversations.owner_subject_id type from UUID to TEXT
ALTER TABLE
  kb.chat_conversations
ALTER COLUMN
  owner_subject_id TYPE TEXT USING owner_subject_id :: TEXT;

-- Step 4: Re-add foreign key constraint with TEXT types
ALTER TABLE
  kb.chat_conversations
ADD
  CONSTRAINT chat_conversations_owner_subject_id_fkey FOREIGN KEY (owner_subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE
SET
  NULL;

-- Step 5: Update specific known user mappings (you can add your own here)
-- This updates conversations owned by the hashed UUID to use the original sub value
UPDATE
  kb.chat_conversations
SET
  owner_subject_id = '335517149097361411'
WHERE
  owner_subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

-- Step 6: Update user_profiles to use original sub (if needed)
UPDATE
  core.user_profiles
SET
  subject_id = '335517149097361411'
WHERE
  subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

-- Add comments to document the change
COMMENT ON COLUMN core.user_profiles.subject_id IS 'User subject ID from authentication provider (any string format). ' || 'Before 2025-10-21: stored as hashed UUIDs. ' || 'After 2025-10-21: stores original sub values.';

COMMENT ON COLUMN kb.chat_conversations.owner_subject_id IS 'User subject ID from authentication provider (any string format). ' || 'Before 2025-10-21: stored as hashed UUIDs. ' || 'After 2025-10-21: stores original sub values (numeric strings, emails, UUIDs, etc.).';

-- Recreate index for efficient ownership lookups
DROP INDEX IF EXISTS kb.idx_chat_conversations_owner;

CREATE INDEX idx_chat_conversations_owner ON kb.chat_conversations(owner_subject_id)
WHERE
  owner_subject_id IS NOT NULL;