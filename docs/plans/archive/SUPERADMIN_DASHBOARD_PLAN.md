# System Monitoring Dashboard (Admin Features)

> **Note**: This is NOT a new role - it's an advanced monitoring feature for existing `org_admin` and `project_admin` users. The "Superadmin" name refers to the feature set, not a separate authorization level.

## 1. High-Level Goals
- Provide a centralized, real-time dashboard for admins to monitor application health and activity.
- Offer deep insights into specific processes like extractions, chat sessions, and syncs.
- Track and display key metrics, including LLM costs, token usage, and job statuses.
- Enable proactive monitoring, system control, and user-centric debugging.

## 1.1 Authorization Model
- **Access Control**: Standard role-based access using existing roles
  - `org_admin`: Full access to all monitoring data within their organization
  - `project_admin`: Access to monitoring data within their projects
- **No New Role**: Uses existing `org_admin` / `project_admin` roles with existing scopes
- **Scope Reuse**: Leverages existing scopes like `extraction:read`, `chat:use`, etc.
- **Implementation**: Standard `@UseGuards(AuthGuard, ScopesGuard)` with `@Scopes()` decorators

## 1.2 Existing Implementation Status

### ✅ Already Implemented (October 2025)

**Cost Analytics Page** (`/admin/monitoring/analytics`):
- **Status**: COMPLETE - Production ready
- **Location**: `apps/admin/src/pages/admin/monitoring/analytics/index.tsx`
- **Features**:
  - Real-time cost visualization with ApexCharts
  - Three interactive charts:
    - Cost over time (line chart)
    - Job distribution by source type (pie chart)
    - Cost by source type (bar chart)
  - Three summary statistics cards:
    - Total jobs processed
    - Total cost in USD
    - Average cost per job
  - Loads up to 1000 extraction jobs for comprehensive analysis
  - Error handling and loading states
  - Responsive design with Tailwind CSS
- **Component**: `CostVisualization.tsx` (reusable, 367 lines)
- **API Integration**: Uses `monitoringClient.listExtractionJobs()` with org/project scoping
- **Documentation**: `docs/COST_ANALYTICS_ROUTING.md`

**Dashboard Page** (`/admin/monitoring/dashboard`):
- **Status**: COMPLETE - Production ready
- **Location**: `apps/admin/src/pages/admin/monitoring/dashboard/index.tsx`
- **Features**:
  - Paginated job list (20 per page)
  - Status and source type filtering
  - Job detail modal with full metadata
  - "View Cost Analytics" button linking to analytics page
  - Real-time job status updates
- **API Integration**: Uses `monitoringClient.listExtractionJobs()` with pagination

**Backend Monitoring API**:
- **Status**: COMPLETE - Production ready
- **Endpoint**: `GET /monitoring/extraction-jobs` (with org/project scoping via headers)
  - Frontend calls: `/api/monitoring/extraction-jobs` (Vite proxy strips `/api` → backend receives `/monitoring/extraction-jobs`)
- **Response**: `ExtractionJobListResponse { items, total, page, page_size, has_more }`
- **Features**:
  - Pagination support
  - Sorting by started_at (desc)
  - Filtering by status and source type
  - Includes cost data per job
- **Authorization**: Uses existing `extraction:read` scope

### 🚧 To Be Implemented (Phases 1-5)
The sections below describe the remaining monitoring features to be built.

## 2. Core Concept: Resource-Centric Monitoring UI
The UI will be built around a generalized, reusable architecture:
- **`ResourceTable`**: A configurable table to display lists of any resource type (jobs, chat sessions, etc.).
- **`DetailsSidePanel`**: A generic slide-in panel to display the details of any selected resource.
- **`DetailViewRegistry`**: A "switchboard" component that dynamically renders the correct detail view based on the resource type.

