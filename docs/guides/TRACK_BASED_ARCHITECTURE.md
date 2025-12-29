# Track-Based Roadmap Architecture

> **Last updated**: EPF v1.13.0 | **Status**: Current

## Overview

As of EPF v1.9.7, the roadmap (`05_roadmap_recipe.yaml`) is structured around **four parallel tracks** that align directly with the four value models in the FIRE phase:

1. **Product Track** → `product.value_model.yaml`
2. **Strategy Track** → `strategy.value_model.yaml`
3. **Org/Ops Track** → `org_ops.value_model.yaml`
4. **Commercial Track** → `commercial.value_model.yaml`

## Key Principle: KRs as the Meta Work Package

**Key Results (KRs) are the lowest level that EPF defines.** They are measurable strategic milestones that represent meaningful progress toward objectives.

**Work packages, tasks, and tickets are the responsibility of spec-driven development tools** (Linear, Jira, GitHub Projects, Notion, etc.). These tools:
- Consume EPF's strategic context (OKRs, KRs, assumptions)
- Create implementation-level work items
- Track day-to-day execution progress
- Report back results for assessment

This separation ensures EPF remains **strategic and directional** while implementation tools handle **tactical and operational** concerns.

```
EPF Domain (Strategic)          Implementation Tools Domain (Tactical)
─────────────────────────────   ─────────────────────────────────────
North Star                      
    ↓                           
Analyses & Opportunity          
    ↓                           
Strategy Formula                
    ↓                           
OKRs by Track                   
    ↓                           
Key Results ─────────────────→  Work Packages / Epics
                                    ↓
                                Tasks / Tickets
                                    ↓
                                Pull Requests
                                    ↓
                                Deployments
```

## Why Track-Based Structure?

**Problem:** A monolithic roadmap structure didn't reflect the reality that product development happens across multiple parallel workstreams with different owners, different success metrics, and different execution rhythms.

**Solution:** Organize the roadmap by tracks so that:
- Each track can have its own OKRs and assumptions
- Different teams can own different tracks
- Cross-track dependencies are explicit and manageable
- Assessment and learning happen at the track level

## Structure

```yaml
roadmap:
  id: "roadmap-001"
  strategy_id: "strat-001"
  
  tracks:
    product:
      track_objective: "High-level goal for product track"
      okrs: [...]           # Product-specific OKRs (okr-p-001)
      riskiest_assumptions: [...] # Product assumptions (asm-p-001)
      solution_scaffold:    # High-level component architecture (comp-p-001)
        key_components: [...]
    
    strategy: {...}         # Strategy track (okr-s-001, kr-s-001, etc.)
    org_ops: {...}          # Org/Ops track (okr-o-001, kr-o-001, etc.)
    commercial: {...}       # Commercial track (okr-c-001, kr-c-001, etc.)
  
  cross_track_dependencies:
    - from_kr: "kr-c-001"
      to_kr: "kr-p-001"
      dependency_type: "requires"
      description: "Commercial validation requires product prototype"
  
  execution_plan:
    critical_path: ["product:kr-p-001", "commercial:kr-c-001"]
    parallel_tracks: [...]
    key_milestones: [...]
```

## ID Naming Convention

Each track uses a consistent prefix for all IDs:

| Track | Prefix | Example IDs |
|-------|--------|-------------|
| **Product** | `p` | `okr-p-001`, `kr-p-001`, `asm-p-001`, `comp-p-001` |
| **Strategy** | `s` | `okr-s-001`, `kr-s-001`, `asm-s-001`, `comp-s-001` |
| **Org/Ops** | `o` | `okr-o-001`, `kr-o-001`, `asm-o-001`, `comp-o-001` |
| **Commercial** | `c` | `okr-c-001`, `kr-c-001`, `asm-c-001`, `comp-c-001` |

This makes it immediately clear which track an item belongs to and prevents ID collisions.

## Cross-Track Dependencies

Dependencies between tracks are expressed at the **Key Result level** and are typed:

