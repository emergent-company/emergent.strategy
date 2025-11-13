# Admin AI Chat (RAG) — Feature Specification

Last updated: 2025-09-08
Owner: Admin App (React + Vite + TypeScript + Tailwind CSS + daisyUI)
Status: Draft

## Summary
Add a typical AI chat experience to the Admin app that uses Retrieval-Augmented Generation (RAG) over our existing knowledge base (kb.documents/kb.chunks) with pgvector embeddings (text-embedding-004). The chat UI is implemented with daisyUI components and streams assistant responses while showing citations to retrieved chunks.

## Nexus UI Integration (Design System Reuse)
This feature MUST exclusively reuse and compose existing Nexus React template UI primitives, patterns, and utility conventions rather than introducing bespoke one-off styling or structural divergences.

Principles:
- No new global CSS beyond what is already in the Nexus `src/styles/` tree; styling is achieved with Tailwind + daisyUI utility classes already sanctioned in the template.
- Prefer existing shared layout wrappers, typography utilities, spacing rhythm, and interactive patterns (cards grid, sidebar layout, settings modal, icon usage with Iconify `lucide--*`).
- Any new UI element that is a visual variant of an existing Nexus component (e.g., card, list item, toolbar section, modal, badge) MUST be implemented as a composition of existing components / utility classes — not a fork.
- If a gap is discovered (component does not exist), document it in an "Extension Needed" subsection (initial implementation may still use utilities) and propose upstream generalization before solidifying a chat‑specific variant.

Mapping of AI Chat UI Areas → Nexus / Existing Patterns:
- Chat Home feature cards → Reuse existing marketing/feature card pattern from landing or `AiHomePage` (card + icon badge layout, same padding + shadow scale).
- Sidebar shell → Existing admin sidebar/drawer pattern (persistent on desktop, drawer behavior on small screens) with `menu` or `list` identical spacing + typography as other navigation lists.
- Conversation list items → Follow existing menu/list two-line item pattern (timestamp style = subdued `text-xs text-base-content/60`; snippet = `text-sm`).
- New Chat button (icon) → Reuse small ghost icon button style used in other toolbars (e.g., Topbar action icons) with `btn btn-ghost btn-xs` + icon span.
- Composer container → Structure and spacing identical to existing bottom action/composer blocks (card-border variant if used elsewhere) ensuring consistent vertical padding and border radius.
- Text input / textarea → Existing form control sizing tokens (e.g., `textarea-md`)—no custom heights.
- Message bubbles → Align with existing chat/message or badge/bubble shapes (rounded radius consistent with design tokens) using daisyUI `chat-bubble-*` classes only.
- Streaming indicator → Reuse loading indicator style (`loading loading-dots loading-sm`) already present in other async UI states.
- Citations accordion → Reuse `collapse` component styling without custom overrides; badges & links reuse standard `badge-*` and `link-*` tokens.
- Settings / Advanced controls → Existing `modal` pattern (header, body, action row) consistent with other modals in Nexus.
- Toasts / Errors → Reuse global toast + alert pattern (placement + semantic color usage).
- Privacy checkbox → Standard checkbox (no custom control) with inline label typography consistent with other forms.
- Keyboard shortcut hint styles (if shown) → Reuse existing subtle text helper style (`text-xs text-base-content/60`).
- Icons → Use Iconify with `iconify lucide--{name}` classes (no SVG inlining unless already patternized elsewhere).

Extension Needed (Documented, Not Immediate Divergence):
- If future enhancements require: inline message-level actions toolbar (copy/regenerate) as a shared component, consider abstracting to `MessageActions` reusable component rather than embedding ad-hoc buttons across pages.

Acceptance Alignment Additions:
- A PR introducing custom CSS for chat MUST justify why composition of existing utilities/components is insufficient and reference this section.
- Visual regression: Chat feature pages should visually blend with existing Nexus Admin pages when Tailwind devtools are hidden (no novel spacing scales, radii, shadows, or font usage).

Non-Goals (Design System):
- Introducing a separate chat design language.
- Adding global theme tokens solely for chat before broader design review.

Review Checklist (Design System Focus):
- [ ] Uses only approved daisyUI/Tailwind classes already present across the app.
- [ ] No new standalone CSS selectors added for chat.
- [ ] Sidebar + cards spacing matches existing baseline (compare with `AiHomePage`).
- [ ] Icon sizes align with existing 16/18/20px patterns.
- [ ] Color usage sticks to semantic tokens (`primary`, `base-*`, `info`, etc.).

## Goals
- Provide an in-app “AI Chat” page within the Admin section.
- Use hybrid retrieval by default: combine semantic (pgvector) and lexical (Postgres FTS/tsvector) results via fusion (e.g., RRF or weighted blend). If one side has zero candidates, gracefully fall back to the other.
- Stream assistant responses to the UI with live tokens and show source citations.
- Support conversation history (client-side initially; optional server persistence).
- Use daisyUI 5 + Tailwind utilities only (no custom CSS unless necessary).
 - Persist conversations in the database with ownership and visibility:
   - Record the owner (the user who started the chat) for every conversation.
   - Support visibility modes: shared (default, visible to all users) and private (visible only to owner).

## Non-goals
- Fine-tuning LLMs.
- Complex document management UI (we already have ingestion endpoints and a documents list).
- Multi-tenant isolation beyond current app auth model.

