// Package aimdbos adapts the engine-neutral AIM cycle steps
// (domain/aim.Step) for execution as a DBOS Transact Go workflow, per
// openspec/changes/adopt-dbos-dynamic-aim. It replaces internal/aimadk,
// which did the same job for ADK.
package aimdbos

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/driver/pgdriver"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// postgresUniqueViolation is the SQLSTATE Postgres returns for a unique
// constraint violation. https://www.postgresql.org/docs/current/errcodes-appendix.html
const postgresUniqueViolation = "23505"

// runRow is the bun model for aim_cycle_runs. Its shape deliberately mirrors
// internal/aimadk's runRow (adk_run_metadata) and pkg/orchestration/pg's
// runRow before it: all three persist the same orchestration.Run /
// orchestration.StepLog Go types, which is what lets RunStore reuse them
// directly rather than a parallel set of DTOs the run panel would need to
// learn.
type runRow struct {
	bun.BaseModel `bun:"table:aim_cycle_runs"`

	ID             uuid.UUID       `bun:"id,pk"`
	WorkflowName   string          `bun:"workflow_name"`
	ConcurrencyKey string          `bun:"concurrency_key"`
	Input          json.RawMessage `bun:"input,type:jsonb"`
	Status         string          `bun:"status"`
	CurrentStep    string          `bun:"current_step"`
	Steps          json.RawMessage `bun:"steps,type:jsonb"`
	Error          string          `bun:"error"`
	// ReplanRequested is set by Replan and cleared once cycleWorkflow's
	// checkReplan boundary check has actually consumed the signal (or
	// found it already gone — see workflow.go). Deliberately not part of
	// orchestration.Run: it is an aimdbos-internal optimization (avoid a
	// dbos.Recv-with-timeout call, and DBOS's own timeout-reached warning
	// log, at every step boundary of every cycle that never uses this
	// feature), not something the run panel or any other engine needs to
	// know about.
	ReplanRequested bool `bun:"replan_requested"`

	// DBOSWorkflowID is the DBOS-internal workflow ID currently executing
	// this run — initially equal to ID, but diverges after Retry, which
	// forks a new DBOS workflow with its own auto-generated ID (confirmed
	// by direct probe; design.md). Every operation that addresses this
	// run's workflow from outside it (Resume's Send, Replan's Send,
	// Abort's CancelWorkflow, Retry's own ForkWorkflow/GetWorkflowSteps on
	// a second retry) must use this field, not ID — a real bug, found by
	// manual testing, that using ID unconditionally caused: resuming a
	// gate on a once-retried run silently addressed an already-dead
	// workflow while the live one waited on Recv forever.
	DBOSWorkflowID string    `bun:"dbos_workflow_id"`
	CreatedAt      time.Time `bun:"created_at"`
	UpdatedAt      time.Time `bun:"updated_at"`
}

// RunStore persists the cross-run record a DBOS-backed orchestration engine
// needs and DBOS's own workflow_status table does not provide: which run is
// active for a concurrency key, which run staged a given batch, and the
// run/step history the run panel already knows how to render.
//
// It speaks orchestration.Run and orchestration.StepLog directly, matching
// internal/aimadk.RunStore's contract exactly — DBOSEngine is a drop-in
// replacement for ADKEngine behind pkg/orchestration.EngineAPI, and nothing
// downstream of that interface should need to know which one is running.
type RunStore struct {
	db *bun.DB
}

// NewRunStore creates a RunStore backed by db.
func NewRunStore(db *bun.DB) *RunStore { return &RunStore{db: db} }

