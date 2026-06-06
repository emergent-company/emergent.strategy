# Design: Complete i18n — Templ Prose and Go Helper Strings

## Context

The June 2026 i18n pass established the full infrastructure and translated ~85% of
user-facing strings. The remaining 648 strings share a common pattern: they are
inside `.templ` files that render artifact detail views, operational dashboards, and
workflow panels. None of them are blocked by external dependencies.

## Key Design Decisions

### 1. Key naming scheme for artifact field labels

**Decision:** Use `artifact.field.<name>` for field labels and `artifact.section.<name>`
for section headings, not file-scoped prefixes.

**Rationale:** Field labels like "Job To Be Done", "Market Size", and "Purpose" appear
across multiple artifact types and are inherently cross-cutting. A flat namespace like
`artifact.field.jtbd` makes them reusable and avoids duplication if the same label
appears in two views. File-scoped keys (e.g. `north_star.field.purpose`) would create
hundreds of identical NB translations for the same concept.

**Example mappings:**
```
"Job To Be Done"         → artifact.field.jtbd
"Strategic Sequencing"   → artifact.section.strategic_sequencing
"Value Proposition"      → artifact.section.value_proposition
"SWOT Analysis"          → artifact.section.swot
"Pain Points"            → artifact.field.pain_points
```

### 2. Category F strings: ctx threading vs. lookup tables

**Decision:** Add `ctx context.Context` as the first parameter to each Go helper
function that returns user-visible strings. Call `langs.T(ctx, key)` in each
return branch.

**Rejected alternative: Static lookup tables.** One option is to return a lang key
from each function (e.g. `"aim.step.observe"`) and let the call site call `langs.T`.
This avoids threading `ctx`, but it changes the function contract and requires every
call site to know it's receiving a key, not a display string. It also defeats the
type system — a bare key string and a translated string are indistinguishable at
compile time.

**Affected functions and their new signatures:**

| Function | File | New first param |
|---|---|---|
| `aimStepObserve` | `phase_aim.templ` | `ctx context.Context` |
| `aimStepAssess` | `phase_aim.templ` | `ctx context.Context` |
| `aimStepDecide` | `phase_aim.templ` | `ctx context.Context` |
| `aimStepAdapt` | `phase_aim.templ` | `ctx context.Context` |
| `aimAutomationHint` | `phase_aim.templ` | `ctx context.Context` |
| `runStepLabel` | `aim_run_panel.templ` | `ctx context.Context` |
| `runStepDescription` | `aim_run_panel.templ` | `ctx context.Context` |
| `runStatusLabel` | `aim_run_panel.templ` | (already wrapped as `runStatusLabelI18n`) |
| `cascadeSkillLabel` | `cascade_tracker.templ` | `ctx context.Context` |
| `cascadeStepLabel` | `cascade_tracker.templ` | `ctx context.Context` |
| `signalTypeHint` | `coherence_view.templ` | `ctx context.Context` |
| `authorityTierHint` | `coherence_view.templ` | `ctx context.Context` |
| `proposalTriggerLabel` | `aim_proposals.templ` | (already wrapped) |
| `assumptionRiskLabel` | `assumptions_view.templ` | `ctx context.Context` |
| `assumptionRiskHint` | `assumptions_view.templ` | `ctx context.Context` |
| `draftActionHint` | `aim_draft_review.templ` | (already wrapped as `artifactTypeLabelI18n`) |
| `pipelineProposalLabel` | `aim_pipeline.templ` | `ctx context.Context` |

All these functions are defined inside the `.templ` file and called only from
template code where `ctx` is always in scope.

### 3. JavaScript inline event handlers

**Decision:** Leave hardcoded. Do not attempt to translate strings embedded in
`onsubmit="..."` attribute values.

**Rationale:** Templ renders these as string literals baked into the HTML attribute
at server render time. The value is not a Go expression — it is emitted verbatim
into the output. Injecting a `langs.T` call would require a `{{ }}` block to compute
the value and then `{ expr }` in the attribute, but templ's attribute expression
syntax only accepts `templ.ComponentScript` for event handlers, not plain strings
(as confirmed by the build error encountered when this was attempted).

Affected locations: the "Install definitions" form `onsubmit` handler in
`phase_fire.templ` (1 string: `"Installing…"`). This is a loading indicator visible
for ~500ms. The risk of leaving it in English is negligible.

### 4. Key proliferation management

**Decision:** Accept ~440 new keys as necessary. Add them in a single batch to
`langs.go` to maintain the all-in-one-file design.

The `internal/langs/langs.go` file already contains ~240 keys after the June 2026
pass. Adding ~440 more brings the total to ~680 keys across two locales. This is
manageable in a single file and maintains the existing convention.

**If key count grows beyond ~1,000** in future, the file can be split into logical
sections using Go `const` blocks per domain area. This is a future concern, not a
constraint for this change.

### 5. NB translation quality

**Decision:** Machine-assisted NB translation with manual review for all prose
strings (categories B and E). Field labels (category A) can be machine-translated
with lower review priority — a mis-translated field label for "Strategic Sequencing"
is far less harmful than a mis-translated error message.

**Translation tiers:**
- **High priority for human review:** Category E (empty state prose), category B
  (section subtitles that set user expectations)
- **Machine translation acceptable:** Category A (field labels), category C (status
  badges), category D (button labels)
- **Low priority:** Category G (tooltips, placeholders) — users rarely read these

### 6. Templ regeneration

**Decision:** Run `templ generate` once after all `.templ` edits are complete, commit
both source and generated files together.

No file-by-file regeneration is needed during development since `go build ./...`
catches type errors in the generated code. The final regeneration ensures the
generated files are in sync with the final `.templ` sources.

## Data Flow for Translated Strings

```
HTTP request arrives with Accept-Language header
    ↓
langs middleware parses Accept-Language, stores locale in ctx
    ↓
Handler calls templ component with ctx
    ↓
Templ render function has ctx in scope
    ↓
{ langs.T(ctx, "artifact.field.jtbd") } → "Job To Be Done" (EN)
                                         → "Jobb som skal gjøres" (NB)
    ↓
HTML emitted with locale-appropriate string
```

For Group 2 functions:
```
{{ items := aimStepObserve(ctx, data) }}
    ↓
aimStepObserve(ctx context.Context, ...) aimCycleStepData {
    return aimCycleStepData{
        Label:    langs.T(ctx, "aim.step.observe"),
        CTA:      langs.T(ctx, "aim.step.observe.cta"),
        ...
    }
}
```

## Risks

- **Key collision:** With ~440 new keys, there is a risk of naming conflicts with
  existing keys. Mitigation: grep for key prefix before adding; `langs.T` returns the
  raw key if missing (no panic), making silent misses visible in the rendered output.

- **Norwegian prose quality:** Machine translation of technical product strategy
  terms ("Strategic Sequencing", "Calibration Memo", "Coherence Engine") may produce
  awkward Norwegian. Mitigation: separate review pass by a native speaker; these are
  non-blocking for shipping.

- **Call site count for ctx threading:** Each Group 2 function may be called from
  multiple `{{ }}` blocks. Missing a call site causes a compile error (wrong number
  of arguments), so all sites must be fixed atomically. This is an asset, not a risk.
