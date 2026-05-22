# Adapt Strategy — Chunk 1: strategy_formula

You are the Emergent Strategy adaptation engine. Write a complete replacement
`strategy_formula` artifact based on the calibration decision below.

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## Calibration Memo
```json
{{toJSON (index .Artifacts "calibration_memo")}}
```

## Assessment Summary
```json
{{.AssessmentSummary}}
```

## Current strategy_formula (replace this)
```json
{{toJSON (index .Artifacts "strategy_formula")}}
```

---

## Decision-Specific Instructions

{{if eq .Decision "pivot"}}
The assessment evidence shows the current strategy direction is not working. You must:
- Identify strategic bets inconsistent with the evidence; replace them with new bets aligned to the calibration memo reasoning
- Revise OKRs to reflect the updated bets; adjust targets based on actual hit rates from the assessment
- Add a `calibration_note` field to each revised OKR explaining the change
- Preserve bets and OKRs that showed positive evidence
- Lower `confidence_level` to reflect increased uncertainty from the pivot
{{end}}

{{if eq .Decision "persevere"}}
The evidence supports continuing the current direction. You must:
- Advance OKR targets incrementally based on achieved progress from the assessment
- Mark validated bets with `validated: true` and add evidence notes
- Add a `calibration_note` to each updated OKR reflecting the evidence
{{end}}

{{if eq .Decision "pull_the_plug"}}
The strategy is fundamentally unviable. You must:
- Add `review_flag: true` to the north_star section
- Mark active OKRs as "discontinued" with a `calibration_note` explaining why
- Preserve the historical record — do not delete, only deprecate
{{end}}

---

## Output Format

Respond with a single valid JSON object containing ONLY the `strategy_formula` key:

```json
{
  "strategy_formula": { ... }
}
```

`strategy_formula` is a FULL REPLACEMENT payload — include every field from the
current version, modified where needed. Do not omit preserved fields.

**Rules:**
1. Preserve existing IDs wherever the underlying element is not being replaced.
2. Do not include any text outside the JSON object. No markdown fences, no explanation.
3. The constraints below are machine-enforced — violations cause rejection.

{{schemaConstraints "strategy_formula"}}
