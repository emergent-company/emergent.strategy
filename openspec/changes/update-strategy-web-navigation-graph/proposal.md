# Change: Replace flat navigation table with EPF navigation graph artifact

## Why

The `strategy-web` spec currently defines the platform's UI topology as a flat markdown table — 38 rows listing screen name, URL, HTTP method, parent, and data hints. This table:

- Has no concept of guards (which personas can reach which screens)
- Has no concept of groups (how screens are organized in navigation)
- Cannot be validated structurally (reachability, orphans, circular parents)
- Cannot be tested with scripted journey scenarios
- Does not integrate with the semantic engine for journey-aware AI reasoning
- Mixes implementation details (HTTP methods, URL patterns) with strategic topology

The `add-navigation-graph-artifact` change introduced a proper navigation graph artifact type with schema validation, structural validation, a state machine runner, MCP tools, and semantic engine integration. The emergent-strategy platform now has its own navigation graph YAML (`FIRE/navigation_graph.yaml`) that models 26 interaction contexts, 39 transitions, 5 guards, and 8 groups — and it has been validated with 8 scripted journey scenarios covering all major user flows.

The `strategy-web` spec should reference this graph as the authoritative topology definition, rather than maintaining a redundant flat table.

## What Changes

- **MODIFIED**: The `strategy-web` navigation section replaces the flat markdown table with a reference to the navigation graph artifact
- **ADDED**: Persona-based reachability requirements (strategist, operator, observer personas reach different context sets)
- **ADDED**: Guard-aware navigation requirement (UI renders based on guard profile)
- **ADDED**: Journey scenario validation requirement (strategy-scenarios must pass against the graph)
- The existing 5 rendering requirements (HTMX, form errors, mobile, PRG, i18n) are unchanged

## Impact

- Affected specs: `strategy-web` (navigation section rewritten)
- Affected code: `apps/strategy-server/internal/web/` (Phase 3 — not yet built)
- Related changes: `add-navigation-graph-artifact` (provides the graph), `add-strategy-server` (Phase 3 web UI)
- Affected artifact: `docs/EPF/_instances/emergent/FIRE/navigation_graph.yaml`
