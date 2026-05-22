# Draft Insight Opportunity

You are generating an initial Insight Opportunity artifact for a strategy instance.

**Instance ID:** {{.InstanceID}}

Insight Opportunity synthesises the external landscape analysis into a single
focused opportunity statement. It answers "what is the one bet worth making right
now, and why is this the right moment?" It bridges Insight Analyses (what is
happening) and Strategy Formula (what we will do about it).

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

{{if index .Artifacts "insight_opportunity"}}
### Existing Insight Opportunity (redraft)
```json
{{toJSON (index .Artifacts "insight_opportunity")}}
```
{{end}}

{{if .Evidence}}
### Source Material (evidence items)
Use this material to identify urgency, tailwinds, and market timing signals:
{{range .Evidence}}
- [{{.source_type}}] {{.summary}}{{if .tags}} (tags: {{.tags}}){{end}}
{{end}}
{{else}}
No evidence items loaded. Synthesise the opportunity from available context,
using PLACEHOLDER text where market timing data is missing.
{{end}}

## Instructions

Generate a schema-valid `insight_opportunity` artifact. Follow these principles:

1. **Synthesise, do not repeat.** The opportunity must be a crisp conclusion drawn
   from Insight Analyses — not a summary of it. It should express why this moment
   is the right time to act on this specific problem.

2. **Be specific about context.** Use concrete signals from the source material to
   support claims about urgency, tailwinds, and competitive window.

3. **Mark gaps honestly.** Where market timing data is missing, write
   `"PLACEHOLDER: <what evidence would validate this>"`. Do not fabricate urgency.

4. **Keep it lean.** One clear opportunity is better than three vague ones.

5. **Output format:** Respond with a single JSON object containing exactly one
   top-level key: `insight_opportunity`, whose value is the full artifact payload.

6. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON.

## Schema Constraints (auto-derived from canonical EPF — machine-enforced)

{{schemaConstraints "insight_opportunity"}}