## 3. UI/UX Specification
- **Main View**: A list of monitored resources (e.g., jobs) in a table.
- **Interaction**: Clicking a row in the table opens the `DetailsSidePanel` from the right, showing details without losing the context of the main list.
- **Live Indicator**: The side panel will have a "● LIVE" indicator if the selected resource is currently in progress, showing real-time log streaming.

### 3.1. Generic UI Components
- `ResourceTable.tsx`: Configurable table for displaying any resource list.
- `DetailsSidePanel.tsx`: Generic slide-in panel container.
- `DetailViewRegistry.tsx`: Renders the correct detail view for the selected resource.
- `LogViewer.tsx`: A performant component for displaying and filtering logs (both backend and frontend).
- `JsonViewer.tsx`: A component to pretty-print JSON with collapsible sections and a copy button.

### 3.2. Specific "Detail View" Components
- **`JobDetailsView.tsx`**:
  - **Summary Tab**: Metadata (status, timestamps, etc.).
  - **Application Logs Tab**: Real-time or static logs from the backend service.
  - **Vertex AI Logs Tab**: Structured logs from Google Cloud Logging, showing raw request/response.
- **`ChatSessionDetailsView.tsx`**:
  - **Summary Tab**: User, duration, total cost, tokens.
  - **Transcript Tab**: A chat-bubble view of the conversation.
  - **MCP Tooling Tab**: A "behind-the-scenes" look at the AI's tool selection, execution, and the final prompt sent to the LLM.
- **`FrontendSessionDetailsView.tsx`**:
  - **Summary Tab**: Session ID, User ID, Browser Info.
  - **Logs Tab**: A view of all logs and errors captured from the user's browser session.

## 4. Data & Logging Specification

### 4.1. Guiding Principle
Capture **structured artifacts** for key events rather than plain text logs. This enables rich, queryable data for the dashboard.

### 4.2. Database Schema (New Tables in `kb` schema)

All new tables will be added to the existing `kb` schema to keep monitoring data alongside application data.

- **`kb.system_process_logs`**: Stores general text logs for any process.
  - `id` (uuid, PK)
  - `process_id` (text) - job_id, session_id, etc.
  - `process_type` (text) - 'extraction_job', 'chat_session', 'sync', etc.
  - `level` (text) - 'debug', 'info', 'warn', 'error'
  - `message` (text)
  - `metadata` (jsonb, nullable) - additional context
  - `timestamp` (timestamptz)
  - `org_id` (text, nullable) - for filtering by org
  - `project_id` (uuid, nullable) - for filtering by project
  - Indexes: `(process_id)`, `(process_type, timestamp)`, `(org_id, timestamp)`, `(project_id, timestamp)`

- **`kb.llm_call_logs`**: A dedicated table for every LLM call.
  - `id` (uuid, PK)
  - `process_id` (text) - links to parent process
  - `process_type` (text)
  - `request_payload` (jsonb) - full request sent to LLM
  - `response_payload` (jsonb) - full response from LLM
  - `usage_metrics` (jsonb) - tokens, latency, etc.
  - `cost_usd` (decimal) - calculated cost
  - `model_name` (text)
  - `status` (text) - 'success', 'error', 'timeout'
  - `error_message` (text, nullable)
  - `timestamp` (timestamptz)
  - `org_id` (text, nullable)
  - `project_id` (uuid, nullable)
  - Indexes: `(process_id)`, `(model_name, timestamp)`, `(org_id, timestamp)`, `(project_id, timestamp)`

- **`kb.mcp_tool_calls`**: Captures the "thought process" for each chat turn.
  - `id` (uuid, PK)
  - `session_id` (uuid) - chat session
  - `turn_number` (integer)
  - `user_prompt` (text)
  - `thought_process` (text, nullable) - AI's reasoning
  - `tool_name` (text, nullable)
  - `tool_input` (jsonb, nullable)
  - `tool_output` (jsonb, nullable)
  - `final_llm_prompt` (text) - actual prompt sent to LLM
  - `timestamp` (timestamptz)
  - `org_id` (text, nullable)
  - `project_id` (uuid, nullable)
  - Indexes: `(session_id, turn_number)`, `(tool_name, timestamp)`, `(org_id, timestamp)`, `(project_id, timestamp)`

