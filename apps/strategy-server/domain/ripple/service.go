// Package ripple implements the Ripple Coherence Engine — detecting and
// managing misalignments between connected strategy artifacts.
package ripple

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// Service manages ripple signal lifecycle.
type Service struct {
	db *bun.DB
}

// NewService creates a new ripple service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// ListParams configures signal listing.
type ListParams struct {
	InstanceID uuid.UUID
	SignalType string // optional filter
	Severity   string // optional filter
	Status     string // optional filter; defaults to "active"
	TargetKey  string // optional filter
	Limit      int
	Cursor     string // signal ID for cursor-based pagination
}

// CreateSignal inserts a new ripple signal.
func (s *Service) CreateSignal(ctx context.Context, sig *domain.RippleSignal) error {
	if sig.ID == uuid.Nil {
		sig.ID = uuid.New()
	}
	if sig.Status == "" {
		sig.Status = domain.SignalStatusActive
	}
	if sig.CreatedAt.IsZero() {
		sig.CreatedAt = time.Now()
	}
	_, err := s.db.NewInsert().Model(sig).Exec(ctx)
	if err != nil {
		return fmt.Errorf("create ripple signal: %w", err)
	}
	return nil
}

// CreateSignals inserts multiple signals in a single statement.
func (s *Service) CreateSignals(ctx context.Context, sigs []*domain.RippleSignal) error {
	if len(sigs) == 0 {
		return nil
	}
	for _, sig := range sigs {
		if sig.ID == uuid.Nil {
			sig.ID = uuid.New()
		}
		if sig.Status == "" {
			sig.Status = domain.SignalStatusActive
		}
		if sig.CreatedAt.IsZero() {
			sig.CreatedAt = time.Now()
		}
	}
	_, err := s.db.NewInsert().Model(&sigs).Exec(ctx)
	if err != nil {
		return fmt.Errorf("create ripple signals: %w", err)
	}
	return nil
}

// ListSignals returns signals matching the given filters.
func (s *Service) ListSignals(ctx context.Context, p ListParams) ([]*domain.RippleSignal, error) {
	var sigs []*domain.RippleSignal
	q := s.db.NewSelect().Model(&sigs).
		Where("rs.instance_id = ?", p.InstanceID).
		OrderExpr("CASE rs.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END").
		Order("rs.created_at DESC")

	status := p.Status
	if status == "" {
		status = domain.SignalStatusActive
	}
	if status != "all" {
		q = q.Where("rs.status = ?", status)
	}
	if p.SignalType != "" {
		q = q.Where("rs.signal_type = ?", p.SignalType)
	}
	if p.Severity != "" {
		q = q.Where("rs.severity = ?", p.Severity)
	}
	if p.TargetKey != "" {
		q = q.Where("rs.target_key = ?", p.TargetKey)
	}
	if p.Cursor != "" {
		q = q.Where("rs.id < ?", p.Cursor)
	}
	limit := p.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q = q.Limit(limit)

	err := q.Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list ripple signals: %w", err)
	}
	return sigs, nil
}

