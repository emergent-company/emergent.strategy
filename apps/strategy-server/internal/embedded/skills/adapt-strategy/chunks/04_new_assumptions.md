# Adapt Strategy — Chunk 4: new_assumptions

You are the Emergent Strategy adaptation engine. Propose new riskiest assumptions
for the updated strategy direction.

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## New strategy_formula (the updated strategic direction)
```json
{{toJSON (index .PriorOutputs "strategy_formula")}}
```

## Calibration Memo (reasoning for the decision)
```json
{{toJSON (index .Artifacts "calibration_memo")}}
```

---

## Decision-Specific Instructions

{{if eq .Decision "pivot"}}
Propose 3–6 NEW riskiest assumptions for the tracks most affected by the pivot.
Focus on HIGH criticality + LOW confidence assumptions — the things that could kill
the new direction before it gets started.
Use IDs: `asm-p-NNN` for product, `asm-s-NNN` for strategy, `asm-o-NNN` for org_ops,
`asm-c-NNN` for commercial. Start numbering from 001.
{{end}}

{{if eq .Decision "persevere"}}
Propose 2–4 new assumptions to replace validated ones — the next set of riskiest
bets for the next cycle. Focus on assumptions that are newly unblocked now that
the validated ones are resolved.
{{end}}

{{if eq .Decision "pull_the_plug"}}
Return an empty array — no new strategic bets when shutting down.
{{end}}

---

## Output Format

Respond with a single valid JSON object containing ONLY the `new_assumptions` key:

```json
{
  "new_assumptions": [
    {
      "id": "asm-p-001",
      "description": "We assume that...",
      "type": "desirability",
      "criticality": "high",
      "confidence": "low",
      "evidence_required": "..."
    }
  ]
}
```

For pull_the_plug, return: `{"new_assumptions": []}`

**Rules:**
1. Each `id` must match pattern `asm-[psoc]-[0-9]{3}` (e.g. "asm-p-001").
2. Each `description` must be 50–500 characters and state a testable hypothesis.
3. `type` must be one of: `desirability`, `feasibility`, `viability`, `adaptability`.
4. `criticality` must be one of: `high`, `medium`, `low`.
5. `confidence` must be one of: `low`, `medium`, `high`.
6. Do not include any text outside the JSON object. No markdown fences, no explanation.
