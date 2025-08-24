# Project Facts Hub — Specification Draft

This repository describes a system that ingests all “facts” about a potential software project (requirements, meeting transcripts, documents, tickets, etc.), indexes them for hybrid retrieval (vector + graph + keyword), and exposes the corpus through an MCP server so AI agents can generate specifications and guide coding agents.

## Contents
- 01-problem-statement.md — Why this exists and who it serves
- 02-requirements.md — Functional and non-functional requirements
- 03-architecture.md — Components and data flow
- 04-data-model.md — Entities, schemas, and provenance
- 05-ingestion-workflows.md — LangChain pipeline designs
- 06-mcp-interface.md — MCP resources and tools contract
- 07-operations.md — Deploy, scale, and operate
- 08-security-and-compliance.md — Data protection and auditing
- 09-evaluation-and-quality.md — QA, metrics, and acceptance
- 10-roadmap.md — Phased delivery plan
- 11-open-questions.md — Assumptions and decisions needed
- glossary.md — Common terms

## Scope assumptions
Storage/Retrieval: Postgres with pgvector for embeddings and built-in FTS for keyword search; optional Neo4j for graph.
Model Choice: Google Gemini. Embeddings use `text-embedding-004`.

Dev server is available under `src/server.ts`. See RUNBOOK.md for how to run Postgres (Docker) and the server.
## Frontend (Admin UI)
