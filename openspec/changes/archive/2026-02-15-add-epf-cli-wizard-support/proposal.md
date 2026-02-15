# Proposal: Add Wizard/Prompt Support to epf-cli

**Date:** February 2025
**Status:** Draft
**Author:** AI Assistant (ProductFactoryOS Session)

---

## 1. Executive Summary

This proposal adds wizard/prompt delivery capabilities to `epf-cli`, enabling AI agents to discover and retrieve EPF workflow guidance dynamically. This complements the existing schema, template, and definition delivery mechanisms, completing the "EPF as API" vision for ProductFactoryOS.

## 2. Problem Statement

### Current Gap

epf-cli currently provides:

- **Schemas:** `epf_list_schemas`, `epf_get_schema` - validation rules
- **Templates:** `epf_list_artifacts`, `epf_get_template` - starting structures
- **Definitions:** `epf_list_definitions`, `epf_get_definition` - examples & canonical content

**Missing:** Wizard/prompt delivery - the "how to use" guidance that helps agents guide users through EPF workflows.

### Why This Matters

EPF's `wizards/` directory contains 18 agent prompts that guide users through strategic workflows:

- **Onboarding:** `start_epf.agent_prompt.md` - entry point for new users
- **Phase Agents:** `lean_start`, `pathfinder`, `product_architect`, `synthesizer`
- **READY Sub-Wizards:** `01_trend_scout` through `04_problem_detective`
- **Specialized:** `balance_checker`, `aim_trigger_assessment`, `feature_definition.wizard`

Currently, agents must:

1. Know the wizards exist
2. Know where to find them in the repo
3. Read them directly from the filesystem

This breaks the "epf-cli as the single interface" principle and doesn't work in scenarios where:

- Agents don't have direct filesystem access (VS Code Copilot, Claude Desktop)
- Users are working in product repos that sync EPF schemas but not wizards
- Mixed-agent setups need consistent prompt injection

## 3. Use Cases

### 3.1 ProductFactoryOS (OpenCode)

OpenCode runs with a mixed-agent prompt that injects specialized EPF knowledge. With wizard delivery:

```
# Current: Hardcoded prompt references
"When user says 'start epf', read wizards/start_epf.agent_prompt.md"

# Proposed: Dynamic discovery
"When user mentions EPF workflow, use epf_get_wizard_for_task(task) to find appropriate wizard"
```

### 3.2 VS Code Copilot / Cursor

Editors using Copilot can configure epf-cli as an MCP server:

```json
// .vscode/settings.json
{
  "mcp.servers": {
    "epf-cli": {
      "command": "epf-cli",
      "args": ["serve", "--schemas-dir", "/path/to/EPF/schemas"]
    }
  }
}
```

Agent can then dynamically fetch wizards:

```
User: "Help me create a feature definition"
Agent: [calls epf_get_wizard_for_task("create feature definition")]
       → Returns feature_definition.wizard.md content
Agent: [follows wizard instructions to guide user]
```

### 3.3 Claude Desktop / Other MCP Clients

Any MCP-compatible client can access EPF wizards:

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "epf-cli": {
      "command": "/path/to/epf-cli",
      "args": ["serve"]
    }
  }
}
```

### 3.4 "Vibe Coding" Support

For users doing exploratory product development, the agent can:

1. Detect user intent from conversation
2. Recommend appropriate wizard
3. Guide through workflow conversationally
4. Validate outputs against schemas

## 4. Proposed Design

### 4.1 Wizard Types

Based on `wizards/README.md`, we categorize wizards:

| Type               | Naming Pattern         | Purpose                                              |
| ------------------ | ---------------------- | ---------------------------------------------------- |
| `agent_prompt`     | `*.agent_prompt.md`    | Conversational AI personas (adaptive, context-aware) |
| `wizard`           | `*.wizard.md`          | Step-by-step guides (structured, sequential)         |
| `ready_sub_wizard` | `##_*.agent_prompt.md` | READY phase sub-wizards (numbered sequence)          |

