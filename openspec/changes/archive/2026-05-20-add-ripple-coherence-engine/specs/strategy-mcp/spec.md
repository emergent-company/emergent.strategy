## ADDED Requirements

### Requirement: Ripple Analysis Tools

The MCP server SHALL expose ripple analysis tools for impact preview and
coherence checking. These tools enable AI agents to understand the
interconnected nature of the strategy graph and guide humans through
ripple resolution.

#### Scenario: Propose change tool available

- **WHEN** MCP tools are discovered
- **THEN** `propose_change` is listed with description "Preview the blast radius of a proposed artifact change before committing" (<=120 chars)

#### Scenario: Coherence check tool available

- **WHEN** MCP tools are discovered
- **THEN** `coherence_check` is listed with description "Full-graph coherence analysis combining structural and semantic signals" (<=120 chars)

#### Scenario: Generate ripple batch tool available

- **WHEN** MCP tools are discovered
- **THEN** `generate_ripple_batch` is listed with description "Assemble context for AI-assisted ripple resolution of active signals" (<=120 chars)

### Requirement: Signal Management Tools

The MCP server SHALL expose signal lifecycle management tools for listing,
acknowledging, resolving, and dismissing ripple signals.

#### Scenario: Signal tools discoverable

- **WHEN** MCP tools are discovered
- **THEN** `list_signals`, `acknowledge_signal`, `resolve_signal`, and `dismiss_signal` are listed with agent-friendly descriptions (<=120 chars each)

#### Scenario: Signal tools require instance context

- **WHEN** `list_signals` is called without `instance_id`
- **THEN** the system returns an error indicating instance_id is required