## User stories
1. As an admin, I can type a question and get an answer grounded in my ingested documents with citations.
2. As an admin, I can see streaming output so I know the system is working.
3. As an admin, I can expand citations to view the exact chunk and open the source document.
4. As an admin, I can stop a long response or regenerate it.
5. As an admin, I can filter retrieval to specific documents.
6. As an admin, I can view my recent chats in the current session and continue them.
7. As an admin, I can see a left sidebar listing my chat history, click to continue a chat, or remove a chat from history.
8. As an admin, when I start a new chat, it is auto-named using the date and my first message.
9. As an admin, pressing Arrow Up with an empty composer recalls my last sent message to edit and re-send.
10. As an admin, my chats are saved to the database; shared chats are visible to all users and private chats are only visible to me, while the system records who started each chat.
11. As an admin, before sending the first message in a conversation, I can mark it as Private so it’s visible only to me and recorded as owned by me.
12. As an admin, the sidebar groups conversations into Shared and Private sections so I can quickly find them.

## IA and Routing
- Chat Home (landing): `apps/admin/src/pages/admin/chat/home/index.tsx` — patterned after `AiHomePage` at `apps/admin/src/pages/admin/apps/gen-ai/home/index.tsx` (cards grid + composer prompt).
- Chat Conversation: `apps/admin/src/pages/admin/chat/conversation/index.tsx` — full chat UI with messages, citations, and streaming.
- Menu: “Chat” with items “Home” and “Conversations”.
- Routes:
  - `/admin/chat` → Chat Home
  - `/admin/chat/c/:id?` → Conversation (if `:id` omitted, starts a new one)
- Register in `apps/admin/src/router/register.tsx` under the Admin layout group.
\
Sidebar layout:
- The chat history sidebar is persistent and visible on both Chat Home and Conversation pages.
- Keep the sidebar visible on all screen sizes; you can use `drawer` with `drawer-open` on all breakpoints. A close button may exist on small screens, but the default state on navigation is open.
- Selecting an item navigates to `/admin/chat/c/:id` and loads that conversation.
 - Group conversations into two sections: Shared and Private. Use section headers (e.g., `menu-title`) or visually distinct titles to separate the lists. Shared shows all non-private conversations; Private shows only the current user’s private conversations.

## UI/UX — Components and Layout
Use only daisyUI components and Tailwind utilities per our styling rules. Below lists the exact daisyUI components used and their roles.

- Layout container:
  - `card` (optional wrapper) with `card-body` for the chat area.
  \
  - Chat history sidebar:
    - Use `drawer` for the sidebar shell; keep it open by default (`drawer-open`).
    - Render conversations with `menu` or `list`. Each item shows title and timestamp; active item uses `menu-active`.
  - Conversation items must occupy the full width of the sidebar; the entire row should be the click target (no dead margins). Use a block-level container with `w-full` so each item takes the whole sidebar width.
    - Per-item delete via `btn btn-xs btn-ghost` with a trash icon.
    - Header row includes a right-aligned New Chat icon button to start a fresh conversation.
      - Button: `btn btn-ghost btn-xs` + `<span class="iconify lucide--plus"></span>`; action navigates to `/admin/chat/c/new` and creates a new conversation.
    - Item content: two-line summary per chat.
      - Line 1: date (e.g., `YYYY-MM-DD HH:mm`) in `text-xs text-base-content/60`, truncated to the sidebar width.
      - Line 2: first user query snippet in `text-sm`, truncated to the sidebar width.
      - Use Tailwind utilities like `truncate text-ellipsis overflow-hidden` to ensure ellipsis; each line is its own block so both lines can truncate independently.
    - Privacy indicator (optional in list): you may add a small `badge` (e.g., `badge-ghost text-xs`) to private items or list them under a Private section header.
- Message list:
  - `chat` per message row with placement:
    - User message: `chat chat-end`
    - Assistant message: `chat chat-start`
  - Message bubble:
    - `chat-bubble` with color variants for role emphasis:
      - Assistant: `chat-bubble-primary`
      - User: default or `chat-bubble-neutral`
  - Avatar (optional):
    - `avatar` with `mask mask-squircle` for rounded images.
- Typing/streaming indicator:
  - `loading loading-dots loading-sm` shown inside a small bubble or below the composer.
- Citations inside assistant message:
  - Use `collapse collapse-arrow` with `collapse-title` (e.g., “Sources (3)”) and `collapse-content` for per-source list.
  - Each source row can include:
    - `badge badge-info` for the source label (e.g., document filename)
    - `link link-primary` to open the source (if URL exists)
    - Use `divider` between citations if content is long
- Message actions:
  - `btn btn-xs btn-ghost` actions (Copy, Regenerate, Stop)
  - Icons via Iconify: `<span class="iconify lucide--copy"></span>`, `lucide--rotate-ccw`, `lucide--square`.
- Composer:
  - For one-line queries: `input input-md` with placeholder
  - For multi-line: `textarea textarea-md`
  - The "Ask a question" composer input/textarea must take the full available width (`w-full`) on both Chat Home and Conversation pages.
  - Send button: `btn btn-primary` with `<span class="iconify lucide--send"></span>`
  - Stop button (visible while streaming): `btn btn-error btn-ghost`
  - Privacy control (new): For a brand-new conversation (no messages yet), show a `checkbox` with label “Private” near the composer. If checked before the first send, the conversation is created as private (visible only to the current user) and marked with the current user as owner. Default is unchecked (shared to all users).
  - Optional advanced controls:
    - K selector: `select select-sm`
    - Document filters: `dropdown` + `menu` to pick documents
  - Keyboard behavior: When the composer is empty, Arrow Up recalls the last user message into the composer for editing. Do not intercept when the composer has content or when modifier keys are pressed.
  - After an Arrow Up recall, Arrow Down clears the composer back to empty. This Down-to-clear applies only immediately after a recall; any typing cancels it.
  - When the composer has content (typed or recalled), Arrow Up moves the caret to the beginning, and Arrow Down moves it to the end without altering content.
  - After content is removed (cleared), pressing Arrow Up again should recall the last used prompt.
