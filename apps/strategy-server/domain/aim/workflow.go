package aim

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillexec"
)

// WorkflowName is the canonical identifier for the AIM cycle workflow.
const WorkflowName = "aim_cycle"

// PortfolioAligner is the interface satisfied by domain/strategy.Service.
// Using an interface here avoids a direct import of domain/strategy from domain/aim
// (which would create a circular dependency through domain/aim → domain/strategy → ...).
type PortfolioAligner interface {
	AlignPortfolio(ctx context.Context, instanceID uuid.UUID) (PortfolioAlignResult, error)
}

// PortfolioAlignResult is the minimal result subset the workflow cares about.
// It mirrors strategy.AlignPortfolioResult without importing that package.
type PortfolioAlignResult struct {
	TracksProcessed  int
	TracksChanged    int
	TotalActivated   int
	TotalDeactivated int
	KRsWithTargets   int
	NoRoadmap        bool
}

// ── engine-neutral step shape ─────────────────────────────────────────────────
//
// These bodies belong to no engine. internal/aimdbos adapts them for
// execution as a DBOS workflow (previously internal/aimadk, for ADK — see
// openspec/changes/adopt-dbos-dynamic-aim); this package imports no engine
// package at all, including pkg/orchestration — Name() is the only thing an
// engine needs from a *CycleWorkflow, recovered structurally by
// internal/aimdbos.Register rather than through a shared interface, so this
// decoupling has no cost even when the engine underneath changes.

// StepInput is everything a step is given.
type StepInput struct {
	// RunID identifies the cycle. Stable across human gates.
	RunID string
	// InstanceID is the EPF instance the cycle runs against.
	InstanceID uuid.UUID
	// Params are the caller's run inputs.
	Params map[string]any
	// Prior holds the outputs of completed steps, in order. snapshot_cycle
	// reads it to recover the calibration decision.
	Prior []StepOutput
}

// StepOutput is what a step produces. An empty BatchID means the step staged
// nothing, which lets a human gate auto-advance.
type StepOutput struct {
	Step    string
	BatchID string
	Meta    map[string]any
}

// Step is one unit of cycle work, free of any engine's types.
type Step struct {
	Name      string
	HumanGate bool
	Run       func(ctx context.Context, in StepInput) (StepOutput, error)
}

// Planner decides which named steps make up an AIM cycle for a given
// instance, and can be asked to reconsider what remains partway through.
// See openspec/changes/adopt-dbos-dynamic-aim, Part C4. It replaces a
// single fixed step order with an instance-aware decision, without this
// package importing anything engine-specific to do it: internal/aimdbos
// calls Plan from inside its own memoized step wrapper (a live DB read
// inside a DBOS workflow function must be wrapped in dbos.RunAsStep to be
// safe under replay — Plan itself does not need to know that).
//
// Plan returns step NAMES, not Step values, deliberately: Step.Run is a
// function value, which cannot cross a gob-encoded boundary (DBOS persists
// workflow/step input and output via gob) — internal/aimdbos.DBOSEngine
// keeps its own name -> Step registry (from CycleSteps()) and looks names
// up locally after Plan decides the order.
//
// An implementation is called at two distinct points, not once per step
// boundary:
//  1. Once at cycle start, with completed == nil, before the run even
//     begins — this is what "decided once at cycle start" means: the
//     initial step set is fixed from the instance's configuration at that
//     instant, not silently re-derived as the cycle progresses.
//  2. Again only if an explicit mid-cycle re-plan signal arrives (a
//     narrower mechanism than automatic re-evaluation — config drift alone
//     must never rewrite a cycle already in flight without that signal).
//
// Implementing this interface is optional: a Workflow that only implements
// CycleSteps() gets a fixed-order planner for free (internal/aimdbos's
// staticPlanner) — every existing test fixture keeps working unchanged.
// CycleWorkflow is the one implementation that actually varies its plan.
type Planner interface {
	// Plan returns the ordered step names that remain to run for
	// instanceID, given completed's outputs so far. Must never return a
	// name already present in completed, and must never reorder or repeat
	// one.
	Plan(ctx context.Context, instanceID uuid.UUID, completed []StepOutput) ([]string, error)
}

