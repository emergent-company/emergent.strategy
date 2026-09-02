// Package pg implements the orchestration.Backend interface using
// uptrace/bun + Postgres and a fixed-size goroutine worker pool.
package pg

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// runRow is the bun model for orchestration_runs.
type runRow struct {
	bun.BaseModel `bun:"table:orchestration_runs"`

	ID             uuid.UUID       `bun:"id,pk"`
	WorkflowName   string          `bun:"workflow_name"`
	ConcurrencyKey string          `bun:"concurrency_key"`
	Input          json.RawMessage `bun:"input,type:jsonb"`
	Status         string          `bun:"status"`
	CurrentStep    string          `bun:"current_step"`
	Steps          json.RawMessage `bun:"steps,type:jsonb"`
	Error          string          `bun:"error"`
	CreatedAt      time.Time       `bun:"created_at"`
	UpdatedAt      time.Time       `bun:"updated_at"`
}

// pgStore handles raw CRUD on orchestration_runs.
type pgStore struct {
	db *bun.DB
}

func newStore(db *bun.DB) *pgStore { return &pgStore{db: db} }

func (s *pgStore) insert(ctx context.Context, run *orchestration.Run) error {
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
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	_, err = s.db.NewInsert().Model(row).Exec(ctx)
	return err
}

func (s *pgStore) updateStatus(ctx context.Context, runID uuid.UUID, status orchestration.RunStatus, currentStep, errMsg string, steps []orchestration.StepLog) error {
	stepsJSON, err := json.Marshal(steps)
	if err != nil {
		return fmt.Errorf("marshal steps: %w", err)
	}
	_, err = s.db.NewUpdate().
		TableExpr("orchestration_runs").
		Set("status = ?", string(status)).
		Set("current_step = ?", currentStep).
		Set("error = ?", errMsg).
		Set("steps = ?", json.RawMessage(stepsJSON)).
		Set("updated_at = NOW()").
		Where("id = ?", runID).
		Exec(ctx)
	return err
}

// markStaleFailed marks pending and running runs as failed on startup.
// awaiting_human runs are NOT killed — they survive restarts because their
// state is fully persisted in the DB (batch commit/discard resumes them).
func (s *pgStore) markStaleFailed(ctx context.Context) (int, error) {
	res, err := s.db.NewUpdate().
		TableExpr("orchestration_runs").
		Set("status = ?", string(orchestration.StatusFailed)).
		Set("error = ?", "server restart").
		Set("updated_at = NOW()").
		Where("status IN (?, ?)",
			string(orchestration.StatusPending),
			string(orchestration.StatusRunning),
		).
		Exec(ctx)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// listAwaitingHuman returns all runs in awaiting_human status.
// Used on startup to re-register resume channels for runs that survived a restart.
func (s *pgStore) listAwaitingHuman(ctx context.Context) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := s.db.NewSelect().
		TableExpr("orchestration_runs").
		ColumnExpr("id").
		Where("status = ?", string(orchestration.StatusAwaitingHuman)).
		Scan(ctx, &ids)
	if err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *pgStore) getByID(ctx context.Context, runID uuid.UUID) (*orchestration.Run, error) {
	var row runRow
	err := s.db.NewSelect().
		Model(&row).
		Where("id = ?", runID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("orchestration run not found: %s", runID)
	}
	if err != nil {
		return nil, err
	}
	return rowToRun(&row)
}

func (s *pgStore) list(ctx context.Context, workflowName, concurrencyKey string) ([]*orchestration.Run, error) {
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

func (s *pgStore) activeRun(ctx context.Context, workflowName, concurrencyKey string) (*orchestration.Run, error) {
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

// findAwaitingRunByBatch returns the run waiting for the given batchID.
func (s *pgStore) findAwaitingRunByBatch(ctx context.Context, batchID string) (*orchestration.Run, error) {
	var rows []runRow
	err := s.db.NewSelect().
		Model(&rows).
		Where("status = ?", string(orchestration.StatusAwaitingHuman)).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		r, err := rowToRun(&rows[i])
		if err != nil {
			continue
		}
		for _, sl := range r.Steps {
			if sl.Status == "awaiting_human" && sl.BatchID == batchID {
				return r, nil
			}
		}
	}
	return nil, nil //nolint:nilnil // nil means "no match"
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

// abandonedGate describes a run parked at a human gate past the threshold.
type abandonedGate struct {
	run         *orchestration.Run
	stepIndex   int
	parkedSince time.Time
}

// findAbandonedGates returns runs awaiting human review for longer than
// olderThan.
//
// The clock starts at the gate's own GateOpenedAt where it is known. Runs
// written before that was recorded fall back to created_at, which is a
// conservative lower bound on how long they have been parked — updated_at is
// unsuitable because unrelated writes touch it, and the run parked since June
// carries an updated_at from August for exactly that reason.
func (s *pgStore) findAbandonedGates(ctx context.Context, olderThan time.Duration, now time.Time) ([]abandonedGate, error) {
	var rows []runRow
	err := s.db.NewSelect().
		Model(&rows).
		Where("status = ?", string(orchestration.StatusAwaitingHuman)).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list awaiting_human runs: %w", err)
	}

	var abandoned []abandonedGate
	for i := range rows {
		run, err := rowToRun(&rows[i])
		if err != nil {
			return nil, fmt.Errorf("decode run %s: %w", rows[i].ID, err)
		}

		stepIndex, parkedSince := openGate(run)
		if now.Sub(parkedSince) <= olderThan {
			continue
		}
		abandoned = append(abandoned, abandonedGate{
			run:         run,
			stepIndex:   stepIndex,
			parkedSince: parkedSince,
		})
	}
	return abandoned, nil
}

// openGate locates the step holding the run open and when its wait began.
// stepIndex is -1 when no step is marked awaiting_human, which can happen for
// runs whose status and step log disagree.
func openGate(run *orchestration.Run) (stepIndex int, parkedSince time.Time) {
	for i := range run.Steps {
		if run.Steps[i].Status != "awaiting_human" {
			continue
		}
		if opened := run.Steps[i].GateOpenedAt; opened != nil {
			return i, *opened
		}
		return i, run.CreatedAt
	}
	return -1, run.CreatedAt
}
