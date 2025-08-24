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

## Frontend (Admin UI)
- Purpose: Browse and search documents, chunks, spec objects, evidence, and relationships; basic curation actions.
- Stack: TypeScript + React 19, Vite 7, React Router 7, Tailwind CSS 4, DaisyUI 5, Zod for client-side typing/validation.
- Components & charts: DaisyUI components; ApexCharts via react-apexcharts for dashboards.
- Theming: DaisyUI themes with Tailwind config; dark/light toggle persisted in local storage.
- API: JSON over HTTP to the MCP server/backend; fetch with retries and exponential backoff.
- Auth: Reuse backend auth (Bearer/Session); store tokens in httpOnly cookies; CSRF protection for state-changing routes.
- Node version: >= 20.19 (per template engines field).

### Admin: Documents
- Purpose: List all ingested/uploaded documents with basic metadata.
- Route: `/apps/documents` (admin layout).
- UI:
  - Page title with breadcrumb to Nexus home.
  - DaisyUI `card` containing an `overflow-x-auto` table.
  - Columns: Filename, Source URL, Mime Type, Chunks (badge), Created At.
  - Empty state row when no data.
  - Loading state uses DaisyUI `skeleton` via a small `LoadingEffect` component.
  - Errors shown using `alert alert-error`.
- Interactions: None (read-only v1). Future: sort, filter, view details.
- Styling: Tailwind CSS 4 + daisyUI 5; no custom CSS.
- Accessibility: Table headers labeled; links open in new tab with `rel="noreferrer"`.

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
