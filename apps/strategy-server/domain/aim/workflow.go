package aim

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// WorkflowName is the canonical identifier for the AIM cycle workflow.
const WorkflowName = "aim_cycle"

// CycleWorkflow implements orchestration.Workflow for the AIM cycle.
// It delegates each step to the existing aim.Service methods.
// The Engine knows nothing about AIM; AIM knows about the Engine
// only through the orchestration.Workflow interface.
type CycleWorkflow struct {
	svc *Service
}

// NewCycleWorkflow creates a new AIM cycle workflow.
func NewCycleWorkflow(svc *Service) *CycleWorkflow {
	return &CycleWorkflow{svc: svc}
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
			Name:      "apply_calibration",
			Execute:   w.stepApplyCalibration,
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

func (w *CycleWorkflow) stepApplyCalibration(ctx context.Context, run *orchestration.Run) (orchestration.StepResult, error) {
	instanceID, err := runInstanceID(run)
	if err != nil {
		return orchestration.StepResult{}, err
	}

	batchID, result, err := w.svc.ApplyCalibration(ctx, instanceID)
	if err != nil {
		return orchestration.StepResult{}, fmt.Errorf("apply calibration: %w", err)
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

	// Derive the calibration decision from the apply_calibration step meta.
	decision := ""
	for _, sl := range run.Steps {
		if sl.Name == "apply_calibration" {
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