- System toasts for errors:
  - `toast toast-end toast-bottom` with `alert alert-error` inside
- Empty state / loading:
  - `skeleton` blocks to hint message layout while data is loading
- Settings dialog:
  - `modal` with `modal-box` to host RAG settings (topK, filter mode, show citations toggle)
- Status dot (model health):
  - `status status-success/status-warning/status-error`

Reference: All class names above are from daisyUI 5 (see docs in repo instructions).

### Chat Home (modeled after AiHomePage)
- Sidebar is visible at all times on Chat Home.
- Hero greeting text with gradient text using Tailwind utilities.
- Three or more feature cards using `card card-border` with icon badges (`bg-*-content text-*-content rounded-box w-fit p-2` + Iconify).
- A bottom composer card (`card card-border`) with a `textarea` and a small actions row:
  - Attachment/mic buttons: `btn btn-sm btn-circle btn-ghost` with lucide icons.
  - Usage status block with a `tooltip` container.
  - Quick action buttons: `btn btn-sm btn-outline rounded-full` for Search/Brainstorm; primary `btn btn-primary btn-circle btn-sm` to submit.
- On submit, navigate to Conversation route and carry the initial prompt.

### Empty State — Conversation (New Chat)
- When the active conversation has no messages (new chat), the Conversation page shows the same CTA cards grid and bottom composer panel as the Chat Home page (patterned after `AiHomePage`).
- The persistent sidebar remains visible.
- Sending the first message both renders in the Conversation view and auto-names the conversation per the naming rules.
- New chat CTAs must be exactly the same as on the Chat Home page (identical components, classes, spacing, icons, and copy). Prefer reusing the same shared React component to guarantee 1:1 parity.

## Visual Structure (high level)
- Header (optional): Page title “AI Chat” with actions (Settings, Clear conversation)
- Left sidebar with chat history (collapsible drawer on small screens)
- Scrollable chat area
- Composer docked at bottom (sticky) with input + Send

## Frontend Data Model (TypeScript)
Strictly typed. Avoid `any`.

```ts
export type Role = 'user' | 'assistant' | 'system';

export interface Citation {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  text: string;
  sourceUrl?: string | null;
  filename?: string | null;
  similarity?: number; // cosine distance (<=>) lower is closer
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string; // ISO
  citations?: Citation[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  ownerUserId?: string; // who started the chat (owner)
  isPrivate?: boolean; // true => only owner can see; false/default => visible to all users
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  history?: Array<Pick<Message, 'role' | 'content'>>;
  topK?: number; // default 5
  documentIds?: string[]; // optional filters
  stream?: boolean; // default true
  isPrivate?: boolean; // when creating a new conversation from the first send
}

export interface ChatChunk {
  type: 'token' | 'done' | 'error' | 'meta';
  token?: string; // emitted when type === 'token'
  messageId?: string; // new/updated assistant message id
  citations?: Citation[]; // provided at end or early
  error?: string; // error description
}
```

## Data Flow
0. User selects an existing conversation from the sidebar or starts a new one.
1. User enters a prompt and hits Send.
2. Frontend immediately appends a user message, then shows a streaming assistant bubble with `loading-dots`.
3. Frontend POSTs to `/chat/stream` with `ChatRequest`.
4. Server embeds the query, runs hybrid retrieval on `kb.chunks` (vector kNN + FTS), fuses the candidate lists (RRF/weighted), fetches topK merged chunks, and calls the LLM with retrieved context.
5. Server streams tokens to the client (SSE). Citations are included once available (can be sent upfront after retrieval or at end).
6. Frontend renders tokens incrementally; user may click Stop to abort.
7. Upon finalization, the assistant message is marked complete and citations are attached.
8. Deleting a conversation from the sidebar removes it from client-side history and, if active, clears the chat view.

Conversation naming rules:
- When creating a new chat from scratch, set `title` to `YYYY-MM-DD — {first message snippet}` where the snippet is trimmed to ~8 words or ~48 characters.
- If the first message is empty, fallback to `YYYY-MM-DD — New Conversation`.

## Chat API Contract

This section defines the authoritative API contract for the Chat feature. It formalizes objects, endpoints, headers, event sequencing, and error semantics. Any implementation MUST adhere to these contracts; deviations require updating this spec first.

### Common HTTP Details
- Base URL: (Admin Server) `https://{host}` — relative paths shown below.
- Auth: Bearer token in `Authorization: Bearer <JWT>` header (Zitadel). 401 if missing/invalid.
- Org / Project Scoping (optional, nullable):
  - `X-Org-ID: <uuid>`
  - `X-Project-ID: <uuid>`
- Content-Type for JSON requests: `application/json`.
- All JSON responses (non-SSE) on success return 2xx. Errors return a JSON error envelope.
- Time fields are ISO 8601 strings (UTC) — e.g. `2025-09-09T12:34:56.123Z`.

### Error Envelope
```
{
  "error": {
    "code": "string",          // machine code, kebab-case
    "message": "Human message", // safe for display
    "details": { ... }           // optional object with extra info
  }
}
```

| HTTP | code (error.code)            | Meaning |
|------|------------------------------|---------|
| 400  | `bad-request`               | Validation / malformed input |
| 401  | `unauthorized`              | Missing/invalid auth |
| 403  | `forbidden`                 | Access denied (private conversation not owned) |
| 404  | `not-found`                 | Resource missing |
| 409  | `conflict`                  | State conflict (rare) |
| 422  | `validation-failed`         | Detailed field issues |
| 429  | `rate-limited`              | Rate limit exceeded (future) |
| 500  | `internal`                  | Unhandled server error |
| 503  | `upstream-unavailable`      | LLM or embedding provider unavailable |

