# Change: Add Strategy Bootstrap Flow

## Why

A strategy instance goes from empty scaffold to "ready for execution" through
a sequence of 7 READY artifacts that must be authored in a specific dependency
order. Today this process has no guided flow, no AI-assisted creation for most
artifacts, and no completeness gate. The result:

### Gap 1: No AI writers for initial READY artifact creation

The scaffold populates 6 artifacts with YAML templates containing placeholder
text ("Your Organization Name", "YYYY-MM-DD"). But there are no skills that
can draft real content for most READY artifacts from scratch:

| Artifact | Has creation skill? |
|----------|-------------------|
| North Star | No — relies on agent interview (pathfinder/lean-start) |
| Insight Analyses | Partial — 4 analysis skills (trend-scout, market-mapper, internal-mirror, problem-detective) each produce one section |
| Strategy Foundations | No — agent interview only |
| Insight Opportunity | No — synthesized by agent from analyses |
| Strategy Formula | No — agent interview only |
| Roadmap Recipe | No — agent interview only |
| Product Portfolio | No skill, not even scaffolded |

The agent-interview approach works well via MCP (an AI agent follows the
pathfinder prompt), but it's invisible from the web UI. A user on the web UI
sees 6 template-filled cards with placeholder text and no guidance on what to
do next.

### Gap 2: No completeness gate

There is no single mechanism that tells the user "your READY phase is complete,
you're ready to move to FIRE." The lifecycle mode detection checks only 3 of 7
artifacts (north_star, strategy_foundations, strategy_formula). The health check
reports schema compliance, not content completeness. The web UI shows per-artifact
gaps but doesn't aggregate them into a phase-level readiness verdict.

### Gap 3: Inter-READY relationships not auto-derived

Auto-extracted relationships only work for features, definitions, value models,
assessment reports, calibration memos, and LRAs. The READY-phase foundation
artifacts (north_star, insight_analyses, strategy_foundations, insight_opportunity,
strategy_formula, roadmap_recipe) produce ZERO outbound relationships when committed.
The logical dependencies between them (north_star informs strategy_foundations,
analyses synthesize into opportunity, formula derives from foundations, roadmap
operationalizes formula) exist only as agent prompt guidance, not as graph edges.

### Gap 4: No web UI authoring flow

The web UI READY dashboard is read-only. It shows which artifacts exist, which
sections have content, and links to the artifact detail viewer. But there is no
way to:
- Create a missing artifact from the web UI
- Trigger an AI draft for a specific artifact
- Follow a guided step-by-step creation flow
- See the dependency order ("create North Star first, then Foundations")

The MCP agent flow (pathfinder → interview → create artifacts) is powerful but
entirely invisible from the browser.

## What Changes

### 1. READY artifact creation skills

Create dedicated "bootstrap" skills for each READY artifact that can generate
a substantive first draft from available context:

| Skill | Inputs | Output |
|-------|--------|--------|
| `draft-north-star` | Company name, industry, product description (user input) | `north_star` with purpose, vision, values |
| `draft-foundations` | `north_star` + user interview answers | `strategy_foundations` with product_vision, value_proposition, strategic_sequencing |
| `draft-formula` | `north_star` + `strategy_foundations` | `strategy_formula` with positioning, moat, business_model |
| `draft-roadmap` | `strategy_formula` + `strategy_foundations` | `roadmap_recipe` with 4-track OKR structure |
| `draft-opportunity` | `insight_analyses` | `insight_opportunity` synthesized from analyses |

The 4 existing analysis skills (trend-scout, market-mapper, internal-mirror,
problem-detective) already cover `insight_analyses` sections and stay as-is.

Each skill uses the existing skill executor's chunked execution to produce
schema-valid artifacts. They read existing artifacts as context (when available)
and produce a staged batch for human review.

### 2. Web UI creation actions

Add "Draft with AI" buttons to the READY dashboard for each missing artifact.
The button POSTs to `/strategies/:id/ready/draft-{artifact}` and triggers the
corresponding skill via the executor. The user is redirected to the draft review
page to review and commit the generated artifact.

The dependency order is enforced:
- North Star can always be drafted (no prerequisites)
- Foundations requires North Star
- Formula requires North Star + Foundations
- Roadmap requires Formula
- Opportunity requires Insight Analyses
- Analyses skills have no prerequisites

Missing prerequisites are shown as disabled buttons with hints ("Requires
North Star").

### 3. READY phase completeness check

Add a `ReadyPhaseReadiness` assessment that scores the READY phase holistically:

**Artifact presence** (7 artifacts × existence check):
- Each artifact present and non-placeholder: full credit
- Present but template/placeholder content: partial credit
- Missing: zero credit

**Section completeness** (aggregate gap strip data):
- Ratio of filled sections to total expected sections across all artifacts

**Relationship coverage** (new):
- Are key inter-READY relationships present?
- Does the roadmap reference OKRs that link to strategy formula?
- Do features link to value model paths?

**Schema validation** (existing):
- Do all artifacts pass their JSON schema?

The assessment produces a 0-100 readiness score and a list of actionable
blockers. It surfaces as:
- A progress bar on the READY dashboard
- A "Ready for FIRE" gate (when score >= 80)
- An entry in the health check response

### 4. Auto-derive inter-READY relationships

Extend `index.ExtractRelationships` to produce edges for READY foundation
artifacts:

| Source | Relationship | Target | Extraction logic |
|--------|-------------|--------|-----------------|
| `strategy_foundations` | `derived_from` | `north_star` | Always (if both exist) |
| `strategy_formula` | `derived_from` | `strategy_foundations` | Always (if both exist) |
| `insight_opportunity` | `synthesized_from` | `insight_analyses` | Always (if both exist) |
| `roadmap_recipe` | `operationalizes` | `strategy_formula` | Always (if both exist) |
| `roadmap_recipe` | `constrained_by` | `strategy_foundations` | Always (if both exist) |
| `north_star` | `informed_by` | `insight_analyses` | Always (if both exist) |

These are structural relationships (they exist whenever both artifacts exist)
rather than content-derived. They encode the authoring dependency graph into
the strategy graph, making it visible to the ripple engine and the semantic
graph.

### 5. First version publication prompt

When all 7 READY artifacts exist and the readiness score is >= 80, surface a
prompt on the READY dashboard: "Your strategy foundation is complete. Publish
your first version to create a baseline snapshot." with a "Publish version"
button.

## Impact

- **Affected specs**: `strategy-web`
- **Affected code**:
  - `internal/embedded/skills/draft-{north-star,foundations,formula,roadmap,opportunity}/` — 5 new skills
  - `domain/skillexec/executor.go` — chunk plans for new skills
  - `internal/handler/handler_ready_draft.go` — new web handlers for draft actions
  - `internal/handler/queries_phases.go` — readiness scoring
  - `internal/ui/phase_ready.templ` — draft buttons, readiness bar, publish prompt
  - `internal/index/extract.go` — inter-READY relationship extraction
  - `internal/mcpserver/lifecycle.go` — completeness gate integration
- **No breaking changes**: Existing MCP tools and agent workflows unaffected.
  The bootstrap skills are additive — the pathfinder agent interview still
  works as before.
- **Database**: No new migrations. Relationships use the existing
  `strategy_relationships` table.
