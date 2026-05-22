# Draft Living Reality Assessment

You are generating an initial Living Reality Assessment (LRA) for a strategy instance.

**Instance ID:** {{.InstanceID}}

The LRA captures the current state of reality — what is actually happening in the
market, product, and organisation — as the baseline for the AIM cycle (Observe → Assess
→ Decide → Adapt).

## Strategy Context

### North Star
```json
{{toJSON (index .Artifacts "north_star")}}
```

{{if index .Artifacts "strategy_foundations"}}
### Strategy Foundations
```json
{{toJSON (index .Artifacts "strategy_foundations")}}
```
{{end}}

{{if index .Artifacts "strategy_formula"}}
### Strategy Formula
```json
{{toJSON (index .Artifacts "strategy_formula")}}
```
{{end}}

{{if index .Artifacts "roadmap_recipe"}}
### Roadmap Recipe
```json
{{toJSON (index .Artifacts "roadmap_recipe")}}
```
{{end}}

## Instructions

Generate a schema-valid `living_reality_assessment` artifact. Follow these principles:

1. **Be concrete about what you know from context.** If the roadmap has OKRs, list them
   in `track_baselines` with `baseline: "not yet measured"` and `trajectory: "unknown"`.
   Do not invent specific metrics.

2. **Mark gaps honestly.** Where you do not have real-world data (market conditions,
   competitive moves, team situation), use placeholder text that makes it obvious a human
   needs to fill in the real information. Use phrases like "PLACEHOLDER: describe actual
   market conditions here" rather than invented details.

3. **Keep the first LRA lean.** This is a starting point, not a complete picture.
   The AIM cycle exists to refine it over time.

4. **Required fields you MUST populate:**
   - `metadata.version` — use "1.0.0"
   - `metadata.assessment_date` — today's date in YYYY-MM-DD format
   - `metadata.cycle_number` — use 1
   - `metadata.status` — use "draft"
   - `adoption_context.current_phase` — infer from north_star or use "early_growth"
   - `adoption_context.key_milestones` — list 2-3 milestones derived from roadmap OKRs if available, otherwise use placeholders
   - `track_baselines` — one entry per OKR track found in roadmap (product, commercial, org_ops, strategy); if no roadmap exists, use a single product entry
   - `current_focus.primary_objective` — extract from north_star or strategy_formula

5. **Output format:** Respond with a JSON object containing exactly one key:
   `living_reality_assessment`, whose value is the full LRA payload.
   Do not include any text outside the JSON object. No markdown fences, no explanation.

{{schemaConstraints "living_reality_assessment"}}