### Core Data Shapes (JSON)
```
Role := "user" | "assistant" | "system"

Citation {
  documentId: string;         // UUID
  chunkId: string;            // UUID
  chunkIndex: number;
  text: string;               // chunk text (may be truncated in future)
  sourceUrl?: string | null;
  filename?: string | null;
  similarity?: number;        // cosine distance (<=>) lower = closer
}

Message {
  id: string;                 // UUID
  role: Role;
  content: string;
  createdAt: string;          // ISO timestamp
  citations?: Citation[];     // Only assistant messages may include
}

Conversation {
  id: string;                 // UUID
  title: string;
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
  messages: Message[];        // Chronological ASC
  ownerUserId?: string;       // UUID of creator
  isPrivate?: boolean;        // default false
}

ChatRequest {
  message: string;            // required, non-empty
  conversationId?: string;    // existing UUID; omitted or invalid => create new
  history?: Array<{ role: Role; content: string }>;
  topK?: number;              // default 5 (1..20 enforced)
  documentIds?: string[];     // optional filter (UUIDs)
  stream?: boolean;           // default true (non-stream path optional)
  isPrivate?: boolean;        // only honored when creating new conversation
}

// SSE Event Wrapper
ChatChunk {
  type: "meta" | "token" | "done" | "error";
  // meta
  conversationId?: string;    // on meta for new conv
  citations?: Citation[];     // on meta (always for new conv; optional for continuation)
  // token
  token?: string;             // incremental token fragment
  // error
  error?: string;             // error message (stream terminates after)
}
```

### Event Sequencing Guarantees (SSE)
1. For a brand-new conversation the first event MUST be `meta` with `conversationId` + `citations`.
2. Zero or more `token` events follow (each contains partial text to append).
3. Zero or one additional `meta` events MAY appear later **only** for supplemental citations (continuations) — (current implementation: citations delivered in initial `meta`).
4. Stream ends with exactly one terminal event: `done` OR `error`.
5. No tokens are emitted after `done`/`error`.

### Headers of Interest
| Header | Direction | Purpose |
|--------|-----------|---------|
| Authorization | Request | Bearer token |
| X-Org-ID | Request | Optional org scoping UUID |
| X-Project-ID | Request | Optional project scoping UUID |
| Content-Type | Request/Response | `application/json` (except SSE) |
| Cache-Control | Response (SSE) | `no-cache` |

### Endpoint: POST /chat/stream  (SSE)
Streams an assistant response (Retrieval + LLM) while creating or continuing a conversation.

Request:
```
POST /chat/stream
Content-Type: application/json
Authorization: Bearer <token>

{
  "message": "What decisions were made yesterday?",
  "conversationId": "a9b1..." | undefined,
  "topK": 5,
  "documentIds": ["..."],
  "isPrivate": true,
  "history": [ { "role": "user", "content": "..." }, ... ]
}
```

Responses:
- 200 + `text/event-stream` (success) — stream of `data: {ChatChunk}` lines separated by blank line.
- 4xx/5xx JSON error envelope if validation/auth fails before stream begins.

Example SSE (new conversation):
```
data: {"type":"meta","conversationId":"3b9d...","citations":[{...}]}

data: {"type":"token","token":"The "}

data: {"type":"token","token":"decision was..."}

data: {"type":"done"}

```

Error in-stream example:
```
data: {"type":"meta","conversationId":"3b9d...","citations":[]}

data: {"type":"error","error":"embedding provider unavailable"}

```

Client Handling Rules:
- On first `meta`, if local id is temp (`^c_`), normalize to server `conversationId`.
- Concatenate `token` fragments (ordered arrival) to assemble assistant message.
- On `error`, finalize assistant message with error content and stop.
- On network abort (client `AbortController`), no additional events expected.

### Endpoint: POST /chat  (Non-stream / Optional)
Synchronous one-shot response (fallback). MAY be omitted in initial milestone; spec includes for completeness.

Request Body: `ChatRequest` with `stream: false` OR absent.

Success (200):
```
{
  "message": Message,           // assistant message
  "conversation": Conversation  // (optional) updated conversation snapshot
}
```

### Endpoint: GET /chat/conversations
Returns grouped conversation metadata (no messages) for sidebar population.

Success (200):
```
{
  "shared": [ { "id": "...", "title": "...", "created_at": "...", "updated_at": "...", "owner_user_id": "...", "is_private": false } ],
  "private": [ { ... is_private: true } ]
}
```

Notes:
- Sorted by `updated_at DESC` per group.
- Shared excludes private conversations of other users.

### Endpoint: GET /chat/:id
Fetch full conversation with messages (access-controlled).

Success (200):
```
{
  "conversation": Conversation
}
```

Errors:
- 400 `bad-request` (invalid UUID format)
- 403 `forbidden` (private not owned)
- 404 `not-found`

### Endpoint: PATCH /chat/:id
Rename conversation (owner only).

Request:
```
{
  "title": "2025-09-09 — New Title"
}
```

Success (200): `{ "ok": true }`

Errors: 400, 403, 404.

### Endpoint: DELETE /chat/:id
Delete a conversation (owner only).

Success (200): `{ "ok": true }`

Errors: 400, 403, 404.

### Rate Limiting (Future / Placeholder)
Server MAY emit `429` with `Retry-After` header (seconds). Clients SHOULD surface a toast advising to retry later. Retries MUST NOT be automatic for identical prompts within a 30s window.

### Idempotency & Retries
- Client should not auto-resend on 5xx; show error and allow manual retry.
- Re-sending initial prompt for the same temp conversation before server meta arrives MUST reuse the same temp id (client guard). Server will treat duplicated create as a continuation if `conversationId` was already persisted.

