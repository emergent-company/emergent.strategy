# EPF Instances

This directory is intentionally empty in the canonical EPF framework repository.

## Where are the instances?

Product-specific instances live in their respective product repositories:
- `twentyfirst/_instances/twentyfirst/`
- `other-product/_instances/other-product/`

## Creating a new instance

When you add EPF to a new product repository via git subtree, create your instance folder:

```bash
# In your product repo, after adding EPF subtree:
mkdir -p docs/EPF/_instances/your-product-name
```

Then copy and customize the template files from the `phases/` directory.

See MAINTENANCE.md for detailed instructions.

## Instance Directory Structure

A complete instance typically contains:

```
_instances/{product-name}/
├── 00_north_star.yaml
├── 01_insight_analyses.yaml
├── 02_strategy_foundations.yaml
├── 03_insight_opportunity.yaml
├── 04_strategy_formula.yaml
├── 05_roadmap_recipe.yaml
├── _meta.yaml
├── feature_definitions/        # Feature definition docs
├── value_models/               # Value model artifacts
└── ad-hoc-artifacts/           # Generated artifacts (optional)
```

## Ad-Hoc Artifacts

The `ad-hoc-artifacts/` folder is an **optional** directory for storing generated documents that are:

- **Derived from EPF content** — memos, presentations, summaries, stakeholder communications
- **Not core EPF artifacts** — they don't follow EPF schemas or participate in traceability
- **Convenience storage** — keeps related outputs co-located with the strategic context that produced them

### What belongs in `ad-hoc-artifacts/`

✅ Stakeholder memos explaining roadmap decisions  
✅ Presentation decks derived from strategy  
✅ Executive summaries of opportunities  
✅ Partner/investor communications  
✅ Team onboarding docs for strategic context  

### What does NOT belong in `ad-hoc-artifacts/`

❌ Core EPF YAML files (these belong in instance root)  
❌ Feature definitions (use `feature_definitions/`)  
❌ Code or implementation artifacts  
❌ Meeting notes or general project docs  

### Naming Convention

Use date-prefixed descriptive names:

```
ad-hoc-artifacts/
├── 2025-12-02_digital_twin_ecosystem_roadmap.md
├── 2025-12-02_digital_twin_ecosystem_roadmap_clickup.md
├── 2025-11-15_q4_strategy_executive_summary.md
└── 2025-10-01_investor_update_deck_notes.md
```

This keeps artifacts chronologically organized and clearly scoped.
