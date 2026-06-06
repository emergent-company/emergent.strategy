## 1. New Translation Keys — English

Add all keys to `internal/langs/langs.go` EN locale. Group by section with comments.
All keys must have both EN and NB entries before any templ file is edited.

### 1.1 Artifact field labels (`artifact.field.*`)
- [ ] Add keys for shared field labels used across artifact views:
  `artifact.field.purpose`, `artifact.field.vision`, `artifact.field.mission`,
  `artifact.field.values`, `artifact.field.pain_points`, `artifact.field.jtbd`,
  `artifact.field.market_size`, `artifact.field.target_segment`,
  `artifact.field.competitive_landscape`, `artifact.field.swot`,
  `artifact.field.strengths`, `artifact.field.weaknesses`,
  `artifact.field.opportunities`, `artifact.field.threats`,
  `artifact.field.goals`, `artifact.field.evidence`, `artifact.field.learnings`,
  `artifact.field.recommendations`, `artifact.field.assumptions`,
  `artifact.field.dependencies`, `artifact.field.boundaries`,
  `artifact.field.scenarios`, `artifact.field.capabilities`,
  `artifact.field.value_outcome`, `artifact.field.confidence`,
  `artifact.field.reasoning`, `artifact.field.decision`

### 1.2 Artifact section headings (`artifact.section.*`)
- [ ] Add keys for section-level groupings:
  `artifact.section.strategic_context`, `artifact.section.value_proposition`,
  `artifact.section.strategic_sequencing`, `artifact.section.design_principles`,
  `artifact.section.competitive_moat`, `artifact.section.value_creation`,
  `artifact.section.business_model`, `artifact.section.success_metrics`,
  `artifact.section.ecosystem`, `artifact.section.risks`, `artifact.section.tradeoffs`,
  `artifact.section.core_beliefs`, `artifact.section.value_tensions`,
  `artifact.section.evolution`, `artifact.section.white_spaces`,
  `artifact.section.opportunity_convergence`, `artifact.section.key_insights`,
  `artifact.section.target_users`, `artifact.section.mission_goals`,
  `artifact.section.layers`, `artifact.section.organisation_context`,
  `artifact.section.current_focus`, `artifact.section.track_baselines`,
  `artifact.section.constraints`, `artifact.section.okr_assessments`,
  `artifact.section.assumption_validations`, `artifact.section.strategic_insights`,
  `artifact.section.next_cycle_direction`, `artifact.section.feedback_into_strategy`,
  `artifact.section.next_steps`, `artifact.section.job_to_be_done`

### 1.3 Status and badge strings
- [ ] `signal.status.acknowledged`, `signal.status.resolved`, `signal.status.dismissed`
- [ ] `signal.severity.info` (Critical and Warning already exist)
- [ ] `maturity.scaled`, `maturity.proven`, `maturity.emerging`, `maturity.hypothetical`
- [ ] `version.source.auto`, `version.source.aim_cycle`, `version.source.manual`
- [ ] `version.status.current`, `version.status.restored`, `version.status.superseded`
- [ ] `evidence.confidence.high`, `evidence.confidence.medium`, `evidence.confidence.low`
- [ ] `assumption.risk.well_tested`, `assumption.risk.partial`, `assumption.risk.untested`
- [ ] `aim.cycle.running`, `aim.cycle.due` (badge labels in pipeline + proposals)

### 1.4 Button and action labels
- [ ] `action.view_all`, `action.view_activity`, `action.view_run`, `action.view_memo`
- [ ] `action.abort`, `action.retry`, `action.retry_step`
- [ ] `action.review_draft`, `action.view_draft`
- [ ] `action.acknowledge`, `action.resolve`, `action.dismiss`
- [ ] `action.approve_cycle`, `action.defer`, `action.back_to_aim`
- [ ] `action.run_cycle`, `action.draft_step`, `action.publish_snapshot`
- [ ] `action.restore`, `action.reconnect`
- [ ] `action.add_evidence`, `action.back_to_evidence`
- [ ] `action.back_to_skill_runs`, `action.skill_run_detail`

