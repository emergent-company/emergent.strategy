# Draft Strategy Formula

You are generating an initial Strategy Formula artifact for a strategy instance.

**Instance ID:** {{.InstanceID}}

The Strategy Formula is the beating heart of the EPF strategy — it defines the
strategic bets, competitive moat, OKRs per track, and riskiest assumptions. It
operationalises the North Star into a testable, executable strategy for the current
cycle. Everything downstream (roadmap, features, value models) must be consistent
with it.

## Context

{{if index .Artifacts "north_star"}}
### North Star
```json
{{toJSON (index .Artifacts "north_star")}}
```
{{end}}

{{if index .Artifacts "strategy_foundations"}}
### Strategy Foundations
```json
{{toJSON (index .Artifacts "strategy_foundations")}}
```
{{end}}

{{if index .Artifacts "insight_opportunity"}}
### Insight Opportunity
```json
{{toJSON (index .Artifacts "insight_opportunity")}}
```
{{end}}

{{if index .Artifacts "strategy_formula"}}
### Existing Strategy Formula (redraft)
```json
{{toJSON (index .Artifacts "strategy_formula")}}
```
{{end}}

{{if .Evidence}}
### Source Material (evidence items)
Use this material to ground bets, moat reasoning, and assumptions in real inputs:
{{range .Evidence}}
- [{{.source_type}}] {{.summary}}{{if .tags}} (tags: {{.tags}}){{end}}
{{end}}
{{else}}
No evidence items loaded. Generate the best possible Strategy Formula from context
available, using PLACEHOLDER text where real validation is needed.
{{end}}

## Instructions

Generate a schema-valid `strategy_formula` artifact. Follow these principles:

1. **Derive bets from the opportunity.** Each strategic bet should map to a claim
   about how this organisation wins in the identified opportunity. Be specific
   enough that the bet is testable.

2. **Articulate the moat honestly.** Identify the real source of defensibility
   from the evidence. Do not claim a moat type that is not supported. Use
   `"PLACEHOLDER: describe actual defensibility here"` if unsupported.

3. **Create OKRs per track.** Produce at least one objective with key results
   for each active track (product, strategy, org_ops, commercial). Key result
   targets should be grounded in evidence where possible, otherwise use ranges
   that will be calibrated in the first AIM cycle.

4. **List riskiest assumptions.** Name the assumptions that, if wrong, would
   break the strategy. These will be tested in the FIRE phase.

5. **Mark gaps honestly.** Use `"PLACEHOLDER: <what needs to be validated>"`
   rather than inventing specific metrics or claims.

6. **Output format:** Respond with a single JSON object containing exactly one
   top-level key: `strategy_formula`, whose value is the full artifact payload.

7. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON. All field values, patterns, and allowed enum values are defined in
   the schema constraints below — violations cause the output to be rejected.

## Schema Constraints (auto-derived from canonical EPF — machine-enforced)

{{schemaConstraints "strategy_formula"}}