### Security Notes
- Private conversations enforce ownership by `owner_user_id` (UUID derived from auth subject mapping rules).
- Citations text is raw chunk content; implement any redaction upstream if needed in future.
- Server must sanitize user `message` before constructing LLM prompt (strip control characters) — implicit requirement.

### Telemetry (Optional Fields)
Implementations MAY log (not return) structured telemetry per exchange:
```
{
  "event": "chat.exchange",
  "conversationId": "uuid",
  "userId": "uuid",
  "promptChars": 1234,
  "tokensOut": 456,
  "topK": 5,
  "retrieval": { "candidates": 5, "vectorMs": 12, "lexicalMs": 8 },
  "latencyMs": 910
}
```

---

## Backend — New Endpoints
Implemented in Nest controllers under `apps/server`.

### NestJS Migration Note
This specification’s endpoint shapes and streaming contract remain authoritative during and after the migration to NestJS (see `docs/spec/03-architecture.md` Framework Migration section). When the server refactor lands:
- Express route implementations move to NestJS Controllers (e.g., `ChatController` with `@Sse('chat/stream')`).
- DTO classes (or Zod schemas) will encode the same `ChatRequest`, `ChatChunk`, `Conversation*` shapes to auto‑generate the OpenAPI spec; field names MUST NOT change without updating this spec first.
- Error envelope is enforced via a global Nest exception filter; no per‑endpoint changes required here.
- Clients should not need modifications; only the spec source of truth changes from manual YAML to generated decorators.

### POST /chat/stream (SSE)
- Content-Type: `text/event-stream`
- Request body: `ChatRequest`
- Response: stream of `ChatChunk` events encoded as SSE `data: {json}\n\n`

Server steps:
- Validate input (non-empty message)
- Compute query embedding via `makeEmbeddings()`
- Hybrid search: run both vector (pgvector) and lexical (FTS) candidate queries, fuse with Reciprocal Rank Fusion (RRF) or a weighted blend, and build citations
- Call the selected LLM with a prompt: system + retrieved snippets + user message + short history
- Stream tokens to client

Creation vs continuation:
- If `conversationId` is provided, append to that conversation (must verify the caller has access if it’s private and they are the owner).
- If `conversationId` is omitted, create a new conversation using:
  - `ownerUserId` inferred from the authenticated request/user
  - `isPrivate` from request body (default false)
  - initial `title` following naming rules

Hybrid search (example SQL using RRF):
```sql
-- $1: vector literal as text, $2: topK, $3: search query text, $4?: array of filtered doc ids
WITH params AS (
  SELECT $1::vector AS qvec,
         websearch_to_tsquery('simple', $3) AS qts,
         $2::int AS topk
), vec AS (
  SELECT c.id, c.document_id, c.chunk_index, c.text,
         1.0 / (ROW_NUMBER() OVER (ORDER BY c.embedding <=> (SELECT qvec FROM params)) + 60) AS rrf
  FROM kb.chunks c
  WHERE ($4::uuid[] IS NULL OR c.document_id = ANY($4::uuid[]))
  ORDER BY c.embedding <=> (SELECT qvec FROM params)
  LIMIT (SELECT topk FROM params)
), lex AS (
  SELECT c.id, c.document_id, c.chunk_index, c.text,
         1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC) + 60) AS rrf
  FROM kb.chunks c
  WHERE c.tsv @@ (SELECT qts FROM params)
    AND ($4::uuid[] IS NULL OR c.document_id = ANY($4::uuid[]))
  ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC
  LIMIT (SELECT topk FROM params)
), fused AS (
  SELECT id, document_id, chunk_index, text, SUM(rrf) AS score
  FROM (
    SELECT * FROM vec
    UNION ALL
    SELECT * FROM lex
  ) u
  GROUP BY id, document_id, chunk_index, text
)
SELECT id AS chunk_id, document_id, chunk_index, text, score
FROM fused
ORDER BY score DESC
LIMIT (SELECT topk FROM params);
```

Notes
- RRF constant (60 above) can be tuned; 50–100 are common.
- If either branch returns zero rows, the other naturally dominates.
- Org/Project scoping and additional filters can be applied in both vec and lex CTEs.

### Optional: POST /chat (non-streaming)
- Request: `ChatRequest` with `stream: false`
- Response: `{ message: Message }`

### GET /chat/conversations
- Returns two groups for the sidebar:
  - `shared`: array of non-private conversations (visible to all users), sorted by `updated_at` desc
  - `private`: array of private conversations owned by the current user, sorted by `updated_at` desc

### GET /chat/:id
- Returns a persisted conversation and messages, enforcing access rules (private only for owner).

## Backend — Existing Endpoints Reuse
- `GET /documents`: list available docs for filter dropdown.
- `GET /search`: default behavior should be hybrid (vector + FTS). Optional `mode` query param may switch to `vector` or `lexical` for debugging.

## Persistence (Server)
All conversations are stored in the database with ownership and privacy.

Add/alter tables:
```sql
CREATE TABLE IF NOT EXISTS kb.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_user_id UUID NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS kb.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  citations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON kb.chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON kb.chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_privacy ON kb.chat_conversations(is_private, owner_user_id);
```

## LLM Prompting (High-level)
- System prompt: instruct model to only use provided context and cite sources with short markers ([1], [2]).
- Context: topK retrieved chunks with document metadata.
- Message: user question.
- Output: concise answer, include inline markers corresponding to citations.

## Error States & Edge Cases
- Empty input → disable Send or show `validator-hint` under composer.
- No citations found → still answer but add disclaimer; allow user to increase K.
- Streaming aborted by user → server should stop LLM call; finalize partial message.
- Network/server errors → show `toast` with `alert-error` and retry option.
- Very long outputs → clamp height with `collapse` for long messages and allow expand.
 - Composer Up-arrow recall → only trigger if input is empty; Escape clears recalled content back to empty.
  - Composer Down-arrow behavior → after an Up recall and before typing, Down clears the composer. With any content present, Up moves caret to start and Down to end.
 - Privacy selection only applies before the first message; once a conversation has messages, its privacy cannot be changed within this scope (changing privacy later is out of scope for v1).