### 1.5 Empty state messages
- [ ] `empty.no_versions`, `empty.no_signals`, `empty.signals_coherent`
- [ ] `empty.no_cycle_runs`, `empty.no_assumptions`, `empty.no_features`
- [ ] `empty.no_evidence`, `empty.no_active_operations`
- [ ] `empty.no_proposals`, `empty.no_skill_runs`, `empty.no_definitions`
- [ ] `empty.no_repositories`

### 1.6 AIM step labels and descriptions (for ctx-threaded functions)
- [ ] `aim.step.observe`, `aim.step.assess`, `aim.step.decide`, `aim.step.adapt`
- [ ] `aim.step.observe.cta_create`, `aim.step.observe.cta_view`, `aim.step.observe.hint_draft`
- [ ] `aim.step.observe.prereq` (Complete North Star first)
- [ ] `aim.step.assess.cta_create`, `aim.step.assess.cta_view`, `aim.step.assess.hint`
- [ ] `aim.step.assess.prereq` (Needs LRA first)
- [ ] `aim.step.decide.cta_complete`, `aim.step.decide.cta_view`, `aim.step.decide.hint`
- [ ] `aim.step.decide.prereq` (Needs assessment first)
- [ ] `aim.step.adapt.cta_apply`, `aim.step.adapt.cta_view`, `aim.step.adapt.hint`
- [ ] `aim.step.adapt.prereq` (Needs calibration decision first)
- [ ] `aim.run.step.draft_assessment`, `aim.run.step.draft_calibration`,
  `aim.run.step.adapt_strategy`, `aim.run.step.align_foundations`,
  `aim.run.step.align_portfolio`, `aim.run.step.publish_version`
- [ ] Description strings for each run step (`aim.run.step.*.description`)

### 1.7 Cascade / skill labels
- [ ] `cascade.skill.adapt_strategy`, `cascade.skill.align_foundations`,
  `cascade.skill.draft_north_star`, `cascade.skill.draft_insights`,
  `cascade.skill.draft_foundations`, `cascade.skill.draft_opportunity`,
  `cascade.skill.draft_formula`, `cascade.skill.draft_roadmap`,
  `cascade.skill.align_portfolio`
- [ ] `cascade.step.drafting_assessment`, `cascade.step.drafting_calibration`,
  `cascade.step.adapting_strategy`, `cascade.step.aligning_foundations`,
  `cascade.step.aligning_portfolio`, `cascade.step.publishing_version`

### 1.8 Signal and authority tier hints
- [ ] `signal.hint.drift`, `signal.hint.propagation`, `signal.hint.conflict`,
  `signal.hint.staleness`, `signal.hint.systemic`, `signal.hint.disconnected`
- [ ] `authority.hint.autonomous`, `authority.hint.gated`, `authority.hint.escalated`

### 1.9 Proposal trigger labels
- [ ] `proposal.trigger.critical_signals`, `proposal.trigger.new_evidence`,
  `proposal.trigger.scheduled`
- [ ] `proposal.age.just_now`, `proposal.age.minutes`, `proposal.age.hours`,
  `proposal.age.days`

### 1.10 Run status labels (supplement existing wrapper)
- [ ] Ensure all branches of `runStatusLabelI18n` use keys:
  `run.status.awaiting_review`, `run.status.completed`, `run.status.aborted`,
  `run.status.failed`

### 1.11 Evidence form labels and options
- [ ] `evidence.form.source_name`, `evidence.form.source_type`,
  `evidence.form.content`, `evidence.form.summary`, `evidence.form.tags`,
  `evidence.form.confidence`
- [ ] Source type options: `evidence.type.pitch_deck`, `evidence.type.market_research`,
  `evidence.type.competitive_analysis`, `evidence.type.product_doc`,
  `evidence.type.strategy_notes`, `evidence.type.user_research`,
  `evidence.type.interview_notes`, `evidence.type.sales_call`, `evidence.type.other`

