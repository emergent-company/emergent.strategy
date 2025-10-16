# LangChain Pipelines

This folder contains code-first pipeline designs to replace prior n8n-based workflows. Pipelines are implemented as services in TypeScript using LangChain.js and exposed via HTTP endpoints or background workers.

## Why LangChain
- Code-first: testable, versionable, and type-safe (Pydantic/TypeScript types)
- Structured outputs: JSON Schema/Pydantic parsing with robust validation
- Flexibility: compose custom retrievers, tools, and chains inside the MCP server

## Core building blocks
- Ingestion API: FastAPI/Express endpoint to accept uploads or provider callbacks
- Download + Store: checksum, object storage write, document row upsert
- Extraction: Unstructured/Tika text parse; optional OCR
- Chunking: headings-aware or semantic splitters
- Embeddings: pgvector/Qdrant upsert; keyword FTS update
- LLM Extraction: schema-constrained chain to produce Spec Objects with evidence
- Persistence: upsert objects, evidence links, relationships
- Events: emit ingestion_complete; warm MCP caches

## Tech stack
- TypeScript: Fastify/Express + LangChain.js + AJV/Zod
- Optionally a task queue for background work (BullMQ/Temporal)
- Providers: Google Gemini, OpenAI, or local models (via LangChain integrations)

## Files
- meeting_transcript_pipeline.md — meeting transcript pipeline design and pseudocode

## Migration note
The older n8n workflow exports under `docs/spec/workflows/` are retained for reference but are no longer authoritative. New work should target these LangChain pipelines.
