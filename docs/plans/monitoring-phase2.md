# System Monitoring Phase 2 - Chat Session Monitoring

**Date**: 2025-10-23  
**Phase**: Phase 2 - Chat Session & MCP Tool Monitoring  
**Status**: 🚧 **PLANNING**

## Overview

Phase 2 extends the monitoring system to track chat sessions and MCP tool calls, providing visibility into:
- Chat conversation flow and history
- MCP tool selection and execution
- LLM calls within chat sessions
- Token usage and costs per conversation
- User interactions and errors

## Goals

1. **Track Chat Sessions**: Capture metadata for each chat session (user, duration, total cost)
2. **Log MCP Tool Calls**: Record which tools the AI selected, their parameters, and results
3. **Monitor Chat LLM Calls**: Track LLM API calls made during chat sessions
4. **Provide Detailed View**: Create UI to visualize chat transcript with behind-the-scenes reasoning
5. **Cost Attribution**: Calculate and display costs per chat session

## Database Schema

### New Table: `kb.mcp_tool_calls`

```sql
CREATE TABLE kb.mcp_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,            -- Chat session ID
    conversation_id TEXT,                 -- Conversation ID within session
    turn_number INT NOT NULL,             -- Which turn in the conversation
    tool_name TEXT NOT NULL,              -- MCP tool that was called
    tool_parameters JSONB,                -- Input parameters to the tool
    tool_result JSONB,                    -- Output from the tool
    execution_time_ms INT,                -- How long tool took
    status TEXT NOT NULL,                 -- 'success', 'error', 'timeout'
    error_message TEXT,                   -- If status='error'
    final_llm_prompt TEXT,                -- Actual prompt sent to LLM after tool execution
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    org_id TEXT,                          -- For filtering by org
    project_id UUID,                      -- For filtering by project
    
    -- Indexes for performance
    CONSTRAINT mcp_tool_calls_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_mcp_tool_calls_session ON kb.mcp_tool_calls(session_id, turn_number);
CREATE INDEX idx_mcp_tool_calls_tool_name ON kb.mcp_tool_calls(tool_name, timestamp);
CREATE INDEX idx_mcp_tool_calls_org ON kb.mcp_tool_calls(org_id, timestamp);
CREATE INDEX idx_mcp_tool_calls_project ON kb.mcp_tool_calls(project_id, timestamp);
CREATE INDEX idx_mcp_tool_calls_status ON kb.mcp_tool_calls(status, timestamp);
```

### Extend Existing: `kb.llm_call_logs`

Already has `process_id` and `process_type` - will use:
- `process_id` = chat session ID
- `process_type` = 'chat_session'

No schema changes needed!

### Extend Existing: `kb.system_process_logs`

Already supports any process type - will use:
- `process_id` = chat session ID
- `process_type` = 'chat_session'

No schema changes needed!

## Backend Implementation

### Step 1: Create Migration

**File**: `apps/server/migrations/0028_monitoring_phase2_chat.sql`

```sql
-- Phase 2: Chat Session & MCP Tool Monitoring

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
ALTER TABLE kb.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_tool_calls_tenant_isolation ON kb.mcp_tool_calls
    USING (
        project_id::text = current_setting('app.current_project_id', true)
        OR org_id = current_setting('app.current_org_id', true)
    );
```

### Step 2: Add Entity Types

**File**: `apps/server/src/modules/monitoring/entities/mcp-tool-call.entity.ts`

```typescript
export interface McpToolCall {
    id: string;
    sessionId: string;
    conversationId?: string;
    turnNumber: number;
    toolName: string;
    toolParameters?: Record<string, any>;
    toolResult?: Record<string, any>;
    executionTimeMs?: number;
    status: 'success' | 'error' | 'timeout';
    errorMessage?: string;
    finalLlmPrompt?: string;
    timestamp: Date;
    orgId?: string;
    projectId?: string;
}
```

**File**: `apps/server/src/modules/monitoring/dto/chat-session.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { ProcessLogDto } from './process-log.dto';
import { LLMCallDto } from './llm-call.dto';

export class McpToolCallDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    sessionId: string;

    @ApiProperty({ required: false })
    conversationId?: string;

    @ApiProperty()
    turnNumber: number;

    @ApiProperty()
    toolName: string;

    @ApiProperty({ required: false })
    toolParameters?: Record<string, any>;

    @ApiProperty({ required: false })
    toolResult?: Record<string, any>;

    @ApiProperty({ required: false })
    executionTimeMs?: number;

    @ApiProperty()
    status: 'success' | 'error' | 'timeout';

    @ApiProperty({ required: false })
    errorMessage?: string;

    @ApiProperty({ required: false })
    finalLlmPrompt?: string;

    @ApiProperty()
    timestamp: Date;
}

export class ChatSessionDetailDto {
    @ApiProperty()
    sessionId: string;

    @ApiProperty()
    conversationId: string;

    @ApiProperty()
    userId: string;

    @ApiProperty()
    startedAt: Date;

    @ApiProperty({ required: false })
    completedAt?: Date;

    @ApiProperty({ required: false })
    durationMs?: number;

    @ApiProperty()
    totalTurns: number;

    @ApiProperty()
    totalCost: number;

    @ApiProperty()
    totalTokens: number;

    @ApiProperty({ type: [ProcessLogDto] })
    logs: ProcessLogDto[];

    @ApiProperty({ type: [LLMCallDto] })
    llmCalls: LLMCallDto[];

    @ApiProperty({ type: [McpToolCallDto] })
    toolCalls: McpToolCallDto[];
}
```