### 4.2 Wizard Metadata

Parse from wizard files (front matter or content analysis):

```go
type WizardInfo struct {
    Name         string      // "start_epf", "pathfinder"
    Type         WizardType  // agent_prompt, wizard, ready_sub_wizard
    Phase        Phase       // READY, FIRE, AIM, or "" for onboarding
    Purpose      string      // Short description
    TriggerPhrases []string  // From "When to Use" section
    Duration     string      // "5-10 min", "8-12 hours"
    Outputs      []string    // What artifacts it creates
    FilePath     string
    Content      string
}
```

### 4.3 MCP Tools

#### `epf_list_wizards`

List available wizards with optional filtering.

**Parameters:**

- `phase` (optional): Filter by phase (READY, FIRE, AIM)
- `type` (optional): Filter by type (agent_prompt, wizard, ready_sub_wizard)

**Response:**

```json
{
  "wizards": [
    {
      "name": "start_epf",
      "type": "agent_prompt",
      "phase": "",
      "purpose": "Interactive onboarding for new users",
      "duration": "5-10 min",
      "triggers": ["start epf", "help me with epf", "what is epf?"]
    },
    {
      "name": "pathfinder",
      "type": "agent_prompt",
      "phase": "READY",
      "purpose": "Complete READY phase with comprehensive analysis",
      "duration": "8-12 hours",
      "triggers": ["full planning", "comprehensive ready phase"]
    }
  ],
  "total": 17
}
```

#### `epf_get_wizard`

Get full wizard content by name.

**Parameters:**

- `name` (required): Wizard name (e.g., "start_epf", "pathfinder", "feature_definition")

**Response:**

```json
{
  "name": "start_epf",
  "type": "agent_prompt",
  "phase": "",
  "purpose": "Interactive onboarding for new users",
  "content": "# AI Knowledge Agent: Start EPF...",
  "triggers": ["start epf", "help me with epf"],
  "duration": "5-10 min",
  "related_wizards": ["lean_start", "pathfinder"],
  "related_templates": [],
  "related_schemas": []
}
```

#### `epf_get_wizard_for_task`

Recommend a wizard based on user task description.

**Parameters:**

- `task` (required): Description of what user wants to do

**Response:**

```json
{
  "task": "create feature definition",
  "recommended_wizard": "feature_definition",
  "confidence": "high",
  "reason": "User wants to create a feature, matches feature_definition.wizard trigger",
  "alternatives": [
    {
      "name": "product_architect",
      "reason": "For creating multiple features with value model integration"
    }
  ]
}
```

#### `epf_list_agent_instructions`

List EPF agent instruction files (for full context injection).

**Response:**

```json
{
  "instructions": [
    {
      "name": "AGENTS.md",
      "purpose": "Full AI agent instructions for EPF",
      "scope": "comprehensive"
    },
    {
      "name": "copilot-instructions.md",
      "purpose": "Quick reference for daily operations",
      "scope": "quick-reference"
    },
    {
      "name": ".ai-agent-instructions.md",
      "purpose": "Framework maintenance protocol",
      "scope": "maintenance"
    }
  ]
}
```

#### `epf_get_agent_instructions`

Get full agent instruction file content.

**Parameters:**

- `name` (required): Instruction file name

### 4.4 CLI Commands

```bash
# List all wizards
epf-cli wizards list
epf-cli wizards list --phase READY
epf-cli wizards list --type agent_prompt

# Show wizard content
epf-cli wizards show start_epf
epf-cli wizards show feature_definition

# Recommend wizard for task
epf-cli wizards recommend "create feature definition"
epf-cli wizards recommend "analyze market trends"

# Agent instructions
epf-cli agents list
epf-cli agents show AGENTS.md
```

### 4.5 Implementation Structure

```
apps/epf-cli/internal/
├── wizard/
│   ├── types.go           # WizardInfo, WizardType, etc.
│   ├── loader.go          # Load wizards from EPF directory
│   ├── parser.go          # Parse wizard metadata from markdown
│   ├── recommender.go     # Task-to-wizard matching logic
│   └── wizard_test.go     # Tests
```

