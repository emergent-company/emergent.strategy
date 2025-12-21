# Feature Definitions Directory

This directory contains feature definition files that bridge EPF's strategic artifacts to implementation tools.

## Purpose

Feature definitions are the **primary output** of EPF consumed by external spec-driven development tools. They translate strategic intent (from value models and roadmaps) into actionable specifications that implementation tools can parse and execute.

## File Naming Convention

Each feature definition is a single YAML file:
```
{feature-slug}.yaml
```

Examples:
- `digital-twin-ecosystem.yaml`
- `bim-service-integration.yaml`
- `predictive-control-system.yaml`

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

## Principles

### 1. One File Per Feature
Each feature gets its own YAML file. No nested folder hierarchies. Git handles history.

### 2. N:M Mapping to Value Model
Features are cross-cutting - they often contribute value to multiple L2/L3 components. Don't force 1:1 mapping.

### 3. Loose References
The `contributes_to`, `tracks`, and `assumptions_tested` fields are pointers for traceability, not rigid dependencies. They help AI agents and humans understand context.

### 4. Tool-Agnostic Format
EPF doesn't know which spec-driven tool will consume these definitions. The structure should be parseable by any tool that needs to understand WHAT to build.

### 5. Lean Documentation
- Git handles versioning - no version fields needed
- No change history in the file - git log provides this
- Minimal structure - only what's needed for implementation tools
- Let AI infer context from git history and related artifacts

### 6. Status Flow
```
draft → ready → in-progress → delivered
```
- `draft`: Still being defined
- `ready`: Complete enough for implementation to begin
- `in-progress`: Actively being implemented
- `delivered`: Feature is live

## Relationship to Other Artifacts

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Value Model    │     │  Feature Definition  │     │  Spec-Driven Tool   │
│  (WHY valuable) │────▶│  (WHAT to build)     │────▶│  (HOW to implement) │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
         │                        │                           │
         │                        │                           │
         ▼                        ▼                           ▼
   "Value generation"     "Sharp interface"        "Implementation specs,
    perspective"          between EPF and          code, tests, etc."
                          external tools"
```

## Creating Feature Definitions

Feature definitions should be created when:
1. A work package in the roadmap is ready for detailed specification
2. The value model components that will receive value are identified
3. The team is ready to hand off to implementation (or implementation tools)

Use the Product Architect wizard prompt to help create feature definitions interactively.