- **`kb.frontend_logs`**: Stores logs and errors captured from the client-side.
  - `id` (uuid, PK)
  - `session_id` (text) - browser session ID
  - `user_id` (text, nullable)
  - `level` (text) - 'log', 'warn', 'error'
  - `message` (text)
  - `stack_trace` (text, nullable)
  - `url` (text) - page URL where log occurred
  - `user_agent` (text)
  - `client_timestamp` (timestamptz) - when error occurred on client
  - `server_timestamp` (timestamptz) - when received by server
  - `metadata` (jsonb, nullable) - browser info, etc.
  - `org_id` (text, nullable)
  - `project_id` (uuid, nullable)
  - Indexes: `(session_id, client_timestamp)`, `(user_id, client_timestamp)`, `(level, server_timestamp)`, `(org_id, server_timestamp)`, `(project_id, server_timestamp)`

**Data Retention Policy** (implement later):
- Keep logs for 90 days by default
- Archive older logs to cold storage
- Provide configuration for retention period per table

### 4.3. Code Injection Points for Logging

All logging will be **asynchronous** to avoid blocking main application flows. Use a queue-based approach (BullMQ/Redis) if performance issues arise.

- **Extraction Jobs (`vertex-ai.provider.ts`)**: 
  - Log to `kb.llm_call_logs` after each `generateContent` call
  - Capture request/response, timing, token usage
  - Calculate cost based on model pricing table

- **Chat Sessions (MCP Service)**: 
  - Log to `kb.mcp_tool_calls` during the chat loop
  - Log to `kb.llm_call_logs` for each LLM invocation
  - Capture tool selection, execution, and results

- **General Processes (`extraction-logger.service.ts`)**: 
  - Generalize this service to write to `kb.system_process_logs`
  - Use across all backend processes (extraction, sync, etc.)
  - Make it async/non-blocking

### 4.4. Frontend Logging

- A `FrontendLoggingService.ts` will be created in the admin app.
- It will intercept `console.*` calls, `window.onerror`, and React Error Boundary catches.
- Logs will be buffered (max 50 logs or 30 seconds) and sent in batches to `POST /api/admin/monitoring/client-logs` endpoint.
- Batch sending reduces network overhead and server load.
- **No PII redaction for now** - log everything as-is for debugging purposes.

### 4.5. LLM Cost Calculation

Create a configuration file for model pricing (updated manually as Google changes pricing):

**File**: `apps/server/src/modules/monitoring/config/llm-pricing.config.ts`

```typescript
// Pricing as of October 2025 - update monthly from Google Cloud Pricing
export const LLM_PRICING = {
  'gemini-1.5-pro': {
    input_per_1k_tokens: 0.00125,   // $1.25 per 1M tokens
    output_per_1k_tokens: 0.005,    // $5.00 per 1M tokens
    currency: 'USD'
  },
  'gemini-1.5-flash': {
    input_per_1k_tokens: 0.000075,  // $0.075 per 1M tokens
    output_per_1k_tokens: 0.0003,   // $0.30 per 1M tokens
    currency: 'USD'
  },
  // Add more models as needed
};

export function calculateLLMCost(
  modelName: string, 
  inputTokens: number, 
  outputTokens: number
): number {
  const pricing = LLM_PRICING[modelName];
  if (!pricing) {
    console.warn(`No pricing info for model: ${modelName}`);
    return 0;
  }
  
  const inputCost = (inputTokens / 1000) * pricing.input_per_1k_tokens;
  const outputCost = (outputTokens / 1000) * pricing.output_per_1k_tokens;
  
  return inputCost + outputCost;
}
```

This approach:
- Keeps pricing configuration in code for version control
- Easy to update when Google changes prices
- Can be overridden via environment variables if needed
- Simple calculation function used across all logging points

