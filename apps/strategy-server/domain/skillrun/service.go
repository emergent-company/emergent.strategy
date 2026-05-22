package skillrun

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// Service manages the skill run ledger.
type Service struct {
	db *bun.DB
}

// NewService creates a new skill run Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// Create inserts a new run record with status=running and returns the run ID.
func (s *Service) Create(ctx context.Context, p CreateParams) (uuid.UUID, error) {
	triggerCtx, err := json.Marshal(p.TriggerContext)
	if err != nil {
		triggerCtx = []byte("{}")
	}
	if p.Trigger == "" {
		p.Trigger = TriggerManual
	}

	run := &Run{
		ID:             uuid.New(),
		InstanceID:     p.InstanceID,
		SkillName:      p.SkillName,
		Status:         StatusRunning,
		Trigger:        p.Trigger,
		TriggerContext: triggerCtx,
		StartedAt:      time.Now(),
		ChunkCount:     p.ChunkCount,
		Model:          p.Model,
		ChunkLog:       []byte("[]"),
		CreatedAt:      time.Now(),
	}

	if _, err := s.db.NewInsert().Model(run).Exec(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("skillrun: create: %w", err)
	}
	return run.ID, nil
}

// UpdateChunk appends a chunk entry to the run's chunk_log and increments
// chunks_completed. Token counts are added to the run totals.
func (s *Service) UpdateChunk(ctx context.Context, runID uuid.UUID, entry ChunkEntry) error {
	entryJSON, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("skillrun: marshal chunk entry: %w", err)
	}

	_, err = s.db.NewUpdate().
		Model((*Run)(nil)).
		Set("chunks_completed = chunks_completed + 1").
		Set("total_input_tokens = total_input_tokens + ?", entry.InputTokens).
		Set("total_output_tokens = total_output_tokens + ?", entry.OutputTokens).
		Set("chunk_log = chunk_log || ?::jsonb", string(entryJSON)).
		Where("id = ?", runID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("skillrun: update chunk: %w", err)
	}
	return nil
}

// Complete marks a run as completed with the resulting batch ID.
func (s *Service) Complete(ctx context.Context, runID uuid.UUID, batchID uuid.UUID) error {
	now := time.Now()
	_, err := s.db.NewUpdate().
		Model((*Run)(nil)).
		Set("status = ?", StatusCompleted).
		Set("completed_at = ?", now).
		Set("batch_id = ?", batchID).
		Where("id = ?", runID).
		Where("status = ?", StatusRunning).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("skillrun: complete: %w", err)
	}
	return nil
}

// Fail marks a run as failed with an error description.
func (s *Service) Fail(ctx context.Context, runID uuid.UUID, errMsg string) error {
	now := time.Now()
	_, err := s.db.NewUpdate().
		Model((*Run)(nil)).
		Set("status = ?", StatusFailed).
		Set("completed_at = ?", now).
		Set("error = ?", errMsg).
		Where("id = ?", runID).
		Where("status = ?", StatusRunning).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("skillrun: fail: %w", err)
	}
	return nil
}

// GetByID returns a single run by its UUID.
func (s *Service) GetByID(ctx context.Context, runID uuid.UUID) (*Run, error) {
	run := new(Run)
	err := s.db.NewSelect().
		Model(run).
		Where("id = ?", runID).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("skillrun: get: %w", err)
	}
	return run, nil
}

// ListByInstance returns skill runs for an instance, ordered newest first.
func (s *Service) ListByInstance(ctx context.Context, instanceID uuid.UUID, p ListParams) ([]Run, error) {
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 50
	}

	var runs []Run
	q := s.db.NewSelect().
		Model(&runs).
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC").
		Limit(p.Limit)

	if p.Status != "" {
		q = q.Where("status = ?", p.Status)
	}
	if p.Trigger != "" {
		q = q.Where("trigger = ?", p.Trigger)
	}

	if err := q.Scan(ctx); err != nil {
		return nil, fmt.Errorf("skillrun: list: %w", err)
	}
	return runs, nil
}

// ActiveForInstance returns the currently running skill run for an instance,
// or nil if none is active. At most one run per instance should be active at
// a time, but no uniqueness constraint enforces this — the caller is responsible
// for checking before creating a new run.
func (s *Service) ActiveForInstance(ctx context.Context, instanceID uuid.UUID) (*Run, error) {
	run := new(Run)
	err := s.db.NewSelect().
		Model(run).
		Where("instance_id = ?", instanceID).
		Where("status = ?", StatusRunning).
		OrderExpr("started_at DESC").
		Limit(1).
		Scan(ctx)
	if err != nil {
		return nil, nil //nolint:nilerr // No active run is a valid state, not an error.
	}
	return run, nil
}

// UsageSummary is an aggregation of token usage grouped by skill name.
type UsageSummary struct {
	SkillName    string `bun:"skill_name"    json:"skill_name"`
	RunCount     int    `bun:"run_count"     json:"run_count"`
	InputTokens  int    `bun:"input_tokens"  json:"input_tokens"`
	OutputTokens int    `bun:"output_tokens" json:"output_tokens"`
}

// GetUsage returns aggregated token usage by skill name for an instance.
// Optional since/until parameters filter by started_at range.
func (s *Service) GetUsage(ctx context.Context, instanceID uuid.UUID, since, until *time.Time) ([]UsageSummary, error) {
	var rows []UsageSummary
	q := s.db.NewSelect().
		TableExpr("skill_runs").
		ColumnExpr("skill_name").
		ColumnExpr("COUNT(*) AS run_count").
		ColumnExpr("COALESCE(SUM(total_input_tokens), 0) AS input_tokens").
		ColumnExpr("COALESCE(SUM(total_output_tokens), 0) AS output_tokens").
		Where("instance_id = ?", instanceID).
		Where("status = ?", StatusCompleted).
		GroupExpr("skill_name").
		OrderExpr("run_count DESC")

	if since != nil {
		q = q.Where("started_at >= ?", *since)
	}
	if until != nil {
		q = q.Where("started_at <= ?", *until)
	}

	if err := q.Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("skillrun: usage: %w", err)
	}
	return rows, nil
}
