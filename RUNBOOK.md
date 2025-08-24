# Dev Runbook

This project provides a minimal ingestion server aligned with the spec. It stores documents and chunks in Postgres (pgvector + FTS) and uses Google Gemini for embeddings.

Prereqs
- Node.js >= 20.19
- Docker

1) Start Postgres with pgvector
- From the `docker/` directory, start the DB:

```bash
cd docker
docker compose up -d
```

2) Configure environment
- Copy `.env.example` to `.env` and fill `GOOGLE_API_KEY` (required).
- Default Postgres creds match docker-compose: spec/spec/spec.

3) Install and run
- In project root:

```bash
cp .env.example .env   # then edit GOOGLE_API_KEY
npm install
npm run db:init
npm run dev
```

- Health check: http://localhost:3001/health

4) Ingest
- POST http://localhost:3001/ingest/url with JSON `{ "url": "https://example.com" }`
- POST http://localhost:3001/ingest/upload (multipart form field `file`)

5) Smoke test
- In another terminal:

```bash
npm run test:smoke
```

Notes
- The DB schema defines: `kb.documents` and `kb.chunks` with `embedding vector(768)` and FTS `tsv`.
- Embeddings model: `text-embedding-004` (Google Gemini).
- Content types: basic HTML and text are supported inline; extend parsers for PDF/Docx later.
