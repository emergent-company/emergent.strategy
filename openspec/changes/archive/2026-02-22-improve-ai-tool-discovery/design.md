## Context

AI agents using EPF-CLI MCP tools consistently fall into a "Heuristic Override" trap: they successfully use diagnostic tools (`epf_health_check`, `epf_validate_file`) but then bypass generative/guiding tools (`epf_get_wizard_for_task`, `epf_get_wizard`) in favor of their pre-training heuristics. This produces EPF artifacts that violate framework rules.

The problem is model-agnostic — it occurs with Gemini 3.1, and to a lesser degree with Claude models. The fix must be structural (embedded in tool response flow) rather than linguistic (stronger wording in tool descriptions).

**Stakeholders:** AI agents (primary consumers), human users (indirect beneficiaries), EPF-CLI maintainers.

**Constraints:**
- Backward compatible — no existing JSON response fields removed or renamed
- No MCP protocol changes — only response payload changes
- Must work across LLM models without relying on model-specific prompt behavior
- epf-cli remains a linter/validator — it never writes content

## Goals / Non-Goals

**Goals:**
- Make every diagnostic tool response self-contained: if it finds a problem, it tells the agent exactly what tool to call next
- Reduce the "tool count overwhelm" by organizing tools into tiers in agent instructions
- Prevent agents from brute-forcing structural validation errors without consulting framework rules

**Non-Goals:**
- Reducing the actual number of MCP tools (all 49+ remain available)
- Changing MCP protocol or transport
- Adding enforcement gates that block tool calls (agents remain free to call any tool)
- Model-specific prompt engineering in tool descriptions

## Decisions

### Decision 1: Tool Call Suggestions as Structured JSON in Responses

Every diagnostic tool response that identifies fixable issues will include a `required_next_tool_calls` array in its JSON output. Each entry contains `tool` (tool name), `params` (pre-filled parameters), `reason` (why this tool), and `priority` (urgent/recommended/optional).

**Why:** This is the core architectural change. Instead of relying on agents reading tool descriptions and making independent decisions about what to call next, the tool responses themselves form a guided chain. The agent only needs to trust the output of the tool it just called.

**Alternatives considered:**
- *Stronger language in tool descriptions:* Already tried ("MANDATORY", "MUST"), doesn't work across models. Rejected.
- *Gating/blocking tools:* Would break MCP protocol expectations and remove agent autonomy. Rejected.
- *Reducing tool count:* Would remove useful specialized tools. Rejected in favor of tiering.

### Decision 2: Structural vs Surface Error Classification

Validation errors will be classified into two categories:
- **Structural:** Indicates the agent misunderstands EPF architecture (wrong L1/L2/L3 organization, anti-patterns, completely wrong artifact structure). These require wizard consultation.
- **Surface:** Indicates the agent understands the structure but made a typo, missed a field, or used a wrong enum value. These can be fixed directly.

Classification heuristics:
- Type mismatches on top-level YAML sections → structural
- More than 30% of fields failing validation → structural
- Anti-pattern indicators detected → structural
- Individual field enum violations → surface
- Missing individual required fields → surface

**Why:** Agents currently treat all validation errors the same way (brute-force fix each one). Structural errors need a fundamentally different approach — the agent needs to go back and learn the rules first.

### Decision 3: Three-Tier Tool Organization in Agent Instructions

Tools will be assigned tiers in the `epf_agent_instructions` response:

| Tier | Name | Tools | Purpose |
|------|------|-------|---------|
| 1 | Essential | `epf_health_check`, `epf_get_wizard_for_task`, `epf_validate_file` | Entry points — always start here |
| 2 | Guided | `epf_get_wizard`, `epf_get_template`, `epf_get_schema`, strategy query tools | Use after Tier 1 directs you here |
| 3 | Specialized | All remaining 40+ tools | Use for specific tasks as needed |

**Why:** With 49+ tools, agents scan the list superficially and latch onto the first tools that sound useful for their immediate task. Tiering provides a clear "start here" signal without removing any tools.

**Alternatives considered:**
- *Single gateway tool:* A single `epf_what_should_i_do` tool that wraps everything. Rejected because it would duplicate logic and add maintenance burden. Tiering achieves the same cognitive benefit with less code.

### Decision 4: Implementation Location

All changes are in the response JSON payloads, not in tool registration or MCP protocol:

| Component | Change |
|-----------|--------|
| `internal/mcp/server.go` | `handleHealthCheck` populates `required_next_tool_calls` |
| `internal/mcp/server.go` | `handleValidateFile` adds `structural_issue` flag and `recommended_tool` |
| `internal/mcp/server.go` | `handleAgentInstructions` adds `tool_tiers` and `tool_discovery_guidance` |
| `internal/checks/` | Health check result types get `ToolCallSuggestion` field |
| `internal/fixplan/` | Fix plan chunks get optional tool suggestion metadata |

No new tool registrations. No changes to existing tool parameters.

## Risks / Trade-offs

- **Risk:** Agents might ignore the `required_next_tool_calls` field entirely.
  - *Mitigation:* The field is at the root level of the JSON response, not nested in metadata. Testing with multiple models will verify discoverability. Even if some agents ignore it, the current behavior is the baseline — this can only improve things.

- **Risk:** Pre-filled parameters in tool suggestions might become stale if tool APIs evolve.
  - *Mitigation:* The suggestion mapping is centralized in one function, making it easy to update when tool signatures change.

- **Risk:** Tiered tool organization might cause agents to think Tier 3 tools are "forbidden."
  - *Mitigation:* Tier descriptions explicitly state all tools are available; tiers indicate recommended starting points, not access control.

## Open Questions

- Should the `required_next_tool_calls` field name be standardized across the MCP ecosystem, or is this EPF-specific? (Current answer: EPF-specific, revisit if MCP develops conventions for tool chaining.)
- Should we add a `confidence` field to tool suggestions to indicate how strongly the tool recommends the next step? (Current answer: Start without it, add if needed based on testing.)
