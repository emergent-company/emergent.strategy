# Operations

## HTTP Endpoints (v0.1)
- GET `/health` -> { ok, model, db }
- POST `/ingest/url` -> { status, documentId, chunks }
- POST `/ingest/upload` (multipart file) -> { status, documentId, chunks }

Auth: None in v0.1 for local dev; add bearer tokens and CSRF in v1.

## Deployments
- Dev: docker-compose with Postgres (pgvector), LangChain ingestion service, MCP server, MinIO, optional Neo4j.
- Prod: Kubernetes; Helm charts; managed Postgres; optional managed Neo4j; object storage (S3/GCS); autoscaling for embedding workers.

## Configuration
- Source connectors: credentials via secrets; per-tenant scopes.
- Embedding providers: model choice, rate limits, batching.
- Chunking strategy: profile per source type.
- Retention policies and PII redaction settings.

## Observability
- Metrics: ingestion latency, chunk count, embedding latency, query P95/P99, recall@k, index freshness.
- Traces: pipeline spans per document; query spans across hybrid path.
- Logs: structured JSON; correlation_id and tenant_id propagation.

## Backups and DR
- Daily snapshots of Postgres and Neo4j; object storage versioning.
- Restore runbooks; periodic fire drills.

## Cost Controls
- Batch embeddings; dedupe by checksum; TTL for caches; tiered storage for large originals.
