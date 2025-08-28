# Admin AI Chat (RAG) — Feature Specification

Last updated: 2025-08-22
Owner: Admin App (React + Vite + TypeScript + Tailwind CSS + daisyUI)
Status: Draft

## Summary
Add a typical AI chat experience to the Admin app that uses Retrieval-Augmented Generation (RAG) over our existing knowledge base (kb.documents/kb.chunks) with pgvector embeddings (text-embedding-004). The chat UI is implemented with daisyUI components and streams assistant responses while showing citations to retrieved chunks.

## Goals
- Provide an in-app “AI Chat” page within the Admin section.
- Query our own database via semantic retrieval (pgvector) and optionally lexical (tsvector) as fallback.
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
4. Server embeds the query, runs vector search on `kb.chunks` (optionally merges with tsvector search), fetches topK chunks, and calls the LLM with retrieved context.
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
- Vector search (pgvector) and build citations
- Call the selected LLM with a prompt: system + retrieved snippets + user message + short history
- Stream tokens to client

Creation vs continuation:
- If `conversationId` is provided, append to that conversation (must verify the caller has access if it’s private and they are the owner).
- If `conversationId` is omitted, create a new conversation using:
  - `ownerUserId` inferred from the authenticated request/user
  - `isPrivate` from request body (default false)
  - initial `title` following naming rules

Vector search (example SQL):
```sql
-- $1: vector literal as text, $2: topK, $3?: array of filtered doc ids
SELECT c.id AS chunk_id,
       c.document_id,
       c.chunk_index,
       c.text,
       (c.embedding <=> $1::vector) AS distance
FROM kb.chunks c
WHERE ($3::uuid[] IS NULL OR c.document_id = ANY($3::uuid[]))
ORDER BY c.embedding <=> $1::vector
LIMIT $2;
```

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
- `GET /search`: lexical search (can be offered as a fallback or “quick search”).

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
