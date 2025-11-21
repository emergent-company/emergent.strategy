-- Migration: Add draft_text field to chat_conversations
-- Description: Allows storing unsent draft text for conversations

ALTER TABLE kb.chat_conversations
ADD COLUMN IF NOT EXISTS draft_text TEXT;

COMMENT ON COLUMN kb.chat_conversations.draft_text IS 'Draft text that user is typing but has not sent yet';
