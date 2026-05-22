# Change: Add Strategy Bootstrap Flow

## Why

A strategy instance starts empty and needs a first set of READY artifacts to
become operational. Today this process is only possible through MCP agents
(pathfinder/lean-start interviews) with no web UI equivalent. It lacks a
consistent evidence pipeline and has no clear "ready enough" gate.

## Core insight: all evidence collection methods produce the same thing

Whether the strategy manager uploads a pitch deck, answers interview questions,
or pastes competitive analysis notes, the output is the same: **evidence items
in the AIM phase**. The distinction between "I have existing material" and "I'm
starting from zero" is a false dichotomy — interviews ARE evidence production.

The unified model:

```
Evidence collection (any combination of):
  - Upload/paste existing documents → evidence items (tagged)
  - Answer guided interview questions → evidence items (tagged)
  - Import from external tools → evidence items (tagged)

When enough evidence is collected:
  → Generate READY artifacts from evidence (in dependency order)
  → Human reviews each draft
  → Publish first version
```

This means:
- There is no separate "bootstrap mode" — genesis IS the first AIM cycle
- The interview is just one evidence collection method alongside upload and paste
- A user with a full pitch deck and one with nothing both follow the same flow —
  they just accumulate evidence differently
- The readiness gate is "enough evidence to generate a first draft" — not
  "perfect artifacts"

## Design principles for the first cycle

**Lean first cycle.** The first version of the strategy will be rough. That's
by design. The AIM cycle exists to refine it over time as more evidence
accumulates. There is no reason to over-engineer the first cycle — it should
produce a "good enough" foundation that can be iterated on.

**Evidence sufficiency, not evidence perfection.** The system should assess
whether enough evidence exists to attempt each READY artifact, not whether
the evidence is comprehensive. A pitch deck alone is sufficient to draft a
North Star. Market research adds depth but isn't required for a first pass.

**Progressive enrichment.** Each AIM cycle adds evidence (signals, assessment
outcomes, user feedback). The strategy gets better over time. The first cycle
just needs to be good enough to start.

## How genesis works in practice

From practical experimentation, strategy managers arrive with varying amounts
of existing material:

**Scenario A — Rich existing material:**
Pitch decks, market research, competitive analysis, product docs, investor
memos. These get loaded as evidence → AI unpacks and structures into READY
artifacts → human reviews → first version published. Fast, mostly automated.

**Scenario B — Some material + gaps:**
A product vision doc and some competitive notes, but no market sizing or formal
strategy. The existing material gets loaded as evidence → guided interview
fills the gaps (producing more evidence items) → AI drafts from the combined
evidence set → human reviews → first version.

**Scenario C — Starting from scratch:**
No prior documentation. The system runs a guided interview covering vision,
market, competition, value proposition, and team context. Each answer becomes
an evidence item. When enough answers are collected → AI drafts READY artifacts
→ human reviews → first version. This is the slowest path but produces the
same output.

All three scenarios converge on the same pipeline: evidence → READY artifacts.

## Important: canonical definitions are NOT user-authored

Strategy, org_ops, and commercial definitions come from canonical EPF at build
time. They are framework structure, not per-instance bootstrap targets. Value
models are FIRE-phase artifacts. Product portfolio references value models.
Neither is part of the READY foundation bootstrap.

## Current gaps

**Gap 1: No unified evidence collection in web UI**

Evidence ingestion exists (`domain/evidence/Ingest()`) but only through MCP.
No web UI for upload, paste, or guided interview. The user has no way to load
source material from the browser.

**Gap 2: No evidence-to-artifact generation pipeline**

No skill reads evidence items and produces READY artifacts. The existing
bootstrap skills (`adapt-foundations`, `adapt-strategy`) update existing
artifacts, not create initial ones. The pathfinder agent interview works via
MCP but isn't integrated with the evidence system — interview answers aren't
stored as evidence items.

**Gap 3: No "evidence sufficiency" assessment**

No mechanism tells the user "you have enough evidence to draft a North Star"
or "add market research to improve the Insight Analyses draft." The readiness
concept needs to apply to evidence collection, not just artifact completeness.

