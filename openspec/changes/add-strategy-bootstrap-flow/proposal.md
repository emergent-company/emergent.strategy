# Change: Add Strategy Bootstrap Flow

## Why

A strategy instance goes from empty scaffold to "ready for execution" through
7 READY artifacts authored in dependency order. Today this process has gaps in
AI assistance, completeness checking, and web UI guidance. The result is that
genesis is only possible via MCP agents (pathfinder/lean-start interviews) with
no web UI equivalent.

### How genesis actually works in practice

From practical experimentation with epf-cli, most instance owners do NOT start
from a blank canvas. They typically have existing material:

- Pitch decks, investor memos
- Market research, competitive analyses
- Product documentation, technical specs
- Strategy notes, board presentations
- User research, interview transcripts

The real bootstrap pattern is **evidence-first**:

1. **Load source material** — existing documents, research, notes go into the
   AIM evidence system as source documents
2. **Create LRA** — the Living Reality Assessment captures the current reality,
   grounded in the source material
3. **First "genesis cycle"** — AI unpacks the source material + LRA into
   structured READY artifacts (north_star, foundations, formula, roadmap, etc.)
4. **Human reviews and refines** — each generated artifact is staged for review

This is conceptually the first AIM cycle, except the "assessment" is the source
material itself rather than OKR scoring.

### Important: canonical definitions are NOT user-authored

The strategy, org_ops, and commercial **definitions** come from canonical EPF.
They are embedded in the binary at build time (via `sync-embedded.sh`),
auto-imported into the schema registry at startup, and served via
`list_definitions` / `get_definition` MCP tools. They are global framework
structure, not per-instance artifacts that need bootstrap skills.

Value models are FIRE-phase artifacts that reference these canonical definitions
but are authored per-instance. Product portfolio is a structural artifact
referencing value models. Neither is part of the READY foundation.

### Current gaps

**Gap 1: No AI writers for initial READY artifact creation from source material**

The bootstrap skills need to work like the evidence-first pattern: read loaded
source documents and existing artifacts, then draft the next artifact in the
dependency chain. Today only `insight_analyses` has partial coverage (4 analysis
skills). All other READY artifacts require agent interview or manual creation.

**Gap 2: No web UI for loading source material**

Evidence ingestion exists (`domain/evidence/Ingest()`) but only through MCP
tools. The web UI has no upload or paste interface for source documents. The
import CLI can load YAML files from a local directory, but there's no web
equivalent.

**Gap 3: No completeness gate**

Lifecycle mode detection checks only 3 of 7 READY artifacts (north_star,
strategy_foundations, strategy_formula). No tool aggregates artifact presence,
section completeness, placeholder detection, and schema validation into a
single readiness verdict.

**Gap 4: Inter-READY relationships not auto-derived**

Auto-extracted relationships work for features, definitions, value models, and
AIM artifacts. READY foundation artifacts produce ZERO outbound relationships.
The dependency graph (north_star informs foundations, foundations derive formula,
formula operationalizes into roadmap) exists only as agent prompt guidance.

## What Changes

### 1. Evidence-aware bootstrap skills

Create bootstrap skills that read source evidence as primary context. Each skill
in the dependency chain reads:
- Any loaded evidence items (tagged with relevant categories)
- Previously created READY artifacts (for context coherence)
- The LRA (when it exists) for grounding

| Skill | Primary input | Context artifacts | Output |
|-------|--------------|-------------------|--------|
| `draft-lra` | Evidence items + user answers | — | `living_reality_assessment` |
| `draft-north-star` | Evidence items | LRA (if exists) | `north_star` |
| `draft-insights` | Evidence items | north_star | `insight_analyses` (full, not section-by-section) |
| `draft-foundations` | Evidence items | north_star, insight_analyses | `strategy_foundations` |
| `draft-opportunity` | Evidence items | insight_analyses, north_star | `insight_opportunity` |
| `draft-formula` | Evidence items | north_star, strategy_foundations, insight_opportunity | `strategy_formula` |
| `draft-roadmap` | Evidence items | strategy_formula, strategy_foundations | `roadmap_recipe` |

The skills degrade gracefully: when no evidence is loaded, they fall back to
interactive prompts (asking the user targeted questions). When evidence IS
loaded, they extract and structure content from it.

The `draft-lra` skill is shared with the `fix-aim-cycle-wiring` proposal (task
group 4). It is listed here for completeness of the dependency chain.

### 2. Web UI evidence loading

Add a simple evidence ingestion interface to the AIM tab or a dedicated
bootstrap page:
- Text paste area for notes, strategy excerpts, competitive analysis
- Each pasted block becomes an evidence item with source_type and tags
- The evidence feeds into the bootstrap skills as context

Full document upload (PDF, DOCX) is out of scope — that path goes through
epf-cli's decomposer and Memory pipeline. This is a lightweight text-based
entry point.

### 3. Web UI draft actions on READY dashboard

Add "Draft with AI" buttons to READY dashboard cards for missing artifacts.
Buttons enforce dependency order (disabled when prerequisites missing).
When evidence items exist, the button label changes to "Draft from evidence"
to signal that source material will be used.

### 4. READY phase readiness score

Compute a 0-100 readiness score based on:
- Artifact presence (7 artifacts)
- Section completeness (aggregate gap ratio)
- Placeholder detection (template text vs real content)
- Schema validation
- Relationship coverage (inter-READY edges exist)

Surface as progress bar on READY dashboard, in health_check response, and
as "Publish first version" prompt at score >= 80.

### 5. Auto-derive inter-READY relationships

Extend `index.ExtractRelationships` to produce structural edges for READY
artifacts:

| Source | Relationship | Target |
|--------|-------------|--------|
| strategy_foundations | derived_from | north_star |
| strategy_formula | derived_from | strategy_foundations |
| insight_opportunity | synthesized_from | insight_analyses |
| roadmap_recipe | operationalizes | strategy_formula |
| roadmap_recipe | constrained_by | strategy_foundations |
| north_star | informed_by | insight_analyses |

These are structural (exist when both artifacts exist), making the dependency
graph visible to the ripple engine and semantic graph.

### 6. Lifecycle mode completeness

Update lifecycle detection to check all 7 READY artifacts for the `foundation`
→ `building` transition, not just 3.

## Impact

- **Affected specs**: `strategy-web`
- **Affected code**: Skills, executor chunk plans, web handlers, READY dashboard
  template, index extraction, lifecycle detection
- **No breaking changes**: Existing MCP tools and agent workflows unaffected
- **Dependency on `fix-aim-cycle-wiring`**: The `draft-lra` skill is defined in
  that proposal. This proposal extends the bootstrap chain around it.
- **Database**: No new migrations
- **Canonical definitions**: NOT affected. Definitions are framework structure,
  not bootstrap targets.