// Create persists a new run, with dbosWorkflowID as its initially-live DBOS
// workflow ID (StartRun always passes run.ID.String() — the same ID it
// gives dbos.RunWorkflow via dbos.WithWorkflowID — but this is an explicit
// parameter, not derived from run.ID here, so the two can never silently
// drift apart from this function's own assumption about what StartRun
// does). It returns orchestration.ErrAlreadyActive if a non-terminal run
// already holds this run's (workflow, concurrency key) pair — enforced by
// aim_cycle_runs' partial unique index, not a check-then-insert race, for
// the same reason internal/aimadk.RunStore.Create documents.
func (s *RunStore) Create(ctx context.Context, run *orchestration.Run, dbosWorkflowID string) error {
	inputJSON, err := json.Marshal(run.Input)
	if err != nil {
		return fmt.Errorf("marshal input: %w", err)
	}
	stepsJSON, err := json.Marshal(run.Steps)
	if err != nil {
		return fmt.Errorf("marshal steps: %w", err)
	}

	now := time.Now().UTC()
	row := &runRow{
		ID:             run.ID,
		WorkflowName:   run.WorkflowName,
		ConcurrencyKey: run.ConcurrencyKey,
		Input:          inputJSON,
		Status:         string(run.Status),
		CurrentStep:    run.CurrentStep,
		Steps:          stepsJSON,
		Error:          run.Error,
		DBOSWorkflowID: dbosWorkflowID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	_, err = s.db.NewInsert().Model(row).Exec(ctx)
	if isUniqueViolation(err) {
		return orchestration.ErrAlreadyActive
	}
	return err
}

// isUniqueViolation reports whether err is a Postgres unique constraint
// violation. The project connects through bun's own pgdriver
// (internal/database/db.go), not pgx directly, so the error surfaces as
// pgdriver.Error rather than *pgconn.PgError.
func isUniqueViolation(err error) bool {
	var pgErr pgdriver.Error
	return errors.As(err, &pgErr) && pgErr.Field('C') == postgresUniqueViolation
}

// UpdateStatus writes a run's status, current step, error, and full step
// log. Callers persist the whole step slice on every transition, matching
// internal/aimadk.RunStore's contract.
func (s *RunStore) UpdateStatus(ctx context.Context, runID uuid.UUID, status orchestration.RunStatus, currentStep, errMsg string, steps []orchestration.StepLog) error {
	stepsJSON, err := json.Marshal(steps)
	if err != nil {
		return fmt.Errorf("marshal steps: %w", err)
	}
	_, err = s.db.NewUpdate().
		Model((*runRow)(nil)).
		Set("status = ?", string(status)).
		Set("current_step = ?", currentStep).
		Set("error = ?", errMsg).
		Set("steps = ?", json.RawMessage(stepsJSON)).
		Set("updated_at = NOW()").
		Where("id = ?", runID).
		Exec(ctx)
	if isUniqueViolation(err) {
		// Reachable when a status transition reactivates a terminal run
		// (Retry, via ForkWorkflow under a fresh DBOS workflow ID but the
		// same aim_cycle_runs row) into a slot a different run has since
		// legitimately taken — the partial unique index enforces "one
		// active run per (workflow, concurrency key)" on UPDATE, not just
		// INSERT.
		return orchestration.ErrAlreadyActive
	}
	return err
}

// SetReplanRequested sets or clears the replan flag for runID. Called by
// DBOSEngine.Replan (set) and by cycleWorkflow's checkReplan (clear, once
// the signal has been consumed or found already gone).
func (s *RunStore) SetReplanRequested(ctx context.Context, runID uuid.UUID, requested bool) error {
	_, err := s.db.NewUpdate().
		Model((*runRow)(nil)).
		Set("replan_requested = ?", requested).
		Set("updated_at = NOW()").
		Where("id = ?", runID).
		Exec(ctx)
	return err
}

// ReplanRequested reports whether runID currently has a pending replan
// request. A dedicated scalar read, not GetByID, since it is called from
// inside a dbos.RunAsStep at every step boundary — the common case (no one
// has ever called Replan) should cost one small SELECT, not a full run
// unmarshal.
func (s *RunStore) ReplanRequested(ctx context.Context, runID uuid.UUID) (bool, error) {
	var requested bool
	err := s.db.NewSelect().
		TableExpr("aim_cycle_runs").
		ColumnExpr("replan_requested").
		Where("id = ?", runID).
		Scan(ctx, &requested)
	return requested, err
}

// DBOSWorkflowID returns runID's currently-live DBOS workflow ID — see
// runRow.DBOSWorkflowID's doc comment for why this can differ from runID
// itself after a retry.
func (s *RunStore) DBOSWorkflowID(ctx context.Context, runID uuid.UUID) (string, error) {
	var id string
	err := s.db.NewSelect().
		TableExpr("aim_cycle_runs").
		ColumnExpr("dbos_workflow_id").
		Where("id = ?", runID).
		Scan(ctx, &id)
	if err != nil {
		return "", fmt.Errorf("aimdbos: load dbos_workflow_id for run %s: %w", runID, err)
	}
	return id, nil
}

// SetDBOSWorkflowID updates runID's currently-live DBOS workflow ID. Called
// by Retry immediately after a successful ForkWorkflow — the point where
// the live workflow's identity actually changes.
func (s *RunStore) SetDBOSWorkflowID(ctx context.Context, runID uuid.UUID, dbosWorkflowID string) error {
	_, err := s.db.NewUpdate().
		Model((*runRow)(nil)).
		Set("dbos_workflow_id = ?", dbosWorkflowID).
		Set("updated_at = NOW()").
		Where("id = ?", runID).
		Exec(ctx)
	return err
}

// GetByID returns one run.
func (s *RunStore) GetByID(ctx context.Context, runID uuid.UUID) (*orchestration.Run, error) {
	var row runRow
	err := s.db.NewSelect().
		Model(&row).
		Where("id = ?", runID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("run not found: %s", runID)
	}
	if err != nil {
		return nil, err
	}
	return rowToRun(&row)
}

// List returns all runs for a workflow + concurrency key, newest first.
func (s *RunStore) List(ctx context.Context, workflowName, concurrencyKey string) ([]*orchestration.Run, error) {
	var rows []runRow
	err := s.db.NewSelect().
		Model(&rows).
		Where("workflow_name = ?", workflowName).
		Where("concurrency_key = ?", concurrencyKey).
		OrderExpr("created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return rowsToRuns(rows)
}

// ActiveRun returns the non-terminal run for a workflow + concurrency key,
// or nil if none.
func (s *RunStore) ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*orchestration.Run, error) {
	var row runRow
	err := s.db.NewSelect().
		Model(&row).
		Where("workflow_name = ?", workflowName).
		Where("concurrency_key = ?", concurrencyKey).
		Where("status IN (?, ?, ?)",
			string(orchestration.StatusPending),
			string(orchestration.StatusRunning),
			string(orchestration.StatusAwaitingHuman),
		).
		Limit(1).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil //nolint:nilnil // nil means "no active run"
	}
	if err != nil {
		return nil, err
	}
	return rowToRun(&row)
}

