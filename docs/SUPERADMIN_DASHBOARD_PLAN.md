# Superadmin Dashboard Specification

## 1. High-Level Goals
- Provide a centralized, real-time dashboard for superadmins to monitor application health and activity.
- Offer deep insights into specific processes like extractions, chat sessions, and syncs.
- Track and display key metrics, including LLM costs, token usage, and job statuses.
- Enable proactive monitoring, system control, and user-centric debugging.

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

### 4.2. Database Schema (New Tables)
- **`SuperAdmin_ProcessLogs`**: Stores general text logs for any process.
  - `processId`, `processType`, `level`, `message`, `timestamp`
- **`SuperAdmin_LlmCalls`**: A dedicated table for every LLM call.
  - `processId`, `processType`, `requestPayload` (JSONB), `responsePayload` (JSONB), `usageMetrics` (JSONB), `cost`, `modelName`, `status`
- **`SuperAdmin_McpTurns`**: Captures the "thought process" for each chat turn.
  - `sessionId`, `userPrompt`, `thoughtProcess`, `toolExecuted` (JSONB), `finalLlmPrompt`
- **`SuperAdmin_FrontendLogs`**: Stores logs and errors captured from the client-side.
  - `sessionId`, `userId`, `level`, `message`, `stackTrace`, `url`, `clientTimestamp`

### 4.3. Code Injection Points for Logging
- **Extraction Jobs (`vertex-ai.provider.ts`)**: Log to `SuperAdmin_LlmCalls` after each `generateContent` call.
- **Chat Sessions (MCP Service)**: Log to `SuperAdmin_McpTurns` and `SuperAdmin_LlmCalls` during the chat loop.
- **General Processes (`extraction-logger.service.ts`)**: Generalize this service to write to `SuperAdmin_ProcessLogs` and use it across all backend processes.

### 4.4. Frontend Logging
- A `FrontendLoggingService.ts` will be created in the admin app.
- It will intercept `console.*` calls, `window.onerror`, and React Error Boundary catches.
- Logs will be buffered and sent in batches to a new `POST /api/superadmin/client-logs` endpoint.

## 5. "Amazing" Superadmin Features (Future Enhancements)
- **Live Metrics & Analytics Dashboard**: Real-time graphs for KPIs like LLM cost, job throughput, and API latency.
- **User-Centric Explorer**: A unified timeline of all activity for a specific user (frontend sessions, jobs, chats, errors).
- **System Configuration and Control**: A UI for managing feature flags, LLM settings, and system toggles (e.g., maintenance mode) in real-time.
- **Cost Management and Budgeting**: A dedicated dashboard for analyzing LLM costs and setting budget alerts.

## 6. Generalized API Plan
- `GET /api/superadmin/resources?type=<type>`: Get a list of resources.
- `GET /api/superadmin/resources/:type/:id`: Get the detailed payload for a specific resource.
- `POST /api/superadmin/client-logs`: Endpoint to receive logs from the frontend.
