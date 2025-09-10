# Architecture

## Overview
Components
  - Chosen Model: Google Gemini. Embeddings model: text-embedding-004 (Gemini 1.5). Generation models can be configured per pipeline later.

## Framework Migration (Express → NestJS)
Rationale
- The current HTTP surface is still small; migrating now reduces future refactor cost.
- NestJS gives us: structured modules, dependency injection, built‑in OpenAPI generation (Swagger), powerful interceptors/guards for auth + multi‑tenancy context, and first‑class SSE (`@Sse()`), while keeping TypeScript ergonomics.
- Code‑first OpenAPI removes the manual drift risk we experienced editing `openapi.yaml`.

Goals (Migration)
- Preserve all existing endpoint paths, HTTP verbs, response shapes, and error envelope (backward compatible for the Admin UI).
- Auto‑generate OpenAPI (3.1) from decorators; our served spec stays at `/openapi/openapi.json` (JSON) and `/docs` (Stoplight or Swagger UI bridge if desired).
- Centralize validation with DTO classes + `class-validator`/`class-transformer` OR Zod pipes (decision: start with class-validator for smooth Nest integration; can layer zod later for shared runtime parsing with ingestion pipelines).
- Enforce error envelope via a global `HttpExceptionFilter` mapping Nest exceptions & unhandled errors to `{ error: { code, message, details } }`.
- Implement multi‑tenancy context propagation with a request‑scoped interceptor/guard that resolves `userId`, `orgId`, `projectId` and sets them into a per‑request provider (and optionally a CLS namespace) used by repositories.
- Support streaming via `@Sse('/chat/stream')` returning an RxJS `Observable<MessageEvent>` wrapping the same ChatChunk frames.

Non‑Goals (Migration)
- Changing persistence layer or table schema.
- Introducing CQRS/event sourcing prematurely.
- Rewriting ingestion pipelines (only route/controller shell moves initially).

High‑Level Module Plan
| Module | Purpose | Key Providers / Controllers |
|--------|---------|-----------------------------|
| AppModule | Root composition | Imports all feature modules; sets up global filters/pipes/guards/interceptors |
| ConfigModule | Configuration + env schema | `ConfigService` validating env vars (Zod or Joi) |
| AuthModule | AuthN/AuthZ integration with Zitadel | `AuthGuard` (JWT verification), `RolesGuard`, token parsing service |
| HealthModule | Liveness/readiness probes | `HealthController` |
| OrgsModule | Organizations CRUD (current read/list) | `OrgsController`, `OrgsService` |
| ProjectsModule | Projects CRUD | `ProjectsController`, `ProjectsService` |
| SettingsModule | Key/value settings | `SettingsController`, `SettingsService` |
| IngestionModule | URL & file ingestion entrypoints | `IngestionController`, `IngestionService` |
| SearchModule | Hybrid search | `SearchController`, `SearchService` (wraps vector + lexical services) |
| DocumentsModule | Documents listing | `DocumentsController`, `DocumentsService` |
| ChunksModule | Chunks listing/retrieval | `ChunksController`, `ChunksService` |
| ChatModule | Chat SSE + conversations CRUD | `ChatController`, `ChatService`, `RetrievalService`, `StreamingService` |
| VectorModule | pgvector + FTS abstraction | `VectorRepository`, scoring/fusion utilities |
| DatabaseModule | DB connection + repositories | TypeORM/Knex/pg Pool provider; RLS context setter interceptor |

Cross‑Cutting Components
- Global Validation Pipe: transforms & validates DTOs; rejects with 422 (maps to `validation-failed`).
- Exception Filter: maps Nest `HttpException` & generic errors to uniform error envelope.
- Logging Interceptor: structured JSON logs with correlation/request ID.
- Context Interceptor: reads headers (`X-Org-ID`, `X-Project-ID`), attaches to CLS store & sets Postgres `SET LOCAL` for RLS.
- Metrics Interceptor (future): collect latency, error counts, streaming durations.

DTO / Schema Strategy
- Define request/response DTOs in each module; annotate with `@ApiProperty()` for OpenAPI.
- Shared primitives (Citation, Message, Conversation, ChatChunk) live in `libs/contracts` (future workspace lib) to avoid duplication across server & potential workers.
- Enforce numeric/string bounds (e.g., `topK` 1..20) with decorators and class-validator.