## Accessibility
- Ensure buttons have `aria-label`s (Send, Stop, Regenerate).
- SSE updates should use `aria-live="polite"` region for streaming tokens.
- Focus management: focus composer after send completes.

## Performance
- Use SSE for minimal overhead.
- Limit history tokens sent to the model (last N turns).
- Debounce document filter changes before re-querying.

## Security & Compliance
- Rate limit `/chat` endpoints.
- Sanitize/escape content before rendering.
- Do not leak secrets in prompts.

## Telemetry
- Log: prompt length, latency, retrieval stats (topK, min/max distance), token count.
- UI events: send, stop, regen, open-citation.

## Try it (manual)
- Start API server (ensure PG and GOOGLE_API_KEY set).
- Ingest a test URL or upload a file via existing endpoints.
- Navigate to `/admin/chat`, ask a question, check citations.

## Implementation Checklist
- [ ] Frontend Chat Home `apps/admin/src/pages/admin/chat/home/index.tsx` (clone layout/interactions from `apps/admin/src/pages/admin/apps/gen-ai/home/index.tsx`)
- [ ] Frontend Conversation `apps/admin/src/pages/admin/chat/conversation/index.tsx` per chat UI spec
- [ ] Sidebar (drawer on mobile) with chat history list; open and delete actions
- [ ] Sidebar New Chat button in header (plus icon) that creates and navigates to `/admin/chat/c/new`
- [ ] Route registration in `apps/admin/src/router/register.tsx` (add `/admin/chat` and `/admin/chat/c/:id?`)
- [ ] Chat client `useChat` hook with SSE support
- [ ] Backend `/chat/stream` endpoint with vector search + LLM streaming
- [ ] Optional: persistence tables and GET endpoints
- [ ] QA: accessibility, error states, long-message UX
- [ ] Keyboard: Arrow Up recalls the last sent message when composer is empty
 - [ ] Keyboard: After an Up recall, Arrow Down clears; with content present, Up/Down move caret to start/end
 - [ ] Conversation empty-state: replicate Chat Home CTA grid and composer when no messages; sidebar remains visible

## Acceptance Criteria — Chat Home
- Matches the visual and interaction style of `AiHomePage` (cards grid, icon badges, tooltip, composer block).
- Uses daisyUI components only (no custom CSS); strictly typed TSX components.
- Composer submit transitions to Conversation view with the typed prompt.
- Cards are clickable and prefill suggested prompts into the composer.
 - Sidebar is visible at all times on the Chat Home page and includes a New Chat icon in the header.
 - Sidebar groups conversations into Shared and Private sections (Shared = non-private visible to all; Private = my private only).
 - Conversation list items are full-width and the entire row is clickable.
 - The "Ask a question" composer textarea spans the full available width.
 - A “Private” checkbox is visible for a brand-new conversation; when checked before the first send, the new conversation is created as private and owned by the current user.

## Acceptance Criteria — Conversation
- Displays messages with `chat` bubbles and roles; streams assistant tokens.
- Shows citations in a collapsible section, each linking to source URL if present.
- Provides Stop and Regenerate actions and handles errors via `toast`.
 - Left sidebar lists recent chats with titles and timestamps; clicking loads that chat; delete removes it from history. On mobile, sidebar is available via a drawer toggle.
 - Sidebar groups conversations into Shared and Private sections, using the same rules as Chat Home.
 - When starting a chat from scratch, the conversation title is automatically set to `YYYY-MM-DD — {first message snippet}`.
 - With the composer empty, pressing Arrow Up recalls the last user message into the composer; user can edit and re-send.
  - Sidebar items show a two-line summary: first line is the date, second line is the first query snippet; both lines truncate with ellipsis to fit the sidebar width.
  - Keyboard: After an Up recall, Arrow Down clears the input; when content exists, Up/Down move the caret to the beginning/end respectively.
 - Sidebar header includes a New Chat icon button to start a new conversation.
 - If the active conversation has no messages, the view shows Chat Home-style CTA cards and a composer panel while keeping the sidebar visible.
 - Conversation list items in the sidebar are full-width and fully clickable.
 - The "Ask a question" composer textarea spans the full available width.
 - New chat CTAs are exactly the same as on the Chat Home page (shared component and classes).
 - For a brand-new conversation, a “Private” checkbox is available; when checked prior to the first send, the conversation is created as private and owned by the current user. Access control: private conversations are viewable only by their owner.

### Additional Acceptance Criteria — New Conversation Lifecycle & Selection
These clarify the expected UX (source of several regressions) and are mandatory for completion:

1. Route Initiation
  - Navigating to `/admin/chat/c/new` MUST (a) create a new empty local conversation unless an empty active one already exists, then (b) immediately navigate (`replace` semantics) to `/admin/chat/c/{tempId}` where `tempId` starts with `c_`.
  - The `/new` route itself should never remain visible after the effect completes (no lingering at `/new`).

2. Temp ID Semantics
  - A temporary id MUST match the regex `^c_[a-z0-9]+` and is strictly client-side until the server returns a canonical UUID (RFC4122 v4/5 style) via the streaming `meta` event.
  - Only one temp conversation may remain empty at a time; creating another while one is still empty should reuse the existing one instead of spawning duplicates.