var _ Planner = (*CycleWorkflow)(nil)

// CycleWorkflow implements orchestration.Workflow for the AIM cycle.
// It delegates each step to the existing aim.Service methods.
// The Engine knows nothing about AIM; AIM knows about the Engine
// only through the orchestration.Workflow interface.
type CycleWorkflow struct {
	svc      *Service
	executor *skillexec.Executor // optional — nil = legacy ApplyCalibration stub
	aligner  PortfolioAligner    // optional — nil = align_portfolio step is a no-op
}

// NewCycleWorkflow creates a new AIM cycle workflow.
// Pass a non-nil executor to use the unified skill executor for the adapt_strategy step.
func NewCycleWorkflow(svc *Service, executor *skillexec.Executor) *CycleWorkflow {
	return &CycleWorkflow{svc: svc, executor: executor}
}

// WithPortfolioAligner attaches a portfolio aligner to run the align_portfolio step.
func (w *CycleWorkflow) WithPortfolioAligner(a PortfolioAligner) *CycleWorkflow {
	w.aligner = a
	return w
}

// Name returns the unique workflow name.
func (w *CycleWorkflow) Name() string { return WorkflowName }

// CycleSteps returns the full registry of steps an AIM cycle can run — six
// entries, in their default order:
//
//  1. draft_assessment  → human reviews assessment report
//  2. draft_calibration → human reviews calibration memo + decision
//  3. adapt_strategy    → human reviews execution-layer rewrites
//  4. adapt_foundations → human reviews foundation-layer updates (auto-advances when empty)
//  5. align_portfolio   → deterministic value model activation (auto-commits, no human gate)
//  6. snapshot_cycle    → auto-publishes version snapshot
//
// This is the registry an engine looks names up in — internal/aimdbos
// builds a name -> Step map from it once, at Register time. It is not
// itself the per-instance plan: Plan decides which of these names run, and
// in what order, for a specific instance. Every instance that hasn't opted
// into a difference (via TriggerConfig) gets exactly this order.
func (w *CycleWorkflow) CycleSteps() []Step {
	return []Step{
		{Name: "draft_assessment", Run: w.stepDraftAssessment, HumanGate: true},
		{Name: "draft_calibration", Run: w.stepDraftCalibration, HumanGate: true},
		{Name: "adapt_strategy", Run: w.stepAdaptStrategy, HumanGate: true},
		{Name: "adapt_foundations", Run: w.stepAdaptFoundations, HumanGate: true},
		// align_portfolio is deterministic and auto-commits, so no human gate.
		{Name: "align_portfolio", Run: w.stepAlignPortfolio},
		{Name: "snapshot_cycle", Run: w.stepSnapshotCycle},
	}
}

// Plan implements Planner. It filters CycleSteps()'s default order by two
// things: names already in completed, and — the one real, already-existing
// per-instance signal found for this (TriggerConfig.SkipFoundations,
// itself read via Service.GetTriggerConfig, the same best-effort,
// defaults-on-any-error load path EvaluateTriggers already relies on for
// per-instance behavior) — whether adapt_foundations should be attempted
// for this instance at all.
//
// svc == nil (only reachable in tests that construct a bare CycleWorkflow)
// is treated as "no per-instance config available," not an error: the
// default order is returned unfiltered, matching every instance that has
// never set a trigger config artifact.
func (w *CycleWorkflow) Plan(ctx context.Context, instanceID uuid.UUID, completed []StepOutput) ([]string, error) {
	done := make(map[string]bool, len(completed))
	for _, c := range completed {
		done[c.Step] = true
	}

	skipFoundations := false
	if w.svc != nil {
		skipFoundations = w.svc.GetTriggerConfig(ctx, instanceID).SkipFoundations
	}

	remaining := make([]string, 0, len(w.CycleSteps()))
	for _, step := range w.CycleSteps() {
		if step.Name == "adapt_foundations" && skipFoundations {
			continue
		}
		if done[step.Name] {
			continue
		}
		remaining = append(remaining, step.Name)
	}
	return remaining, nil
}

