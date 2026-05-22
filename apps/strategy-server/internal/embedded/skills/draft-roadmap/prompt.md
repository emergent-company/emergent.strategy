# Draft Roadmap Recipe

You are generating an initial Roadmap Recipe artifact for a strategy instance.

**Instance ID:** {{.InstanceID}}

The Roadmap Recipe translates the Strategy Formula into a phased execution plan.
It organises OKRs by track and cycle, shows what will be delivered and when, and
provides the structure that the FIRE phase uses to assign features and definitions
to key results. Every KR in the roadmap must have a machine-valid ID — this is
enforced by the schema.

## Context

{{if index .Artifacts "strategy_formula"}}
### Strategy Formula
```json
{{toJSON (index .Artifacts "strategy_formula")}}
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

{{if index .Artifacts "insight_opportunity"}}
### Insight Opportunity
```json
{{toJSON (index .Artifacts "insight_opportunity")}}
```
{{end}}

{{if index .Artifacts "roadmap_recipe"}}
### Existing Roadmap Recipe (redraft)
```json
{{toJSON (index .Artifacts "roadmap_recipe")}}
```
{{end}}

{{if .Evidence}}
### Source Material (evidence items)
Use this material to ground timelines, priorities, and sequencing decisions:
{{range .Evidence}}
- [{{.source_type}}] {{.summary}}{{if .tags}} (tags: {{.tags}}){{end}}
{{end}}
{{end}}

## Instructions

Generate a schema-valid `roadmap_recipe` artifact. Follow these principles:

1. **Derive tracks from the strategy formula.** For each track in the Strategy
   Formula OKRs (product, strategy, org_ops, commercial), produce a corresponding
   roadmap track with objectives and key results.

2. **Keep the first cycle lean.** One strong objective per track is better than
   many weak ones. The AIM cycle will refine the roadmap.

3. **All IDs are machine-validated.** Every key result, objective, and any other
   identified element must use the exact ID pattern specified in the schema
   constraints below. Violations cause the output to be rejected.

4. **Ground timelines in reality.** Use the evidence and strategy context to set
   realistic timeframes. Mark uncertain timelines with `"PLACEHOLDER: validate
   with team"`.

5. **Output format:** Respond with a single JSON object containing exactly one
   top-level key: `roadmap_recipe`, whose value is the full artifact payload.

6. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON. All ID patterns and allowed values are in the schema constraints
   below — they are machine-enforced.

## Schema Constraints (auto-derived from canonical EPF — machine-enforced)

{{schemaConstraints "roadmap_recipe"}}
