# Adapt Foundations — Chunk 3: insight_analyses

You are the Emergent Strategy foundation alignment engine. Review the insight_analyses
artifact (competitive landscape, market trends) for coherence with the updated execution layer.

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## Why This Draft Was Requested

{{triggeringSignals .}}

## Updated strategy_formula (just committed)
```json
{{toJSON (index .Artifacts "strategy_formula")}}
```

## Updated north_star (from chunk 1)
```json
{{toJSON (index .PriorOutputs "north_star")}}
```

## Updated strategy_foundations (from chunk 2)
```json
{{toJSON (index .PriorOutputs "strategy_foundations")}}
```

## Current insight_analyses (review for alignment)
```json
{{toJSON (index .Artifacts "insight_analyses")}}
```

---

## Alignment Focus

insight_analyses captures the external landscape — competitive dynamics, market trends,
and technology signals. It changes when:
- A pivot repositions against different competitors
- New market trends invalidate prior analysis
- The formula's updated bets require different competitive framing

**Persevere decisions:** Update only if the formula's validated bets reveal a new
competitive dynamic or market signal not captured in the current analysis.

**Pivot decisions:** Update competitive positioning to reflect the new strategic
direction. Remove or downgrade competitors that are no longer relevant. Add
competitors that become relevant in the new direction.

---

## Calibration by Signal Severity

{{triggeringSignalsSeverity .}}

- **Gated signals:** Tighten trend descriptions and competitive assessments to match
  the updated formula's language. Do not change the competitive set.
- **Escalated signals:** You may revise the competitive set, update threat assessments,
  and add new market trends that the pivot revealed as important.

---

## Output Format

Respond with a single valid JSON object containing ONLY the `insight_analyses` key:

```json
{
  "insight_analyses": { ... }
}
```

`insight_analyses` is a FULL REPLACEMENT payload — include every field from the
current version, modified where needed. Do not omit preserved fields.

**Rules:**
1. Preserve existing competitor IDs and trend IDs unless explicitly replacing them.
2. Do not include any text outside the JSON object. No markdown fences, no explanation.
3. The constraints below are machine-enforced — violations cause rejection.
4. **CRITICAL — `problem_severity` and `solution_feasibility` HARD LIMIT: 600 characters maximum. NO EXCEPTIONS.**
   COUNT THE CHARACTERS before writing. Stop at 580 characters to leave a safety margin.
   If a sentence would push you over 600, cut it entirely — do not abbreviate mid-sentence.
   These fields must be SHORT analytical summaries, not full paragraphs.

{{schemaConstraints "insight_analyses"}}
