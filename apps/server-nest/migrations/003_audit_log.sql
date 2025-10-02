-- Phase 3: Authorization Audit Trail (6a)
-- Migration to create audit_log table for tracking authorization and access events
-- Create audit_log table in kb schema
CREATE TABLE IF NOT EXISTS kb.audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    -- 'success', 'failure', 'denied'
    user_id TEXT,
    user_email TEXT,
    resource_type TEXT,
    resource_id TEXT,
    action TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    http_method TEXT NOT NULL,
    status_code INTEGER,
    error_code TEXT,
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    details JSONB,
    -- Flexible storage for scopes, metadata, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON kb.audit_log(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON kb.audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON kb.audit_log(event_type);

CREATE INDEX IF NOT EXISTS idx_audit_log_outcome ON kb.audit_log(outcome);

CREATE INDEX IF NOT EXISTS idx_audit_log_endpoint ON kb.audit_log(endpoint);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_timestamp ON kb.audit_log(user_id, timestamp DESC);

-- Create GIN index on JSONB details for flexible querying
CREATE INDEX IF NOT EXISTS idx_audit_log_details ON kb.audit_log USING GIN(details);

-- Create a composite index for compliance queries (user + time range + outcome)
CREATE INDEX IF NOT EXISTS idx_audit_log_compliance ON kb.audit_log(user_id, timestamp DESC, outcome);

-- Comment on table
COMMENT ON TABLE kb.audit_log IS 'Authorization and access audit trail for compliance and security analysis';

COMMENT ON COLUMN kb.audit_log.event_type IS 'Type of event: auth.*, authz.*, resource.*, search.*, graph.*';

COMMENT ON COLUMN kb.audit_log.outcome IS 'Result of operation: success, failure, denied';

COMMENT ON COLUMN kb.audit_log.details IS 'JSONB field containing scopes, missing_scopes, and custom metadata';