## 5. Backend Module Structure

### 5.1. File Organization

```
apps/server/src/modules/monitoring/
├── monitoring.module.ts          # NestJS module registration
├── monitoring.controller.ts      # REST API endpoints
├── monitoring.service.ts         # Business logic for querying logs
├── monitoring-logger.service.ts  # Service for writing logs to DB (injected into other modules)
├── config/
│   └── llm-pricing.config.ts    # Model pricing configuration
├── dto/
│   ├── resource-query.dto.ts    # Query params for listing resources
│   ├── resource-detail.dto.ts   # Response DTO for resource details
│   ├── log-entry.dto.ts         # Response DTO for log entries
│   └── frontend-log.dto.ts      # Input DTO for frontend logs
└── entities/
    ├── system-process-log.entity.ts
    ├── llm-call-log.entity.ts
    ├── mcp-tool-call.entity.ts
    └── frontend-log.entity.ts
```

### 5.2. MonitoringModule Integration

The `MonitoringModule` will export `MonitoringLoggerService` so it can be injected into:
- `ExtractionJobsModule` - for logging extraction lifecycle
- `ChatModule` - for logging chat sessions and MCP calls
- `VertexAIModule` - for logging LLM calls
- Any other module that needs monitoring

Example injection:
```typescript
// In extraction-job.service.ts
constructor(
  private readonly db: DatabaseService,
  private readonly monitoringLogger: MonitoringLoggerService, // ← Injected
) {}

async processJob(jobId: string) {
  await this.monitoringLogger.logProcessEvent({
    processId: jobId,
    processType: 'extraction_job',
    level: 'info',
    message: 'Job processing started',
    orgId: this.currentOrgId,
    projectId: this.currentProjectId,
  });
  
  // ... job processing logic
}
```

## 6. Generalized API Plan

### Phase 1: Extraction Jobs Monitoring (Week 1)
**Goal**: Get basic monitoring working for extraction jobs only

1. **Database Migration**
   - Create `kb.system_process_logs` table
   - Create `kb.llm_call_logs` table
   - Add indexes for performance

2. **Backend Logging Service**
   - Create `MonitoringLoggerService` in `modules/monitoring/`
   - Inject into `ExtractionJobService` and `VertexAIProvider`
   - Log extraction lifecycle events
   - Log LLM calls with request/response

3. **Backend API**
   - Create `MonitoringModule`, `MonitoringController`, `MonitoringService`
   - Implement `GET /api/admin/monitoring/resources?type=extraction_job`
   - Implement `GET /api/admin/monitoring/resources/extraction_job/:id`
   - Implement `GET /api/admin/monitoring/resources/extraction_job/:id/logs`
   - Add proper authorization with existing scopes

4. **Frontend Components**
   - Create `ResourceTable` component (reusable)
   - Create `DetailsSidePanel` component (reusable)
   - Create `JobDetailsView` component (specific)
   - Create extraction jobs page at `/admin/monitoring/jobs`

5. **Testing**
   - Run extraction job
   - Verify logs are captured
   - Verify UI shows job details and logs

### Phase 2: Chat Session Monitoring (Week 2)
**Goal**: Add chat session and MCP tool monitoring

1. **Database Migration**
   - Create `kb.mcp_tool_calls` table
   - Add indexes

2. **Backend Logging**
   - Inject `MonitoringLoggerService` into `ChatService` and `McpClientService`
   - Log each chat turn with MCP tool calls
   - Log LLM calls during chat

3. **Backend API**
   - Add chat session endpoints to `MonitoringController`
   - Implement `GET /api/admin/monitoring/resources?type=chat_session`
   - Implement detail and logs endpoints

4. **Frontend Components**
   - Create `ChatSessionDetailsView` component
   - Create chat sessions page at `/admin/monitoring/chat-sessions`
   - Add chat transcript viewer
   - Add MCP tooling viewer (show behind-the-scenes AI reasoning)