## 5. Wizard Metadata Extraction

Wizards don't have YAML front matter, so we parse from content:

### 5.1 Trigger Phrases

From `## When to Use This Wizard` or `## Trigger phrases:` sections:

```markdown
**Trigger phrases:**

- "start epf"
- "begin epf"
- "help me with epf"
```

### 5.2 Duration

From tables or inline mentions:

```markdown
| Wizard      | Purpose                | Duration |
| ----------- | ---------------------- | -------- |
| `start_epf` | Interactive onboarding | 5-10 min |
```

### 5.3 Outputs

From output descriptions or artifact mentions:

```markdown
**What you'll create:**

- North Star + lightweight artifacts
```

### 5.4 Purpose

From first heading or introductory paragraph:

```markdown
# AI Knowledge Agent: Start EPF (Interactive Onboarding)

You are the **EPF Welcome Guide**, helping new users understand what EPF is...
```

## 6. Task-to-Wizard Matching

The `epf_get_wizard_for_task` tool uses keyword matching and fuzzy search:

### 6.1 Trigger Phrase Matching

Direct match against wizard trigger phrases:

```go
func (r *Recommender) Match(task string) *Recommendation {
    taskLower := strings.ToLower(task)

    for _, wizard := range r.wizards {
        for _, trigger := range wizard.TriggerPhrases {
            if strings.Contains(taskLower, strings.ToLower(trigger)) {
                return &Recommendation{
                    Wizard: wizard,
                    Confidence: "high",
                    Reason: fmt.Sprintf("Matches trigger phrase: %s", trigger),
                }
            }
        }
    }
    // ... fuzzy matching fallback
}
```

### 6.2 Keyword Matching

Match task keywords to wizard purposes:

| Keywords                          | Recommended Wizard                          |
| --------------------------------- | ------------------------------------------- |
| "feature", "create feature"       | `feature_definition` or `product_architect` |
| "roadmap", "planning", "strategy" | `pathfinder` or `lean_start`                |
| "trend", "market analysis"        | `01_trend_scout`                            |
| "validate", "check", "review"     | `balance_checker`                           |
| "assess", "retrospective"         | `synthesizer`                               |

### 6.3 Phase Detection

If task mentions a phase, filter to that phase's wizards:

```go
if strings.Contains(taskLower, "ready phase") {
    wizards = r.filterByPhase(wizards, PhaseREADY)
}
```

## 7. Integration with Existing Tools

### 7.1 Cross-References

Wizards often reference templates and schemas. The `epf_get_wizard` response includes:

```json
{
  "related_templates": ["feature_definition", "north_star"],
  "related_schemas": ["feature_definition", "north_star"],
  "related_guides": ["FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md"]
}
```

### 7.2 Workflow Integration

Agent can chain tools:

```
1. epf_get_wizard_for_task("create feature") → feature_definition.wizard
2. epf_get_template("feature_definition") → YAML template
3. [Agent guides user through wizard steps]
4. epf_validate_content(content, "feature_definition") → validation
```

## 8. Benefits

### 8.1 For ProductFactoryOS

- Dynamic wizard discovery without hardcoding
- Consistent prompt injection across agents
- Version-synced guidance (wizards update with EPF)

### 8.2 For External Agents

- Any MCP-compatible agent can access EPF guidance
- No filesystem access required
- Works in sandboxed environments (VS Code, Claude Desktop)

### 8.3 For Users

- "Vibe coding" support - agents can guide naturally
- Consistent experience across editors/agents
- Always up-to-date guidance

## 9. Non-Goals

### 9.1 Wizard Execution

epf-cli provides wizard content but doesn't execute wizard logic. The agent interprets and follows the wizard instructions.

### 9.2 Wizard Authoring

epf-cli doesn't create or modify wizards. Wizards are authored in the EPF repository and delivered read-only.

### 9.3 Conversation State