**Gap 4: No completeness gate for READY phase**

Lifecycle detection checks only 3 of 7 READY artifacts. No holistic readiness
score. No "publish first version" prompt.

**Gap 5: Inter-READY relationships not auto-derived**

READY foundation artifacts produce zero outbound relationship edges. The
dependency graph is invisible to the ripple engine.

## What Changes

### 1. Unified evidence collection

Build a web UI evidence collection interface on the AIM tab that supports
all three input methods:

**a) Text paste:** Textarea with source_type selector (pitch_deck, market_research,
competitive_analysis, product_doc, strategy_notes, user_research, interview_notes)
and auto-suggested tags. Each submission creates an evidence item.

**b) Guided interview:** A structured questionnaire that produces evidence items.
The interview adapts based on what evidence already exists — if a pitch deck was
uploaded, the interview skips vision/purpose questions and focuses on gaps. Each
answer is stored as an evidence item with source_type `interview` and appropriate
tags.

**c) Evidence from existing artifacts:** When an instance is imported with
existing YAML files (via CLI import), the import process should create summary
evidence items from the imported artifacts, making the existing strategy content
available to the evidence pipeline.

### 2. Evidence sufficiency assessment

Before each READY artifact can be drafted, assess whether sufficient evidence
exists. The assessment is tag-based:

| READY artifact | Required evidence tags (any of) | Minimum items |
|---------------|-------------------------------|---------------|
| North Star | vision, strategy, pitch, purpose | 1 |
| Insight Analyses | market, competitive, trends, user_research | 2 |
| Strategy Foundations | vision, value_proposition, positioning | 1 (+ north_star exists) |
| Insight Opportunity | market, competitive, user_research | 1 (+ insight_analyses exists) |
| Strategy Formula | strategy, positioning, competitive | 1 (+ foundations exists) |
| Roadmap Recipe | strategy, product, planning | 1 (+ formula exists) |

The thresholds are deliberately low — the first cycle should be lean. Better
evidence produces better artifacts, but the system shouldn't block on perfection.

### 3. Evidence-aware bootstrap skills

Create skills that read evidence items as primary context. Each skill:
- Queries evidence items filtered by relevant tags
- Reads prerequisite READY artifacts for coherence
- Produces a schema-valid first draft
- Falls back to minimal generation when evidence is sparse

The skills are the same ones listed in the original proposal (draft-north-star,
draft-insights, draft-foundations, draft-opportunity, draft-formula,
draft-roadmap) but they are now explicitly part of the evidence pipeline, not
standalone creation tools.

### 4. Web UI draft actions on READY dashboard

"Draft with AI" buttons on READY cards. The button state reflects evidence
sufficiency:
- **Enabled + "Draft from evidence"**: sufficient evidence exists
- **Enabled + "Draft with AI"**: insufficient evidence but prerequisites met
  (will produce a sparser draft)
- **Disabled + prerequisite hint**: dependency artifact missing
- **Hidden or "Redraft"**: artifact already has substantive content

### 5. READY phase readiness score

0-100 score based on artifact presence, section completeness, placeholder
detection, schema validation. Surfaces as progress bar, health_check field,
and "Publish first version" prompt at >= 80.

### 6. Auto-derive inter-READY relationships

Structural edges between READY artifacts (derived_from, synthesized_from,
operationalizes, constrained_by, informed_by). Created when both artifacts
exist. Visible to ripple engine.

### 7. Lifecycle mode completeness

Check all 7 READY artifacts for foundation → building transition. When evidence
exists but artifacts are placeholder-only, recommend the bootstrap flow.

## Impact

- **Affected specs**: `strategy-web`
- **Affected code**: Skills, executor, web handlers, evidence service, READY
  dashboard, index extraction, lifecycle detection
- **No breaking changes**: MCP tools and agent workflows unaffected
- **Dependency on `fix-aim-cycle-wiring`**: `draft-lra` skill defined there
- **Database**: No new migrations
- **Canonical definitions**: NOT affected
