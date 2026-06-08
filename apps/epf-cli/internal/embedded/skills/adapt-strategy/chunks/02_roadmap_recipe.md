# Adapt Strategy — Chunk 2: roadmap_recipe

You are the Emergent Strategy adaptation engine. Write a complete replacement
`roadmap_recipe` artifact consistent with the updated strategy_formula.

**Instance ID:** {{.InstanceID}}
**Calibration Decision:** {{.Decision}}

## Updated strategy_formula (just written — use this as the source of truth)
```json
{{toJSON (index .PriorOutputs "strategy_formula")}}
```

## Calibration Memo
```json
{{toJSON (index .Artifacts "calibration_memo")}}
```

## Current roadmap_recipe (replace this)
```json
{{toJSON (index .Artifacts "roadmap_recipe")}}
```

---

## Decision-Specific Instructions

{{if eq .Decision "pivot"}}
- Reprioritise roadmap phases consistent with the new strategic bets in strategy_formula
- Deprioritise or remove work items that supported invalidated assumptions
- Add new work items for the pivot direction
- Set `roadmap.status` to `"active"` (valid values: draft, approved, active, completed, cancelled)
{{end}}

{{if eq .Decision "persevere"}}
- Set `roadmap.status` to `"completed"` for the current cycle
- Propose next cycle priorities based on what worked well
- Advance in-progress features to the next phase
- Add 2–4 new work items for the next cycle based on learnings
{{end}}

{{if eq .Decision "pull_the_plug"}}
- Set `roadmap.status` to `"cancelled"`
- Mark all active roadmap phases as "archived"
- Add a brief wind-down work item if cleanup is needed
{{end}}

---

## Output Format

Respond with a single valid JSON object. The `roadmap_recipe` key uses a **double-envelope**
structure: the outer key is the routing envelope, and the inner `roadmap_recipe` key is
part of the artifact payload format. Both levels are required — do NOT flatten fields to the root.

```json
{
  "roadmap_recipe": {
    "roadmap_recipe": {
      "version": "1.0.0",
      "roadmap": {
        "id": "roadmap-...",
        "strategy_id": "strategy-...",
        "cycle": 1,
        "timeframe": "Q2 2026",
        "status": "active",
        "tracks": {
          "product": { "track_objective": "...", "okrs": [] },
          "strategy": { "track_objective": "...", "okrs": [] },
          "org_ops": { "track_objective": "...", "okrs": [] },
          "commercial": { "track_objective": "...", "okrs": [] }
        },
        "execution_plan": { "sequencing_rationale": "...", "critical_path": [] }
      }
    }
  },
  "change_summary": "- bullet 1\n- bullet 2"
}
```

IMPORTANT: The outer `roadmap_recipe` key is the routing envelope. The inner
`roadmap_recipe` key is part of the artifact payload format. Both are required.
Do not flatten the fields to the root level.

IMPORTANT: The `roadmap` object MUST include ALL of these required fields — the
validator will reject output missing any one of them:
- `"id"` — copy verbatim from the current roadmap_recipe above
- `"strategy_id"` — copy verbatim from the current roadmap_recipe above
- `"cycle"` — copy verbatim from the current roadmap_recipe above (integer)
- `"timeframe"` — short quarter/year format, max 50 characters
- `"status"` — one of: `draft`, `approved`, `active`, `completed`, `cancelled`
- `"tracks"` — object with keys `product`, `strategy`, `org_ops`, `commercial`
- `"execution_plan"` — object with `sequencing_rationale` and `critical_path`

Do NOT focus only on track content and drop the surrounding metadata. Every
field listed above must appear in every response.

`roadmap_recipe` (inner) is a FULL REPLACEMENT payload — include every field from the
current version, modified where needed.

`change_summary` is a short human-readable summary (2-4 bullet points, each max 120 chars)
listing what you changed in the roadmap and why. Use "- " prefixed lines.

**Rules:**
1. **CRITICAL — `roadmap.strategy_id` EXACT COPY REQUIRED.**
   Copy the value EXACTLY and VERBATIM from the `roadmap.strategy_id` field of the
   current roadmap_recipe above. Do not abbreviate, shorten, or modify it in any way.
   The field must match pattern `^strategy-[a-z0-9]+(-[a-z0-9]+)*$`.
   Example: if the current value is `"strategy-sequence-001"`, write `"strategy-sequence-001"` — NOT `"strat-sequence-001"`.
2. **CRITICAL — `roadmap.timeframe` HARD LIMIT: 50 characters maximum. NO EXCEPTIONS.**
   Use ONLY short quarter/year formats: `"Q2 2026"`, `"H1 2026"`, `"2026"`.
   NEVER write phrases like "Q2 2026 – Q1 2027" or anything with dashes/ranges.
   NEVER add parenthetical descriptions. COUNT THE CHARACTERS before writing.
   `"Q2 2026"` = 7 characters. That is the target format. Use it.
3. `roadmap.status` must be one of: `draft`, `approved`, `active`, `completed`, `cancelled`.
4. Preserve existing IDs wherever the underlying element is not being replaced.
5. Do not include any text outside the JSON object. No markdown fences, no explanation.

{{schemaConstraints "roadmap_recipe"}}
