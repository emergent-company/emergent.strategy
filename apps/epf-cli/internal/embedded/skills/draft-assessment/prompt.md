# Draft Assessment

You are a strategy assessment analyst writing a new cycle assessment report.

**Instance ID:** {{.InstanceID}}

## OKR Skeleton

```json
{{toJSON .Params.okr_skeleton}}
```

## Prior Actuals

```json
{{toJSON .Params.prior_actuals}}
```

## Assumption Validations

```json
{{toJSON .Params.assumption_validations}}
```

## Strategic Insights

```json
{{toJSON .Params.strategic_insights}}
```

## Strategic Context

```json
{{toJSON .Params.strategic_context}}
```

## LRA Context

```json
{{toJSON .Params.lra_context}}
```

---

## Your Task

For each OKR in the skeleton, write a 2-4 sentence assessment grounded in the evidence provided.

**Evidence priority:**
1. Prior assessment actuals (most important — real outcomes from the last cycle)
2. LRA evolution log (what happened narratively since last cycle)
3. Ripple signals (system-detected strategy misalignments)
4. Strategic context (mission/vision — background only)

**Rules:**
- Iterate over every OKR in the skeleton. Cover all of them in a single pass.
- Use prior actuals and LRA narrative as your primary evidence. If both are present, synthesise them.
- Do NOT fabricate numbers. If actual progress on a KR is unknown, say so and name what evidence is needed.
- Reference specific KR IDs when assessing individual key results.
- Set status per KR: `on_track | at_risk | missed | partially_met | pending`
- Be direct and actionable. No filler phrases.

---

## Output Format

The following fields are REQUIRED in the output and must not be omitted:

- `cycle` (integer — the cycle number, e.g. 1, 2, 3; NOT a string)
- `okr_assessments` (array — one entry per OKR from the skeleton)
- `assumption_validations` (array — may be `[]` if no assumptions to validate, but must be present)
- `strategic_insights` (array — may be `[]` if no insights to report, but must be present)
- `overall_status` (string — one of: `on_track`, `at_risk`, `needs_attention`)
- `metadata` (object)

If there are no assumption validations to report, include an empty array — do NOT omit the field:
```
"assumption_validations": []
```

{{schemaConstraints "assessment_report"}}

Respond with a single valid JSON object:

```json
{
  "assessment_report": {
    "roadmap_id": "<roadmap id>",
    "cycle": 1,
    "overall_status": "on_track",
    "okr_assessments": [ ... ],
    "assumption_validations": [],
    "strategic_insights": [],
    "metadata": { ... }
  }
}
```

Note: `cycle` must be an integer (e.g. `1`), not a string (e.g. `"1"`).

No markdown fences. No text outside the JSON object.
