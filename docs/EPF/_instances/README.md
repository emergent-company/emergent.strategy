# EPF Instances

This directory is intentionally empty in the canonical EPF framework repository.

**For complete instance creation workflow**, see [`docs/guides/INSTANTIATION_GUIDE.md`](../docs/guides/INSTANTIATION_GUIDE.md).

## Where are the instances?

Product-specific instances live in their respective product repositories:
- `twentyfirst/docs/EPF/_instances/twentyfirst/`
- `huma-blueprint-ui/docs/EPF/_instances/huma/`
- `lawmatics/docs/EPF/_instances/lawmatics/`
- `emergent/docs/EPF/_instances/emergent/`

## Creating a new instance

When you add EPF to a new product repository via git subtree, create your instance folder with the complete directory structure:

```bash
# In your product repo, after adding EPF subtree:
cd docs/EPF/_instances

# Create instance root
mkdir -p your-product-name

# Create complete phase-based structure
mkdir -p your-product-name/READY
mkdir -p your-product-name/FIRE/feature_definitions
mkdir -p your-product-name/FIRE/value_models
mkdir -p your-product-name/FIRE/workflows
mkdir -p your-product-name/AIM
mkdir -p your-product-name/ad-hoc-artifacts
mkdir -p your-product-name/context-sheets
mkdir -p your-product-name/cycles
```

**Why create all folders upfront?**
- Provides clear visual navigation of EPF structure
- Shows what's missing vs. what's complete
- Prevents confusion about where artifacts belong
- Makes the phase-based workflow immediately visible
- Empty folders signal "this needs content" rather than "where does this go?"

Then copy and customize the template files from the `templates/READY/` directory to populate your `READY/` folder.

See MAINTENANCE.md for detailed instructions.

## Instance Directory Structure (Phase-Based)

**CRITICAL:** Instances MUST mirror the framework's phase-based structure. This is fundamental to EPF's READY → FIRE → AIM philosophy.

A complete instance contains:

```
_instances/{product-name}/
├── _meta.yaml                  # Instance metadata
├── README.md                   # Instance overview
├── context-sheets/             # Context documents (optional)
├── cycles/                     # Archived cycle artifacts
│
├── READY/                      # Strategy & Planning Phase
│   ├── 00_north_star.yaml
│   ├── 01_insight_analyses.yaml
│   ├── 02_strategy_foundations.yaml
│   ├── 03_insight_opportunity.yaml
│   ├── 04_strategy_formula.yaml
│   └── 05_roadmap_recipe.yaml
│
├── FIRE/                       # Execution & Delivery Phase
│   ├── feature_definitions/    # Feature definition docs (fd-XXX_slug.yaml)
│   ├── value_models/           # Value model artifacts
│   ├── workflows/              # Workflow definitions
│   └── mappings.yaml           # Cross-artifact mappings
│
├── AIM/                        # Learning & Adaptation Phase (optional)
│   ├── assessment_report.yaml
│   └── calibration_memo.yaml
│
└── ad-hoc-artifacts/           # Generated artifacts (optional)
```

### Why Phase-Based Structure?

1. **Philosophical Alignment:** EPF operates in cycles of READY (plan) → FIRE (execute) → AIM (learn). Instance structure should reflect this.
2. **Clear Boundaries:** Separates strategic planning artifacts from execution artifacts from retrospective artifacts.
3. **Framework Mirroring:** Instances follow the same structure as `templates/`, making navigation intuitive.
4. **Traceability:** Phase boundaries make it clear where artifacts belong in the workflow.

### Migrating from Flat Structure

If your instance uses the legacy flat structure, migrate as follows:

```bash
cd docs/EPF/_instances/{product-name}

# Create phase directories
mkdir -p READY FIRE AIM

# Move READY phase artifacts
mv 00_north_star.yaml 01_insight_analyses.yaml 02_strategy_foundations.yaml \
   03_insight_opportunity.yaml 04_strategy_formula.yaml 05_roadmap_recipe.yaml READY/

# Move FIRE phase artifacts
mv feature_definitions value_models workflows FIRE/
mv mappings.yaml FIRE/

# Move AIM phase artifacts (if they exist)
mv assessment_report.yaml calibration_memo.yaml AIM/ 2>/dev/null || true
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
