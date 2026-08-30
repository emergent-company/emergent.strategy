# Cross-Repo Dependencies: ADK Go v2 adoption

This document tracks downstream consumers of the ADK v2 primitives introduced
by this change. When modifying shared patterns, check all listed repos for
impact.

---

## opencode-harness

**Repo:** `github.com/emergent-company/opencode-harness`
**Spec:** `openspec/specs/factory-engine/spec.md`

### Relationship

`opencode-harness` is a Software Factory Harness for OpenCode that adopts ADK
Go v2 as its workflow runtime. It builds on the same foundational primitives
established by this change, but does NOT import this repo's code. Shared
patterns are replicated independently.

### What opencode-harness Reuses from This Change

| Primitive | This change (strategy-server) | opencode-harness |
|-----------|-------------------------------|------------------|
| **ADK v2 graph engine** | AIM cycle (6 sequential nodes with conditional gates) | Factory pipeline (stages with parallel expert fan-out + join) |
| **ADK HITL** | `RequestInput`/Resume on 4 AIM steps | Expert verdict approval gates; max-revision escalation |
| **Session persistence** | Postgres `bunsession` store | Adapted store (Postgres or file-backed for local CLI use) |
| **`llm.Provider` interface** | Extracted in Part A; registered as ADK models in Part B | Same interface shape for expert agent LLM calls |
| **ADK model registry** | `model.Register(pattern, factory)` | Same — expert agents configured via model registry |

### Coordination Rules

1. **ADK version pin:** Both repos should track the same ADK v2 minor version.

2. **`llm.Provider` contract:** If `Chat`, `ChatWithFormat`, `Ping`, or `Model`
   signatures change in Part A, notify opencode-harness before merging.

3. **Session store schema:** If the goose migration for ADK session tables changes,
   document the schema so opencode-harness can replicate or adapt for its store.

4. **HITL edge cases:** Document any `RequestInput`/Resume edge cases discovered
   during Part B (partial resume, timeout, duplicate approval) in
   `internal/adk/` package docs. opencode-harness will reference these.

5. **No cross-imports:** Intentional. Different deployment models (multi-tenant
   server vs local CLI tool).

### Sequencing

This change is the **pathfinder** for ADK v2 adoption:

```
emergent-strategy Part A (Provider seam)     ← ships first
         │
emergent-strategy Part B (ADK runtime)       ← validates graph + HITL + sessions
         │
opencode-harness (factory engine)            ← builds on proven patterns
```

Lessons learned from Part B (especially session reconstruction, HITL resume
after restart, and graph construction patterns) should be documented in
`internal/adk/` before opencode-harness begins implementation.