### Step 3: Add MonitoringLoggerService Methods

**File**: `apps/server/src/modules/monitoring/monitoring-logger.service.ts`

Add new methods for MCP tool call logging:

```typescript
/**
 * Log an MCP tool call
 */
async logMcpToolCall(input: {
    sessionId: string;
    conversationId?: string;
    turnNumber: number;
    toolName: string;
    toolParameters?: Record<string, any>;
    toolResult?: Record<string, any>;
    executionTimeMs?: number;
    status: 'success' | 'error' | 'timeout';
    errorMessage?: string;
    finalLlmPrompt?: string;
    orgId?: string;
    projectId?: string;
}): Promise<string> {
    try {
        const result = await this.db.query(
            `INSERT INTO kb.mcp_tool_calls (
                session_id, conversation_id, turn_number, tool_name,
                tool_parameters, tool_result, execution_time_ms,
                status, error_message, final_llm_prompt,
                timestamp, org_id, project_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
            RETURNING id`,
            [
                input.sessionId,
                input.conversationId || null,
                input.turnNumber,
                input.toolName,
                input.toolParameters ? JSON.stringify(input.toolParameters) : null,
                input.toolResult ? JSON.stringify(input.toolResult) : null,
                input.executionTimeMs || null,
                input.status,
                input.errorMessage || null,
                input.finalLlmPrompt || null,
                input.orgId || null,
                input.projectId || null,
            ]
        );

        return result.rows[0].id;
    } catch (error) {
        this.logger.error(
            `Failed to log MCP tool call for session ${input.sessionId}`,
            error instanceof Error ? error.stack : String(error)
        );
        return '';
    }
}
```

### Step 4: Add MonitoringService Methods

**File**: `apps/server/src/modules/monitoring/monitoring.service.ts`

Add methods to query chat session data:

```typescript
/**
 * Get MCP tool calls for a chat session
 */
async getMcpToolCallsForSession(
    sessionId: string,
    limit = 50,
    offset = 0,
): Promise<McpToolCallDto[]> {
    const sql = `
        SELECT 
            id, session_id, conversation_id, turn_number, tool_name,
            tool_parameters, tool_result, execution_time_ms,
            status, error_message, final_llm_prompt, timestamp
        FROM kb.mcp_tool_calls
        WHERE session_id = $1
        ORDER BY turn_number ASC, timestamp ASC
        LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query(sql, [sessionId, limit, offset]);

    return result.rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        conversationId: row.conversation_id,
        turnNumber: row.turn_number,
        toolName: row.tool_name,
        toolParameters: row.tool_parameters,
        toolResult: row.tool_result,
        executionTimeMs: row.execution_time_ms,
        status: row.status,
        errorMessage: row.error_message,
        finalLlmPrompt: row.final_llm_prompt,
        timestamp: new Date(row.timestamp),
    }));
}

/**
 * Get detailed chat session info (logs + LLM calls + tool calls)
 */
