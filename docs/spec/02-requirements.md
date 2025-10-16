# Requirements

## Functional
- Source ingestion
  - File drop (manual upload or watched folder/S3/GCS/Drive/SharePoint/Box).
  - Tickets and dev tools (Jira/Linear/GitHub Issues/PRs/Discussions).
  - Meetings and chat (Zoom/Meet/Teams/Slack). Support audio/video transcription via external service.
  - Web pages and wikis (Confluence/Notion/GitHub Wiki).
- Multi-tenancy & projects
  - Users can create separate Organizations (multi-tenant).
  - The creator of an Organization automatically becomes its Owner (role).
  - Each Organization can contain multiple Projects.
  - Users from across the whole system can be invited to Projects (cross-org invitations allowed by email or user id).
  - Users can switch Organization easily in the UI.
  - Users can switch Project easily in the UI (primary control lives in the Sidebar Project switcher).
  - Every piece of imported data must be assigned to a specific Project and is only available within that Project.
- Processing
  - Text extraction for common file types (pdf, docx, pptx, xlsx, md, html, txt).
  - Language detection and normalization (UTF-8, basic cleaning, PII redaction options).
  - Chunking with configurable strategies (semantic, fixed, headings-aware).
  - Embeddings generation (pluggable models/providers).
  - Metadata and provenance capture (source URL, timestamps, authors, access scopes, hash).
- Indexing and storage
  - Vector index in Postgres via pgvector (ANN).
  - Graph store for entities/relations (Neo4j) and provenance edges.
  - Full Text Search via Postgres built-in FTS.
  - Object store for originals and derived artifacts.
- Retrieval and reasoning
  - Hybrid search (vector + keyword) with optional graph-aware reranking. Default retrieval uses fused vector kNN and FTS candidates (e.g., RRF or weighted blending), supports org/project filters, and returns citations.
  - Citations and snippet highlighting with chunk IDs.
  - Session-based context packing for AI agents (retrieval-augmented prompts).
- MCP server
  - Expose resources (facts, documents, chunks, entities, relations).
  - Provide tools: search, fetch, expand (neighbors), summarize, propose_spec.
  - AuthN/Z passthrough or service auth; per-tenant scoping.

## Non-Functional
- Performance: P95 query under 1s for 100k chunks; ingestion latency < 2 min from drop to searchable (for small docs).
- Scalability: handle >5M chunks with horizontal scaling.
- Reliability: 99.9% available MCP; idempotent ingestion.
- Security: SSO, row-level security per tenant/org/project, encryption at rest and in transit, audit logging.
- Observability: metrics, traces, structured logs, lineage dashboards.
- Extensibility: new sources/processors via LangChain components and code-first pipelines.

