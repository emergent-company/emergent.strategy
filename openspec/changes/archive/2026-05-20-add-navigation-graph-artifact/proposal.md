# Change: Add Navigation Graph as a strategy-layer artifact

## Why

EPF models entity lifecycles via the existing workflow schema (states, transitions, guards). But there is no artifact for modeling the **user journey topology** — the interaction contexts a user inhabits and how they traverse between them.

This gap was exposed while building 21st-captable, where a navigation graph (~60 contexts, ~80 transitions, ~10 guards, ~8 groups) emerged as a critical architectural element. The insight: **the topology of the customer journey is a strategic concern**, not an implementation detail. Questions like "can a free-tier user reach the waterfall?" or "how many steps from dashboard to reporting?" should be answerable from strategy artifacts, not by reading application code.

Today, EPF has no way to:
- Define the intended customer journey structure as a strategic specification
- Verify that a journey specification is internally consistent (no dead ends, no unreachable contexts, guards make sense)
- Test customer journey scenarios against the specification to verify it consistently describes the desired end state
- Reason about how guard models (user roles, tiers, entity states) shape the reachable product surface for different user types

The navigation graph fills this gap as strategic product documentation — like feature definitions and value models, it defines **what the customer experience should be**. How implementations deliver that experience is their own concern. EPF validates the specification; implementations deliver against it.

The journey graph is complementary to the workflow schema:

| Aspect | Workflow Schema | Navigation Graph |
|--------|----------------|-----------------|
| Nodes | Entity states (draft, approved) | Interaction contexts (cap table, settings) |
| Edges | State transitions (approve, reject) | Journey paths (navigate, open modal) |
| Guards | Business rules (data validation) | Access control + contextual rules (tier, role, entity state) |
| Scope | Single entity lifecycle | Entire product interaction surface |

Both share the same mathematical structure (directed graph with guarded edges) and both should be executable by the same state machine runner within EPF tooling.

## What Changes

- **New EPF artifact type:** `navigation_graph` in the FIRE phase — strategic documentation defining the intended customer journey topology
- **New JSON schema:** `navigation_graph_schema.json` defining interaction contexts, transitions, guards, groups, presentation modes, and data requirements
- **Graph state machine runner:** A general-purpose engine that loads and executes EPF graph artifacts (navigation graphs and workflow definitions), supporting interactive exploration and scripted journey testing
- **New validation rules:** Reachability analysis, orphan detection, unique IDs, guard consistency, landing context per group
- **New MCP tools:** Journey search, reachability queries, path computation, guard diagnosis, scripted journey execution
- **New CLI commands:** `journey walk` (interactive exploration), `journey run` (scripted scenario testing), `journey validate` (structural checks)
- **Composition model:** Rules for connecting multiple service sub-graphs into a product-wide topology via portal edges
- **Semantic engine integration:** Interaction contexts decompose into graph nodes in emergent.memory; transitions become edges with guard metadata

## Impact

- Affected specs: `epf-cli-mcp` (new tools), `epf-semantic-engine` (new graph node types)
- Affected code: `internal/schema/` (new artifact type), `internal/runner/` (new state machine engine), `internal/decompose/` (new graph objects), `internal/embedded/schemas/` (new schema), `cmd/` (new journey commands)
- New spec: `epf-navigation` capability
- Related proposals: `add-emergent-strategy-platform` (semantic engine integration), `expand-strategy-mcp-tools` (MCP tool parity)
- Origin: GitHub issue #35