// ── step implementations ──────────────────────────────────────────────────────

func (w *CycleWorkflow) stepDraftAssessment(ctx context.Context, in StepInput) (StepOutput, error) {
	instanceID := in.InstanceID

	batchID, summary, err := w.svc.DraftAssessment(ctx, instanceID)
	if err != nil {
		return StepOutput{}, fmt.Errorf("draft assessment: %w", err)
	}

	return StepOutput{
		BatchID: batchID.String(),
		Meta: map[string]any{
			"okr_count":        summary.OKRCount,
			"assumption_count": summary.AssumptionCount,
			"llm_used":         summary.LLMUsed,
		},
	}, nil
}

func (w *CycleWorkflow) stepDraftCalibration(ctx context.Context, in StepInput) (StepOutput, error) {
	instanceID := in.InstanceID

	batchID, summary, err := w.svc.DraftCalibration(ctx, instanceID)
	if err != nil {
		return StepOutput{}, fmt.Errorf("draft calibration: %w", err)
	}

	return StepOutput{
		BatchID: batchID.String(),
		Meta: map[string]any{
			"suggested_decision": summary.SuggestedDecision,
			"okr_hit_rate_pct":   summary.OKRHitRate,
			"invalidated_count":  summary.InvalidatedCount,
			"llm_used":           summary.LLMUsed,
		},
	}, nil
}

func (w *CycleWorkflow) stepAdaptStrategy(ctx context.Context, in StepInput) (StepOutput, error) {
	instanceID := in.InstanceID

	// If the unified executor is wired, use the adapt-strategy skill.
	if w.executor != nil {
		// Build params: pass the decision from run input (if provided) or rely on
		// the context bundle to extract it from the calibration memo.
		params := map[string]any{
			"_trigger": "aim_cycle",
			"_trigger_context": map[string]any{
				"run_id":    in.RunID,
				"step_name": "adapt_strategy",
			},
		}
		if decision, ok := in.Params["decision"].(string); ok && decision != "" {
			params["decision"] = decision
		}

		result, err := w.executor.RunChunked(ctx, instanceID, "adapt-strategy", params)
		if err != nil {
			return StepOutput{}, fmt.Errorf("adapt strategy: %w", err)
		}

		return StepOutput{
			BatchID: result.BatchID.String(),
			Meta: map[string]any{
				"artifact_types":    result.ArtifactTypes,
				"llm_used":          result.LLMUsed,
				"validation_passed": result.ValidationPassed,
				"input_tokens":      result.InputTokens,
				"output_tokens":     result.OutputTokens,
			},
		}, nil
	}

	// Fallback: legacy ApplyCalibration stub (backward compatibility).
	batchID, result, err := w.svc.ApplyCalibration(ctx, instanceID)
	if err != nil {
		return StepOutput{}, fmt.Errorf("apply calibration (fallback): %w", err)
	}

	return StepOutput{
		BatchID: batchID.String(),
		Meta: map[string]any{
			"decision":           result.Decision,
			"affected_artifacts": result.AffectedArtifacts,
		},
	}, nil
}