## Model and Dev Environment
- LLM Provider: Google Gemini.
- Embeddings Model: `text-embedding-004` (Gemini 1.5 embeddings).
- Dev DB: Postgres with pgvector and FTS, running locally via Docker Compose with bootstrap SQL to enable extensions and create base tables.
Acceptance Criteria (Hybrid Retrieval)
- A search request can run in hybrid mode by default, combining pgvector and FTS results via fusion (RRF or weighted blend).
- Server exposes a debug switch to force `vector` or `lexical` only (e.g., `GET /search?mode=vector|lexical|hybrid`).
- When one modality has no candidates, the other still returns useful results.
- Results include citations with chunk ids and provenance metadata.

 - Dev Auth: Zitadel (https://zitadel.com/) (OIDC/OAuth2) runs locally via Docker Compose alongside Postgres for development. Provide minimal bootstrap (org/project/app) and expose issuer URL and credentials via `.env`.
 - Self-hosted reference (staging/prod): Follow Zitadel self-hosting deployment overview: https://zitadel.com/docs/self-hosting/deploy/overview
 - Dev UI Catalog: Storybook (v8+, Vite builder) for React + TypeScript to document and test UI components used across the project. Must load the same `src/styles/app.css` (Tailwind CSS 4 + daisyUI 5) so visuals match the app. Provide a global decorator that wraps stories with the Nexus `ConfigProvider` to enable theme switching (light/dark) and other global UI config.

Acceptance Criteria (Storybook UI Catalog)
- A dev command starts Storybook locally (e.g., `npm run storybook` from `apps/admin`).
- All shared UI components used in the Admin UI under `apps/admin/src/components/**` have at least one typed CSF story file (`*.stories.tsx`). Core layout primitives (Sidebar, Topbar, Logo, ThemeToggle, form inputs, tables, alerts, toasts, loaders, empty states) are included.
- Stories render with Tailwind/daisyUI styles and look consistent with the running app (styles are imported via the same app entry CSS).
- A theme control (light/dark) is available in the toolbar and toggles daisyUI themes via `ConfigProvider`/`useConfig`.
- Stories include basic states: default, loading/skeleton, empty, error, and an interactive example where relevant. Controls are enabled for key props; no `any` types.
- Lint/typecheck pass for stories as part of the existing build/typecheck tasks (no custom exceptions needed).

### Definition of Done: UI Refactors and Storybook Coverage
- Policy: When a UI component in `apps/admin/src/components/**` is created, renamed, or refactored, the same PR must add or update a typed CSF story (`*.stories.tsx`) for that component. No refactor should land without Storybook coverage.
- Gradual rollout: We will incrementally reach 100% Storybook coverage. If a refactor touches a component that currently lacks a story, the PR must add a minimal story (default state) at minimum. Prefer adding key states (loading/empty/error) where applicable.
- Location and naming: Place stories adjacent to components using the `ComponentName.stories.tsx` convention. Use strict typing for props; avoid `any`.
- Consistency: Stories must render with the same app styles (`src/styles/app.css`) and rely on the global decorators (router, ConfigProvider, AuthProvider) defined in Storybook preview so visuals and behavior match the app.
- Exceptions: Pure re-export/index files or trivial wrapper components may be skipped temporarily only if the underlying building blocks already have coverage. If skipped, add a brief rationale in the PR description and open a follow-up task to track completion.

## Frontend (Admin UI)
- Purpose: Browse and search documents, chunks, spec objects, evidence, and relationships; basic curation actions.
- Stack: TypeScript + React 19, Vite 7, React Router 7, Tailwind CSS 4, DaisyUI 5, Zod for client-side typing/validation.
- Components & charts: DaisyUI components; ApexCharts via react-apexcharts for dashboards.
- Theming: DaisyUI themes with Tailwind config; dark/light toggle persisted in local storage.
- API: JSON over HTTP to the MCP server/backend; fetch with retries and exponential backoff.
- Auth: Zitadel (https://zitadel.com/) (OIDC/OAuth2) is the auth backend. Reuse backend auth (Bearer/Session); store tokens in httpOnly cookies; CSRF protection for state-changing routes. Providers: Google, GitHub, and username/password (all via Zitadel).
 - Auth Frontend integration: Follow Zitadel’s React example for SPA login: https://zitadel.com/docs/examples/login/react
- Node version: >= 20.19 (per template engines field).

### Public Landing (Marketing)
- Purpose: A simple, public-facing landing page that introduces the product and links into the Admin app.
- Routes: `/` (default), alias `/landing`.
- Tech/Styling: React + TypeScript, Tailwind CSS 4 + daisyUI 5; icons via Iconify (Lucide). No custom CSS unless absolutely necessary.
- Content (minimal):
  - Logo and short product value proposition.
  - Feature highlights (3–6 items) using daisyUI components (e.g., cards/hero).
  - Primary CTA button “Open Dashboard” that routes to `/admin` (if unauthenticated, downstream routing flow can move to `/auth/login`).
  - Secondary links (optional): GitHub repo, docs, contact.
- Accessibility/SEO:
  - Meta tags live in `apps/admin/index.html` (title/description/OG). Landing should set sensible headings and alt text.
  - Keyboard accessible and responsive layout.

Acceptance Criteria (Landing)
- Visiting `/` or `/landing` renders the Landing page without authentication.
- The page uses only Tailwind/daisyUI classes; visuals align with the Admin design language.
- The primary CTA button navigates to `/admin`.
- No runtime imports from `reference/**`.

### Org & Project Switching (Admin UI)
Goal: Remove friction and eliminate race conditions when changing Organizations by auto‑selecting a Project.

Policy / Behavior
1. When a user selects (or the app auto-selects) an Organization, the client automatically assigns the first available Project in that Organization as active **without** showing an intermediate "Select a project" gating screen.
2. If the Organization has no Projects, the user is immediately prompted to create one (single input form). After successful creation it becomes active automatically.
3. A user can still manually change the active Project at any time via the Sidebar Project switcher. Manual selection is respected and never auto-overridden until the user changes Organization again.
4. Switching Organization clears the previous active Project and triggers the auto‑selection process for the new Organization (first project, or create flow if none). Stale Projects from the previous Organization must not cause the Organization to revert.
5. Project auto-selection only runs if there is currently no active Project for the selected Organization (i.e., it will not override a user choice within the same Organization session).
6. The client MUST avoid using data from the previous Organization’s project list during the fetch window for the new Organization to prevent accidental cross‑org reversion.

Acceptance Criteria (Org/Project Switching)
- A user with memberships in multiple Organizations can switch Orgs from a topbar (avatar dropdown) control.
- Upon Org switch, if at least one Project exists, the first Project is activated automatically; there is no intermediate selection page.
- If no Projects exist, a create-project form is shown immediately; successful submission activates the new Project.
- Manual Project switching (via Sidebar Project switcher) persists until the next Org change.
- After any switch, lists and searches scope to the active Org/Project and headers `X-Org-ID` / `X-Project-ID` reflect the current context.
- Upload/ingest flows enforce presence of an active Project; absence occurs only transiently during Org change before auto-selection or creation.

#### Avatar Menu — Organizations Switcher
- Placement: inside the Topbar profile avatar dropdown, under a section titled "Organizations".
- Content: list all Organizations the user belongs to (from `GET /orgs`).
  - Each item uses a Lucide icon via Iconify: `<span class="iconify lucide--building-2"></span>` followed by the org name.
  - The active Organization displays a trailing check icon `<span class="iconify lucide--check"></span>` and/or `aria-current="true"`.
- Add organization: include a footer link "Add organization" that opens a modal to create a new organization.
- Loading/empty states: show `skeleton` rows while loading; empty state text with the "Add organization" link when none exist.
- Keyboard/accessibility: avatar trigger has `tabindex="0" role="button"`; list is arrow-key navigable and screen-reader friendly.

Acceptance Criteria (Avatar Organizations Switcher)
- Opening the avatar menu shows an "Organizations" section listing all orgs with the active one check-marked.
- Selecting an organization switches the active Org context immediately, persists it locally, and updates subsequent API calls.
- The "Add organization" link opens a modal; successful creation switches context to the new org and closes the modal.
- Errors during switching or creation are surfaced with a `toast` + `alert-error` or inline `alert` in the modal.

Add Organization (minimal flow)
- Trigger: "Add organization" in the avatar menu opens a daisyUI `modal` titled "Create Organization".
- Form: a single required `input` for Organization name (max length 100) and a `btn btn-primary` submit.
- Submit: `POST /orgs` with `{ name }`.
- Success: server creates the Organization and a Membership with role `Owner` for the creator; the UI switches the active Org to the new one.
- Failure: show `alert alert-error` in the modal; keep the modal open for correction.

#### Sidebar Project Switcher (Layout Builder – "Project")
- Use the Layout Builder Sidebar variant named "Project" as the canonical Project switcher (parity with the demo).
- Placement:
  - In the Sidebar, near the top (below the logo/title block), visible on all admin pages that use the Admin layout.
  - On small screens, it collapses with the Sidebar and remains accessible via the Sidebar toggle.
- Behavior/UI (daisyUI):
  - Render as a compact list/dropdown of Projects with the active item highlighted.
  - Use daisyUI `menu`/`list` styles consistent with the Layout Builder "Project" sidebar demo.
  - Include the current project name and optional icon (Iconify Lucide, e.g., `lucide--folder` or `lucide--folder-open`).
  - Optional search/filter input at the top of the list for long project lists.
  - Optional quick actions (small links/buttons) to “Create project” and “Manage projects”, shown conditionally by permission.
- Interaction:
  - Clicking a project switches the active Project context immediately and updates views.
  - Focus/keyboard navigation works within the list; active state is clearly indicated.
  - If the Sidebar Project switcher is present, it is the primary place to change projects (the Topbar may still host the Org switcher).
- Accessibility:
  - List is keyboard navigable; screen readers announce the active project and the list role.
  - Provide `aria-current="true"` or equivalent for the active project item.

Acceptance Criteria (Sidebar Project Switcher)
- The Sidebar renders a Project switcher matching the Layout Builder "Project" variant style and behavior.
- Selecting a Project updates the app context and all subsequent API requests include `X-Org-ID`/`X-Project-ID` for the selection.
- The active Project is visually highlighted; the selection persists across reloads.
- On mobile/collapsed Sidebar, the switcher remains reachable and functional.
- Auto‑selection on Org change does not fire if the user has already chosen a Project within that Org during the current session.

UI Notes (Nexus + daisyUI)
- Avatar menu (Organizations): place an "Organizations" section inside the avatar dropdown using `dropdown` + `menu` classes; active item shows a check icon.
- Sidebar (Projects): use the Layout Builder "Project" variant with `menu` styling; optionally include a small search `input` at the top.
- Use `dropdown-end` to right-align the avatar menu; highlight active items consistently.
- Show `skeleton` placeholders during loading; provide accessible labels and `aria-current` on active items.
- Use `toast` + `alert-error` for switch/creation errors and `alert-success` for confirmations.

Data Contract (used by Admin UI for switching)
- Fetch orgs: `GET /orgs`
  - Response: `{ orgs: Array<{ id: string, name: string, slug?: string }> }`
- Fetch projects: `GET /orgs/:orgId/projects`
  - Response: `{ projects: Array<{ id: string, name: string, slug?: string, organization_id: string }> }`
- Create org: `POST /orgs` body `{ name: string }`
  - Response: `{ id: string, name: string }` (creator receives a Membership with role `Owner`)
- Create project: `POST /projects` body `{ organization_id: string, name: string }`
  - Response: `{ id: string, organization_id: string, name: string }`
- Invite to org: `POST /orgs/:orgId/invite` body `{ email: string, role?: "Admin"|"Member"|"Viewer" }`
- Invite to project: `POST /projects/:projectId/invite` body `{ email: string, role?: "Admin"|"Contributor"|"Viewer" }`
- Headers to set on subsequent data calls: `X-Org-ID: <orgId>`, `X-Project-ID: <projectId>`.
- Error codes: `400` when context missing/invalid; `403` when user lacks membership; `404` when resource not found.

### Auth UI (Nexus Template)
- Use the Nexus Admin Dashboard Template’s Auth layout and components for all authentication pages.
- Styling uses Tailwind CSS 4 + daisyUI 5 utility classes; icons via Iconify with Lucide (e.g., `iconify lucide--log-in`).
- Routes live under `/auth/*` (e.g., `/auth/login`, `/auth/callback`, `/auth/logout`) and integrate with the router’s Auth layout.

Acceptance Criteria (Auth UI – Nexus Template)
- `/auth/login` renders inside the Nexus Auth layout shell and uses template components (Logo, headings, inputs, buttons, alerts).
- Inputs and buttons are daisyUI components; no custom CSS files are introduced for auth pages.
- Icons on the login screen (if present) are Iconify Lucide classes (e.g., `iconify lucide--github`, `iconify lucide--google`).
- Unauthenticated navigation to protected routes redirects to `/auth/login`; after successful callback, user returns to the original route.

### Admin: Documents
- Purpose: List all ingested/uploaded documents with basic metadata and allow manual upload.
- Route: `/admin/apps/documents` (admin layout).
- UI:
  - Page title with breadcrumb to Nexus home.
  - Upload area at the top of the page (above the table) with:
    - Primary action button: "Upload document" (opens file chooser).
    - Visible drop zone with a dashed border and instruction text: "Click to upload or drag & drop a file".
    - Drag-over highlight state (border/color change) when a file is dragged over the page/zone.
  - DaisyUI `card` containing an `overflow-x-auto` table.
  - Columns: Filename, Source URL, Mime Type, Chunks (badge), Created At.
  - Empty state row when no data.
  - Loading state uses DaisyUI `skeleton` via a small `LoadingEffect` component.
  - Errors shown using `alert alert-error`.
- Interactions:
  - Upload document (single-file v1):
    - Click the "Upload document" button to open a native file chooser and select a file.
    - Or drag a file anywhere on the page (or onto the drop zone) to initiate upload.
    - Accepted types (aligned with extraction): pdf, docx, pptx, xlsx, md, html, txt. Show a helpful message if an unsupported type is dropped.
    - Max file size: 10 MB (matches backend limit).
    - While uploading: show an inline progress/loader and disable the upload button.
    - On success: show a success toast and refresh the documents list.
    - On error: show `alert alert-error` with the server-provided message.
  - Future: sort, filter, view details.
- Styling: Tailwind CSS 4 + daisyUI 5; no custom CSS.
- Accessibility:
  - Table headers labeled; links open in new tab with `rel="noreferrer"`.
  - Drop zone must be keyboard-focusable, announce purpose (aria-label/aria-describedby), and support pressing Enter/Space to open the file chooser.

Acceptance Criteria (Documents Upload)
- The page presents a clearly visible "Upload document" button and a dashed drop zone with instructional text.
- Dragging a file over the page visibly highlights the drop zone; dropping the file triggers an upload attempt.
- Clicking the button opens a file chooser. Selecting a file triggers upload.
- Files over 10 MB or unsupported types are blocked with a clear error.
- On success, the new document appears at the top of the list without a full page reload.
- The upload component is operable with keyboard and announced to assistive tech.

API Contract (used by Admin UI)
- Endpoint: `POST /ingest/upload`
- Content type: `multipart/form-data`
- Form field: `file` (single file)
- Success: `{ status: "ok", ... }` and the server ingests/chunks the document asynchronously.
- Failure: `{ error: string }` with appropriate HTTP status.

Optional Enhancements (polish)
- Multi-file uploads: allow selecting/dropping multiple files with a queued UI; cap parallel uploads (e.g., 2–3 at a time).
- Per-file progress: show a `progress` bar per item; allow cancel/retry individually.
- Toast notifications: use `toast` + `alert-success|alert-error` for non-blocking feedback instead of inline alerts.
- Better drag-and-drop UX: show a full-page overlay highlight when dragging a file anywhere in the window; confine drop handling to page root.
- File list preview: render selected/dropped files (icon, name, size, type); validate before sending; disable duplicates by checksum/file name + size heuristic.
- URL ingestion shortcut: add a small input + "Ingest URL" button that calls `POST /ingest/url` next to the upload button.
- Accessibility: add `aria-live="polite"` region for upload status updates; ensure color changes are not the only indicators.
- Error detail: parse server error JSON safely; show concise messages and an expandable "Show details" for advanced logs.
- Configurable limits: surface max file size/allowed types from server settings endpoint to avoid hard-coded client limits.
- Empty/loading polish: replace success inline message with a temporary success toast and auto-dismiss.

### API: Documents
- Endpoint: `GET /documents`
- Response shape:
  - `{ documents: Array<{ id: string, source_url: string|null, filename: string|null, mime_type: string|null, created_at: string, updated_at: string, chunks: number }>} }
- Behavior:
  - Returns all documents ordered by `created_at DESC`.
  - `chunks` is the count of rows in `kb.chunks` per document.
  - Safe on existing DBs (columns added if missing).

## Out of Scope (v1)
- Automated contract extraction for all domains (beyond simple NER/relations).
- End-user UI beyond basic admin and health dashboards.

---

## Backend Invites & RLS Enforcement

### Invites and Roles
- Users can invite members to an Organization via email and assign a role: `owner`, `admin`, `member`, or `viewer`.
- Invitation lifecycle: create invite → email with token link → accept → account association → role granted.
- Resend and revoke invites supported; expired/invalid tokens rejected with a helpful message.
- Role matrix:
  - owner: full control over org and projects (manage roles, billing, deletion).
  - admin: manage projects and members (except owners), settings.
  - member: CRUD on project resources within granted projects.
  - viewer: read-only access to allowed resources.
- Auditing: record invite creation, acceptance, revocation with actor and timestamps.

### Row-Level Security (RLS)
- All data access is restricted by Organization and Project using database RLS policies.
- Required headers on every API request: `Authorization`, and where applicable `X-Org-ID`, `X-Project-ID`.
- Backend validates the active user’s membership and role for the given org/project before executing queries.
- Database RLS ensures cross-tenant isolation even if an application bug occurs; access checks at both API and DB layers.
- Logs capture policy denials for observability.