### 1.12 Skill run page labels
- [ ] `skillrun.stat.total_runs`, `skillrun.stat.total_tokens`, `skillrun.stat.skills_used`
- [ ] `skillrun.col.skill`, `skillrun.col.runs`, `skillrun.col.input`,
  `skillrun.col.output`, `skillrun.col.total`, `skillrun.col.trigger`,
  `skillrun.col.progress`, `skillrun.col.tokens`, `skillrun.col.duration`,
  `skillrun.col.started`
- [ ] `skillrun.section.token_usage`, `skillrun.section.run_history`,
  `skillrun.section.chunk_log`
- [ ] `skillrun.stat.chunks`, `skillrun.stat.input_tokens`, `skillrun.stat.output_tokens`,
  `skillrun.stat.duration`

### 1.13 Version view labels
- [ ] `version.stat.artifacts`, `version.stat.equilibrium`, `version.stat.changes`
- [ ] `version.section.changes_from_parent`, `version.section.calibration_decision`,
  `version.section.strategic_insights`
- [ ] `version.tooltip.equilibrium`, `version.confirm.restore`

### 1.14 Execution dashboard labels
- [ ] `exec.stat.objectives`, `exec.stat.key_results`, `exec.stat.features`
- [ ] `exec.stat.aim_tracked`, `exec.section.strategic_bets`,
  `exec.section.health`, `exec.section.strategic_insights`
- [ ] `exec.health.untested_assumptions`, `exec.health.evidence_items`,
  `exec.health.aim_cycles`

### 1.15 GitHub connect page labels
- [ ] `github.connect.title`, `github.connect.subtitle`
- [ ] `github.connect.step1`, `github.connect.step1_subtitle`
- [ ] `github.connect.your_repos`, `github.connect.scanning`,
  `github.connect.refresh`, `github.connect.retry_scan`
- [ ] `github.connect.link_only`, `github.connect.how_it_works`
- [ ] `github.connect.public_repos`, `github.connect.private_repos`,
  `github.connect.aim_autopush`
- [ ] `github.connect.rate_limited`, `github.connect.used_by`
- [ ] Badge strings: `github.badge.epf_found`, `github.badge.no_epf`,
  `github.badge.private`, `github.badge.partial_scan`, `github.badge.scan_error`,
  `github.badge.auto_push_on`, `github.badge.no_auto_push`

### 1.16 Tooltip and placeholder strings (Category G)
- [ ] `tooltip.llm_segments`, `tooltip.total_tokens`, `tooltip.features_dropped`
- [ ] `tooltip.maturity_t1`, `tooltip.maturity_t2`, `tooltip.maturity_t3`
- [ ] `tooltip.missing_value_model_link`, `tooltip.ai_assisted_step`,
  `tooltip.auto_advanced`, `tooltip.skipped_step`
- [ ] `tooltip.objective_identifier`, `tooltip.kr_identifier`, `tooltip.trl`
- [ ] `placeholder.evidence_source_name`, `placeholder.evidence_content`,
  `placeholder.evidence_summary`, `placeholder.evidence_tags`

---

## 2. New Translation Keys — Norwegian (NB)

- [ ] Translate all keys added in section 1 into NB
- [ ] **High quality review required** for categories B and E (prose)
- [ ] Machine translation acceptable for A, C, D, G

---

## 3. Templ File Updates — Group 1 (Mechanical replacements)

For each file: add `langs` import, replace all hardcoded strings with `langs.T(ctx, key)`.
Strings in `data-tip` attributes use `{ langs.T(ctx, key) }` expression syntax.

