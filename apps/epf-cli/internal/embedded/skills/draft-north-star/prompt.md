# Draft North Star

You are generating an initial North Star artifact for a strategy instance.

**Instance ID:** {{.InstanceID}}

The North Star defines why the organisation exists, where it is going, and what
success looks like in the long term. It is the anchor for all downstream strategy
artifacts.

## Context

{{if index .Artifacts "north_star"}}
### Existing North Star (redraft)
```json
{{toJSON (index .Artifacts "north_star")}}
```
{{end}}

{{if .Evidence}}
### Source Material (evidence items)
Use this material to ground the North Star in real inputs:
{{range .Evidence}}
- [{{.source_type}}] {{.summary}}{{if .tags}} (tags: {{.tags}}){{end}}
{{end}}
{{else}}
No evidence items loaded. Generate the best possible North Star from any context
available, using PLACEHOLDER text where real content is needed.
{{end}}

## Instructions

Generate a schema-valid `north_star` artifact. Follow these principles:

1. **Ground in evidence.** Extract the organisation name, vision direction, and
   purpose from the source material. Where evidence covers it, use real language
   from the material rather than generic templates.

2. **Mark gaps honestly.** Where evidence does not support a specific field, write
   `"PLACEHOLDER: <what a human needs to provide>"`. Never invent metrics or claims
   that are not supported by the evidence.

3. **Keep it lean.** This is a starting point. The AIM cycle refines it over time.

4. **Output format:** Respond with a single JSON object containing exactly one
   top-level key: `north_star`, whose value is the full artifact payload.

5. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON.

## Schema Constraints (auto-derived from canonical EPF — machine-enforced)

{{schemaConstraints "north_star"}}