// FindRunByBatch returns the run awaiting review of the given batch, or nil
// if none. Only steps currently awaiting_human are considered.
func (s *RunStore) FindRunByBatch(ctx context.Context, batchID string) (*orchestration.Run, error) {
	var rows []runRow
	err := s.db.NewSelect().
		Model(&rows).
		Where("status = ?", string(orchestration.StatusAwaitingHuman)).
		Scan(ctx)
	if err != nil {
		return nil, err
	}

	for i := range rows {
		run, err := rowToRun(&rows[i])
		if err != nil {
			continue
		}
		for _, sl := range run.Steps {
			if sl.Status == "awaiting_human" && sl.BatchID == batchID {
				return run, nil
			}
		}
	}
	return nil, nil //nolint:nilnil // nil means "no match"
}

// FindAbandonedGates returns runs awaiting human review for longer than
// olderThan. Kept for parity with internal/aimadk's contract and for any
// caller that still wants to inspect gate age directly — but note that
// under DBOSEngine, gate abandonment is primarily enforced natively by
// Recv's own timeout (see internal/aimdbos/workflow.go), not by a separate
// sweep discovering old rows the way ADK needed one.
func (s *RunStore) FindAbandonedGates(ctx context.Context, olderThan time.Duration, now time.Time) ([]orchestration.AbandonedGate, error) {
	var rows []runRow
	err := s.db.NewSelect().
		Model(&rows).
		Where("status = ?", string(orchestration.StatusAwaitingHuman)).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list awaiting_human runs: %w", err)
	}

	runs, err := rowsToRuns(rows)
	if err != nil {
		return nil, err
	}
	return orchestration.FindAbandonedGates(runs, olderThan, now), nil
}

func rowToRun(row *runRow) (*orchestration.Run, error) {
	var input map[string]any
	if err := json.Unmarshal(row.Input, &input); err != nil {
		return nil, fmt.Errorf("unmarshal run input: %w", err)
	}
	var steps []orchestration.StepLog
	if err := json.Unmarshal(row.Steps, &steps); err != nil {
		return nil, fmt.Errorf("unmarshal run steps: %w", err)
	}
	return &orchestration.Run{
		ID:             row.ID,
		WorkflowName:   row.WorkflowName,
		ConcurrencyKey: row.ConcurrencyKey,
		Input:          input,
		Status:         orchestration.RunStatus(row.Status),
		CurrentStep:    row.CurrentStep,
		Steps:          steps,
		Error:          row.Error,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}, nil
}

func rowsToRuns(rows []runRow) ([]*orchestration.Run, error) {
	out := make([]*orchestration.Run, 0, len(rows))
	for i := range rows {
		r, err := rowToRun(&rows[i])
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}
