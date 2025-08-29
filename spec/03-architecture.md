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
- Candidate generation: vector kNN + keyword BM25.
- Fusion: RRF or weighted blending, then graph-aware rerank using:
  - Provenance authority (source type, recency, author reputation).
  - Graph proximity to query entities.
- Output: top-N passages with citations, expandable via graph neighbors.

## Deployment
- Containerized services; infra as code.
- Minimal viable stack: Single Postgres instance (pgvector + FTS enabled) as system of record, Neo4j (optional v1), LangChain.js ingestion service (TypeScript/Node), MCP server, object store (S3-compatible). Optional task queue (Redis/Rabbit) for background processing.
- Admin UI build: static assets produced by Vite; serve via CDN or reverse proxy alongside the API. Node >= 20.19 for local dev.
