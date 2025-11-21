# Chat Context Management: Windowing & Summarization

## Status

- Status: Proposed
- Priority: Medium
- Created: 2025-11-21

## Current State

The Chat Agent (LangGraph) uses `PostgresSaver` to persist conversation history indefinitely.

- **Behavior:** It loads the _entire_ conversation history from the `checkpoints` table for every new message.
- **Limitation:** As conversations grow, the context window fills up, eventually hitting the LLM's token limit (e.g., 128k or 1M tokens depending on the model). This leads to increased latency, higher costs, and eventually hard failures.

## Proposed Improvement

Implement a strategy to manage long conversation threads effectively.

### 1. Message Windowing (Trimming)

- **Concept:** Only pass the last $N$ (e.g., 20) messages to the LLM.
- **Implementation:**
  - Modify `LangGraphService` to use a `stateModifier` function.
  - This function filters the `messages` list before it reaches the model.
  - LangChain has utilities like `trimMessages` to help with this (handling system prompts, keeping tool calls valid).

### 2. Summarization

- **Concept:** Periodically summarize older messages into a single "Summary" message.
- **Implementation:**
  - Add a node to the graph that runs when the message count > $X$.
  - This node calls an LLM to summarize the first $X-N$ messages.
  - Replace those messages with a `SystemMessage` containing the summary.

### 3. Long-Term Memory (Store)

- **Concept:** Extract facts and save them to a semantic store, rather than relying on raw chat logs.
- **Implementation:** Use the LangGraph `Store` interface (backed by Postgres/pgvector) to save user preferences or facts found during the chat.

## Success Metrics

- Chat continues to function smoothly for threads with 100+ messages.
- Token usage per turn remains stable (bounded) rather than growing linearly.
- No "Context Window Exceeded" errors.
