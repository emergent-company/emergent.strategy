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

// CycleWorkflow implements orchestration.Workflow for the AIM cycle.
// It delegates each step to the existing aim.Service methods.
// The Engine knows nothing about AIM; AIM knows about the Engine
// only through the orchestration.Workflow interface.
type CycleWorkflow struct {
	svc      *Service
	executor *skillexec.Executor // optional — nil = legacy ApplyCalibration stub
}

// NewCycleWorkflow creates a new AIM cycle workflow.
// Pass a non-nil executor to use the unified skill executor for the adapt_strategy step.
func NewCycleWorkflow(svc *Service, executor *skillexec.Executor) *CycleWorkflow {
	return &CycleWorkflow{svc: svc, executor: executor}
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

// Steps returns the four ordered steps of an AIM cycle.
func (w *CycleWorkflow) Steps() []orchestration.Step {
	return []orchestration.Step{
		{
			Name:      "draft_assessment",
			Execute:   w.stepDraftAssessment,
			HumanGate: true,
		},
		{
			Name:      "draft_calibration",
			Execute:   w.stepDraftCalibration,
			HumanGate: true,
		},
		{
			Name:      "adapt_strategy",
			Execute:   w.stepAdaptStrategy,
			HumanGate: true,
		},
		{
			Name:      "snapshot_cycle",
			Execute:   w.stepSnapshotCycle,
			HumanGate: false,
		},
	}
}

// ── step implementations ──────────────────────────────────────────────────────

func (w *CycleWorkflow) stepDraftAssessment(ctx context.Context, run *orchestration.Run) (orchestration.StepResult, error) {
	instanceID, err := runInstanceID(run)
	if err != nil {
		return orchestration.StepResult{}, err
	}

	batchID, summary, err := w.svc.DraftAssessment(ctx, instanceID)
	if err != nil {
		return orchestration.StepResult{}, fmt.Errorf("draft assessment: %w", err)
	}

	return orchestration.StepResult{
		BatchID: batchID.String(),
		Meta: map[string]any{
			"okr_count":        summary.OKRCount,
			"assumption_count": summary.AssumptionCount,
			"llm_used":         summary.LLMUsed,
		},
	}, nil
}

func (w *CycleWorkflow) stepDraftCalibration(ctx context.Context, run *orchestration.Run) (orchestration.StepResult, error) {
	instanceID, err := runInstanceID(run)
	if err != nil {
		return orchestration.StepResult{}, err
	}

	batchID, summary, err := w.svc.DraftCalibration(ctx, instanceID)
	if err != nil {
		return orchestration.StepResult{}, fmt.Errorf("draft calibration: %w", err)
	}

	return orchestration.StepResult{
		BatchID: batchID.String(),
		Meta: map[string]any{
			"suggested_decision": summary.SuggestedDecision,
			"okr_hit_rate_pct":   summary.OKRHitRate,
			"invalidated_count":  summary.InvalidatedCount,
			"llm_used":           summary.LLMUsed,
		},
	}, nil
}

func (w *CycleWorkflow) stepAdaptStrategy(ctx context.Context, run *orchestration.Run) (orchestration.StepResult, error) {
	instanceID, err := runInstanceID(run)
	if err != nil {
		return orchestration.StepResult{}, err
	}

	// If the unified executor is wired, use the adapt-strategy skill.
	if w.executor != nil {
		// Build params: pass the decision from run input (if provided) or rely on
		// the context bundle to extract it from the calibration memo.
		params := map[string]any{
			"_trigger": "aim_cycle",
			"_trigger_context": map[string]any{
				"run_id":    run.ID.String(),
				"step_name": "adapt_strategy",
			},
		}
		if decision, ok := run.Input["decision"].(string); ok && decision != "" {
			params["decision"] = decision
		}

		result, err := w.executor.RunChunked(ctx, instanceID, "adapt-strategy", params)
		if err != nil {
			return orchestration.StepResult{}, fmt.Errorf("adapt strategy: %w", err)
		}

		return orchestration.StepResult{
			BatchID: result.BatchID.String(),
			Meta: map[string]any{
				"artifact_types":    result.ArtifactTypes,
				"llm_used":          result.LLMUsed,
				"validation_passed": result.ValidationPassed,
			},
		}, nil
	}

	// Fallback: legacy ApplyCalibration stub (backward compatibility).
	batchID, result, err := w.svc.ApplyCalibration(ctx, instanceID)
	if err != nil {
		return orchestration.StepResult{}, fmt.Errorf("apply calibration (fallback): %w", err)
	}

	return orchestration.StepResult{
		BatchID: batchID.String(),
		Meta: map[string]any{
			"decision":           result.Decision,
			"affected_artifacts": result.AffectedArtifacts,
		},
	}, nil
}

func (w *CycleWorkflow) stepSnapshotCycle(ctx context.Context, run *orchestration.Run) (orchestration.StepResult, error) {
	instanceID, err := runInstanceID(run)
	if err != nil {
		return orchestration.StepResult{}, err
	}

	// Derive the calibration decision from the adapt_strategy step meta.
	// The executor stores it in the context bundle from the calibration memo;
	// the legacy fallback stores it explicitly as "decision" in the meta.
	decision := ""
	for _, sl := range run.Steps {
		if sl.Name == "adapt_strategy" || sl.Name == "apply_calibration" {
			if d, ok := sl.Meta["decision"].(string); ok {
				decision = d
			}
		}
	}

	if err := w.svc.SnapshotCycle(ctx, instanceID, 0, decision); err != nil {
		return orchestration.StepResult{}, fmt.Errorf("snapshot cycle: %w", err)
	}

	return orchestration.StepResult{}, nil
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