3. UUID Normalization
  - Upon receiving the first streaming `meta` event containing `conversationId` (UUID), the client MUST atomically:
    1. Merge (not duplicate) message history from the temp conversation into the UUID conversation object.
    2. Update active conversation reference to the UUID.
    3. `replace` the URL path segment with the UUID (no full reload, no extra history entry).
  - The list item in the sidebar MUST stay highlighted throughout (no flicker to a previous conversation).

4. Active Highlight & Fallback
  - Highlight logic MUST treat either the explicit active conversation id OR (if still resolving) the current route id as authoritative so that immediately after redirect to `/c/{tempId}` the sidebar item is highlighted even before any asynchronous hydration finishes.
  - There MUST NOT be a frame where no item is highlighted after the first user message is sent.

5. Empty State Transition
  - The “empty CTA” panel MUST disappear as soon as the first user message is appended locally (i.e. before any assistant tokens arrive). The presence of a placeholder assistant message or streaming dots counts as a non-empty conversation state.
  - Returning to the CTA panel for that conversation after the first user message has been sent is prohibited.

6. Auto‑Send with Query Param
  - When a `q` query parameter is present on `/c/new` (e.g. `/c/new?q=Hello`), the flow MUST:
    1. Create/reuse the empty conversation.
    2. Redirect to `/c/{tempId}?q=...`.
    3. Wait until the tempId is known, then send the first message attaching to that temp conversation id (never creating a *second* temp conversation).
  - The user MUST immediately see their message bubble and streaming indicator (no lingering CTA screen).

7. Delete Button Visibility Rules
  - Show delete action only when the current user is the owner (`ownerUserId === user.sub`) OR the conversation is still a temp / unresolved owner (temp id or empty) OR it is explicitly marked private before ownership hydration.
  - Never show delete for a non-owned shared, persisted conversation (prevents 403 errors). Attempting delete on hidden cases should be impossible via the UI.

8. No Orphan Temps
  - After UUID normalization, the original temp conversation entry MUST be removed (or merged) so that the sidebar never shows both the temp id and its UUID counterpart simultaneously.

9. Navigation History Hygiene
  - Creating a new chat and its subsequent UUID normalization should add at most one new history entry (the temp route). The normalization uses `replace` so Back does not revisit the temp id nor `/new`.

10. Resilience / Race Handling
  - If the `meta` event with UUID arrives before the UI finishes rendering the first message, the merge MUST still succeed and the final state MUST satisfy all above criteria (no lost messages, highlight intact, no reversion to CTA panel).
  - If network fails mid‑stream, the temp conversation remains with user + partial assistant message; subsequent retry can reuse it (no forced creation of another temp id when pressing send again while empty assistant content exists).

11. Performance / Perceived Responsiveness
  - Time from clicking “New Chat” to seeing an empty composer within the conversation view MUST be under 100ms on a standard dev machine (subjective acceptance: “feels instant”).

12. Accessibility Continuity
  - During temp → UUID swap, focus MUST remain in (or be restored to) the composer if the user had focus there; no unexpected focus loss.

13. Telemetry (Optional, if instrumentation present)
  - Emit an event `chat.conversation.normalize` with fields `{ tempId, conversationId, elapsedMs }` when UUID normalization completes.

14. Testability Guidance
  - Provide an integration test scenario (Playwright) that: starts at `/c/new?q=Test+Prompt`, verifies redirect to `/c/c_...`, ensures first user bubble renders, then awaits URL replace to UUID, asserting the same message content persists.

15. Regression Protection (Documentation Only)
  - A future change MUST NOT reintroduce reliance on `activeConversation` hydration alone for highlight; route id fallback must remain in place.

16. Initial Chat Screen & Creation Timing (Clarification Added)
  - Clicking the global “New Chat” button (or navigating to `/c/new`) presents an initial chat screen composed of the CTA cards + empty composer + (optional) privacy checkbox. At this point NO server conversation record exists yet; only an ephemeral temp client conversation (id `c_*`) is held locally.
  - The server conversation MUST NOT be created until the user submits the very first message. This first send triggers the `/chat/stream` call which returns the canonical UUID via the `meta` SSE event.
  - While this initial temp conversation is empty (zero messages):
    1. The “New Chat” button MUST be disabled (use daisyUI disabled state e.g. `btn-disabled` or `btn btn-ghost btn-xs btn-disabled`) to signal that another new chat cannot be started yet.
    2. Attempting to invoke creation again SHOULD perform no action (idempotent) — the existing empty temp conversation is reused silently.
    3. (Clarification) Clicking the disabled button must have no side effects; no second temp id may be generated.
  - After the first user message is locally appended (optimistic), the empty-state CTA panel MUST disappear immediately (rule already covered in 5) and the “New Chat” button becomes enabled again (allowing the user to start another conversation later).
  - Navigation to an existing (already persisted) conversation while an empty temp conversation is open IS permitted (standard UX) and will simply abandon the empty temp (it may be pruned later) — HOWEVER if product policy later decides to block that, this spec would need amendment; current clarification: only the duplicate new-chat creation is blocked, not switching to an existing conversation.
  - Rationale: prevents clutter of multiple empty temp conversations and provides a clearer funnel to producing the first meaningful message before allocating server resources.

17. Disabled State Visual Consistency
  - The disabled "New Chat" control must retain its position and sizing to avoid layout shift; only opacity / pointer events change per daisyUI defaults.
  - Provide an accessible hint via `aria-disabled="true"` and (optionally) a tooltip, e.g. title="Finish this empty chat or send a message first".

18. Server Creation Event Ordering (Restated with Clarification)
  - SSE `meta` event containing `conversationId` MUST always be the first event emitted for a brand-new conversation (before any `token`) so the client can normalize the temp id as early as possible after the first send.
  - If retrieval fails before LLM streaming (e.g. no citations, upstream embedding error), server still emits a `meta` with the UUID (so the empty server conversation with one user message exists) followed by either `error` or immediate `done`.

