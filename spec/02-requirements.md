# Requirements

## Functional
- Source ingestion
  - File drop (manual upload or watched folder/S3/GCS/Drive/SharePoint/Box).
  - Tickets and dev tools (Jira/Linear/GitHub Issues/PRs/Discussions).
  - Meetings and chat (Zoom/Meet/Teams/Slack). Support audio/video transcription via external service.
  - Web pages and wikis (Confluence/Notion/GitHub Wiki).
- Processing
  - Text extraction for common file types (pdf, docx, pptx, xlsx, md, html, txt).
  - Language detection and normalization (UTF-8, basic cleaning, PII redaction options).
  - Chunking with configurable strategies (semantic, fixed, headings-aware).
  - Embeddings generation (pluggable models/providers).
  - Metadata and provenance capture (source URL, timestamps, authors, access scopes, hash).
- Indexing and storage
  - Vector index in Postgres via pgvector (ANN).
  - Graph store for entities/relations (Neo4j) and provenance edges.
  - Full Text Search via Postgres built-in FTS.
  - Object store for originals and derived artifacts.
- Retrieval and reasoning
  - Hybrid search (keyword + vector + graph reranking) with filters.
  - Citations and snippet highlighting with chunk IDs.
  - Session-based context packing for AI agents (retrieval-augmented prompts).
- MCP server
  - Expose resources (facts, documents, chunks, entities, relations).
  - Provide tools: search, fetch, expand (neighbors), summarize, propose_spec.
  - AuthN/Z passthrough or service auth; per-tenant scoping.

## Non-Functional
- Performance: P95 query under 1s for 100k chunks; ingestion latency < 2 min from drop to searchable (for small docs).
- Scalability: handle >5M chunks with horizontal scaling.
- Reliability: 99.9% available MCP; idempotent ingestion.
- Security: SSO, row-level security per tenant, encryption at rest and in transit, audit logging.
- Observability: metrics, traces, structured logs, lineage dashboards.
- Extensibility: new sources/processors via LangChain components and code-first pipelines.

