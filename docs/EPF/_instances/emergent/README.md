# Emergent - EPF Instance

This folder contains the EPF (Evolving Product Framework) instance for the **Emergent** product.

## Structure

```
emergent/
├── 00_north_star.yaml          # Vision and strategic direction
├── 01_insight_analyses.yaml    # Market and user insights
├── 02_insight_opportunity.yaml # Opportunity identification
├── 02_strategy_foundations.yaml # Strategic foundations
├── 03_insight_opportunity.yaml # Detailed opportunities
├── 03_strategy_formula.yaml    # Strategy formulation
├── 04_roadmap_recipe.yaml      # Roadmap planning
├── 04_strategy_formula.yaml    # Strategy details
├── 05_roadmap_recipe.yaml      # Detailed roadmap
├── feature_definitions/        # Feature definition files (fd-*.yaml)
├── roadmaps/                   # Roadmap artifacts
└── assessments/                # Assessment reports
```

## Getting Started

1. Start with `00_north_star.yaml` to define vision
2. Work through insight and strategy files
3. Create feature definitions in `feature_definitions/`
4. Build roadmaps in `roadmaps/`

## Framework Version

- EPF Framework: v1.9.7
- Schema Version: v1.4.0

## Syncing Updates

Pull framework updates:
```bash
git subtree pull --prefix=docs/EPF epf main --squash -m "EPF: Pull updates"
```