### Phase 3: Frontend Logging (Week 3)
**Goal**: Capture and display frontend errors

1. **Database Migration**
   - Create `kb.frontend_logs` table
   - Add indexes

2. **Frontend Service**
   - Create `FrontendLoggingService`
   - Intercept console.error, window.onerror
   - Batch logs and send to backend

3. **Backend API**
   - Implement `POST /api/admin/monitoring/client-logs`
   - Rate limiting per user

4. **Frontend UI**
   - Create `FrontendLogsView` component
   - Create frontend logs page at `/admin/monitoring/frontend-logs`
   - Show error stack traces, browser info

### Phase 4: Analytics & Dashboard (Week 4)
**Goal**: Add aggregated metrics and main dashboard

1. **Backend Analytics**
   - Create SQL views for common aggregations
   - Add endpoints for metrics (cost per day, tokens per model, etc.)

2. **Frontend Dashboard**
   - Create main dashboard page
   - Add charts (cost over time, job success rate, etc.)
   - Add real-time stats (active jobs, recent errors)

3. **LLM Analytics Page**
   - Cost breakdown by model
   - Token usage trends
   - Cost optimization recommendations

### Phase 5: Polish & Performance (Week 5)
**Goal**: Optimize and add nice-to-have features

1. **Performance**
   - Add pagination to all lists
   - Add virtual scrolling if needed
   - Optimize SQL queries
   - Add Redis caching for hot data

2. **Real-Time Updates**
   - Add polling (every 5 seconds) for "live" jobs
   - Consider WebSocket for true real-time later

3. **Export & Search**
   - Add CSV export for logs
   - Add full-text search across logs
   - Add filtering UI (date range, status, etc.)

## 9. Summary & Key Decisions

### ✅ Confirmed Approach
1. **No New Role**: Uses existing `org_admin` / `project_admin` roles
2. **Existing Authorization**: Standard `@UseGuards(AuthGuard, ScopesGuard)` with existing scopes
3. **Schema Location**: All new tables in `kb` schema (not separate schema)
4. **Async Logging**: Acceptable - won't block main application flows
5. **MVP First**: Start with extraction jobs only, then expand
6. **No PII Redaction**: Log everything for debugging purposes (initially)
7. **Pricing in Code**: `llm-pricing.config.ts` with manual updates
8. **Pagination**: All lists paginated from day 1

### 📋 Database Tables
- `kb.system_process_logs` - General process logging
- `kb.llm_call_logs` - LLM request/response tracking with cost
- `kb.mcp_tool_calls` - MCP tool execution tracking for chat
- `kb.frontend_logs` - Client-side error and log capture

### 🎯 MVP Scope (Phase 1)
- Extraction job monitoring only
- Basic UI: job list + detail panel
- LLM call tracking with cost calculation
- Process logs with log levels

### 🔮 Future Phases
- Chat session monitoring (Phase 2)
- Frontend error tracking (Phase 3)
- Analytics dashboard (Phase 4)
- Real-time updates & polish (Phase 5)

### 🚀 Getting Started
Next step: Create database migration for Phase 1 tables (`system_process_logs` and `llm_call_logs`).

## 6. Generalized API Plan

All endpoints follow existing patterns with org/project scoping via headers (`X-Org-ID`, `X-Project-ID`).

### 6.1. API Endpoints

**Base Path**: `/api/admin/monitoring`

- `GET /api/admin/monitoring/resources?type=<type>&limit=50&offset=0`: Get paginated list of resources
  - Query params: `type` (extraction_job, chat_session, frontend_session), `limit`, `offset`, `status`, `date_from`, `date_to`
  - Returns: `{ items: Resource[], total: number, limit: number, offset: number }`
  - Scopes: `extraction:read` (for jobs), `chat:use` (for sessions)
  
- `GET /api/admin/monitoring/resources/:type/:id`: Get detailed payload for a specific resource
  - Returns full details including logs, metrics, related data
  - Scopes: Same as above based on type
  
