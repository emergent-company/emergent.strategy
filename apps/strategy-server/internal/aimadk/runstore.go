package aimadk

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

// runRow is the bun model for adk_run_metadata. It mirrors pkg/orchestration/pg's
// runRow deliberately: both persist the same orchestration.Run shape, and
// keeping the column mapping identical is what lets RunStore reuse
// orchestration.Run and orchestration.StepLog directly rather than a second
// set of DTOs the run panel would need to learn.
type runRow struct {
	bun.BaseModel `bun:"table:adk_run_metadata"`

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

// RunStore persists the cross-run record an ADK-backed orchestration engine
// needs and an ADK session does not provide on its own: which run is active
// for a concurrency key, which run staged a given batch, and the run/step
// history the run panel already knows how to render.
//
// It speaks orchestration.Run and orchestration.StepLog directly rather than
// introducing a parallel type. Both the run panel and the EngineAPI contract
// already understand that shape.
type RunStore struct {
	db *bun.DB
}

// NewRunStore creates a RunStore backed by db.
func NewRunStore(db *bun.DB) *RunStore { return &RunStore{db: db} }

// Create persists a new run. It returns orchestration.ErrAlreadyActive if a
// non-terminal run already holds this run's (workflow, concurrency key) pair.
//
// That check is a database constraint (a partial unique index on
// adk_run_metadata), not a check-then-insert race: the legacy engine's
// StartRun checks for an active run and then inserts as two separate
// operations, so two concurrent StartRun calls can both pass the check before
// either insert lands. This store closes that race by construction — Create
// either succeeds or the constraint rejects it, with nothing observable in
// between.
func (s *RunStore) Create(ctx context.Context, run *orchestration.Run) error {
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
	if isUniqueViolation(err) {
		return orchestration.ErrAlreadyActive
	}
	return err
}

// isUniqueViolation reports whether err is a Postgres unique constraint
// violation. The project connects through bun's own pgdriver
// (internal/database/db.go), not pgx directly, so the error surfaces as
// pgdriver.Error rather than *pgconn.PgError — this must match the driver
// actually in use, not the more commonly documented pgx error type.
func isUniqueViolation(err error) bool {
	var pgErr pgdriver.Error
	return errors.As(err, &pgErr) && pgErr.Field('C') == postgresUniqueViolation
}

// UpdateStatus writes a run's status, current step, error, and full step log.
// The step log is the authoritative record of gate lifecycle
// (GateOpenedAt/GateClearedAt/GateOutcome) and step metadata; callers persist
// the whole slice on every transition, matching the legacy engine's contract.
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

// ActiveRun returns the non-terminal run for a workflow + concurrency key, or
// nil if none. Because Create enforces at most one such row via the unique
// index, this can never return ambiguous results the way a race-prone check
// could.
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

// FindRunByBatch returns the run awaiting review of the given batch, or nil if
// none. Only steps currently awaiting_human are considered — a batch id that
// appears on a completed step from an earlier point in the run's own history
// must not match.
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
// olderThan. The clock-fallback logic lives in orchestration.FindAbandonedGates,
// shared with the legacy engine's store, so it is not reimplemented here.
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
