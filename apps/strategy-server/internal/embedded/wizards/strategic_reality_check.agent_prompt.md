# AI Knowledge Agent: Strategic Reality Check (SRC)

You are conducting a **Strategic Reality Check** — a systematic evaluation of all EPF READY and FIRE artifacts against current reality. Unlike the Assessment Report (which tracks OKR execution outcomes), the SRC asks: **are the strategic foundations still valid?**

The SRC is organized by detection type, not by artifact:

1. **Belief Validity** — Are North Star beliefs, Strategy Formula risks, and Roadmap assumptions still true?
2. **Market Currency** — Are Insight Analyses, competitive landscape, and opportunity assessments still fresh?
3. **Strategic Alignment** — Are cross-references (value model paths, KR links, feature dependencies) intact?
4. **Execution Reality** — Does stated maturity/status match actual implementation state?
5. **Recalibration Plan** — What needs updating, in what priority order?

---

## Step 1: Generate Mechanical Checks

**Start by running the automated checks.** These populate the mechanical portions of the SRC without requiring human judgment.

```
epf_aim_generate_src { "instance_path": "..." }
```

This auto-populates:
- **Market currency**: Compares `last_reviewed`, `next_review_date`, and `last_assessment_date` fields against today's date. Calculates `days_since_review` and assigns `staleness_level`.
- **Strategic alignment**: Validates all `contributes_to[]` paths, KR target paths, feature `dependencies[]`, and LRA-to-value-model maturity consistency. Uses the same logic as `epf_validate_relationships` but produces structured findings.
- **Execution reality** (partial): Checks for status/maturity mismatches (e.g., feature status "delivered" but maturity "hypothetical", or implementation references missing for "in-progress" features).

**Leaves as TODOs:**
- Belief validity (requires evidence evaluation)
- Market currency `market_changes_detected` (requires market research)
- Execution reality subjective gaps (requires judgment)

---

## Step 2: Evaluate Belief Validity

**This is the most subjective section.** For each belief, risk, or assumption with a monitoring directive, assess current evidence.

### Artifacts to evaluate:

| Artifact | Fields to check |
|----------|----------------|
| `READY/00_north_star.yaml` | `belief_challenges[].monitoring`, `core_beliefs[]` |
| `READY/04_strategy_formula.yaml` | `risks[].monitoring`, `strategic_bets[]` |
| `FIRE/05_roadmap_recipe.yaml` | `riskiest_assumptions[].confidence` |

### For each belief/risk/assumption:

1. **Read the original belief** from the source artifact
2. **Gather current evidence** — market data, user feedback, competitive moves, internal metrics
3. **Assess the signal**: strengthening / holding / weakening / invalidated
4. **Determine confidence delta**: increased / decreased / no_change

### Useful MCP tools:
- `epf_get_product_vision` — read North Star beliefs
- `epf_get_competitive_position` — current competitive landscape
- `epf_search_strategy` — search for related strategy content
- `epf_get_value_propositions` — current value propositions

### Guidance:
- **strengthening**: New evidence reinforces the belief. Consider escalating to core assumption.
- **holding**: No material change. Maintain current posture.
- **weakening**: Evidence starting to contradict. Flag for review in recalibration plan.
- **invalidated**: Clear contradiction. Requires immediate strategic response.
- Multiple "weakening" findings across related beliefs suggests a larger strategic shift is needed.

---

## Step 3: Assess Market Currency

**Review the mechanical staleness findings and add market context.**

For each finding from `aim generate-src`:
1. Review the `days_since_review` and `staleness_level`
2. Assess whether actual market changes have occurred since the last review
3. Fill in `market_changes_detected` with specific changes (or leave empty if none)
4. Set `recommended_action` based on combined staleness and market change assessment

### Artifacts to check freshness on:

| Artifact | Review field | Expected cadence |
|----------|-------------|-----------------|
| `READY/00_north_star.yaml` | `last_reviewed` / `next_review` | Yearly |
| `READY/01_insight_analyses.yaml` | `next_review_date` | 3-6 months |
| `READY/03_insight_opportunity.yaml` | Date fields, `confidence_level` | Each cycle |
| `FIRE/feature_definitions/fd-*.yaml` | `last_assessment_date` | 90 days |

### Staleness level guidance:
- **low**: Within review window. No action needed.
- **medium**: Approaching review date, or past date but no known changes. Schedule review.
- **high**: Past review date. Known market changes may apply. Review soon.
- **critical**: Significantly overdue AND known market changes. Review immediately.

---

## Step 4: Review Strategic Alignment

**These findings are fully mechanical.** Review the `aim generate-src` output for:

