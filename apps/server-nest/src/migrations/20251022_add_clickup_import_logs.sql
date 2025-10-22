-- Create table for ClickUp import logs
CREATE TABLE IF NOT EXISTS kb.clickup_import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id TEXT NOT NULL,
    import_session_id TEXT NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    step_index INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    operation_name TEXT,
    status TEXT NOT NULL,
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    error_stack TEXT,
    duration_ms INTEGER,
    items_processed INTEGER,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for querying by import session
CREATE INDEX IF NOT EXISTS idx_clickup_import_logs_session 
    ON kb.clickup_import_logs(import_session_id);

-- Index for querying by integration
CREATE INDEX IF NOT EXISTS idx_clickup_import_logs_integration 
    ON kb.clickup_import_logs(integration_id);

-- Index for querying by operation type
CREATE INDEX IF NOT EXISTS idx_clickup_import_logs_operation 
    ON kb.clickup_import_logs(import_session_id, operation_type);

-- Index for querying errors
CREATE INDEX IF NOT EXISTS idx_clickup_import_logs_errors 
    ON kb.clickup_import_logs(import_session_id, status) 
    WHERE status = 'error';

-- Index for ordering by step
CREATE INDEX IF NOT EXISTS idx_clickup_import_logs_steps 
    ON kb.clickup_import_logs(import_session_id, step_index, logged_at);

-- Add check constraint for status values
ALTER TABLE kb.clickup_import_logs 
    ADD CONSTRAINT chk_clickup_import_logs_status 
    CHECK (status IN ('pending', 'success', 'error', 'warning', 'info'));

-- Add check constraint for operation type values
ALTER TABLE kb.clickup_import_logs 
    ADD CONSTRAINT chk_clickup_import_logs_operation 
    CHECK (operation_type IN ('discovery', 'fetch_spaces', 'fetch_docs', 'fetch_pages', 'store_document', 'create_extraction', 'api_call', 'error'));

-- Comment on table
COMMENT ON TABLE kb.clickup_import_logs IS 'Logs for ClickUp import operations with detailed step tracking';
COMMENT ON COLUMN kb.clickup_import_logs.import_session_id IS 'Unique ID for each import run (UUID or timestamp-based)';
COMMENT ON COLUMN kb.clickup_import_logs.operation_type IS 'Type of operation: discovery, fetch_spaces, fetch_docs, fetch_pages, store_document, create_extraction, api_call, error';
COMMENT ON COLUMN kb.clickup_import_logs.status IS 'Status of the operation: pending, success, error, warning, info';
COMMENT ON COLUMN kb.clickup_import_logs.step_index IS 'Sequential step number within the import session';
COMMENT ON COLUMN kb.clickup_import_logs.items_processed IS 'Number of items processed in this step (e.g., number of docs, pages)';