19. Empty Temp Abandonment Policy
  - An empty temp conversation abandoned by navigating away (no messages ever added) MAY be pruned from local storage after 20–30s (existing pruning logic) and will never be created server-side. This keeps local storage clean.
  - Telemetry (optional): emit `chat.temp.abandoned` with `{ tempId, ageMs }` when pruned.

### Derived Edge Cases (Documented)
| Case | Expected Handling |
|------|-------------------|
| Rapid double click on New Chat | Reuse existing empty temp conversation (no duplicates) |
| Navigate to /c/{uuid} then quickly to /c/new | Should not overwrite active uuid; new temp becomes active only after route effect runs |
| User sends prompt, meta UUID delayed >3s | Stay on temp route; highlight stable; streaming proceeds; normalization occurs when UUID arrives |
| User deletes temp conversation mid-stream | Abort stream; remove temp; UI returns to CTA using a fresh `/c/new` flow |
| Server returns error before meta event | Assistant placeholder updated with error; temp conversation retained (not normalized) |

### Non-Functional Requirements (Supplemental for Lifecycle)
1. Idempotency: Re-sending the initial prompt after a network error uses the same (still empty or partial) conversation id rather than creating a new temp.
2. Consistency: After page reload on `/c/{uuid}`, hydration MUST fetch full conversation and not recreate a temp.
3. Storage Hygiene: Local persistence layer MUST prune temp conversations older than a configurable window (default 20–30s) that have zero messages.

## API Documentation (OpenAPI + Stoplight Integration)

Interactive, shareable documentation for the entire API surface (auth probes, orgs, projects, settings, ingestion, search, documents, chunks, chat) is published via a unified OpenAPI 3.1 spec rendered with Stoplight Elements.

Scope (current): All implemented endpoints. The earlier chat-only spec remains temporarily (`chat.openapi.yaml`) but will be deprecated once external consumers migrate.

Deliverables (Unified):
1. Unified OpenAPI spec file: `apps/server/openapi.yaml` (authoritative, version >= 0.2.0).
2. Raw unified spec route: `GET /openapi/openapi.yaml` (YAML, `Content-Type: application/yaml`).
3. Unified docs UI: `GET /docs` (Stoplight Elements pointing at unified spec with tags grouping by functionality).
4. README section updated (`apps/server/README.md`) with unified workflow.

Authoring Guidelines (Unified):
- Schemas MUST mirror runtime data models; modify code + spec in same PR.
- Security: global HTTP bearer (`bearerAuth`) omitted only for explicitly public endpoints (`/health`, password grant probe & login).
- SSE Modeling: `/chat/stream` success 200 documented as `text/event-stream` with example chunk sequence; each frame is a line `data: {json}` plus blank line (OpenAPI limitation prevents discrete schema enforcement per frame).
- Component schemas include: `Citation`, `Message`, `Conversation`, `ChatRequest`, `ChatChunk`, `ErrorEnvelope`, `ConversationGroups`.
- Constraints: `topK` (1..20), `message` non-empty, `ChatChunk.type` enum enforced.
- Provide examples for new streaming patterns or error envelopes when adding endpoints.

Change Control:
- Any endpoint or schema alteration MUST update `openapi.yaml` and this narrative spec.
- Planned CI: spectral lint for unified spec (future enhancement).

Versioning:
- Unified spec `info.version` starts at `0.2.0`. Use semantic bumps: patch (docs-only), minor (additions/backward-compatible), major (breaking change).

Testing Checklist (Unified):
- [ ] `curl -s localhost:3001/openapi/openapi.yaml | head -n 5` shows `openapi: 3.1.0` & `version: 0.2.0+`.
- [ ] Browser loads `/docs` listing all endpoint groups.
- [ ] Chat schemas (`ChatRequest`, `ChatChunk`) align with TS interfaces (no drift).
- [ ] SSE order text matches Event Sequencing Guarantees.

Regeneration Workflow:
1. Update TypeScript runtime types / handlers.
2. Edit `openapi/openapi.yaml` (and `chat.openapi.yaml` if still present).
3. (Optional) Lint: `npx @redocly/cli lint apps/server/openapi.yaml`.
4. Commit code + spec together.

Future Enhancements:
- Remove legacy chat-only spec after external migration.
- Add dark mode styling override for Stoplight.
- Autogenerate portions from JSDoc (exploration).

Rationale:
One unified spec reduces drift, enables SDK generation, automated testing, and cohesive onboarding.


### Open Implementation Notes (Informational)
The current implementation uses a client-generated temp id with prefix `c_` and merges upon SSE `meta` event. The spec codifies this approach and defines UX guarantees (highlight, absence of flicker, CTA dismissal). Any alternative (e.g., pre-reserving UUID server-side) MUST preserve the observable behaviors defined above.

## daisyUI Components Index (used)
- `chat`, `chat-bubble`, `chat-start`, `chat-end`
- `avatar` (+ `mask-*`)
- `collapse`, `collapse-title`, `collapse-content`, `collapse-arrow`
- `badge` (for source labels)
- `btn` (+ `btn-primary`, `btn-ghost`, `btn-error`, sizes)
- `input` / `textarea`
- `select`
- `dropdown`, `menu`
- `loading` (`loading-dots`)
- `toast`, `alert` (error/info)
- `divider`
- `modal`
- `skeleton`
- `status`
- `card` (optional wrapper)
 - `drawer` (for the sidebar), `list` (optional alternative to `menu`)
 - `checkbox` (privacy control before first send)

## Open Questions
- Which LLM provider/model for generation? (Gemini, OpenAI, etc.)
- Do we need auth scoping for chat persistence by user?
- Should we support file attachments in the composer to ingest on-the-fly?
