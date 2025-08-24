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

## IA and Routing
- Chat Home (landing): `apps/admin/src/pages/admin/chat/home/index.tsx` — patterned after `AiHomePage` at `apps/admin/src/pages/admin/apps/gen-ai/home/index.tsx` (cards grid + composer prompt).
- Chat Conversation: `apps/admin/src/pages/admin/chat/conversation/index.tsx` — full chat UI with messages, citations, and streaming.
- Menu: “Chat” with items “Home” and “Conversations”.
- Routes:
  - `/admin/chat` → Chat Home
  - `/admin/chat/c/:id?` → Conversation (if `:id` omitted, starts a new one)
- Register in `apps/admin/src/router/register.tsx` under the Admin layout group.

## UI/UX — Components and Layout
Use only daisyUI components and Tailwind utilities per our styling rules. Below lists the exact daisyUI components used and their roles.

- Layout container:
  - `card` (optional wrapper) with `card-body` for the chat area.
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
  - Send button: `btn btn-primary` with `<span class="iconify lucide--send"></span>`
  - Stop button (visible while streaming): `btn btn-error btn-ghost`
  - Optional advanced controls:
    - K selector: `select select-sm`
    - Document filters: `dropdown` + `menu` to pick documents
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
- Hero greeting text with gradient text using Tailwind utilities.
- Three or more feature cards using `card card-border` with icon badges (`bg-*-content text-*-content rounded-box w-fit p-2` + Iconify).
- A bottom composer card (`card card-border`) with a `textarea` and a small actions row:
  - Attachment/mic buttons: `btn btn-sm btn-circle btn-ghost` with lucide icons.
  - Usage status block with a `tooltip` container.
  - Quick action buttons: `btn btn-sm btn-outline rounded-full` for Search/Brainstorm; primary `btn btn-primary btn-circle btn-sm` to submit.
- On submit, navigate to Conversation route and carry the initial prompt.

## Visual Structure (high level)
- Header (optional): Page title “AI Chat” with actions (Settings, Clear conversation)
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
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  history?: Array<Pick<Message, 'role' | 'content'>>;
  topK?: number; // default 5
  documentIds?: string[]; // optional filters
  stream?: boolean; // default true
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
1. User enters a prompt and hits Send.
2. Frontend immediately appends a user message, then shows a streaming assistant bubble with `loading-dots`.
3. Frontend POSTs to `/chat/stream` with `ChatRequest`.
4. Server embeds the query, runs vector search on `kb.chunks` (optionally merges with tsvector search), fetches topK chunks, and calls the LLM with retrieved context.
5. Server streams tokens to the client (SSE). Citations are included once available (can be sent upfront after retrieval or at end).
6. Frontend renders tokens incrementally; user may click Stop to abort.
7. Upon finalization, the assistant message is marked complete and citations are attached.

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

### Optional: GET /chat/:id
- Returns a persisted conversation and messages if server-side persistence is implemented.

## Backend — Existing Endpoints Reuse
- `GET /documents`: list available docs for filter dropdown.
- `GET /search`: lexical search (can be offered as a fallback or “quick search”).

## Optional Persistence (Server)
If we want durable histories, add tables:
```sql
CREATE TABLE IF NOT EXISTS kb.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
- [ ] Route registration in `apps/admin/src/router/register.tsx` (add `/admin/chat` and `/admin/chat/c/:id?`)
- [ ] Chat client `useChat` hook with SSE support
- [ ] Backend `/chat/stream` endpoint with vector search + LLM streaming
- [ ] Optional: persistence tables and GET endpoints
- [ ] QA: accessibility, error states, long-message UX

## Acceptance Criteria — Chat Home
- Matches the visual and interaction style of `AiHomePage` (cards grid, icon badges, tooltip, composer block).
- Uses daisyUI components only (no custom CSS); strictly typed TSX components.
- Composer submit transitions to Conversation view with the typed prompt.
- Cards are clickable and prefill suggested prompts into the composer.

## Acceptance Criteria — Conversation
- Displays messages with `chat` bubbles and roles; streams assistant tokens.
- Shows citations in a collapsible section, each linking to source URL if present.
- Provides Stop and Regenerate actions and handles errors via `toast`.

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

## Open Questions
- Which LLM provider/model for generation? (Gemini, OpenAI, etc.)
- Do we need auth scoping for chat persistence by user?
- Should we support file attachments in the composer to ingest on-the-fly?
