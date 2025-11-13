# Routing and URL Conventions

This document defines the unified URL structure for the SPA (Vite + React Router) and future server routes.

Goals:
- Consistent, predictable namespaces as the app grows.
- Clear separation for public (marketing/landing) vs. authenticated admin apps.
- Human-readable, REST-like paths with optional IDs and query filters.

## Namespaces
- Public site: `/` (landing and marketing only)
- Admin shell: `/admin` (authenticated area root)
- Admin apps: `/admin/apps/:appId/...`
- Standalone admin utilities: `/admin/tools/:toolId/...` (optional category for utilities not considered "apps")
- Admin settings: `/admin/settings/...` (centralized configuration UI)
- Auth: `/auth/...`
- Components showcase and docs: `/components/...` (dev/demo only)

Rationale: All authenticated features live under `/admin`. Feature verticals that feel like products (Chat, Documents, etc.) are grouped under `/admin/apps/*` for long-term scalability.

## Entry Points and Defaults
- Landing page CTA: The landing page (`/`) should include a prominent "Dashboard" link that navigates to `/admin`.
- Admin default route: Visiting `/admin` should open the default admin page, defined as the first link in the Admin sidebar. Practically, `/admin` should resolve to that first sidebar route so the default page changes automatically with the sidebar order.

## Current and Proposed Routes

### Public
- Landing: `/` (default) and `/landing` (alias)

### Auth
- Login: `/auth/login`
- Register: `/auth/register`
- Forgot password: `/auth/forgot-password`
- Reset password: `/auth/reset-password`

### Admin Apps
- Chat
  - List/Hub: `/admin/apps/chat`
  - Conversation: `/admin/apps/chat/c/:id` (optional `:id` for new/empty state: `/admin/apps/chat/c`)
- Documents
  - Library: `/admin/apps/documents`
  - Document detail (future): `/admin/apps/documents/:docId`
  - View document chunks shortcut (redirect): `/admin/apps/documents/:docId/chunks` → `/admin/apps/chunks?docId=:docId`
  - Upload UX: The Documents page includes an upload button and a drag-and-drop drop zone. Uploads hit `POST /ingest/upload` with `multipart/form-data` (`file` field). On success, refresh the list in-place.

- Chunk Browser (NEW)
  - Chunks table: `/admin/apps/chunks`
  - Optional filters via query params: `?docId=<document_id>&q=<search>&page=1&pageSize=50&sort=created_at:desc`
  - Purpose: Inspect indexed chunks; filter by document; preview individual chunk content.

### Admin Utilities (optional pattern for future)
- Layout Builder: `/admin/tools/layout-builder`

### Admin Settings
Centralized area for platform configuration. Current scope is focused and intentionally minimal.

- Settings: `/admin/settings` → redirects to `/admin/settings/ai/prompts`
- AI Prompt Templates: `/admin/settings/ai/prompts` (only active settings page for now)

Notes:
- Settings routes live under the Admin shell and are registered in `apps/admin/src/router/register.tsx`.
- Additional settings (providers, ingestion, etc.) may be added later; for now, the Settings group only exposes AI Prompts.

Related:
- My Profile lives separately at `/admin/profile` and is accessed from the topbar profile menu.

### Developer Components
- Components gallery: `/components` (unchanged; dev/demo only)


## URL Design Guidelines
- Use lowercase, kebab-case for path segments.
- Plural nouns for collections (e.g., `documents`, `conversations`).
- IDs are URL-safe identifiers: prefer UUIDs or slugs.
- Optional segments should be explicit with `?` when defined in the router.
- Use query params for filtering/sorting/pagination: `?q=...&sort=...&page=...`.
- Avoid dynamic class names in routes; keep paths static strings for Tailwind.

## Tables (UI Consistency)

All tables across the Admin app must share a consistent look-and-feel based on the reference in `components/interactions/datatables`.

Requirements
- Structure: wrap in a responsive container `<div class="overflow-x-auto">` and use `<table class="table">`.
- States: provide a clear loading skeleton on first load and a "No results." empty row (`<td colSpan={columnCount}>No results.</td>`).
- Alignment: keep header and cell alignment consistent per column across pages.
- Truncation: prefer `truncate` with constrained max widths for long text cells; allow links to the full resource when applicable.
- Pagination/sorting/search: when advanced interactions are needed, follow the TanStack Table patterns used in `components/interactions/datatables/*` demos; otherwise, simple static tables are acceptable.
- Styling: only use DaisyUI/Tailwind classes; avoid custom CSS unless necessary.

Notes
- For advanced tables (sorting, column visibility, selection), mirror the component patterns in the datatables demos (e.g., `RenderCell`, `useReactTable`).
- For simple resource lists (e.g., Documents, Chunks), using static thead/tbody markup with the shared styles is fine.

## Chunk Browser (Feature Spec)

Goal: Provide a searchable, filterable table of content chunks, similar to the Documents table, with a preview modal to inspect a chunk quickly.

Routes
- Main: `/admin/apps/chunks`
- From a specific document: `/admin/apps/documents/:docId/chunks` should redirect to `/admin/apps/chunks?docId=:docId`.

Table (similar look/feel to Documents)
- Columns: `Chunk ID`, `Document` (title, link), `Section` (section_path), `Ordinal`, `Tokens`, `Quality`, `Created`
- Default sort: `created_at desc` then `ordinal asc`
- Pagination: server-backed; `page`, `pageSize`
- Row actions: `Preview`, `Open Document`

