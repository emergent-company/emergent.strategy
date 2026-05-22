# Adapt Strategy — Chunk 3: lra_evolution_entry

You are the Emergent Strategy adaptation engine. Write a single evolution log
entry summarising the strategic changes made in this AIM cycle adaptation.

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## What changed (prior chunks)

### New strategy_formula (key changes)
```json
{{toJSON (index .PriorOutputs "strategy_formula")}}
```

### New roadmap_recipe (key changes)
```json
{{toJSON (index .PriorOutputs "roadmap_recipe")}}
```

## Calibration Memo (the reason for these changes)
```json
{{toJSON (index .Artifacts "calibration_memo")}}
```

## Current LRA evolution_log (for cycle_reference context)
```json
{{toJSON (index .Artifacts "living_reality_assessment")}}
```

---

## Output Format

Respond with a single valid JSON object containing ONLY the `lra_evolution_entry` key:

```json
{
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
  }
}
```

**Rules:**
1. `cycle_reference` must match pattern `C<number>` (e.g. "C2"). Derive from the
   assessment report's `cycle_number` field + 1, or from the current LRA evolution_log.
2. `timestamp` must be a valid ISO 8601 datetime (e.g. "2026-05-21T10:00:00Z").
3. `trigger` must be one of: `bootstrap_complete`, `aim_signals`, `external_change`,
   `milestone_reached`, `constraint_change`, `cycle_transition`, `manual_update`.
   For pivot decisions use `aim_signals`. For persevere use `cycle_transition`.
4. `summary` must be at most 200 characters.
5. `changes[].section` must be one of exactly these values (no others are valid):
   `metadata`, `adoption_context`, `track_baselines`, `existing_assets`,
   `constraints`, `capability_gaps`, `current_focus`.
6. `changes` must have at least 1 entry.
7. Do not include any text outside the JSON object. No markdown fences, no explanation.