1. **Broken value model paths** — `contributes_to[]` references that don't resolve. Note the suggested fix.
2. **Broken KR links** — Assumption `linked_to_kr[]` or KR target paths that don't resolve.
3. **Broken feature dependencies** — Feature `dependencies[]` referencing non-existent features.
4. **Maturity vocabulary mismatches** — LRA track maturity vs. value model maturity using different vocabulary.

For each broken or stale reference, verify the finding is accurate and note whether it's a typo, a renamed artifact, or a genuinely missing target.

---

## Step 5: Assess Execution Reality

**Bridge the gap between mechanical checks and judgment calls.**

Review each finding and add:
- Subjective assessment of whether the gap matters
- Context about why the mismatch exists
- Appropriate severity level

### Common patterns to look for:
- Feature status "delivered" but capability maturity still "hypothetical" → probably needs maturity update
- Feature status "in-progress" but no implementation references → might be stalled
- Value model component maturity "proven" but no mapping artifacts → maturity claim unverified
- LRA product stage claim doesn't match feature delivery reality

### Severity guidance:
- **info**: Minor, fix when convenient. (e.g., missing optional field)
- **warning**: Should be addressed soon. (e.g., stale assessment date on active feature)
- **critical**: Materially affects strategic decisions. (e.g., status claims "delivered" but nothing built)

---

## Step 6: Build Recalibration Plan

**Synthesize all findings into a prioritized action list.**

For each finding that requires action:
1. Identify the **target artifact** and **section** that needs updating
2. Choose the **action**: review / update / rewrite / archive
3. Assign **priority**: critical / high / medium / low
4. Estimate **effort**: "15 minutes", "1 hour", "2-3 hours", etc.
5. Write a **rationale** citing specific findings
6. Link back to **finding IDs** from previous sections

### Action type guidance:
- **review**: Just look at it — assess whether change is needed (lowest effort)
- **update**: Modify specific fields — the content is mostly right but needs refreshing
- **rewrite**: Substantial rework — the section or artifact needs fundamental rethinking
- **archive**: Remove or deprecate — content is obsolete

### Priority guidance:
- **critical**: Affects current strategic decisions. Wrong data → wrong decisions.
- **high**: Should be addressed this cycle. Prevents drift from becoming critical.
- **medium**: Address next cycle. Important but not urgent.
- **low**: Nice to have. Fix when convenient.

---

## Step 7: Write the SRC

**Use the write-back tool to finalize the SRC artifact.**

```
epf_aim_write_src {
  "instance_path": "...",
  "cycle": 1,
  "assessment_date": "2025-01-15",
  "belief_validity": [...],
  "market_currency": [...],
  "strategic_alignment": [...],
  "execution_reality": [...],
  "recalibration_plan": [...],
  "summary": {
    "overall_health": "attention_needed",
    "finding_counts": { ... }
  }
}
```

### Overall health assignment:
- **healthy**: 0-2 non-info findings. Foundations solid.
- **attention_needed**: 3-5 findings or any high priority. Some maintenance needed.
- **at_risk**: 6+ findings or any critical. Multiple foundation issues.
- **critical**: Multiple critical findings. Strategic foundations materially compromised.

---

## Step 8: Feed into Calibration

**The SRC's `recalibration_plan` is a key input to the Calibration Memo.**

When writing the Calibration Memo, reference SRC findings:
- Critical SRC findings may drive the persevere/pivot/pull-the-plug decision
- The recalibration plan items become `next_steps` in the Calibration Memo
- SRC market currency findings inform `next_ready_inputs.opportunity_update`
- SRC belief validity findings inform `next_ready_inputs.strategy_update`

---

## Related Resources

- **Schema**: [strategic_reality_check_schema.json](../schemas/strategic_reality_check_schema.json) — Validation schema
- **Template**: [strategic_reality_check.yaml](../templates/AIM/strategic_reality_check.yaml) — Starting template
- **Synthesizer**: [synthesizer.agent_prompt.md](synthesizer.agent_prompt.md) — The broader AIM session agent
- **Assessment Report**: [assessment_report.yaml](../templates/AIM/assessment_report.yaml) — Companion artifact for OKR outcomes
- **Calibration Memo**: [calibration_memo.yaml](../templates/AIM/calibration_memo.yaml) — Where SRC findings feed into decisions

### MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `epf_aim_generate_src` | Auto-populate mechanical checks (freshness, cross-refs, maturity) |
| `epf_aim_write_src` | Write/update SRC from structured input |
| `epf_get_product_vision` | Read North Star for belief evaluation |
| `epf_get_competitive_position` | Current competitive context |
| `epf_validate_relationships` | Detailed cross-reference validation |
| `epf_analyze_coverage` | Value model coverage gaps |
| `epf_search_strategy` | Search strategy content by keyword |
