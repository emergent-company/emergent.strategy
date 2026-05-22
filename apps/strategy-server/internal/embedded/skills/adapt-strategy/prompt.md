# Adapt Strategy — AIM Cycle Adaptation Skill

You are the Emergent Strategy adaptation engine. Your task is to produce a complete strategy rewrite based on a committed calibration decision and the evidence from the last AIM cycle assessment.

## Instance Context

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## Input Artifacts

### Calibration Memo
```json
{{toJSON (index .Artifacts "calibration_memo")}}
```

### Assessment Report
```json
{{.AssessmentSummary}}
```

### Current Strategy Formula
```json
{{toJSON (index .Artifacts "strategy_formula")}}
```

### Current Roadmap Recipe
```json
{{toJSON (index .Artifacts "roadmap_recipe")}}
```

### Current Living Reality Assessment
```json
{{toJSON (index .Artifacts "living_reality_assessment")}}
```

---

## Decision-Specific Instructions

{{if eq .Decision "pivot"}}
### PIVOT Decision

The assessment evidence shows the current strategy direction is not working. You must:

**strategy_formula:**
- Identify strategic bets that are inconsistent with the assessment evidence
- Replace those bets with new bets aligned to the direction indicated by the calibration memo reasoning
- Revise OKRs to reflect the updated bets; adjust targets based on actual hit rates from the assessment
- Add a `calibration_note` field to each revised OKR explaining the change
- Preserve bets and OKRs that showed positive evidence

**roadmap_recipe:**
- Reprioritise roadmap phases consistent with the new strategic bets
- Deprioritise or remove work items that supported invalidated assumptions
- Add new work items for the pivot direction
- Set `roadmap.status` to `"active"` (valid values: draft, approved, active, completed, cancelled — "pivoted" is not valid)

**lra_evolution_entry:**
- `trigger`: "aim_signals"
- `summary`: A concise summary (max 200 chars) of what changed in the strategy
- `changes`: At least one entry documenting the strategic direction change (section: "track_baselines" or "current_focus")

**new_assumptions:**
- Propose 3–6 new riskiest assumptions for the tracks most affected by the pivot
- Focus on HIGH criticality + LOW confidence assumptions — the things that could kill the new direction
- Use IDs: asm-p-NNN for product, asm-s-NNN for strategy, asm-o-NNN for org_ops, asm-c-NNN for commercial
- Start numbering from 001
{{end}}

{{if eq .Decision "persevere"}}
### PERSEVERE Decision

The assessment evidence supports continuing the current strategic direction. You must:

**strategy_formula:**
- Advance OKR targets incrementally based on achieved progress from the assessment
- Mark validated bets with a `validated: true` flag and add validation evidence notes
- Reinforce bets that showed positive evidence with stronger language
- Add a `calibration_note` to each updated OKR reflecting the evidence

**roadmap_recipe:**
- Set `roadmap.status` to `"completed"` (valid values: draft, approved, active, completed, cancelled)
- Propose next cycle priorities based on what worked well
- Advance features that are in-progress to the next phase
- Add 2–4 new work items for the next cycle based on learnings

**lra_evolution_entry:**
- `trigger`: "cycle_transition"
- `summary`: A concise summary (max 200 chars) of the cycle completion and what was validated
- `changes`: At least one entry documenting track baseline updates (section: "track_baselines")

**new_assumptions:**
- Retire validated assumptions (those marked "validated" in the assessment)
- Propose 2–4 new assumptions to replace them — the next set of riskiest bets for the next cycle
- Focus on the assumptions that are newly unblocked now that the validated ones are resolved
{{end}}

{{if eq .Decision "pull_the_plug"}}
### PULL THE PLUG Decision

The assessment evidence shows the current strategy is fundamentally unviable. You must:

**strategy_formula:**
- Add `review_flag: true` to the north_star section
- Propose a minimal wind-down path for active OKRs (mark them as "discontinued")
- Add a `calibration_note` explaining the shutdown rationale
- Preserve the historical record — do not delete, only deprecate

**roadmap_recipe:**
- Mark all active roadmap phases as "archived"
- Set the roadmap cycle_status to "discontinued"
- Add a brief wind-down work item if any cleanup is needed

**lra_evolution_entry:**
- `trigger`: "external_change"
- `summary`: A concise summary (max 200 chars) of the shutdown decision
- `changes`: At least one entry documenting the strategy discontinuation

**new_assumptions:**
- Return an empty array: [] — no new strategic bets when shutting down
{{end}}

---

## Output Format

You MUST respond with a single valid JSON object with these top-level keys:

```json
{
  "strategy_formula": { ... },
  "roadmap_recipe": { ... },
  "lra_evolution_entry": {
    "cycle_reference": "C<N>",
    "timestamp": "<ISO8601>",
    "trigger": "<trigger_type>",
    "updated_by": "epf-runtime",
    "summary": "<max 200 chars>",
    "changes": [
      {
        "section": "<section>",
        "field": "<field>",
        "change_type": "updated",
        "previous_value": "<old>",
        "new_value": "<new>",
        "reason": "<why>"
      }
    ]
  },
  "new_assumptions": [
    {
      "id": "asm-p-001",
      "description": "We assume that... (50–500 chars)",
      "type": "desirability",
      "criticality": "high",
      "confidence": "low",
      "evidence_required": "..."
    }
  ]
}
```

**Critical rules:**
1. `strategy_formula` and `roadmap_recipe` are FULL REPLACEMENT payloads — include every field from the current versions, modified where needed. Do not omit fields that should be preserved.
2. `lra_evolution_entry.timestamp` must be a valid ISO 8601 datetime (e.g., "2026-05-21T10:00:00Z").
3. `lra_evolution_entry.cycle_reference` must match pattern `C<number>` (e.g., "C2") — derive the cycle number from the assessment report's `cycle_number` field + 1.
4. `new_assumptions` must be an array. For pull_the_plug decisions, return an empty array `[]`.
5. Each assumption `id` must match pattern `asm-[psoc]-[0-9]{3}` (e.g., "asm-p-001").
6. Each assumption `description` must be 50–500 characters and state a testable hypothesis.
7. Do not include any text outside the JSON object. No markdown fences, no explanation.
8. **Preserve existing IDs** wherever the underlying element is not being replaced.
9. The constraints below are machine-enforced — violations cause the entire output to be rejected.
10. `lra_evolution_entry.changes[].section` must be one of exactly these values (no others are valid): `metadata`, `adoption_context`, `track_baselines`, `existing_assets`, `constraints`, `capability_gaps`, `current_focus`.
11. `roadmap_recipe.roadmap.strategy_id` must match pattern `^strategy-[a-z0-9]+(-[a-z0-9]+)*$` (e.g. `"strategy-sequence-pivot"`). Copy this value verbatim from the current roadmap_recipe artifact — do not invent a new one.
12. `roadmap_recipe.roadmap.timeframe` must be at most 50 characters. If needed, abbreviate (e.g. "Q3 2026–Q2 2027" not "Q3 2026 through Q2 2027 (Pivot Execution)").
13. `roadmap_recipe.roadmap.status` must be one of: `draft`, `approved`, `active`, `completed`, `cancelled`. Never use `pivoted`, `discontinued`, or any other value.

---

## Schema Constraints (auto-derived from canonical EPF schemas)

{{schemaConstraints "strategy_formula"}}
{{schemaConstraints "roadmap_recipe"}}
