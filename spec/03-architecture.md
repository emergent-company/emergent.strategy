# Architecture

## Overview
Components
  - Chosen Model: Google Gemini. Embeddings model: text-embedding-004 (Gemini 1.5). Generation models can be configured per pipeline later.
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
