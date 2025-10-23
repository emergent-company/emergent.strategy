-- Migration: Phase 2 - Chat Session & MCP Tool Monitoring
-- Date: 2025-10-23
-- Description: Add tables and indexes for chat session monitoring and MCP tool call tracking
-- Create MCP tool calls table
CREATE TABLE kb.mcp_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    conversation_id TEXT,
    turn_number INT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_parameters JSONB,
    tool_result JSONB,
    execution_time_ms INT,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
    error_message TEXT,
    final_llm_prompt TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    org_id TEXT,
    project_id UUID
);

-- Indexes for performance
CREATE INDEX idx_mcp_tool_calls_session ON kb.mcp_tool_calls(session_id, turn_number);

CREATE INDEX idx_mcp_tool_calls_tool_name ON kb.mcp_tool_calls(tool_name, timestamp);

CREATE INDEX idx_mcp_tool_calls_org ON kb.mcp_tool_calls(org_id, timestamp);

CREATE INDEX idx_mcp_tool_calls_project ON kb.mcp_tool_calls(project_id, timestamp);

CREATE INDEX idx_mcp_tool_calls_status ON kb.mcp_tool_calls(status, timestamp);

-- RLS policies (mirror extraction job patterns)
ALTER TABLE
    kb.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_tool_calls_tenant_isolation ON kb.mcp_tool_calls USING (
    project_id :: text = current_setting('app.current_project_id', true)
    OR org_id = current_setting('app.current_org_id', true)
);

-- Show summary
SELECT
    'kb.mcp_tool_calls' as table_name,
    COUNT(*) as row_count
FROM
    kb.mcp_tool_calls
UNION
ALL
SELECT
    'Table created successfully' as table_name,
    COUNT(*) as row_count
FROM
    information_schema.tables
WHERE
    table_schema = 'kb'
    AND table_name = 'mcp_tool_calls';