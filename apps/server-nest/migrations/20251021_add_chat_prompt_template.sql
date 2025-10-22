-- Migration: Add chat_prompt_template to projects
-- Date: 2025-10-21
-- Purpose: Allow users to customize the chat prompt template per project through UI settings
-- Add chat_prompt_template column to projects table
ALTER TABLE
    kb.projects
ADD
    COLUMN IF NOT EXISTS chat_prompt_template TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN kb.projects.chat_prompt_template IS 'Custom chat prompt template. Supports placeholders: {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, {{MESSAGE}}, {{MARKDOWN_RULES}}. If null, uses default template.';

-- Default template (users can customize this in UI settings)
-- Note: We don't set a default value in the database - the application will use a default template if this is null