// stepAdaptFoundations runs adapt-foundations to align READY-layer artifacts
// with the execution-layer changes from adapt_strategy. Returns an empty
// StepResult (no BatchID) when the skill determines no foundation changes are
// needed — the orchestration engine auto-advances past the human gate in that case.
func (w *CycleWorkflow) stepAdaptFoundations(ctx context.Context, in StepInput) (StepOutput, error) {
	instanceID := in.InstanceID

	if w.executor == nil {
		// No executor wired — skip this step silently (legacy mode).
		return StepOutput{}, nil
	}

	params := map[string]any{
		"_trigger": "aim_cycle",
		"_trigger_context": map[string]any{
			"run_id":    in.RunID,
			"step_name": "adapt_foundations",
			"source":    "orchestrated_cycle_step4",
		},
	}

	result, err := w.executor.RunChunked(ctx, instanceID, "adapt-foundations", params)
	if err != nil {
		return StepOutput{}, fmt.Errorf("adapt foundations: %w", err)
	}

	// If no artifacts were staged (empty batch), return empty BatchID so the
	// orchestration engine auto-advances without waiting for human review.
	if result.BatchID == (uuid.UUID{}) {
		return StepOutput{
			Meta: map[string]any{
				"auto_advanced_reason": "no_foundation_changes_needed",
			},
		}, nil
	}

	return StepOutput{
		BatchID: result.BatchID.String(),
		Meta: map[string]any{
			"artifact_types":    result.ArtifactTypes,
			"llm_used":          result.LLMUsed,
			"validation_passed": result.ValidationPassed,
			"input_tokens":      result.InputTokens,
			"output_tokens":     result.OutputTokens,
		},
	}, nil
}

// stepAlignPortfolio runs deterministic portfolio alignment after adapt_strategy.
// It reads committed roadmap KRs and syncs value model active flags to match.
// All mutations are auto-committed. If no aligner is wired, the step is a no-op.
func (w *CycleWorkflow) stepAlignPortfolio(ctx context.Context, in StepInput) (StepOutput, error) {
	instanceID := in.InstanceID

	if w.aligner == nil {
		// No aligner wired — skip silently (useful in test and legacy modes).
		return StepOutput{
			Meta: map[string]any{"skipped": true, "reason": "no aligner configured"},
		}, nil
	}

	result, err := w.aligner.AlignPortfolio(ctx, instanceID)
	if err != nil {
		// Alignment failures are non-fatal: log and continue to snapshot_cycle.
		// The next heartbeat consistency check will correct any drift. The error
		// is captured in Meta rather than returned, by design.
		return StepOutput{ //nolint:nilerr
			Meta: map[string]any{
				"error":   err.Error(),
				"skipped": true,
			},
		}, nil
	}

	return StepOutput{
		// No BatchID: this step auto-commits and has no human review gate.
		Meta: map[string]any{
			"tracks_processed":  result.TracksProcessed,
			"tracks_changed":    result.TracksChanged,
			"total_activated":   result.TotalActivated,
			"total_deactivated": result.TotalDeactivated,
			"krs_with_targets":  result.KRsWithTargets,
			"no_roadmap":        result.NoRoadmap,
		},
	}, nil
}

func (w *CycleWorkflow) stepSnapshotCycle(ctx context.Context, in StepInput) (StepOutput, error) {
	instanceID := in.InstanceID

	// Derive the calibration decision from step metadata.
	// Sources (checked in priority order):
	//   1. adapt_strategy/apply_calibration "decision" (legacy fallback path)
	//   2. draft_calibration "suggested_decision" (executor path)
	decision := ""
	for _, sl := range in.Prior {
		if sl.Step == "adapt_strategy" || sl.Step == "apply_calibration" {
			if d, ok := sl.Meta["decision"].(string); ok && d != "" {
				decision = d
			}
		}
		if sl.Step == "draft_calibration" && decision == "" {
			if d, ok := sl.Meta["suggested_decision"].(string); ok && d != "" {
				decision = d
			}
		}
	}

	versionID, err := w.svc.SnapshotCycle(ctx, instanceID, 0, decision)
	if err != nil {
		return StepOutput{}, fmt.Errorf("snapshot cycle: %w", err)
	}

	return StepOutput{
		Meta: map[string]any{
			"version_id": versionID.String(),
		},
	}, nil
}