## Model and Dev Environment
- LLM Provider: Google Gemini.
- Embeddings Model: `text-embedding-004` (Gemini 1.5 embeddings).
- Dev DB: Postgres with pgvector and FTS, running locally via Docker Compose with bootstrap SQL to enable extensions and create base tables.
 - Dev Auth: Zitadel (https://zitadel.com/) (OIDC/OAuth2) runs locally via Docker Compose alongside Postgres for development. Provide minimal bootstrap (org/project/app) and expose issuer URL and credentials via `.env`.
 - Self-hosted reference (staging/prod): Follow Zitadel self-hosting deployment overview: https://zitadel.com/docs/self-hosting/deploy/overview

## Frontend (Admin UI)
- Purpose: Browse and search documents, chunks, spec objects, evidence, and relationships; basic curation actions.
- Stack: TypeScript + React 19, Vite 7, React Router 7, Tailwind CSS 4, DaisyUI 5, Zod for client-side typing/validation.
- Components & charts: DaisyUI components; ApexCharts via react-apexcharts for dashboards.
- Theming: DaisyUI themes with Tailwind config; dark/light toggle persisted in local storage.
- API: JSON over HTTP to the MCP server/backend; fetch with retries and exponential backoff.
- Auth: Zitadel (https://zitadel.com/) (OIDC/OAuth2) is the auth backend. Reuse backend auth (Bearer/Session); store tokens in httpOnly cookies; CSRF protection for state-changing routes. Providers: Google, GitHub, and username/password (all via Zitadel).
 - Auth Frontend integration: Follow Zitadel’s React example for SPA login: https://zitadel.com/docs/examples/login/react
- Node version: >= 20.19 (per template engines field).

### Auth UI (Nexus Template)
- Use the Nexus Admin Dashboard Template’s Auth layout and components for all authentication pages.
- Styling uses Tailwind CSS 4 + daisyUI 5 utility classes; icons via Iconify with Lucide (e.g., `iconify lucide--log-in`).
- Routes live under `/auth/*` (e.g., `/auth/login`, `/auth/callback`, `/auth/logout`) and integrate with the router’s Auth layout.

Acceptance Criteria (Auth UI – Nexus Template)
- `/auth/login` renders inside the Nexus Auth layout shell and uses template components (Logo, headings, inputs, buttons, alerts).
- Inputs and buttons are daisyUI components; no custom CSS files are introduced for auth pages.
- Icons on the login screen (if present) are Iconify Lucide classes (e.g., `iconify lucide--github`, `iconify lucide--google`).
- Unauthenticated navigation to protected routes redirects to `/auth/login`; after successful callback, user returns to the original route.

### Admin: Documents
- Purpose: List all ingested/uploaded documents with basic metadata and allow manual upload.
- Route: `/admin/apps/documents` (admin layout).
- UI:
  - Page title with breadcrumb to Nexus home.
  - Upload area at the top of the page (above the table) with:
    - Primary action button: "Upload document" (opens file chooser).
    - Visible drop zone with a dashed border and instruction text: "Click to upload or drag & drop a file".
    - Drag-over highlight state (border/color change) when a file is dragged over the page/zone.
  - DaisyUI `card` containing an `overflow-x-auto` table.
  - Columns: Filename, Source URL, Mime Type, Chunks (badge), Created At.
  - Empty state row when no data.
  - Loading state uses DaisyUI `skeleton` via a small `LoadingEffect` component.
  - Errors shown using `alert alert-error`.
- Interactions:
  - Upload document (single-file v1):
    - Click the "Upload document" button to open a native file chooser and select a file.
    - Or drag a file anywhere on the page (or onto the drop zone) to initiate upload.
    - Accepted types (aligned with extraction): pdf, docx, pptx, xlsx, md, html, txt. Show a helpful message if an unsupported type is dropped.
    - Max file size: 10 MB (matches backend limit).
    - While uploading: show an inline progress/loader and disable the upload button.
    - On success: show a success toast and refresh the documents list.
    - On error: show `alert alert-error` with the server-provided message.
  - Future: sort, filter, view details.
- Styling: Tailwind CSS 4 + daisyUI 5; no custom CSS.
- Accessibility:
  - Table headers labeled; links open in new tab with `rel="noreferrer"`.
  - Drop zone must be keyboard-focusable, announce purpose (aria-label/aria-describedby), and support pressing Enter/Space to open the file chooser.

Acceptance Criteria (Documents Upload)
- The page presents a clearly visible "Upload document" button and a dashed drop zone with instructional text.
- Dragging a file over the page visibly highlights the drop zone; dropping the file triggers an upload attempt.
- Clicking the button opens a file chooser. Selecting a file triggers upload.
- Files over 10 MB or unsupported types are blocked with a clear error.
- On success, the new document appears at the top of the list without a full page reload.
- The upload component is operable with keyboard and announced to assistive tech.

API Contract (used by Admin UI)
- Endpoint: `POST /ingest/upload`
- Content type: `multipart/form-data`
- Form field: `file` (single file)
- Success: `{ status: "ok", ... }` and the server ingests/chunks the document asynchronously.
- Failure: `{ error: string }` with appropriate HTTP status.

Optional Enhancements (polish)
- Multi-file uploads: allow selecting/dropping multiple files with a queued UI; cap parallel uploads (e.g., 2–3 at a time).
- Per-file progress: show a `progress` bar per item; allow cancel/retry individually.
- Toast notifications: use `toast` + `alert-success|alert-error` for non-blocking feedback instead of inline alerts.
- Better drag-and-drop UX: show a full-page overlay highlight when dragging a file anywhere in the window; confine drop handling to page root.
- File list preview: render selected/dropped files (icon, name, size, type); validate before sending; disable duplicates by checksum/file name + size heuristic.
- URL ingestion shortcut: add a small input + "Ingest URL" button that calls `POST /ingest/url` next to the upload button.
- Accessibility: add `aria-live="polite"` region for upload status updates; ensure color changes are not the only indicators.
- Error detail: parse server error JSON safely; show concise messages and an expandable "Show details" for advanced logs.
- Configurable limits: surface max file size/allowed types from server settings endpoint to avoid hard-coded client limits.
- Empty/loading polish: replace success inline message with a temporary success toast and auto-dismiss.

### API: Documents
- Endpoint: `GET /documents`
- Response shape:
  - `{ documents: Array<{ id: string, source_url: string|null, filename: string|null, mime_type: string|null, created_at: string, updated_at: string, chunks: number }>} }
- Behavior:
  - Returns all documents ordered by `created_at DESC`.
  - `chunks` is the count of rows in `kb.chunks` per document.
  - Safe on existing DBs (columns added if missing).

## Out of Scope (v1)
- Automated contract extraction for all domains (beyond simple NER/relations).
- End-user UI beyond basic admin and health dashboards.
