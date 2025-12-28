# Feature Definitions Directory

This directory contains **feature definition templates** for creating implementation-ready specifications.

**For conceptual overview**, see [Root README - Feature Definitions section](../../../README.md#feature-definitions-the-bridge-to-implementation).

## Template Files

- **`feature_definition_template.yaml`** - Complete YAML template with placeholders and instructional comments (200+ lines)

## Quick Reference

Feature definitions are the **primary output** of EPF consumed by external spec-driven development tools. They translate strategic intent (value models, roadmaps) into actionable specifications.

---

## File Naming Convention

Each feature definition follows this pattern:
```
fd-{number}-{slug}.yaml
```

**Examples**:
- `fd-001-document-ingestion.yaml`
- `fd-007-organization-workspace-management.yaml`
- `fd-012-navigation-information-architecture.yaml`

---

## Template Structure

```yaml
# Feature Definition: {Feature Name}
# EPF v1.9.6+

id: fd-{sequential-number}
name: "{Human-Readable Feature Name}"
slug: "{feature-slug}"
status: draft | ready | in-progress | delivered

# Strategic Context (loose references for traceability)
strategic_context:
  # Which value model L2/L3 paths receive value from this feature (N:M mapping)
  contributes_to:
    - "Product.{L1}.{L2}.{L3}"
    - "Commercial.{L1}.{L2}"
  
  # Which roadmap track(s) this feature belongs to
  tracks:
    - product
    - commercial
  
  # Which assumptions from the roadmap this feature helps validate
  assumptions_tested:
    - asm-p-001
    - asm-c-002

# Core Definition
definition:
  # The "job to be done" - what user need does this satisfy?
  job_to_be_done: |
    {When [situation], I want to [motivation], so I can [expected outcome].}
  
  # High-level description of the solution approach
  solution_approach: |
    {Brief description of HOW this feature will work from a user's perspective.}
  
  # Key capabilities this feature provides
  capabilities:
    - id: cap-001
      name: "{Capability Name}"
      description: "{What this capability does}"
    - id: cap-002
      name: "{Capability Name}"
      description: "{What this capability does}"

# Implementation Guidance (for spec-driven tools to consume)
implementation:
  # User-facing contexts (UI screens, emails, notifications, etc.)
  contexts:
    - id: ctx-001
      type: ui | email | notification | api | report
      name: "{Context Name}"
      description: "{What this context presents or enables}"
  
  # Key user scenarios (similar to user stories)
  scenarios:
    - id: scn-001
      actor: "{User type}"
      action: "{What they do}"
      outcome: "{What happens}"
      acceptance_criteria:
        - "{Criterion 1}"
        - "{Criterion 2}"

# Constraints and Non-Goals
boundaries:
  # What this feature explicitly does NOT do
  non_goals:
    - "{Thing this feature won't do}"
  
  # Technical or business constraints
  constraints:
    - "{Constraint 1}"

# Optional: Dependencies on other features
dependencies:
  requires:
    - fd-{other-feature-id}
  enables:
    - fd-{dependent-feature-id}
```

## Core Principles

For detailed explanation of principles (N:M mapping, tool-agnostic design, lean documentation), see [Root README - Feature Definitions section](../../../README.md#feature-definitions-the-bridge-to-implementation).

**Quick summary:**
- One file per feature (no nested hierarchies)
- N:M mapping to value model (features are cross-cutting)
- Loose references for traceability (not rigid dependencies)
- Tool-agnostic format (parseable by any implementation tool)
- Lean documentation (git handles versioning)

### Status Flow
```
draft → ready → in-progress → delivered
```
- `draft`: Still being defined
- `ready`: Complete enough for implementation to begin
- `in-progress`: Actively being implemented
- `delivered`: Feature is live

---

## Creating Feature Definitions

### Prerequisites

Before creating feature definitions, ensure you have:
1. **Value model components** identified (which L2/L3 paths receive value)
2. **Roadmap Key Results** defined (which KRs does this feature serve)
3. **Riskiest assumptions** identified (what does this feature help validate)

### Creation Process

1. **Read the wizard guidance**: [`wizards/feature_definition.wizard.md`](../../../wizards/feature_definition.wizard.md)
2. **Copy this template** to your instance: `_instances/{product}/FIRE/feature_definitions/`
3. **Fill in content** following template structure
4. **Validate schema**: `scripts/validate-feature-quality.sh features/{file}.yaml`
5. **Review examples**: [`features/`](../../../features/) directory contains reference implementations

### Quality Standards

All feature definitions must meet schema v2.0 requirements:
- ✅ Exactly 4 distinct personas with character names and metrics
- ✅ 3-paragraph narratives per persona (200+ chars each)
- ✅ Scenarios at top-level with rich context/trigger/action/outcome
- ✅ Rich dependency objects with WHY explanations (30+ chars)
- ✅ Comprehensive capabilities, contexts, scenarios coverage

### Validation

```bash
# Validate against schema
./scripts/validate-feature-quality.sh _instances/{product}/FIRE/feature_definitions/{feature}.yaml

# Schema location
schemas/feature_definition_schema.json
```

---

## Resources

- **Conceptual Overview**: [Root README - Feature Definitions](../../../README.md#feature-definitions-the-bridge-to-implementation)
- **Creation Wizard**: [`wizards/feature_definition.wizard.md`](../../../wizards/feature_definition.wizard.md)
- **AI Agent Guidance**: [`wizards/product_architect.agent_prompt.md`](../../../wizards/product_architect.agent_prompt.md)
- **Validation Schema**: [`schemas/feature_definition_schema.json`](../../../schemas/feature_definition_schema.json)
- **Example Features**: [`features/`](../../../features/) directory
- **Quality System Docs**: [`docs/technical/EPF_SCHEMA_V2_QUALITY_SYSTEM.md`](../../../docs/technical/EPF_SCHEMA_V2_QUALITY_SYSTEM.md)