OpenAPI Generation
- Enable `@nestjs/swagger`; in bootstrap generate spec to memory and write JSON file (optionally also produce YAML for Stoplight).
- Post‑process hook adds `x-tagGroups` to group endpoints (same grouping currently in manually maintained spec).
- Serve JSON spec at `/openapi/openapi.json`; keep compatibility alias at existing YAML path until clients updated, then deprecate.

SSE Implementation (Chat)
- `@Sse('chat/stream')` returns `Observable<MessageEvent>` where `data` field contains serialized `ChatChunk`.
- Convert internal async generator of LLM tokens into an RxJS observable (`fromEventPattern` or manual `new Observable`).
- Ensure meta → token* → done|error sequencing by composing observables (`concat(of(meta), token$, of(done))`).
- Abort support: pass `AbortSignal` from request; if client disconnects (`close` event), complete observable and cancel LLM call.

Incremental Migration Plan
1. Create `apps/server-nest` (or refactor in-place if repo simplicity preferred). Scaffold with Nest CLI (`nest new`).
2. Implement core cross‑cutting modules (Config, Database, Auth) + HealthModule first; verify build & OpenAPI output.
3. Port read‑only endpoints (health, settings, orgs, projects, documents, chunks, search) maintaining identical routes.
4. Implement ChatModule SSE with a mock retrieval first; validate streaming contract matches existing Admin UI consumer.
5. Port ingestion endpoints last (file upload handling via `@UseInterceptors(FileInterceptor('file'))`).
6. Run differential contract test: compare old `openapi.yaml` vs generated `openapi.json` (ignoring ordering) — fail build on breaking changes.
7. Remove legacy Express code & manual spec once parity confirmed; update docs to reference generated spec only.

Acceptance Criteria (Nest Migration)
- All existing endpoints continue to respond with same paths & semantics (no 404 regressions) under Nest server.
- Generated OpenAPI contains identical schemas & field names for public contract objects (Chat, Documents, etc.).
- Error envelope format unchanged for all non‑200 responses.
- SSE chat stream preserves event order and field names (`type`, `conversationId`, `citations`, `token`, `error`).
- Manual `openapi.yaml` file no longer requires hand edits post‑migration (build generates spec).
- Unit tests (or contract snapshot tests) verify at least one example response per module and SSE frame sequence for /chat/stream.

Risks & Mitigations
- Drift between DTO & DB entity shapes → Introduce mapper functions; keep DTOs lean, exclude internal fields.
- Performance overhead of DI/request scope → Most providers remain singleton; only context provider is request‑scoped.
- Learning curve → Keep module boundaries tight; document patterns here.

Open Questions
- Keep manual YAML for Stoplight advanced grouping vs. enrich generated spec? (Planned: Post‑process injection of `x-tagGroups`).
- Zod vs class-validator long term? (Start with class-validator; revisit if we want shared schema execution in workers.)
- File storage abstraction location (IngestionModule vs dedicated StorageModule)?

Decommission Plan (Legacy Express)
- Parallel run Nest server on different port; smoke test endpoints.
- Switch reverse proxy / dev start script to Nest port once contract tests pass.
- Remove Express routes & manual spec; archive commit hash for reference.

Timeline (Rough)
- Week 1: Scaffold + core modules + health/settings.
- Week 2: Port search/documents/chunks/orgs/projects.
- Week 3: Chat SSE + ingestion + contract tests + remove Express.

All future backend feature specs should assume NestJS conventions (modules, providers, controllers, DTOs, decorators) from this point forward.
## Data Flow
1. Source event (file drop, webhook, poll) hits the TypeScript LangChain ingestion API or queue.
2. Fetch and store original in object storage; compute checksum.
3. Text extraction and normalization.
4. Chunking and metadata enrichment.
5. Embedding creation and vector upsert.
6. Graph extraction (optional NER + relation heuristics); write entities/edges.
7. Keyword index update.
8. Publish ingestion completion event; MCP cache warm.

## Multi-tenancy & Context Propagation
- Auth token carries user id and memberships; server resolves active tenant/org/project context from headers (e.g., `X-Org-ID`, `X-Project-ID`) or session.
- All write/read paths require an active project context; requests without it return 400 with guidance.
- RLS in Postgres enforces tenant/org/project scoping; indices include `(tenant_id, organization_id, project_id)` where applicable.
- Invitations: owners/admins can invite existing users by email to orgs/projects; acceptance establishes Membership/ProjectMembership.

