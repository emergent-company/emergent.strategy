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
- Landing: `/` (unchanged)

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
  - `/admin/profile` (My Profile; topbar link)

## Open Questions
- Should "tools" live under `/admin/apps` instead of `/admin/tools`? We can collapse into apps later if desired.
- SEO needs only apply to public routes; admin routes can remain purely client-side.


## AI Prompt Configurability (Scope and Defaults)
All AI prompts currently hard-coded in the app should be editable from Admin Settings → AI → Prompt Templates. The server must read the latest saved templates, with safe fallbacks to the defaults below. Validate required variables and guardrails.

Editable prompt templates and suggestions:

1) Chat RAG System Prompt (server)
   - Key: `chat.systemPrompt`
   - Default (from `apps/server/src/server.ts`):
     "You are a helpful assistant. Answer the user question using only the provided CONTEXT. Cite sources inline using bracketed numbers like [1], [2], matching the provided context order. If the answer can't be derived from the CONTEXT, say you don't know rather than hallucinating."
   - Notes: No variable placeholders. Keep guardrails about using only CONTEXT and not hallucinating.

2) Chat RAG Human Template (server)
   - Key: `chat.userTemplate`
   - Default (from `apps/server/src/server.ts`):
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
