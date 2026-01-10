# Proposal: Fix Server Stability

## Background

The server is experiencing frequent crashes (OOM) and excessive logging.

1.  **OOM Crash:** `SemanticChunkerService` tries to embed ~3500 sentences in a single call, causing a heap out-of-memory error.
2.  **Log Spam:** `ZitadelService` retries failed introspection calls indefinitely, flooding logs and wasting CPU.

## Goal

Stabilize the server by fixing the OOM crash and throttling the auth error loop.

## Scope

- **Semantic Chunker:** Implement batching for embedding generation to reduce memory pressure.
- **Zitadel Service:** Implement a circuit breaker to back off when upstream Auth fails with 500 errors.

## Risks

- Batching might slightly slow down chunking (sequential network calls), but stability is prioritized.
- Circuit breaker might temporarily block valid auth requests if the error is intermittent, but 500s usually indicate persistent config issues.
