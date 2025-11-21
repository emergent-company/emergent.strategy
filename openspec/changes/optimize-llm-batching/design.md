# Design: Batching & Aggregation

## 1. Semantic Chunking Improvements

The current similarity threshold (0.75) is likely too high for `text-embedding-004`, treating almost every sentence as a topic shift.

**Proposed Changes:**

- **Minimum Chunk Size:** Enforce a "soft" minimum (e.g., 500 characters or 5 sentences) before considering a split. This ensures chunks are at least paragraph-sized.
- **Adaptive Threshold:** Lower the default threshold to 0.6 or make it configurable.

## 2. Extraction Aggregation (Bin-Packing)

Instead of 1 Chunk -> 1 LLM Call, we will use a **Bin-Packing Strategy**.

**Algorithm:**

1.  Receive `N` Semantic Chunks.
2.  Initialize `current_batch = []`.
3.  Iterate through chunks:
    - If `len(current_batch) + len(chunk) < MAX_TOKENS` (e.g., 8000 tokens):
      - Add chunk to `current_batch`.
    - Else:
      - Dispatch `extract(current_batch)` (one LLM call).
      - Start new `current_batch` with current chunk.
4.  Dispatch remaining `current_batch`.

**Why 8000 tokens?**
Gemini Flash has a 1M window, but reasonable batch sizes (8k-16k) balance latency and "lost in the middle" risks.

## 3. Unified Extraction

The prompt will be updated to handle multiple chunks/sections at once, returning a consolidated list of entities for that batch.