// CountByStatus returns active signal counts grouped by severity for an instance.
func (s *Service) CountByStatus(ctx context.Context, instanceID uuid.UUID) (map[string]int, error) {
	type row struct {
		Severity string `bun:"severity"`
		Count    int    `bun:"count"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("ripple_signals").
		ColumnExpr("severity, COUNT(*) AS count").
		Where("instance_id = ?", instanceID).
		Where("status = ?", domain.SignalStatusActive).
		GroupExpr("severity").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("count ripple signals: %w", err)
	}
	counts := make(map[string]int)
	for _, r := range rows {
		counts[r.Severity] = r.Count
	}
	return counts, nil
}

// GetSignal returns a single signal by ID.
func (s *Service) GetSignal(ctx context.Context, signalID uuid.UUID) (*domain.RippleSignal, error) {
	sig := new(domain.RippleSignal)
	err := s.db.NewSelect().Model(sig).Where("rs.id = ?", signalID).Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("get ripple signal %s: %w", signalID, err)
	}
	return sig, nil
}

// AcknowledgeSignal sets a signal's status to acknowledged.
func (s *Service) AcknowledgeSignal(ctx context.Context, signalID uuid.UUID) (*domain.RippleSignal, error) {
	sig := new(domain.RippleSignal)
	res, err := s.db.NewUpdate().Model(sig).
		Set("status = ?", domain.SignalStatusAcknowledged).
		Where("id = ?", signalID).
		Where("status IN (?, ?)", domain.SignalStatusActive, domain.SignalStatusAcknowledged).
		Returning("*").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("acknowledge signal %s: %w", signalID, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, fmt.Errorf("signal %s not found or already resolved/dismissed", signalID)
	}
	return sig, nil
}

// ResolveSignal sets a signal's status to resolved, optionally linking to a batch.
func (s *Service) ResolveSignal(ctx context.Context, signalID uuid.UUID, batchID *uuid.UUID) (*domain.RippleSignal, error) {
	now := time.Now()
	sig := new(domain.RippleSignal)
	q := s.db.NewUpdate().Model(sig).
		Set("status = ?", domain.SignalStatusResolved).
		Set("resolved_at = ?", now).
		Where("id = ?", signalID).
		Where("status IN (?, ?)", domain.SignalStatusActive, domain.SignalStatusAcknowledged)

	if batchID != nil {
		q = q.Set("batch_id = ?", *batchID)
	}
	res, err := q.Returning("*").Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("resolve signal %s: %w", signalID, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, fmt.Errorf("signal %s not found or already resolved/dismissed", signalID)
	}
	return sig, nil
}

// ResolveByTarget auto-resolves all active/acknowledged signals targeting a given
// artifact key. Called after an artifact is updated via CommitBatch.
func (s *Service) ResolveByTarget(ctx context.Context, instanceID uuid.UUID, targetKey string, batchID *uuid.UUID) (int, error) {
	now := time.Now()
	q := s.db.NewUpdate().TableExpr("ripple_signals").
		Set("status = ?", domain.SignalStatusResolved).
		Set("resolved_at = ?", now).
		Where("instance_id = ?", instanceID).
		Where("target_key = ?", targetKey).
		Where("status IN (?, ?)", domain.SignalStatusActive, domain.SignalStatusAcknowledged)

	if batchID != nil {
		q = q.Set("batch_id = ?", *batchID)
	}
	res, err := q.Exec(ctx)
	if err != nil {
		return 0, fmt.Errorf("resolve signals by target %s: %w", targetKey, err)
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// DismissSignal sets a signal's status to dismissed with a reason.
func (s *Service) DismissSignal(ctx context.Context, signalID uuid.UUID, reason string) (*domain.RippleSignal, error) {
	now := time.Now()
	metadata := fmt.Sprintf(`{"dismiss_reason": %q}`, reason)
	sig := new(domain.RippleSignal)
	res, err := s.db.NewUpdate().Model(sig).
		Set("status = ?", domain.SignalStatusDismissed).
		Set("resolved_at = ?", now).
		Set("metadata = COALESCE(metadata, '{}'::jsonb) || ?::jsonb", metadata).
		Where("id = ?", signalID).
		Where("status IN (?, ?)", domain.SignalStatusActive, domain.SignalStatusAcknowledged).
		Returning("*").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("dismiss signal %s: %w", signalID, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, fmt.Errorf("signal %s not found or already resolved/dismissed", signalID)
	}
	return sig, nil
}

// TopCritical returns the N most critical active signals for an instance.
func (s *Service) TopCritical(ctx context.Context, instanceID uuid.UUID, limit int) ([]*domain.RippleSignal, error) {
	if limit <= 0 {
		limit = 3
	}
	var sigs []*domain.RippleSignal
	err := s.db.NewSelect().Model(&sigs).
		Where("rs.instance_id = ?", instanceID).
		Where("rs.status = ?", domain.SignalStatusActive).
		OrderExpr("CASE rs.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END").
		Order("rs.created_at DESC").
		Limit(limit).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("top critical signals: %w", err)
	}
	return sigs, nil
}
