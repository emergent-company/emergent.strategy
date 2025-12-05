# Legacy READY Phase Files

This folder contains the original, simplified READY phase files from EPF v1.9.0.

These files have been **superseded** by the new three-stage READY structure:
- `01_insight_opportunity.yaml` (INSIGHT phase)
- `02_strategy_formula.yaml` (STRATEGY phase)
- `03_roadmap_recipe.yaml` (ROADMAP phase - consolidates all three legacy files)

## What was changed:

### Original Structure (Legacy)
- `okrs.yaml` - Simple OKR definitions
- `assumptions.yaml` - Basic assumption list
- `work_packages.yaml` - Basic work package list

### New Structure (Current)
The `03_roadmap_recipe.yaml` file now contains:
- **OKRs section** - Enhanced with measurement methods and baselines
- **Riskiest assumptions section** - Enhanced with types, criticality, and evidence requirements
- **Work packages section** - Enhanced with types, dependencies, traceability, and execution details
- **Solution scaffold** - New: High-level architecture and component mapping
- **Execution plan** - New: Sequencing, critical path, and milestones

## When to use these legacy files:

**Don't use them.** They are kept here only for reference purposes. Always use the new three-stage structure in the parent READY folder.