### Invites Flow
- Create invite: API creates a signed, expiring token bound to org/project, role, and invitee email.
- Notify: email service sends acceptance link to invitee; link opens `/auth/callback?invite=...` which exchanges token, verifies email, and binds to user account.
- Accept: upon success, backend creates membership rows (organization_memberships, project_memberships) with the requested role; idempotent if already accepted.
- Revoke/resend: admin endpoints to revoke an outstanding token or resend the email; audit every action.

### RLS Enforcement
- DB tables include `organization_id` and optionally `project_id` foreign keys; enable RLS and define policies like:
  - USING: user is a member of the row’s organization (and project where applicable) with sufficient role.
  - WITH CHECK: inserts/updates allowed only within caller’s permitted org/project set.
- API layer derives `current_setting('app.user_id')`, `app.org_id`, `app.project_id` via `SET LOCAL` at the start of a request to let RLS evaluate without passing IDs in every query.
- All queries run inside a transaction with these settings; logs include org/project for traceability.

## Admin UI: Documents
- The admin SPA (Vite/React) supports manual document upload via button and drag-and-drop to `POST /ingest/upload` (multipart/form-data, `file` field, 10MB limit), then queries `GET /documents` to list document metadata from Postgres.
- The server computes `chunks` via a subquery count on `kb.chunks`.
- The UI renders a daisyUI `table`; no pagination in v1; sorting/filtering planned.

## Auth UI
- Use the Nexus Admin Dashboard Template (React) for all auth pages.
- Reuse the template’s Auth layout and components, following Tailwind CSS 4 + daisyUI 5 and Iconify Lucide icon rules.
- Routes should live under `/auth/*` and integrate with the router’s Auth layout.

Acceptance Criteria (Auth UI – Nexus Template)
- Auth routes (`/auth/login`, `/auth/callback`, `/auth/logout`) render using the Nexus Auth layout and components.
- Inputs, buttons, and alerts on auth pages are daisyUI components; no custom CSS introduced for auth.
- Icons are implemented via Iconify with Lucide classes, if icons are present.
- Unauthenticated access to protected routes redirects to `/auth/login`; after successful auth callback, user returns to the originally requested route.

Optional Steps (Architecture / Backend)
- Offload storage: persist originals to object storage (S3-compatible) instead of memory for large files; stream to disk before processing.
- Background processing: enqueue ingestion into a job queue (e.g., BullMQ/Redis) to avoid blocking the upload HTTP request; return 202 + job id.
- Antivirus/malware scanning: integrate ClamAV or a SaaS scanner before extracting text.
- Content hashing & deduplication: compute checksum (e.g., sha256) and skip re-ingestion for duplicates with clear UI feedback.
- Rate limits & quotas: per-user/org limits for upload size/daily volume.
- Webhooks/events: emit "document.ingested" after chunking/embedding; the Admin UI can subscribe (SSE/WebSocket) to auto-refresh.
- Observability: add metrics for upload latency, failures, and ingestion lag; expose in a dashboard.

## Hybrid Retrieval
- Default retrieval mode: hybrid.
- Candidate generation: vector kNN (pgvector) + keyword FTS (tsvector/BM25 equivalent via ts_rank).
- Fusion: Reciprocal Rank Fusion (RRF, k≈60) or weighted blending of normalized scores; then optional graph-aware rerank using:
  - Provenance authority (source type, recency, author reputation).
  - Graph proximity to query entities.
- Output: top-N passages with citations, expandable via graph neighbors.

API Notes
- `/search` defaults to hybrid; `mode=vector|lexical|hybrid` may be provided for debugging and evaluation.
- Chat retrieval uses the same fusion pipeline to build the context window.

## Deployment
- Containerized services; infra as code.
- Minimal viable stack: Single Postgres instance (pgvector + FTS enabled) as system of record, Neo4j (optional v1), LangChain.js ingestion service (TypeScript/Node), MCP server, object store (S3-compatible). Optional task queue (Redis/Rabbit) for background processing.
- Admin UI build: static assets produced by Vite; serve via CDN or reverse proxy alongside the API. Node >= 20.19 for local dev.
