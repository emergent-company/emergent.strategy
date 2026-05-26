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
  "new_assumptions": [ ... ],
  "change_summary": "1-2 bullet points summarising the new assumptions being proposed"
}
```

For pull_the_plug, return: `{"new_assumptions": [], "change_summary": "- No new assumptions (pull_the_plug)"}`

Each assumption object must have:
- `id` — e.g. `asm-p-001` (p=product, s=strategy, o=org_ops, c=commercial)
- `track` — one of: product, strategy, org_ops, commercial
- `description` — 50–500 characters, a testable hypothesis
- `criticality` — one of: high, medium, low
- `confidence` — one of: high, medium, low
- `test_method` — how to validate or invalidate this assumption

**Rules:**
1. Each `description` must state a testable hypothesis.
2. Respond with ONLY a valid JSON object. No markdown fences, no explanation, no text outside the JSON.
