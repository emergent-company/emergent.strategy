-- Migration: Add enabled_tools column to chat_conversations
-- Purpose: Allow per-conversation configuration of which AI tools are enabled
-- NULL = all tools enabled (default behavior), array = specific tools enabled

BEGIN;

ALTER TABLE kb.chat_conversations 
ADD COLUMN enabled_tools text[] DEFAULT NULL;

COMMENT ON COLUMN kb.chat_conversations.enabled_tools IS 
'List of enabled tool names for this conversation. NULL means all tools enabled (default).';

COMMIT;
