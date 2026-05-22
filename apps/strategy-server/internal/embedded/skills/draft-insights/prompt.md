# Draft Insight Analyses

You are generating an initial Insight Analyses artifact for a strategy instance.

**Instance ID:** {{.InstanceID}}

Insight Analyses captures the external landscape — market trends, competitive
positioning, customer understanding, and white-space opportunities — that inform
the strategy. It is the external intelligence layer that feeds Strategy Foundations
and Insight Opportunity.

## Context

{{if index .Artifacts "north_star"}}
### North Star
```json
{{toJSON (index .Artifacts "north_star")}}
```
{{end}}

{{if index .Artifacts "insight_analyses"}}
### Existing Insight Analyses (redraft)
```json
{{toJSON (index .Artifacts "insight_analyses")}}
```
{{end}}

{{if .Evidence}}
### Source Material (evidence items)
Extract market, competitive, customer, and technology insight from this material:
{{range .Evidence}}
- [{{.source_type}}] {{.summary}}{{if .tags}} (tags: {{.tags}}){{end}}
{{end}}
{{else}}
No evidence items loaded. Generate the best possible Insight Analyses from any
context available, using PLACEHOLDER text where real research is needed.
{{end}}

## Instructions

Generate a schema-valid `insight_analyses` artifact. Follow these principles:

1. **Extract from evidence.** Use the source material to populate competitive
   landscape, market trends, and customer personas with concrete observations.
   Prefer specific claims with attribution over generic placeholders.

2. **Mark gaps honestly.** Where evidence does not cover a required section,
   write `"PLACEHOLDER: <what a human needs to research>"`. Do not invent
   market data, competitor names, or persona details not present in the source.

3. **Keep it lean.** First-pass analysis. Real insight deepens over AIM cycles.

4. **Output format:** Respond with a single JSON object containing exactly one
   top-level key: `insight_analyses`, whose value is the full artifact payload.

5. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON.

## Schema Constraints (auto-derived from canonical EPF — machine-enforced)

{{schemaConstraints "insight_analyses"}}
