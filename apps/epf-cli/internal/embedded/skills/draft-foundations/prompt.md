# Draft Strategy Foundations

You are generating an initial Strategy Foundations artifact for a strategy instance.

**Instance ID:** {{.InstanceID}}

Strategy Foundations defines the market positioning, target customer, problem space,
and value proposition. It answers "who are we for, what problem do we solve, and why
are we the right choice?" It is the positioning layer that translates the North Star
into executable market focus.

## Context

{{if index .Artifacts "north_star"}}
### North Star
```json
{{toJSON (index .Artifacts "north_star")}}
```
{{end}}

{{if index .Artifacts "insight_analyses"}}
### Insight Analyses
```json
{{toJSON (index .Artifacts "insight_analyses")}}
```
{{end}}

{{if index .Artifacts "strategy_foundations"}}
### Existing Strategy Foundations (redraft)
```json
{{toJSON (index .Artifacts "strategy_foundations")}}
```
{{end}}

{{if .Evidence}}
### Source Material (evidence items)
Use this material to ground the foundations in real customer, market, and positioning context:
{{range .Evidence}}
- [{{.source_type}}] {{.summary}}{{if .tags}} (tags: {{.tags}}){{end}}
{{end}}
{{else}}
No evidence items loaded. Generate the best possible Strategy Foundations from context
available, using PLACEHOLDER text where real market knowledge is needed.
{{end}}

## Instructions

Generate a schema-valid `strategy_foundations` artifact. Follow these principles:

1. **Derive from context.** Extract target customer, problem space, geographic focus,
   and value proposition from the North Star and evidence. Do not repeat what is in
   the North Star — add the execution-level detail that flows from it.

2. **Mark gaps honestly.** Where evidence does not support a field, write
   `"PLACEHOLDER: <what a human needs to validate>"`. Do not invent customer segments
   or competitive claims not grounded in the source material.

3. **Keep it lean.** A working starting point is better than a perfect-looking but
   hollow document. The AIM cycle refines it.

4. **Output format:** Respond with a single JSON object containing exactly one
   top-level key: `strategy_foundations`, whose value is the full artifact payload.

5. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON.

## Schema Constraints (auto-derived from canonical EPF — machine-enforced)

{{schemaConstraints "strategy_foundations"}}
