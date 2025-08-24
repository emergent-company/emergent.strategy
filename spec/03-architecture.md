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
- The admin SPA (Vite/React) queries `GET /documents` to list document metadata from Postgres.
- The server computes `chunks` via a subquery count on `kb.chunks`.
- The UI renders a daisyUI `table`; no pagination in v1; sorting/filtering planned.

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