- `GET /api/admin/monitoring/resources/:type/:id/logs?level=info&limit=100`: Get logs for specific resource
  - Query params: `level` (debug, info, warn, error), `limit`, `offset`
  - Returns paginated logs from `kb.system_process_logs`
  
- `GET /api/admin/monitoring/resources/:type/:id/llm-calls`: Get all LLM calls for a process
  - Returns data from `kb.llm_call_logs`
  
- `POST /api/admin/monitoring/client-logs`: Receive batched logs from frontend
  - Body: `{ logs: FrontendLog[] }`
  - No scopes required (authenticated users only)
  - Rate limited per user

### 6.2. Authorization

- All endpoints require authentication via `@UseGuards(AuthGuard, ScopesGuard)`
- Use existing scopes:
  - `extraction:read` - for extraction job monitoring
  - `chat:use` - for chat session monitoring
  - No special "superadmin" scope needed
- Org/project filtering handled automatically via RLS policies and request headers

## 7. Frontend Integration Plan

### 7.1. Sidebar Navigation

The "Superadmin" section in the sidebar (already exists) will be renamed to "System Monitoring" or keep as-is. This section is visible to `org_admin` and `project_admin` users.

The proposed links are:
- **System Monitoring** (Group Title)
  - **Dashboard**: `/admin/monitoring/dashboard` - The main job list and metrics page
  - **Cost Analytics**: `/admin/monitoring/analytics` - Visual cost/usage analysis with charts (ApexCharts) and model breakdown
  - **Extraction Jobs**: `/admin/monitoring/jobs` - A view of the `ResourceTable` for extraction jobs
  - **Chat Sessions**: `/admin/monitoring/chat-sessions` - A view for chat session monitoring
  - **Frontend Logs**: `/admin/monitoring/frontend-logs` - A view for client-side error tracking

**Note**: "Cost Analytics" and "LLM Analytics" are the same feature - cost tracking with model-level breakdown. The current implementation shows:
- Cost over time (line chart)
- Job distribution by source type (pie chart)
- Cost by source type (bar chart)
- Summary statistics (total jobs, total cost, average cost)

Future enhancements can add:
- Token usage trends per model
- Cost breakdown by model (gemini-1.5-pro vs gemini-1.5-flash)
- Cost optimization recommendations
- Month-over-month comparisons

**Cross-Page Navigation**:
- Dashboard has "View Cost Analytics" button → links to Cost Analytics page
- Cost Analytics has breadcrumb: Dashboard > Cost Analytics
- All monitoring pages have consistent navigation header with quick links to other monitoring sections
- Resource tables (jobs, sessions) have action buttons that open detail panels inline (no navigation)

### 7.2. Routing

Routes will be added to `apps/admin/src/router/register.tsx` to register the page components. Each route will be lazy-loaded for better performance.

```typescript
// In register.tsx
{ path: "/admin/monitoring/dashboard", element: cw(lazy(() => import("@/pages/admin/monitoring/dashboard"))) },
{ path: "/admin/monitoring/analytics", element: cw(lazy(() => import("@/pages/admin/monitoring/analytics"))) },
{ path: "/admin/monitoring/jobs", element: cw(lazy(() => import("@/pages/admin/monitoring/jobs"))) },
{ path: "/admin/monitoring/chat-sessions", element: cw(lazy(() => import("@/pages/admin/monitoring/chat-sessions"))) },
{ path: "/admin/monitoring/frontend-logs", element: cw(lazy(() => import("@/pages/admin/monitoring/frontend-logs"))) },
```

**Note**: The `/admin/monitoring/analytics` route already exists and is working. It currently shows cost visualization with ApexCharts. Future enhancements will add model-level breakdown and token usage trends to this same page.

### 7.3. Access Control

No special frontend guards needed - standard `GuardedAdmin` wrapper handles authentication. Backend enforces authorization via existing scopes.
