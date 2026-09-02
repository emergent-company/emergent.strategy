package aim

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillexec"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
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
// The AIM cycle is driven by two engines during the ADK migration. Rather than
// implement the steps twice and rely on tests to catch the drift, the bodies
// live here in a shape neither engine owns, and each engine adapts them.

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

// ConcurrencyKey extracts the instance_id from the run input.
// One active AIM cycle per instance is allowed.
func (w *CycleWorkflow) ConcurrencyKey(run *orchestration.Run) string {
	if id, ok := run.Input["instance_id"].(string); ok {
		return id
	}
	return ""
}

// Steps returns the six ordered steps of an AIM cycle.
//
//  1. draft_assessment  → human reviews assessment report
//  2. draft_calibration → human reviews calibration memo + decision
//  3. adapt_strategy    → human reviews execution-layer rewrites
//  4. adapt_foundations → human reviews foundation-layer updates (auto-advances when empty)
//  5. align_portfolio   → deterministic value model activation (auto-commits, no human gate)
//  6. snapshot_cycle    → auto-publishes version snapshot
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

// Steps adapts the neutral steps to the legacy engine. It exists only while
// both engines are wired, and goes away with pkg/orchestration.
func (w *CycleWorkflow) Steps() []orchestration.Step {
	neutral := w.CycleSteps()
	steps := make([]orchestration.Step, len(neutral))

	for i, step := range neutral {
		steps[i] = orchestration.Step{
			Name:      step.Name,
			HumanGate: step.HumanGate,
			Execute:   legacyStepFunc(step),
		}
	}
	return steps
}

// legacyStepFunc wraps a neutral step so the legacy engine can call it.
func legacyStepFunc(step Step) orchestration.StepFunc {
	return func(ctx context.Context, run *orchestration.Run) (orchestration.StepResult, error) {
		in, err := stepInputFromRun(run)
		if err != nil {
			return orchestration.StepResult{}, err
		}

		out, err := step.Run(ctx, in)
		if err != nil {
			return orchestration.StepResult{}, err
		}

		return orchestration.StepResult{BatchID: out.BatchID, Meta: out.Meta}, nil
	}
}

// stepInputFromRun projects a legacy run record onto the neutral input.
func stepInputFromRun(run *orchestration.Run) (StepInput, error) {
	instanceID, err := runInstanceID(run)
	if err != nil {
		return StepInput{}, err
	}

	prior := make([]StepOutput, 0, len(run.Steps))
	for _, logged := range run.Steps {
		prior = append(prior, StepOutput{
			Step:    logged.Name,
			BatchID: logged.BatchID,
			Meta:    logged.Meta,
		})
	}

	return StepInput{
		RunID:      run.ID.String(),
		InstanceID: instanceID,
		Params:     run.Input,
		Prior:      prior,
	}, nil
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

// ── helpers ───────────────────────────────────────────────────────────────────

func runInstanceID(run *orchestration.Run) (uuid.UUID, error) {
	raw, ok := run.Input["instance_id"].(string)
	if !ok || raw == "" {
		return uuid.Nil, fmt.Errorf("aim workflow: missing instance_id in run input")
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("aim workflow: invalid instance_id %q: %w", raw, err)
	}
	return id, nil
}
