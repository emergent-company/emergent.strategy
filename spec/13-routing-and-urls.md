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

## Example Route Registry (TS)

This section mirrors the desired structure and can be implemented incrementally:

- Admin Apps
  - `/admin/apps/chat`
  - `/admin/apps/chat/c/:id?`
  - `/admin/apps/documents`

## Open Questions
- Should "tools" live under `/admin/apps` instead of `/admin/tools`? We can collapse into apps later if desired.
- SEO needs only apply to public routes; admin routes can remain purely client-side.