epf-cli doesn't track wizard progress or conversation state. That's the agent's responsibility.

## 10. Design Principles Alignment

### 10.1 Git is God

Wizards are markdown files in the git repository. No database state.

### 10.2 Agent as Writer, Tool as Linter

epf-cli delivers wizard content (reference material). Agents interpret and guide. epf-cli validates outputs.

### 10.3 Schema First

Wizard metadata is parsed consistently. Future: Add optional YAML front matter to wizards for explicit metadata.

## 11. Future Enhancements

### 11.1 YAML Front Matter (Optional)

Add structured metadata to wizard files:

```yaml
---
name: start_epf
type: agent_prompt
phase: ''
purpose: Interactive onboarding for new users
duration: 5-10 min
triggers:
  - start epf
  - help me with epf
outputs:
  - routing decision
related:
  - lean_start
  - pathfinder
---
# AI Knowledge Agent: Start EPF
```

### 11.2 Wizard Versioning

Track wizard versions alongside schema versions for compatibility.

### 11.3 Context-Aware Recommendations

Consider instance state when recommending wizards:

- "You have no north_star.yaml - recommend `start_epf` or `lean_start`"
- "Your roadmap is complete - recommend `balance_checker`"

## 12. Success Metrics

1. **Adoption:** ProductFactoryOS uses wizard tools instead of hardcoded paths
2. **Discoverability:** Agents can recommend appropriate wizard >80% of the time
3. **Completeness:** All 17+ wizards are accessible via MCP tools
4. **Performance:** Wizard retrieval <100ms

## 13. Implementation Timeline

| Phase | Tasks                                                   | Duration |
| ----- | ------------------------------------------------------- | -------- |
| 1     | Create `internal/wizard/` package with types and loader | 1 day    |
| 2     | Implement metadata parser                               | 1 day    |
| 3     | Add MCP tools (`epf_list_wizards`, `epf_get_wizard`)    | 1 day    |
| 4     | Add `epf_get_wizard_for_task` with recommender          | 1 day    |
| 5     | Add CLI commands                                        | 0.5 day  |
| 6     | Testing and documentation                               | 0.5 day  |

**Total:** ~5 days

## 14. Appendix: Current Wizard Inventory

| Wizard                    | Type             | Phase | Purpose                            |
| ------------------------- | ---------------- | ----- | ---------------------------------- |
| `start_epf`               | agent_prompt     | -     | Interactive onboarding             |
| `lean_start`              | agent_prompt     | READY | Minimal viable READY (Level 0-1)   |
| `pathfinder`              | agent_prompt     | READY | Complete READY phase (Level 2+)    |
| `product_architect`       | agent_prompt     | FIRE  | Feature definitions + value models |
| `synthesizer`             | agent_prompt     | AIM   | Assessment + calibration           |
| `01_trend_scout`          | ready_sub_wizard | READY | Rapid trend analysis               |
| `02_market_mapper`        | ready_sub_wizard | READY | Market dynamics analysis           |
| `03_internal_mirror`      | ready_sub_wizard | READY | Internal capability assessment     |
| `04_problem_detective`    | ready_sub_wizard | READY | Deep problem investigation         |
| `aim_trigger_assessment`  | agent_prompt     | AIM   | Decide if immediate AIM warranted  |
| `balance_checker`         | agent_prompt     | READY | Roadmap viability assessment       |
| `feature_definition`      | wizard           | FIRE  | Step-by-step feature creation      |
| `feature_enrichment`      | wizard           | FIRE  | Enhance existing features          |
| `context_sheet_generator` | wizard           | -     | User context documentation         |
| `roadmap_enrichment`      | wizard           | READY | Enhance roadmap artifacts          |

---

## References

- EPF Wizards README: `/docs/EPF/wizards/README.md`
- MASTER_PLAN: `/docs/product-factory-os/MASTER_PLAN.md`
- epf-cli AGENTS.md: `/apps/epf-cli/AGENTS.md`
- MCP Server Implementation: `/apps/epf-cli/internal/mcp/server.go`
