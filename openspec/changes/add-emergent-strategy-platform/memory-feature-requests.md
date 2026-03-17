# Feature Requests for emergent.memory

Context: The EPF Semantic Strategy Runtime (see `proposal.md`) requires emergent.memory as its semantic graph substrate. This document captures the gaps between what the plan requires and what Memory v0.35.50 provides.

## Assessment Summary

Out of 22 plan requirements assessed:
- **9 fully covered** by Memory today (custom types, properties, embeddings, blueprints, schema evolution)
- **10 partially covered** with viable workarounds (multi-hop via repeated API calls, search by text proxy, etc.)
- **3 missing** with no clean workaround

The partially-covered items all have pragmatic workarounds that let us ship Phase 1 without blocking on Memory changes. The 3 missing items need feature requests.

---

## CRITICAL: Graph Branching for Scenario Projection

**Plan requirement (Decision 8)**: "What if?" scenarios create a branch of the semantic graph, apply proposed changes to the branch, run the propagation circuit on the branch, then merge or discard.

**What exists**: Nothing. No branch, fork, snapshot, or copy-on-write concept in the graph API.

**Why it's critical**: The entire scenario workflow — "what happens to our competitive position if we drop the franchise model?" — depends on this. Strategic managers need to explore hypothetical changes without committing them. The propagation circuit runs on the branch to show cascade consequences.

**Proposed solution**: Copy-on-write graph branching at the project level:
- `memory graph branch create --name "scenario/drop-franchise"` — creates a lightweight branch of the current graph state
- Objects created/updated on a branch are branch-local (copy-on-write from main)
- `memory graph branch list` — list active branches
- `memory graph branch diff --name "scenario/drop-franchise"` — show objects that differ from main
- `memory graph branch merge --name "scenario/drop-franchise"` — apply branch changes to main
- `memory graph branch delete --name "scenario/drop-franchise"` — discard without applying
- Queries and search on a branch should see branch-local changes overlaid on main

**Workaround without this feature**: Create a separate Memory project per scenario (heavyweight — requires full re-ingestion), or maintain branched state in the Go engine's memory (complex, loses Memory's search/embedding capabilities on branched objects). Neither is clean.

**Timeline**: Needed by Phase 1 completion (scenario projection is part of Phase 1). However, Phase 1 can ship impact analysis and contradiction detection without branching. Scenario projection specifically depends on this.

---

## HIGH: Event Stream / Webhook Callback for Graph Changes

**Plan requirement (Decision 7, Phase 2)**: When graph objects change (created/updated), the Go propagation circuit needs to be notified to evaluate whether a cascade should trigger.

**What exists**: Reaction agents fire on object lifecycle events, but they trigger server-side agent runs — not external webhooks. Webhook hooks exist but are for triggering agent runs, not for notifying arbitrary HTTP endpoints.

**Why it's high priority**: The causal AIM loop (Phase 2) needs reactive cascades. When AIM evidence enters the graph as new objects, the propagation circuit must be notified. Without events, the circuit must poll — which is wasteful and adds latency.

**Proposed solution**: Allow webhook hooks to fire to an external URL (not just trigger an agent):
- `memory agents hooks create <agent-id> --label "epf-cascade" --url "http://localhost:8080/cascade" --events "created,updated" --object-types "Assumption,Belief,Feature"`
- When matching objects are created/updated, POST the event payload to the URL
- Include object ID, type, key, changed properties in the payload

**Alternative**: A server-sent events (SSE) or WebSocket stream that the Go engine subscribes to for graph change events.

**Workaround without this feature**: Poll via `memory graph objects list --type <Type>` periodically. Functional but adds 5-10s latency and wastes API calls. Acceptable for Phase 1 development; not acceptable for production.

**Timeline**: Needed by Phase 2 (Causal AIM Loop). Phase 1 can use polling.

---

## MEDIUM: Entity-Similarity Query ("nearest neighbors to entity X")

**Plan requirement (Decision 4, semantic edge discovery)**: When ingesting artifacts, the engine needs to discover semantic edges by finding objects whose embeddings are similar to a given object's embedding.