async getChatSessionDetail(sessionId: string): Promise<ChatSessionDetailDto | null> {
    // Get basic session info from first/last logs
    const sessionInfo = await this.db.query(
        `SELECT 
            MIN(timestamp) as started_at,
            MAX(timestamp) as completed_at
        FROM kb.system_process_logs
        WHERE process_id = $1 AND process_type = 'chat_session'`,
        [sessionId]
    );

    if (sessionInfo.rows.length === 0) {
        return null;
    }

    // Get all logs, LLM calls, and tool calls in parallel
    const [logs, llmCalls, toolCalls, costInfo] = await Promise.all([
        this.getProcessLogs(sessionId, 'chat_session', 100),
        this.getLLMCallsForResource(sessionId, 'chat_session', 100),
        this.getMcpToolCallsForSession(sessionId, 100),
        this.db.query(
            `SELECT 
                COUNT(DISTINCT turn_number) as total_turns,
                COALESCE(SUM(execution_time_ms), 0) as total_execution_time
            FROM kb.mcp_tool_calls
            WHERE session_id = $1`,
            [sessionId]
        ),
    ]);

    // Calculate total cost from LLM calls
    const totalCost = llmCalls.reduce((sum, call) => sum + (call.costUsd || 0), 0);
    const totalTokens = llmCalls.reduce((sum, call) => sum + (call.totalTokens || 0), 0);

    const startedAt = sessionInfo.rows[0].started_at;
    const completedAt = sessionInfo.rows[0].completed_at;
    const durationMs = completedAt && startedAt 
        ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
        : null;

    return {
        sessionId,
        conversationId: toolCalls[0]?.conversationId || sessionId,
        userId: 'unknown', // TODO: Extract from metadata
        startedAt: new Date(startedAt),
        completedAt: completedAt ? new Date(completedAt) : undefined,
        durationMs,
        totalTurns: parseInt(costInfo.rows[0]?.total_turns || '0'),
        totalCost,
        totalTokens,
        logs,
        llmCalls,
        toolCalls,
    };
}
```

### Step 5: Add Controller Endpoints

**File**: `apps/server/src/modules/monitoring/monitoring.controller.ts`

Add chat session endpoints:

```typescript
/**
 * Get chat session details with logs, LLM calls, and tool calls
 */
@Get('chat-sessions/:sessionId')
@Scopes('chat:use')
@ApiOperation({ summary: 'Get chat session details' })
@ApiResponse({ status: 200, description: 'Chat session details', type: ChatSessionDetailDto })
async getChatSessionDetail(
    @Param('sessionId') sessionId: string,
): Promise<ChatSessionDetailDto> {
    const detail = await this.monitoringService.getChatSessionDetail(sessionId);
    if (!detail) {
        throw new NotFoundException(`Chat session ${sessionId} not found`);
    }
    return detail;
}

/**
 * Get MCP tool calls for a chat session
 */
@Get('chat-sessions/:sessionId/tool-calls')
@Scopes('chat:use')
@ApiOperation({ summary: 'Get MCP tool calls for chat session' })
@ApiResponse({ status: 200, description: 'MCP tool calls', type: [McpToolCallDto] })
async getChatSessionToolCalls(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
): Promise<McpToolCallDto[]> {
    return this.monitoringService.getMcpToolCallsForSession(sessionId, limit, offset);
}

/**
 * List recent chat sessions
 */
@Get('chat-sessions')
@Scopes('chat:use')
@ApiOperation({ summary: 'List recent chat sessions' })
@ApiResponse({ status: 200, description: 'Chat sessions' })
async listChatSessions(
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
): Promise<any[]> {
    // Query distinct session IDs from system_process_logs
    const sql = `
        SELECT DISTINCT
            process_id as session_id,
            MIN(timestamp) as started_at,
            MAX(timestamp) as last_activity_at,
            COUNT(*) as log_count
        FROM kb.system_process_logs
        WHERE process_type = 'chat_session'
        GROUP BY process_id
        ORDER BY MAX(timestamp) DESC
        LIMIT $1 OFFSET $2
    `;

    const result = await this.monitoringService['db'].query(sql, [limit, offset]);

    return result.rows.map((row) => ({
        sessionId: row.session_id,
        startedAt: new Date(row.started_at),
        lastActivityAt: new Date(row.last_activity_at),
        logCount: parseInt(row.log_count),
    }));
}
```

## Chat Service Integration

### Step 6: Inject MonitoringLoggerService into Chat Module

**File**: `apps/server/src/modules/chat/chat.module.ts`

```typescript
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
    imports: [
        // ... existing imports
        MonitoringModule,  // ← Add this
    ],
    // ... rest of module
})
export class ChatModule {}
```

**File**: `apps/server/src/modules/chat/chat.service.ts`

```typescript
import { MonitoringLoggerService } from '../monitoring/monitoring-logger.service';

@Injectable()
export class ChatService {
    constructor(
        // ... existing dependencies
        private readonly monitoringLogger: MonitoringLoggerService,  // ← Add this
    ) {}