- [ ] `north_star.templ` — 33 strings (field labels, section headings)
- [ ] `insight_analyses.templ` — 29 strings
- [ ] `insight_opportunity.templ` — 21 strings
- [ ] `strategy_formula.templ` — 25 strings
- [ ] `strategy_foundations.templ` — 19 strings
- [ ] `roadmap_recipe.templ` — 23 strings
- [ ] `lra_view.templ` — 23 strings
- [ ] `assessment_view.templ` — 14 strings
- [ ] `calibration_view.templ` — 29 strings (minus the helper function strings, handled in section 4)
- [ ] `feature_view.templ` — 27 strings
- [ ] `value_model_view.templ` — 14 strings
- [ ] `phase_fire_track.templ` — 34 strings
- [ ] `coherence_view.templ` — template-level strings only (helpers in section 4)
- [ ] `aim_pipeline.templ` — template-level strings only
- [ ] `aim_run_panel.templ` — template-level strings only
- [ ] `aim_proposals.templ` — template-level strings only
- [ ] `aim_draft_review.templ` — template-level strings only
- [ ] `aim_runs.templ` — 8 strings
- [ ] `versions_view.templ` — 26 strings
- [ ] `execution_dashboard.templ` — 17 strings
- [ ] `phase_aim.templ` — template-level strings only (step functions in section 4)
- [ ] `phase_evidence.templ` — 29 strings
- [ ] `activity_page.templ` — 3 strings
- [ ] `skill_runs_page.templ` — 23 strings
- [ ] `skill_run_detail_page.templ` — 11 strings
- [ ] `cascade_tracker.templ` — template-level strings only
- [ ] `generating_indicators.templ` — 7 strings
- [ ] `assumptions_view.templ` — template-level strings only
- [ ] `github_connect.templ` — 53 strings

---

## 4. Templ File Updates — Group 2 (ctx threading)

For each function: add `ctx context.Context` as the first parameter, replace string
literals with `langs.T(ctx, key)`, update all call sites in the same file.

- [ ] `phase_aim.templ`: `aimStepObserve(ctx, ...)`, `aimStepAssess(ctx, ...)`,
  `aimStepDecide(ctx, ...)`, `aimStepAdapt(ctx, ...)`, `aimAutomationHint(ctx, ...)`
  — update all `{{ }}` call sites to pass `ctx`
- [ ] `aim_run_panel.templ`: `runStepLabel(ctx, ...)`, `runStepDescription(ctx, ...)`
  — update call sites; `runStatusLabelI18n` already exists, ensure all branches covered
- [ ] `cascade_tracker.templ`: `cascadeSkillLabel(ctx, ...)`, `cascadeStepLabel(ctx, ...)`
  — update call sites
- [ ] `coherence_view.templ`: `signalTypeHint(ctx, ...)`, `authorityTierHint(ctx, ...)`
  — update call sites
- [ ] `aim_proposals.templ`: `proposalTriggerLabel(ctx, ...)`, `proposalAge(ctx, ...)`
  — update call sites; `proposalStatusLabelI18n` already exists
- [ ] `assumptions_view.templ`: `assumptionRiskLabel(ctx, ...)`,
  `assumptionRiskHint(ctx, ...)`, `assumptionStatusHint(ctx, ...)`
  — update call sites
- [ ] `aim_pipeline.templ`: `pipelineProposalLabel(ctx, ...)` — update call sites

---

## 5. Regeneration and Build Verification

- [ ] Run `cd apps/strategy-server && go run github.com/a-h/templ/cmd/templ@v0.3.1020 generate`
- [ ] Run `cd apps/strategy-server && go build ./...` — must be clean
- [ ] Run `cd apps/strategy-server && go test ./...` — must match baseline (all pass)
- [ ] Run `cd apps/strategy-server && task lint` — must be clean

---

## 6. Verification

- [ ] Start server (`task dev-up`) and visually inspect key pages in EN locale:
  - `/` (dashboard)
  - A strategy instance → READY, FIRE, AIM tabs
  - `/settings`
  - An artifact detail view (north_star, feature, calibration)
  - AIM run panel
- [ ] Set `Accept-Language: nb` header (browser devtools or curl) and verify same
  pages render in Norwegian
- [ ] Confirm no raw lang keys (e.g. `"artifact.field.jtbd"`) appear in rendered output
  (would indicate a missing key in the EN map)

---

## Out of Scope

- JavaScript `onsubmit` attribute in `phase_fire.templ` ("Installing…") — leave as-is
- MCP tool descriptions and parameter descriptions — intentionally English-only
