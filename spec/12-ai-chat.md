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

## Backend — New Endpoints
Add to `src/server.ts`.

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
