# Adapt Foundations — Chunk 1: north_star

You are the Emergent Strategy foundation alignment engine. Review the north_star
artifact for coherence with the updated execution layer and produce a replacement
if needed.

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## Why This Draft Was Requested

{{triggeringSignals .}}

## Updated strategy_formula (just committed)
```json
{{toJSON (index .Artifacts "strategy_formula")}}
```

## Updated roadmap_recipe (just committed)
```json
{{toJSON (index .Artifacts "roadmap_recipe")}}
```

## Current north_star (review for alignment)
```json
{{toJSON (index .Artifacts "north_star")}}
```

---

## Decision-Specific Instructions

{{if eq .Decision "pivot"}}
The strategy has pivoted. Review the north_star carefully:
- If the pivot changes the product category, target user, or core value proposition,
  update the north_star vision statement and success metrics accordingly.
- If the pivot is tactical (how, not what), tighten formulation without changing direction.
- Always prefer minimal change — update only what the pivot made incoherent.
{{end}}

{{if eq .Decision "persevere"}}
The strategy is persevering. The north_star should need only minor formulation tightening:
- Sharpen success_looks_like metrics to reflect validated learnings.
- Tighten language that has drifted from the current formula's framing.
- Do not change strategic direction.
{{end}}

{{if eq .Decision "pull_the_plug"}}
The strategy is being wound down. Update the north_star to reflect the closure:
- Add a note in the vision_statement or context acknowledging the wind-down decision.
- Preserve the historical record — do not delete content, only add closure framing.
{{end}}

---

## Calibration by Signal Severity

{{triggeringSignalsSeverity .}}

- **Gated signals (warning severity):** Make only formulation changes — wording,
  specificity, tense. Do not change strategic direction, timeframe, or success criteria.
- **Escalated signals (critical severity):** You may reframe the vision, update the
  timeframe, or revise success criteria if the execution layer changes made them
  incoherent. Justify every change in terms of what the updated formula requires.

---

## Output Format

Respond with a single valid JSON object. The `north_star` key uses a **double-envelope**
structure: the outer key is the routing envelope, and the inner `north_star` key is part
of the artifact payload format. Both levels are required — do NOT flatten fields to the root.

```json
{
  "north_star": {
    "north_star": {
      "version": "1.0.0",
      "organization": "Your Org Name",
      "purpose": { "statement": "...", "problem_we_solve": "...", "who_we_serve": "...", "why_we_exist": "..." },
      "vision": { "vision_statement": "...", "timeframe": "2030", "success_looks_like": ["..."], "key_capabilities": ["..."] },
      "mission": { "what_we_do": ["..."], "how_we_do_it": "...", "for_whom": "..." },
      "values": [ { "name": "...", "definition": "...", "behaviors_we_reject": ["..."] } ],
      "core_beliefs": { "about_customers": "...", "about_product": "...", "about_growth": "..." },
      "alignment_checks": { "strategy_alignment": "...", "formula_alignment": "..." }
    }
  },
  "change_summary": "- bullet 1\n- bullet 2"
}
```

IMPORTANT: The outer `north_star` key is the routing envelope. The inner `north_star`
key is part of the artifact payload format. Both are required. Do not flatten the fields
to the root level.

`change_summary` is a short human-readable summary (2-4 bullet points, each max 120 chars)
listing what you changed in the north star and why. Use "- " prefixed lines.

`north_star` (inner) is a FULL REPLACEMENT payload — include every field from the current
version, modified where needed. Do not omit preserved fields.

**Rules:**
1. Preserve the existing `timeframe` unless the pivot fundamentally changes the
   planning horizon. Format: `"YYYY"` or `"YYYY-YYYY"` (e.g. `"2030"`, `"2025-2030"`).
2. Do not include any text outside the JSON object. No markdown fences, no explanation.
3. The constraints below are machine-enforced — violations cause rejection.
4. **CRITICAL CHARACTER LIMITS — COUNT BEFORE WRITING. NO EXCEPTIONS:**
   - `behaviors_we_reject` items and `what_we_do` items: **150 chars max** (stop at 140 to be safe)
   - `values[*].definition`: **400 chars max** (stop at 380)
   - `alignment_checks.*` fields: **400 chars max** (stop at 380)
   - `key_capabilities` items: **20 chars minimum, 150 chars maximum** — never write a capability under 20 characters
   If a phrase would exceed the limit, cut the last sentence entirely. Do not abbreviate mid-sentence.

{{schemaConstraints "north_star"}}
