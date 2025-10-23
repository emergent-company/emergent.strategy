-- Add parent document relationship and integration metadata to documents table
-- Add parent_document_id for hierarchical structure (ClickUp pages, Notion pages, etc.)
ALTER TABLE
    kb.documents
ADD
    COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES kb.documents(id) ON DELETE
SET
    NULL;

-- Add integration metadata column (stores source-specific data like ClickUp doc ID, parent info, etc.)
ALTER TABLE
    kb.documents
ADD
    COLUMN IF NOT EXISTS integration_metadata JSONB DEFAULT '{}' :: jsonb;

-- Add index for parent lookups (finding children of a document)
CREATE INDEX IF NOT EXISTS idx_documents_parent ON kb.documents(parent_document_id)
WHERE
    parent_document_id IS NOT NULL;

-- Add index for integration metadata queries (e.g., finding by external_id)
CREATE INDEX IF NOT EXISTS idx_documents_integration_metadata ON kb.documents USING gin(integration_metadata);

-- Example integration_metadata structure for ClickUp:
-- {
--   "source": "clickup",
--   "doc_id": "4bj41-33735",
--   "page_id": "4bj41-22835",
--   "workspace_id": "4573313",
--   "parent_page_id": "4bj41-19415",
--   "date_created": 1749652166805,
--   "date_updated": 1751025934210,
--   "creator_id": 56506196,
--   "avatar": {"value": "emoji::📃"},
--   "cover": {"image_url": "https://..."},
--   "archived": false,
--   "protected": false
-- }
COMMENT ON COLUMN kb.documents.parent_document_id IS 'Reference to parent document for hierarchical structures (e.g., ClickUp page → parent page)';

COMMENT ON COLUMN kb.documents.integration_metadata IS 'Source-specific metadata (ClickUp doc IDs, page hierarchy, creator info, etc.)';