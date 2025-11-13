# Project Facts Hub — Specification Draft

This repository describes a system that ingests all “facts” about a potential software project (requirements, meeting transcripts, documents, tickets, etc.), indexes them for hybrid retrieval (vector + keyword, with optional graph reranking), and exposes the corpus through an MCP server so AI agents can generate specifications and guide coding agents.

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
- 13-routing-and-urls.md — URL namespaces, conventions, and redirects
- 14-reference-projects.md — Guidelines for keeping external templates as read-only references
- 15-passkey-auth.md — Passkey-based authentication flows
- 16-user-profile.md — User profile data model & operations
- 17-server-e2e-testing.md — Backend E2E testing strategy
- 18-authorization-model.md — Authorization & RBAC model
- 19-dynamic-object-graph.md — Dynamic graph & schema/branch architecture
- 20-graph-overview.md — Plain-language project graph feature overview
- 21-branch-merge-mvp.md — Branch merge minimal viable design (see also server README section "Branch Merge Dry-Run (MVP)")
- **24-dynamic-type-discovery-and-ingestion.md** — **Template packs, AI-powered ingestion, automatic type discovery, and reprocessing**
- **28-automatic-extraction-and-notifications.md** — **Automatic object extraction on document upload & completion notifications with summaries**
- glossary.md — Common terms

### New Feature: Dynamic Type Discovery System
The system now supports template-based object type management with AI-powered automation:

- **Template Packs**: Pre-defined type collections (TOGAF, Scrum, custom) with JSON schemas, extraction prompts, and UI configs
- **Smart Ingestion**: AI extracts typed objects from documents, understands relationships, links entities
- **Type Discovery**: Analyzes patterns in unstructured data to suggest new object types
- **Reprocessing**: Re-run extraction on existing documents after defining new types
- **🆕 Automatic Extraction**: Documents uploaded automatically trigger object extraction jobs based on project settings (see `28-automatic-extraction-and-notifications.md`)
- **🆕 Extraction Notifications**: Real-time in-app notifications with detailed summaries when extraction jobs complete, including object counts, type breakdown, quality metrics, and quick actions (see `28-automatic-extraction-and-notifications.md`)

**Key Documents:**
- `24-dynamic-type-discovery-and-ingestion.md` — Complete technical specification
- `28-automatic-extraction-and-notifications.md` — **NEW: Automatic extraction & notification system**
- `reference/togaf-core-template-pack.json` — Example TOGAF template pack
- `guides/togaf-template-quickstart.md` — User workflow guide
- `guides/dynamic-type-system-architecture-flow.md` — Architecture diagrams
- `guides/DYNAMIC-TYPE-SYSTEM-SUMMARY.md` — Executive summary & implementation roadmap

**Implementation Status:**
- ✅ **Phase 1 (Partial)**: Database schema, Template Pack module, unit tests complete
  - See `apps/server/PHASE1_IMPLEMENTATION.md` for details
  - Migration: `apps/server/src/migrations/0001_dynamic_type_system_phase1.sql`
  - Module: `apps/server/src/modules/template-packs/`
- 🚧 **Phase 1 (Remaining)**: Type registry service, schema validation, E2E tests
- ⏳ **Phase 2**: Smart Ingestion with AI extraction
- ⏳ **Phase 3**: Type Discovery engine
- ⏳ **Phase 4**: Reprocessing framework

## Scope assumptions
Storage/Retrieval: Postgres with pgvector for embeddings and built-in FTS for keyword search; hybrid fusion (vector + FTS) is the default; optional Neo4j for graph reranking.
Model Choice: Google Gemini. Embeddings use `text-embedding-004`.

Backend server is consolidated under `apps/server` (NestJS). See RUNBOOK.md for running Postgres (Docker) and the Nest server.

## Frontend (Admin UI)

The Admin SPA (React + Vite) lives under `apps/admin/`.

Key entry points:
```
apps/admin/
  index.html          # Root HTML (Vite mount point)
  src/main.tsx        # App bootstrap (providers + router)
  src/router/         # Route registry + layout wiring
  src/pages/          # Page components grouped by area (admin, auth, settings, etc.)
  src/components/     # Reusable UI building blocks & layouts
  src/contexts/       # Global config (theme, direction, font, etc.)
  src/styles/         # Tailwind + daisyUI CSS entrypoints
```

Conventions:
- All authenticated routes are namespaced under `/admin` (see `13-routing-and-urls.md`).
- Route definitions are centralized in `apps/admin/src/router/register.tsx`.
- Theme & layout configuration is accessed via the `useConfig` hook.

Upcoming additions:
- Chunk browser UI (`/admin/apps/chunks`) with server-backed pagination & filters.
- Settings → AI Prompt Templates (editable prompt registry; server fallback defaults).

---

Extend this section (do not duplicate) for future frontend architectural notes.
