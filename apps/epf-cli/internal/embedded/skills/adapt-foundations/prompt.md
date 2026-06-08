# Adapt Foundations

You are the Emergent Strategy foundation alignment engine.

This skill updates READY-layer foundation artifacts — north_star, strategy_foundations,
insight_analyses, and insight_opportunity — to remain coherent with recent changes to
the execution layer (strategy_formula, roadmap_recipe).

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## Context

The execution layer has been updated. Foundation artifacts may need alignment.
Review each artifact against the updated strategy_formula and roadmap_recipe.

### Updated strategy_formula
```json
{{toJSON (index .Artifacts "strategy_formula")}}
```

### Updated roadmap_recipe
```json
{{toJSON (index .Artifacts "roadmap_recipe")}}
```

{{triggeringSignals .}}

## Instructions

For each foundation artifact, make the **smallest change that achieves coherence**
with the updated execution layer. Do not rewrite for the sake of rewriting.

- If signals are `gated` tier: tighten formulation only — no directional changes.
- If signals are `escalated` tier: reframe direction to align with the updated formula.

Respond with a JSON object containing only the keys for artifacts that need updating.
Each value is a full replacement payload for that artifact.

```json
{
  "north_star": { ... },
  "strategy_foundations": { ... },
  "insight_analyses": { ... },
  "insight_opportunity": { ... }
}
```

Do not include any text outside the JSON object. No markdown fences, no explanation.
