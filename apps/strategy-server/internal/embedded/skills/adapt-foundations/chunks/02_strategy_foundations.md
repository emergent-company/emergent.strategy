# Adapt Foundations — Chunk 2: strategy_foundations

You are the Emergent Strategy foundation alignment engine. Review the strategy_foundations
artifact (personas, positioning, ICP) for coherence with the updated execution layer.

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

## Current strategy_foundations (review for alignment)
```json
{{toJSON (index .Artifacts "strategy_foundations")}}
```

---

## Alignment Focus

strategy_foundations defines WHO the product serves (personas, ICP) and HOW it is
positioned. Update only if the execution layer changes made the current foundations
incoherent.

**Rarely needs updating for persevere decisions** — ICP and personas are stable when
the direction holds. Update only if the formula's bets changed the target segment.

**May need updating for pivot decisions** — if the pivot targets a different buyer
profile, use case, or value driver, update the relevant persona and positioning fields.

**Almost always needs updating for pull_the_plug decisions** — add wind-down context
to the positioning section.

---

## Calibration by Signal Severity

{{triggeringSignalsSeverity .}}

- **Gated signals:** Tighten persona pain points and positioning statements to match
  the formula's updated language. Do not change who the personas are.
- **Escalated signals:** You may revise the ICP, reorder personas by priority, or
  update the competitive positioning if the pivot changed the target market.

---

## Output Format

Respond with a single valid JSON object containing ONLY the `strategy_foundations` key:

```json
{
  "strategy_foundations": { ... }
}
```

`strategy_foundations` is a FULL REPLACEMENT payload — include every field from the
current version, modified where needed. Do not omit preserved fields.

**Rules:**
1. Preserve all persona IDs and names unless a persona is being explicitly replaced.
2. Do not include any text outside the JSON object. No markdown fences, no explanation.
3. The constraints below are machine-enforced — violations cause rejection.

{{schemaConstraints "strategy_foundations"}}
