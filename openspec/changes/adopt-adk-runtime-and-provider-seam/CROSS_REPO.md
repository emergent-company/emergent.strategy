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

---

## Read this before assuming strategy-server's approach transfers directly

**→ `openspec/AGENT_RUNTIME_PATTERN.md`**

ADK v2 reloads and rescans a session's **entire event history every turn**,
with no compaction in the module, and cost is linear in **total bytes** of
history: 1,000 events at 8KB each costs ~122ms of overhead per turn; at 32KB
each, ~530ms. This is real, and it rules out a session whose events accumulate
LLM/tool content for as long as the agent runs — a chat-style loop, which is
this harness's likely shape once it drives tool calls with real file content,
diffs, and command output.

**It does not rule out ADK's Runner/session for a workflow graph of thin
nodes**, which is strategy-server's actual shape: AIM's step bodies do their
LLM work directly and hand the graph a compact result, so a whole six-step
cycle's session — gates included — holds on the order of 10-20 events
regardless of gate duration. strategy-server resumed using ADK's Runner,
graph, and `RequestInput`/resume for exactly this reason; see the scope
history in `proposal.md`.

**The distinction that decides which case you are in** — "Workflow graphs vs
chat-style agents" in `openspec/AGENT_RUNTIME_PATTERN.md` — is what to apply
here, not a blanket rule either way. `sequence` is worth reading regardless:
it ships ADK v2 in production while refusing the Runner and SessionService
entirely (`ADR-055`, enforced by a build-failing import guard), because its
shape — arbitrary-length transcripts and tool payloads — is close to what this
harness will have. If the harness's units of work turn out closer to
`sequence`'s shape than to AIM's, its answer should look more like theirs than
like strategy-server's.

The rest of the pattern — bounded cycles with Memory as the bridge between
them, and ten invariants covering retrieval budgets, write-back curation, and
the authority split between Memory and domain tables — applies regardless of
which side of that distinction any given harness workload falls on, and is in
`openspec/AGENT_RUNTIME_PATTERN.md`.

What still holds from this change: the **provider seam** (Part A), the ADK
`model.LLM` adapter, the engine-neutral step shape, and the run/step audit
direction. What is under review: whether an ADK session should span an AIM
cycle's human gates (it should not), and therefore how much of the workflow
graph earns its place.
