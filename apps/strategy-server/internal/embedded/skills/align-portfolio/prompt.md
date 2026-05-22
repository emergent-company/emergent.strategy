# Align Portfolio

You are aligning the value model with the current roadmap and strategy formula.

**Instance ID:** {{.InstanceID}}

The Value Model defines which value generators the organisation is betting on
across its four execution tracks (product, strategy, org_ops, commercial). Portfolio
alignment ensures the value model reflects the current strategic bets and roadmap
priorities — so that the FIRE phase definitions and features trace back to the right
value paths.

## Context

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

{{if index .Artifacts "strategy_foundations"}}
### Strategy Foundations
```json
{{toJSON (index .Artifacts "strategy_foundations")}}
```
{{end}}

{{if index .Artifacts "north_star"}}
### North Star
```json
{{toJSON (index .Artifacts "north_star")}}
```
{{end}}

{{if .Evidence}}
### Source Material (evidence items)
{{range .Evidence}}
- [{{.source_type}}] {{.summary}}{{if .tags}} (tags: {{.tags}}){{end}}
{{end}}
{{end}}

## Instructions

Generate schema-valid `value_model` artifact updates — one per track — that
reflect what the current roadmap and strategy formula are optimising for. Follow
these principles:

1. **Read the roadmap OKRs per track.** For each of the four tracks (product,
   strategy, org_ops, commercial), identify which value paths are being actively
   pursued this cycle based on the key results.

2. **Activate the right components.** Set each relevant value model component
   to active and assign a tier that reflects its priority this cycle. Components
   not relevant to the current roadmap should remain inactive.

3. **Be specific about why.** Each activated component should have a clear
   rationale that traces back to a KR or strategic bet. Do not activate components
   speculatively.

4. **Output format:** Respond with a single JSON object containing a `value_models`
   array — one entry per track. Each entry must be a schema-valid `value_model`
   artifact payload for that track.

5. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON. All field names, status values, and structural requirements are
   defined in the schema constraints below — violations cause the output to be
   rejected.

## Schema Constraints (auto-derived from canonical EPF — machine-enforced)

{{schemaConstraints "value_model"}}
