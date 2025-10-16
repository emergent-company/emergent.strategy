# Ingestion Workflows (LangChain)

This section proposes reference LangChain.js pipelines in TypeScript to ingest, extract, chunk, embed, and index documents.

**Note:** For automatic object extraction and notifications, see `28-automatic-extraction-and-notifications.md`.

## Triggers
- HTTP Webhook: file upload and metadata; returns ingestion id.
- Cloud Storage Watch: S3/GCS bucket new object.
- App Webhooks: GitHub, Jira, Slack, Zoom/Meet recordings, Confluence.
- Scheduler: periodic backfill or sync.

## Pipeline Stages
1. Fetch & Store
   - Download asset; compute SHA-256 checksum; write to object storage.
   - Write Document row (upsert by checksum+uri).
2. Extract & Normalize
   - Extract text via Unstructured/Tika; fallback OCR (optional).
   - Language detection; clean; split pages/sections.
3. Chunk
   - Strategy: headings-aware (markdown/HTML), semantic (text-graph), or fixed-size.
   - Add metadata: section_path, page_idx, ordinal.
4. Embed
   - Generate embeddings; handle provider quotas; cache by checksum.
   - For embeddings in v0.1, we use Google Gemini `text-embedding-004` via LangChain's `GoogleGenerativeAIEmbeddings`.
5. Index
   - Upsert chunks to vector DB; update FTS; write provenance.
6. Graph Enrichment (optional v1.1)
   - NER to create Entities; relation extraction; connect evidence.
   - **Automatic Object Extraction:** If enabled at project level, trigger extraction job to extract structured objects from document based on active template pack types (see `28-automatic-extraction-and-notifications.md`).
7. Complete
   - Emit event; push to MCP cache; notify caller.
   - **Notification:** Send notification when extraction job completes with summary of extracted objects (see `28-automatic-extraction-and-notifications.md`).

Error Handling & Idempotency
- Retry with exponential backoff; dead-letter queue for manual review.
- Idempotent by checksum and source uri.
- Partial ingestion cleanup on failure.

## Workflow Example: Meeting Transcript ➜ Structured Spec Objects

Objective
- Take a meeting recording/transcript, diarize speakers, summarize, extract structured objects (Decisions/ADRs, ActionItems, Questions, Requirement candidates, Risks), index chunks, and persist objects with evidence links.

High-level Steps (LangChain)
1) Trigger
   - Zoom/Meet/Teams webhook: recording.completed or transcript.available
   - Fallback: HTTP file upload
2) Fetch & Store
   - Download media/transcript, compute checksum, save to object store
   - Create Document row (source: meeting, uri: provider link)
3) Speech-to-Text + Diarization (if only audio/video)
   - ASR with diarization and timestamps (e.g., Whisper/GCP/Assembly)
4) Normalize Transcript
   - Segment into utterances [{speaker, start, end, text}], detect language, clean
5) Topic Segmentation
   - LLM-based or heuristic segmentation into topics/sections
6) Chunking
   - Create chunks per topic with section_path and timecodes
7) Embeddings
   - Generate embeddings; upsert to vector index; update FTS
8) Information Extraction
   - LLM extraction to JSON for: decisions, action_items, questions, requirement_candidates, risks
   - Include evidence alignment (utterance or chunk ids)
9) Persist Spec Objects
   - Create Meeting object (participants, agenda, summary)
   - Create Decision (ADR), ActionItem, Question, Requirement (FR/NFR), Risk objects
   - For each object, attach evidence[] pointing to chunk_ids with role and confidence
10) Graph & Links
   - Link decisions to requirements (refine/trace_to), action items to owners, etc.
11) Complete & Notify
   - Emit ingestion_complete event; optional notification to a Slack channel
   - **Modern Approach:** Send in-app notification with extraction summary (object counts, types, quality metrics) - see `28-automatic-extraction-and-notifications.md`

Suggested LangChain.js Pipeline Skeleton (TypeScript)
- Fastify/Express route (webhook) or worker (BullMQ/Temporal consumer)
- Downloader (fetch/axios) with checksum (node:crypto)
- ASR client (provider SDKs) with optional diarization
- Normalizer to utterances [{speaker, start, end, text}]
- Topic segmenter (LCEL chain or heuristic)
- Chunker (LangChain text splitters; headings-aware or semantic)
- Embeddings (langchain.embeddings with batching and caching)
- Persistence layer (DAO): upsert Document, Chunk, Provenance
- Extraction chain with structured output (Zod/AJV + LangChain OutputParsers) for Decisions, Requirements, ActionItems, Questions, Risks
- Upsert Spec Objects, Evidence, Relationships
- End

PII & Security
- Optional redaction before embeddings; tenant scoping on all rows

See docs/spec/examples/meeting-transcript-workflow.md for a concrete payload example.

## Example LangChain Flow
- Preprocess: split transcript into chunks with deterministic ids
- Chain: system+user prompts; use Zod/AJV OutputParsers for schema-constrained JSON
- Validate: JSON Schema using AJV (compile once and reuse validators)
- Persist: upsert Meeting, Decisions, Requirements, ActionItems, Questions, Risks; insert Evidence links and Relationships
- Error path: log and dead-letter the transcript for manual review

## Admin UI notes
- The Admin UI (React + Tailwind + DaisyUI) surfaces ingestion runs, documents, chunks, and extracted objects.
- Provide filters, FTS query input, and vector search examples; show citations/evidence with chunk previews and ts_headline snippets.
- Use DaisyUI components for tables, tabs, alerts, and modals; keep pages lightweight and streaming-friendly.
