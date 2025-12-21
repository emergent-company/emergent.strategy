# Legacy Numbering Files

These files were moved here during the EPF v1.10.1 consistency cleanup (December 2025).

## Why These Files Exist

During the transition from EPF v1.9.x to v1.10.x, the artifact numbering scheme was updated:

| Old Numbering | New Numbering |
|---------------|---------------|
| 02_insight_opportunity | 03_insight_opportunity |
| 03_strategy_formula | 04_strategy_formula |
| 04_roadmap_recipe | 05_roadmap_recipe |

The new canonical structure (as validated by `scripts/validate-instance.sh`) is:

```
00_north_star.yaml
01_insight_analyses.yaml
02_strategy_foundations.yaml
03_insight_opportunity.yaml
04_strategy_formula.yaml
05_roadmap_recipe.yaml
```

## Files in This Directory

- `02_insight_opportunity.yaml` - Old numbering (now 03)
- `03_strategy_formula.yaml` - Old numbering (now 04)
- `04_roadmap_recipe.yaml` - Old numbering (now 05)
- `04_strategy_formula.yaml` - Duplicate that was briefly at wrong position

## Migration Note

If you have an existing instance using the old numbering, rename your files:
- `02_insight_opportunity.yaml` → `03_insight_opportunity.yaml`
- `03_strategy_formula.yaml` → `04_strategy_formula.yaml`
- `04_roadmap_recipe.yaml` → `05_roadmap_recipe.yaml`

The content is compatible; only the numbering changed to reflect the logical flow:
1. North Star (00) - Foundation
2. Insight Analyses (01) - Understanding
3. Strategy Foundations (02) - Living positioning
4. Insight Opportunity (03) - Cycle-specific opportunity
5. Strategy Formula (04) - Cycle-specific strategy
6. Roadmap Recipe (05) - Cycle-specific plan
