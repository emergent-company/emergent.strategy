# Spec Server

Minimal ingestion server aligned with the spec:
- Ingest a URL or uploaded file, extract text, chunk, embed with Google Gemini `text-embedding-004`.
- Store in Postgres with pgvector and FTS.

See `SETUP.md` for end-to-end local setup (DB, Zitadel auth, API server, Admin SPA) and `RUNBOOK.md` for operational details.
