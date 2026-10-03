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

{{if index .Artifacts "value_model"}}
### Current Value Model (committed state — one per track)

This is the value model as it exists today. It is the source of truth for the
existing layer/component/sub-component structure, descriptions, and
human-authored content. You MUST treat everything here as given: do not
re-create, rename, re-describe, re-order, or drop any of it. Your only job is
to change `active` / `activation_notes` on the components the roadmap targets.

```json
{{toJSON (index .Artifacts "value_model")}}
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

Portfolio alignment is an **incremental activation** operation, not a
regeneration. The value model already exists (see "Current Value Model" above).
You are producing a **patch** that flips specific components on or off to match
what the current roadmap is optimising for — nothing more.

**Do NOT emit full `value_model` payloads. Do NOT re-author structure.** The
existing layers, components, sub-components, their ids, names, descriptions,
`path_segment`s, and all other fields are human-authored and authoritative.
Emitting a replacement payload has, in real use, destroyed rich domain models
(e.g. collapsing a 45-component model down to a 2-component skeleton). That must
not happen.

Follow these principles:

1. **Read the roadmap OKRs per track.** For each track present in the roadmap
   (product, strategy, org_ops, commercial), identify which value paths are being
   actively pursued this cycle based on the key results — in particular any
   `value_model_target` references on the KRs.

2. **Resolve each target to an existing component.** A `value_model_target`
   names a dot-separated `L1.L2.L3` component path. Find that exact component in
   the Current Value Model above. If it does not exist, do NOT invent it — emit a
   `warnings` entry instead. Never create components to satisfy a target.

3. **Activate only what the roadmap targets.** For each resolved component, set
   `active: true` and write an `activation_notes` string that cites the KR id
   driving it. Activation propagates upward: a component's parent layer/component
   is also active. Leave everything the roadmap does not target untouched —
   including components that are currently active but no longer targeted should
   only be deactivated if the roadmap clearly drops them, and then with a note.

4. **Be specific about why.** Every activation/deactivation must cite a KR id or
   strategic bet. Do not activate speculatively.

5. **Output format — a patch, not a replacement.** Respond with a single JSON
   object of the following shape:

   ```json
   {
     "activations": [
       {
         "track": "product",
         "component_path": "L1-id.L2-id.L3-id",
         "active": true,
         "activation_notes": "Targeted by KR <kr-id>: <reason>"
       }
     ],
     "deactivations": [
       {
         "track": "strategy",
         "component_path": "L1-id.L2-id",
         "reason": "No longer referenced by any current-cycle KR"
       }
     ],
     "warnings": [
       "value_model_target product.L1-x.L2-y.L3-z on KR <kr-id> matches no component in the current value model"
     ]
   }
   ```

   Each `component_path` MUST reference a component that exists in the Current
   Value Model above. Every other field of the value model is left exactly as it
   is — the consumer applies this patch to the committed artifact.

6. **Produce only the JSON object.** No markdown fences, no explanation outside
   the JSON.

## Reference: value_model structure (for resolving component paths only)

The constraints below describe the `value_model` artifact so you can correctly
resolve `L1.L2.L3` component paths against the Current Value Model. They are
**not** an instruction to emit a full value_model payload — emit only the patch
object specified above.

{{schemaConstraints "value_model"}}