    async streamChatResponse(conversationId: string, message: string, ...): AsyncGenerator<string> {
        const sessionId = `chat-${conversationId}-${Date.now()}`;
        const startTime = Date.now();

        // Log chat session start
        await this.monitoringLogger.logProcessEvent({
            processId: sessionId,
            processType: 'chat_session',
            level: 'info',
            message: 'Chat session started',
            projectId: this.currentProjectId,
            metadata: {
                conversation_id: conversationId,
                user_message: message.substring(0, 100),
            }
        });

        try {
            // ... existing chat logic

            // Log completion
            await this.monitoringLogger.logProcessEvent({
                processId: sessionId,
                processType: 'chat_session',
                level: 'info',
                message: 'Chat session completed',
                projectId: this.currentProjectId,
                metadata: {
                    duration_ms: Date.now() - startTime,
                    turn_count: ...,
                }
            });
        } catch (error) {
            // Log error
            await this.monitoringLogger.logProcessEvent({
                processId: sessionId,
                processType: 'chat_session',
                level: 'error',
                message: `Chat session failed: ${error.message}`,
                projectId: this.currentProjectId,
            });
            throw error;
        }
    }
}
```

## Frontend Implementation

### Step 7: Add Chat Session Types and API Client

**File**: `apps/admin/src/api/monitoring.ts`

Add chat session types and methods:

```typescript
export interface McpToolCall {
    id: string;
    sessionId: string;
    conversationId?: string;
    turnNumber: number;
    toolName: string;
    toolParameters?: Record<string, any>;
    toolResult?: Record<string, any>;
    executionTimeMs?: number;
    status: 'success' | 'error' | 'timeout';
    errorMessage?: string;
    finalLlmPrompt?: string;
    timestamp: string;
}

export interface ChatSessionDetail {
    sessionId: string;
    conversationId: string;
    userId: string;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    totalTurns: number;
    totalCost: number;
    totalTokens: number;
    logs: ProcessLog[];
    llmCalls: LLMCall[];
    toolCalls: McpToolCall[];
}

// Add to MonitoringClient interface
export interface MonitoringClient {
    // ... existing methods
    listChatSessions(limit?: number, offset?: number): Promise<any[]>;
    getChatSessionDetail(sessionId: string): Promise<ChatSessionDetail>;
    getChatSessionToolCalls(sessionId: string, limit?: number, offset?: number): Promise<McpToolCall[]>;
}

// Add to createMonitoringClient factory
listChatSessions: async (limit = 50, offset = 0) => {
    return fetchJson(`${apiBase}/api/monitoring/chat-sessions?limit=${limit}&offset=${offset}`);
},
getChatSessionDetail: async (sessionId: string) => {
    return fetchJson(`${apiBase}/api/monitoring/chat-sessions/${sessionId}`);
},
getChatSessionToolCalls: async (sessionId: string, limit = 50, offset = 0) => {
    return fetchJson(`${apiBase}/api/monitoring/chat-sessions/${sessionId}/tool-calls?limit=${limit}&offset=${offset}`);
},
```

### Step 8: Create Chat Session Detail Component

**File**: `apps/admin/src/components/organisms/ChatSessionDetailsView/ChatSessionDetailsView.tsx`

```tsx
// Similar structure to JobDetailsView but with chat-specific tabs:
// - Summary (session info, cost, tokens)
// - Transcript (chat bubbles showing conversation)
// - MCP Tools (table of tool calls with expand for parameters/results)
// - LLM Calls (same as extraction jobs)
// - Logs (same as extraction jobs)
```

### Step 9: Create Chat Sessions Page

**File**: `apps/admin/src/pages/admin/monitoring/chat-sessions/index.tsx`

```tsx
// Similar to extraction jobs dashboard but showing:
// - Session ID
// - Started At
// - Duration
// - Total Turns
// - Total Cost
// - Status (active/completed)
// Click to open ChatSessionDetailsView modal
```

## Testing Plan

1. **Backend Testing**:
   - Create migration
   - Run migration: `npx nx run server:migrate`
   - Verify tables created: Query `kb.mcp_tool_calls`
   - Test MonitoringLoggerService.logMcpToolCall()
   - Test MonitoringService queries
   - Test API endpoints with curl

2. **Integration Testing**:
   - Start a chat session via UI
   - Verify logs appear in `kb.system_process_logs`
   - Verify tool calls appear in `kb.mcp_tool_calls`
   - Verify LLM calls appear in `kb.llm_call_logs`

3. **Frontend Testing**:
   - Navigate to `/admin/monitoring/chat-sessions`
   - Verify session list loads
   - Click session to open detail view
   - Verify all tabs render correctly
   - Verify tool call expand/collapse works

## Success Criteria

- ✅ Migration applied successfully
- ✅ Chat sessions logged to database
- ✅ MCP tool calls captured with parameters and results
- ✅ LLM calls attributed to chat sessions
- ✅ Cost calculation working for chat sessions
- ✅ Frontend displays chat transcript
- ✅ Frontend shows tool execution details
- ✅ All tabs load without errors

## Next Steps After Phase 2

- **Phase 3**: Frontend error logging (capture browser console errors)
- **Phase 4**: Analytics dashboard (aggregated metrics and charts)
- **Phase 5**: Real-time updates and performance optimization

---

**Ready to implement!** Start with Step 1 (migration) and work sequentially through the steps.