- **requires**: Blocking dependency (B requires A to be complete)
- **informs**: Information flow (B benefits from A's outputs but isn't blocked)
- **enables**: Capability dependency (A creates capability that B uses)

Example:
```yaml
cross_track_dependencies:
  - from_kr: "kr-p-001"        # Product prototype capability
    to_kr: "kr-c-001"          # Commercial validation
    dependency_type: "requires"
    description: "Commercial team needs product prototype for prospect demos"
```

This helps spec-driven development tools understand sequencing constraints when creating work packages.

## Execution Planning

The execution plan provides a cross-track view at the **Key Result level**:

1. **Critical Path**: The longest sequence of dependent KRs across all tracks
2. **Parallel Tracks**: Which KRs can be pursued concurrently
3. **Key Milestones**: Major checkpoints that involve KRs from multiple tracks

Example:
```yaml
execution_plan:
  critical_path: 
    - "product:kr-p-001"      # Product prototype (week 1-2)
    - "commercial:kr-c-001"   # Commercial validation (week 3-4)
  
  parallel_tracks:
    - name: "Product & Strategy Discovery"
      key_results: ["product:kr-p-001", "strategy:kr-s-001"]
      timeframe: "Weeks 1-2"
    
    - name: "Commercial Validation"
      key_results: ["commercial:kr-c-001"]
      timeframe: "Weeks 3-4"
      depends_on: ["product:kr-p-001"]
```

## Assessment by Track

In the AIM phase, assessments are organized by track and focus on **Key Result outcomes**:

```yaml
okr_assessments:
  product:
    - okr_id: "okr-p-001"
      assessment: "Product OKR assessment"
      key_result_outcomes:
        - kr_id: "kr-p-001"
          target: "15% increase in WAU"
          actual: "8% increase"
          status: "partially_met"
          learnings:
            - "Onboarding friction is the main blocker"

strategic_insights:
  - "How the four tracks worked together"
  - "Cross-track dependencies that created value or friction"
```

## Handoff to Implementation Tools

When a roadmap is approved, the Key Results are handed off to spec-driven development tools which:

1. **Parse the roadmap** to understand strategic context
2. **Create work packages** (epics, projects) for each KR
3. **Break down into tasks** based on solution_scaffold components
4. **Link assumptions** to discovery/validation work
5. **Track progress** and report completion status

EPF does NOT prescribe which tools to use. The roadmap is tool-agnostic - any spec-driven system can consume it.

## Benefits

1. **Clarity of Ownership**: Each track has clear owners (Product team, Strategy team, etc.)
2. **Parallel Execution**: Teams can work in parallel with explicit coordination points
3. **Granular Assessment**: Learn at the track and KR level what worked and what didn't
4. **Realistic Planning**: Reflects how work actually happens in organizations
5. **Traceability**: Clear line from track → value model → implementation
6. **Tool Flexibility**: Implementation tools can evolve independently of strategy

## See Also

- `05_roadmap_recipe.yaml` - Complete example with all four tracks
- `schemas/roadmap_recipe_schema.json` - JSON schema for validation
- `MAINTENANCE.md` - Section 3 for traceability rules
- `wizards/pathfinder.agent_prompt.md` - Guidance for creating track-based roadmaps

## Related Resources

- **Template**: [05_roadmap_recipe.yaml](../../templates/READY/05_roadmap_recipe.yaml) - Template for track-based roadmaps with OKRs and milestones
- **Schema**: [roadmap_recipe_schema.json](../../schemas/roadmap_recipe_schema.json) - Validation schema for roadmap structure
- **Schema**: [value_model_schema.json](../../schemas/value_model_schema.json) - Schema for FIRE phase value models that roadmaps reference
- **Wizard**: [pathfinder.agent_prompt.md](../../wizards/pathfinder.agent_prompt.md) - Interactive guidance for creating track-based roadmaps
- **Guide**: [STRATEGY_FOUNDATIONS_GUIDE.md](./STRATEGY_FOUNDATIONS_GUIDE.md) - Strategy foundations that inform roadmap priorities