Filters
- Document filter: searchable select of Documents (by title); sets `docId` query param
- Query: full-text query against chunk text; sets `q` query param
- Optional: token range sliders (min/max), language select

Preview Modal
- Opens over the table; shows:
  - Chunk text (monospace, soft-wrapped), with optional highlight of `q` terms
  - Metadata: `chunk_id`, `document_id` + title, `ordinal`, `tokens`, `section_path`, `quality_score`, `language`
  - Actions: `Copy`, `Open document`, `Close`

Navigation
- Documents table should offer a `View chunks` action per document row that links to `/admin/apps/chunks?docId=:docId`.
- Additionally, clicking the numeric "Chunks" count in the Documents table should navigate to `/admin/apps/chunks?docId=:docId` (same behavior as the "View chunks" action).

API (draft)
- GET `/chunks`: list with filters `docId`, `q`, `page`, `pageSize`, `sort`
- GET `/chunks/:id`: fetch one for preview
- Response shape (list): `{ items: ChunkRow[], page: number, pageSize: number, total: number }`
- `ChunkRow` minimal fields: `{ id, document_id, document_title, section_path, ordinal, token_count, quality_score, created_at }`

Notes
- Respect multi-tenancy and authorization; only chunks for accessible documents should return.
- Keep the UI consistent with the Documents table components and styles.

### Optional Enhancements (polish)
- Sorting controls in the UI mapped to `sort` query param (allow `created_at` or `chunk_index` with `:asc|:desc`). Persist in URL and update without full reload.
- Highlight query terms from `q` inside the snippet and preview modal. Use a safe client-side highlighter that preserves spacing and avoids XSS.
- Reset pagination to `page=1` whenever filters (`docId`, `q`, `pageSize`, `sort`) change.
- Page size selector with common options (10, 25, 50, 100) mapped to `pageSize` param; default 25.
- Better empty/loading states: show a skeleton on first load and a friendly empty state when no results are found.
- Deep link preservation: all filters should serialize to the URL so the page is shareable and restorable on refresh.

## React Router Implementation Notes
- Define all admin app routes under the Admin layout.
- Add `<Navigate replace>` routes for legacy paths.
- Keep route definitions centralized in `apps/admin/src/router/register.tsx`.
- Expose a Settings section in the Admin sidebar that links to `/admin/settings` and its subpages.

## Example Route Registry (TS)

This section mirrors the desired structure and can be implemented incrementally:

- Admin Apps
  - `/admin/apps/chat`
  - `/admin/apps/chat/c/:id?`
  - `/admin/apps/documents`
  
- Admin Settings
  - `/admin/settings` (redirects to `/admin/settings/ai/prompts`)
  - `/admin/settings/ai/prompts`

- Other
  - `/` (Landing)
  - `/landing` (Landing alias)
  - `/admin/profile` (My Profile; topbar link)

## Open Questions
- Should "tools" live under `/admin/apps` instead of `/admin/tools`? We can collapse into apps later if desired.
- SEO needs only apply to public routes; admin routes can remain purely client-side.


## AI Prompt Configurability (Scope and Defaults)
All AI prompts currently hard-coded in the app should be editable from Admin Settings → AI → Prompt Templates. The server must read the latest saved templates, with safe fallbacks to the defaults below. Validate required variables and guardrails.

Editable prompt templates and suggestions:

1) Chat RAG System Prompt (server)
   - Key: `chat.systemPrompt`
  - Default (legacy simple server removed; now provided by Nest implementation in `apps/server`):
     "You are a helpful assistant. Answer the user question using only the provided CONTEXT. Cite sources inline using bracketed numbers like [1], [2], matching the provided context order. If the answer can't be derived from the CONTEXT, say you don't know rather than hallucinating."
   - Notes: No variable placeholders. Keep guardrails about using only CONTEXT and not hallucinating.

2) Chat RAG Human Template (server)
   - Key: `chat.userTemplate`
  - Default (legacy simple server removed; now provided by Nest implementation in `apps/server`):
     "Question:\n{question}\n\nCONTEXT (citations in order):\n{context}\n\nProvide a concise, well-structured answer."
   - Required placeholders: `{question}`, `{context}`.
   - Validation: Reject save if required placeholders are missing.

3) New Chat Suggested Prompts (admin UI)
   - Key: `chat.suggestions` (array of cards)
   - Default items (from `apps/admin/src/components/NewChatCtas.tsx`):
     - "Summarize the key points of the latest ingested document."
     - "List the action items from the meeting transcript with owners and due dates."
     - "What are the critical requirements mentioned in the requirements document?"
   - Admin UI should allow: add, edit, remove, reorder; each item has icon, title, desc, prompt.

Storage & scope:
- Scope settings per workspace/tenant (org) with optional environment override.
- Persist in a `settings` table (e.g., `kb.settings`) keyed by `{org_id, key}` with JSON values. Server caches with short TTL.
- Server falls back to defaults if a key is absent or invalid.

Server usage:
- On `/chat/stream`, resolve `chat.systemPrompt` and `chat.userTemplate` from settings; interpolate `{question}`, `{context}`.
- Trim and sanitize to prevent prompt injection via saved templates; log which template version was used.

Admin Settings UX:
- Provide a preview pane and variable helper when editing templates.
- Show validation errors for missing placeholders and risky changes (e.g., removing citation guidance).
- Include a "Restore default" action per template.

Non-goals (for now):
- Fine-grained per-user overrides.
- Versioning UI (keep latest + server logs for now).
