## Context

EPF has workflow schemas for entity lifecycles but no artifact for modeling the **desired customer journey topology** — the interaction contexts a user should be able to inhabit and how they should be able to move between them.

This gap was exposed while building 21st-captable, where a navigation graph emerged as a critical architectural element. The insight: the customer journey topology is a strategic concern. It defines the desired end state of the product's interaction surface — where the product should be when fully delivered.

The navigation graph is the **topology** — the map of all intended interaction contexts and paths. It defines the wanted state. Implementations work toward closing the gap between current state and this definition. The graph is executable within EPF tooling via a state machine runner, allowing the strategy author to verify that the specification consistently describes a coherent desired end state.

### Stakeholders

- Strategy authors (defining and verifying the desired customer journey topology during FIRE phase)
- AI agents (journey-aware reasoning about the product's intended interaction surface)

## Goals / Non-Goals

**Goals:**
- Define a medium-agnostic schema for user journey topology
- Enable structural validation (reachability, orphans, guard consistency)
- Enable strategy authors to explore and verify the desired journey topology via the state machine runner
- Integrate with the semantic engine for journey-aware search and impact analysis
- Support multi-service composition for products spanning multiple repos

**Non-Goals:**
- Prescribing medium-specific fields (URL patterns, HTTP methods, icons, sidebar configuration) — implementations carry those in their own layer or in the context `properties` escape hatch
- Runtime state machine execution (that belongs in application code)
- UI rendering or component specification (the graph defines topology, not appearance)
- Replacing the existing workflow schema (workflows model entity lifecycles, navigation models user journeys — they coexist)

## Decisions

### Decision: Strategic product documentation, not implementation driver

The EPF navigation graph is **strategic documentation** — it defines the intended customer experience topology as a product planning artifact, alongside feature definitions and value models. It does NOT drive or generate implementations.

A context like `{id: "cap-table", title: "Cap Table", group: "equity", mode: "landing", scoped: true}` is a strategic declaration: the product intends for there to be a place called "Cap Table" in the equity section, acting as the entry point for that section, scoped to an entity. How an implementation delivers this — as a web page, a CLI view, a mobile tab — is entirely outside EPF's concern.

**EPF's role is to validate the specification itself:** Is the topology internally consistent? Are all contexts reachable? Do guards make sense? Can a defined customer journey complete? The runner executes the strategic specification to verify these properties.

**The implementation's role** is to deliver the customer value defined by the specification. Whether it reads the YAML, copies the structure into code, or builds something completely different is its own concern. EPF validates whether the implementation aligns with the strategic intent — not by driving the implementation, but by providing a verifiable specification that the implementation can be tested against.

**This is the same relationship EPF has with all its artifacts.** A feature definition doesn't generate code — it defines what the feature should accomplish. A value model doesn't build the product — it defines how value should be organized. The navigation graph doesn't build the UI — it defines what the customer journey should be.

### Decision: YAML artifact in FIRE phase (not code-embedded)

The navigation graph lives as a YAML file in `FIRE/navigation_graph.yaml` (or `FIRE/navigation/*.yaml` for multi-graph products), validated against a JSON Schema like all other EPF artifacts.

**Why not keep it in code (like 21st-captable)?** The graph is a strategic artifact — it defines what interaction contexts exist and how users traverse them. This is a product design decision, not an implementation detail. By putting it in EPF, it becomes plannable during FIRE, validatable by the CLI, queryable by AI agents, and diffable across versions.

**Migration path:** Services that already have code-based graphs (like 21st-captable) extract the strategic topology to YAML. The implementation continues to own medium-specific fields (URL patterns, icons, handler bindings) in its own code or configuration, reading the topology from the EPF artifact. The graph becomes the source of truth for **what contexts exist**; the code maps them to **how they render**.

**Alternatives considered:**
- Code-only (current 21st approach): Works for single-service, but not queryable by EPF tools, not validatable during strategy phase, not composable across services.
- Separate tool outside EPF: Would fragment the strategy layer. The journey topology is as strategic as the value model.

### Decision: Guards are declarative references, not executable logic

Guards in the navigation graph are named conditions with a type and description (e.g., `{id: "shares-allowed", type: "entity-state", description: "Company must have shareholder registry"}`). They do NOT contain executable logic.

The runtime implementation maps guard IDs to actual checks (database queries, domain logic, role lookups). The EPF artifact declares the semantic meaning — what condition exists and why — not how to evaluate it.

This keeps the schema medium-agnostic and prevents coupling the strategic artifact to a specific tech stack.

### Decision: Guard groups for domain-mode filtering

Products often have guards that collectively define a domain mode. In 21st-captable, guards `shares-allowed`, `share-classes`, and `shares-exist` collectively mean "requires shareholder registry". The runtime uses this grouping for filtering which sections are visible without evaluating each guard individually.

The schema captures this via an optional `guard_group` field on guard definitions. Guards in the same group collectively imply a domain mode. The journey walk and reachability tools accept a guard profile that specifies which groups pass, rather than requiring individual guard evaluation.

### Decision: Composition via portal edges and graph imports

For multi-service products, each service owns its sub-graph. A product-level graph declares imports and portal edges:

```yaml
imports:
  - service: twentyfirst
    path: navigation_graph.yaml
  - service: 21st-captable
    path: navigation_graph.yaml

portal_edges:
  - id: portal-to-captable
    source: twentyfirst:company-detail
    target: 21st-captable:cap-table
    guard: shares-allowed
```

Portal edge targets use `service:context-id` notation. Validation checks that both endpoints resolve.

**Alternatives considered:**
- Single unified graph: Too tightly coupled for independently deployed services.
- Pure runtime composition: Loses the strategic planning value — you can't reason about the product-wide journey at the EPF level.

### Decision: General-purpose graph state machine runner

The navigation graph is not just a static artifact to validate — it is **executable**. EPF provides a state machine runner that loads any graph artifact (navigation graph or workflow), maintains current state, evaluates guards against a profile, and tracks traversal history.

This is the same mathematical structure: directed graph with nodes, edges, and guard predicates. The runner is graph-type agnostic — it operates on the common primitives. A navigation graph adapter maps contexts/transitions to nodes/edges. A workflow adapter maps states/transitions to the same model. One engine, multiple graph types.

Two execution modes serve different needs:

- **Interactive walk** (TUI): The strategy author explores the defined journey topology, toggling guard profiles to simulate different user types ("what can a free-tier member reach?"), and discovers dead ends, awkward flows, or contradictions in the specification. This verifies that the desired end state is coherent and complete.
- **Scripted run**: Customer journey scenarios are defined as YAML files (a sequence of transitions + guard profile + expected outcome) and executed as part of EPF validation. "Can a shareholder-registry user reach the waterfall in 3 steps?" becomes a verifiable property of the specification.

**Why a runner instead of just validation?** Structural validation (reachability, orphans) tells you the graph is well-formed. The runner tells you the specification **consistently describes the desired end state**. A specification can be structurally valid but strategically broken — a critical path might require 12 steps, or a guard combination might make an important context unreachable for a common user type. These are only discoverable by executing the graph. The runner gives the strategy author confidence that the defined topology is what they intend.

**Why graph-type agnostic?** The existing workflow schema models entity lifecycles with the same structure (states, transitions, guards). Building a navigation-specific runner would duplicate logic. A general runner means workflow definitions also become executable — you can simulate an entity's lifecycle journey through its states.

**Alternatives considered:**
- Navigation-specific TUI only: Would not support scripted testing or workflow graphs.
- Separate runners per graph type: Duplicated logic for the same mathematical structure.

## Risks / Trade-offs

- **Abstraction gap:** The strategic graph may feel too abstract for developers who want to auto-generate routes from it. **Mitigation:** The `properties` map allows implementations to attach medium-specific metadata. The strategic graph plus implementation metadata together replicate what 21st-captable has today. The separation is conceptual, not a loss of capability.

- **Schema complexity vs expressiveness:** The schema needs to be rich enough to model real products (60+ contexts, guards with conditions, grouping) without becoming unwieldy for simple products. **Mitigation:** Most fields are optional. A 5-context graph with 4 transitions is valid and useful.

- **Multi-service composition is speculative:** The portal edge model hasn't been tested across real services yet. **Mitigation:** Ship single-graph support first (tasks 1-5). Composition (task 6) is a separate phase that can be redesigned based on real usage.

- **Guard semantics are product-specific:** Guard types (role, tier, entity-state) vary by product. **Mitigation:** The schema defines guard structure (id, type, description) without prescribing guard types. Products define their own guard vocabulary.

## Open Questions

- Should the navigation graph support versioning (e.g., "in v2.0 we add these contexts")? Or is that handled by git history?
- How does the graph relate to feature definitions? Should a feature definition declare which contexts it introduces? Or is that a mapping maintained separately?
- Should the journey walk command support "personas" (walking the graph as a specific persona with known role/tier) by reading from EPF insight analyses?
- What is the right pattern for implementations to extend the graph? Should there be a companion `navigation_implementation.yaml` that adds medium-specific fields keyed by context ID, or is the `properties` map sufficient?