**What exists**: `memory query --mode=search "text query"` searches by text input. Returns similarity scores with `--show-scores`. Can filter to graph results with `--result-types graph`.

**What's missing**: No way to say "find the top-10 objects most similar to entity X by embedding" without extracting entity X's text and re-submitting it as a search query.

**Proposed solution**: Add entity-reference search:
- `memory query --mode=search --similar-to <entity-id> --limit 10 --result-types graph`
- Uses the entity's existing embedding vector directly — no need to extract and re-encode text
- Returns ranked graph objects with similarity scores

**Workaround without this feature**: Extract the object's `description` or `name` property, use it as the text query. This works but: (a) loses any embedding context beyond what's in those text fields, (b) adds an extra API call per semantic edge discovery. Functional for 300-500 node instances.

**Timeline**: Nice to have for Phase 1. Would significantly improve semantic edge quality and reduce ingestion time.

---

## MEDIUM: Object Create with Key via CLI

**What exists**: `memory graph objects create --type X --name "Y"` — no `--key` flag. Keys can only be set via blueprint seed JSONL.

**Why it matters**: Incremental sync (update a single changed artifact section) needs to create objects with stable keys so re-sync is idempotent. Without `--key` on create, the engine must either use the REST API directly or generate JSONL and re-apply the full blueprint.

**Proposed solution**: Add `--key` flag to `memory graph objects create`:
- `memory graph objects create --type Belief --name "Enterprise focus" --key "ns-belief-enterprise" --properties '{"inertia_tier": "1"}'`

**Workaround**: Use REST API directly for individual creates with keys. Or generate JSONL and use `memory blueprints --upgrade` for each incremental change (heavier but works).

---

## MEDIUM: Property-Filtered Object Listing

**What exists**: `memory graph objects list --type X` filters by type only. No property-level filtering.

**Why it matters**: The propagation circuit needs to fetch subsets of the graph efficiently — e.g., "all objects with inertia_tier=1" (North Star beliefs) or "all objects of type Assumption with status=invalidated".

**Proposed solution**: Add `--filter` flag:
- `memory graph objects list --type Assumption --filter 'status=invalidated'`
- Or support a query parameter: `memory graph objects list --type Assumption --properties-filter '{"status": "invalidated"}'`

**Workaround**: Fetch all objects of a type (`--limit 500`), filter in Go. Acceptable for 300-500 node instances. May need revisiting for larger instances.

---

## Items That Don't Need Feature Requests

These have acceptable workarounds built into the plan:

| Gap | Workaround | Why it's fine |
|-----|-----------|---------------|
| Multi-hop traversal (no N-hop query) | Fetch full subgraph into Go memory, traverse in-process | Graph is small (300-2000 nodes). In-memory traversal is <10ms. |
| Rollback/checkpoints | Go engine records old→new per object, issues updates to restore | More code, but the circuit already tracks all changes. |
| Batch relationships with srcKey/dstKey | Blueprint seed files support key-based refs. CLI `create-batch` uses IDs but that's the CLI, not the API. | Full re-sync uses blueprints (key-based). Incremental sync resolves keys→IDs first. |
| Schema int validation | Store `inertia_tier` as string, parse in Go | Schema properties are informational — Go validates. |
| Auth bridging | Use project tokens (`emt_*`) stored in `.env.local` | Works for single-user and development. Multi-tenant auth bridging is Phase 3+ scope. |
| Batch object updates | Parallel individual HTTP calls from Go client | No rate limiting documented. Go concurrency handles this well. |

---

## Recommended Sequencing

1. **Now**: Submit graph branching request (CRITICAL, long lead time)
2. **Now**: Submit entity-similarity query request (MEDIUM, likely straightforward)
3. **Now**: Submit object create with key request (MEDIUM, simple CLI addition)
4. **Phase 2 prep**: Submit event stream/webhook request (HIGH, needed before Phase 2)
5. **Phase 2 prep**: Submit property-filtered listing request (MEDIUM, nice-to-have)
