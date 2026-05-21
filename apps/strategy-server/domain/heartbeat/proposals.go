package heartbeat

// Proposal management for the continuous AIM loop.
//
// When the heartbeat fires a trigger AND:
//   - no active orchestration run exists for the instance, AND
//   - no pending proposal exists for the instance,
//
// a CycleProposal is created. Humans can then approve (→ starts AIM cycle),
// defer (→ snooze for N days), or let it auto-expire after the snooze window.

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// CycleStarter is implemented by the orchestration engine. It allows the
// heartbeat package to start an AIM cycle without importing pkg/orchestration
// or domain/aim directly.
type CycleStarter interface {
	StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (CycleRun, error)
}

// CycleRun is the minimal view of an orchestration run returned by CycleStarter.
type CycleRun struct {
	ID uuid.UUID
}

// DefaultSnoozeDuration is the snooze window when deferring without a custom duration.
const DefaultSnoozeDuration = 7 * 24 * time.Hour

// Proposal is the heartbeat package's view of domain.CycleProposal.
type Proposal struct {
	ID             uuid.UUID       `json:"id"`
	InstanceID     uuid.UUID       `json:"instance_id"`
	TriggerReason  string          `json:"trigger_reason"`
	TriggerMessage string          `json:"trigger_message"`
	EvidenceCount  int             `json:"evidence_count"`
	SignalCount    int             `json:"signal_count"`
	ContextPayload json.RawMessage `json:"context_payload"`
	Status         string          `json:"status"`
	SnoozedUntil   *time.Time      `json:"snooze_until,omitempty"`
	ApprovedRunID  *uuid.UUID      `json:"approved_run_id,omitempty"`
	ResolvedAt     *time.Time      `json:"resolved_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

// CreateProposalParams holds the context snapshot at proposal creation time.
type CreateProposalParams struct {
	InstanceID     uuid.UUID
	TriggerReason  string
	TriggerMessage string
	EvidenceCount  int
	SignalCount    int
	ContextPayload map[string]any // e.g. days_since_last_cycle, evidence_summary
}

// ---------------------------------------------------------------------------
// CreateProposal
// ---------------------------------------------------------------------------

// maybeCreateProposal creates a CycleProposal if no pending proposal already
// exists for the instance. It is called from EvaluateAll after a trigger fires.
// Returns true if a new proposal was created.
func (s *Service) maybeCreateProposal(ctx context.Context, p CreateProposalParams) bool {
	// Guard: skip if a pending proposal already exists.
	if s.hasPendingProposal(ctx, p.InstanceID) {
		slog.DebugContext(ctx, "heartbeat: pending proposal already exists — skipping",
			"instance_id", p.InstanceID)
		return false
	}

	ctxPayload, _ := json.Marshal(p.ContextPayload)
	if ctxPayload == nil {
		ctxPayload = json.RawMessage(`{}`)
	}

	row := &domain.CycleProposal{
		ID:             uuid.New(),
		InstanceID:     p.InstanceID,
		TriggerReason:  p.TriggerReason,
		TriggerMessage: p.TriggerMessage,
		EvidenceCount:  p.EvidenceCount,
		SignalCount:    p.SignalCount,
		ContextPayload: ctxPayload,
		Status:         domain.CycleProposalStatusPending,
	}

	if _, err := s.db.NewInsert().Model(row).Exec(ctx); err != nil {
		slog.ErrorContext(ctx, "heartbeat: failed to create cycle proposal",
			"instance_id", p.InstanceID, "err", err)
		return false
	}

	slog.InfoContext(ctx, "heartbeat: cycle proposal created",
		"proposal_id", row.ID,
		"instance_id", p.InstanceID,
		"reason", p.TriggerReason,
	)

	// Stage 5.7: record in activity stream.
	if s.activity != nil {
		s.activity.Record(ctx, ActivityEvent{
			InstanceID: p.InstanceID,
			EventType:  "proposal.created",
			Payload: map[string]any{
				"proposal_id":     row.ID.String(),
				"trigger_reason":  p.TriggerReason,
				"trigger_message": p.TriggerMessage,
				"evidence_count":  p.EvidenceCount,
				"signal_count":    p.SignalCount,
			},
		})
	}

	return true
}

// ---------------------------------------------------------------------------
// ListProposals
// ---------------------------------------------------------------------------

// ListProposals returns cycle proposals for an instance. Pass status="" for all,
// or "pending" / "approved" / "deferred" / "expired" to filter.
func (s *Service) ListProposals(ctx context.Context, instanceID uuid.UUID, status string) ([]Proposal, error) {
	var rows []domain.CycleProposal
	q := s.db.NewSelect().
		Model(&rows).
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC")
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Scan(ctx); err != nil {
		return nil, err
	}
	return toProposals(rows), nil
}

// GetProposal returns a single proposal by ID.
func (s *Service) GetProposal(ctx context.Context, proposalID uuid.UUID) (*Proposal, error) {
	var row domain.CycleProposal
	if err := s.db.NewSelect().Model(&row).Where("id = ?", proposalID).Scan(ctx); err != nil {
		return nil, ErrProposalNotFound
	}
	p := toProposal(row)
	return &p, nil
}

// ---------------------------------------------------------------------------
// ApproveProposal
// ---------------------------------------------------------------------------

// ApproveProposal marks the proposal as approved and starts an AIM orchestration
// run. Returns the run ID. If a run is already active, returns ErrCycleAlreadyActive.
func (s *Service) ApproveProposal(ctx context.Context, proposalID uuid.UUID, starter CycleStarter, workflowName string) (*Proposal, error) {
	var row domain.CycleProposal
	if err := s.db.NewSelect().Model(&row).Where("id = ?", proposalID).Scan(ctx); err != nil {
		return nil, ErrProposalNotFound
	}
	if row.Status != domain.CycleProposalStatusPending {
		return nil, ErrProposalNotPending
	}

	// Start the orchestration run.
	run, err := starter.StartRun(ctx, workflowName, row.InstanceID.String(), map[string]any{
		"instance_id": row.InstanceID.String(),
		"proposal_id": row.ID.String(),
	})
	if err != nil {
		return nil, err
	}

	// Mark approved.
	now := time.Now().UTC()
	runID := run.ID
	row.Status = domain.CycleProposalStatusApproved
	row.ApprovedRunID = &runID
	row.ResolvedAt = &now

	if _, err := s.db.NewUpdate().
		Model(&row).
		Column("status", "approved_run_id", "resolved_at").
		WherePK().
		Exec(ctx); err != nil {
		slog.WarnContext(ctx, "heartbeat: failed to update proposal status to approved",
			"proposal_id", proposalID, "err", err)
	}

	p := toProposal(row)
	slog.InfoContext(ctx, "heartbeat: proposal approved, AIM cycle started",
		"proposal_id", proposalID,
		"instance_id", row.InstanceID,
		"run_id", run.ID,
	)

	// Stage 5.7: record in activity stream.
	if s.activity != nil {
		s.activity.Record(ctx, ActivityEvent{
			InstanceID: row.InstanceID,
			EventType:  "proposal.approved",
			Payload: map[string]any{
				"proposal_id": proposalID.String(),
				"run_id":      run.ID.String(),
			},
		})
	}

	return &p, nil
}

// ---------------------------------------------------------------------------
// DeferProposal
// ---------------------------------------------------------------------------

// DeferProposal snoozes the proposal for the given duration (default 7 days).
// The heartbeat will not create a new proposal until snooze_until passes.
func (s *Service) DeferProposal(ctx context.Context, proposalID uuid.UUID, duration time.Duration) (*Proposal, error) {
	var row domain.CycleProposal
	if err := s.db.NewSelect().Model(&row).Where("id = ?", proposalID).Scan(ctx); err != nil {
		return nil, ErrProposalNotFound
	}
	if row.Status != domain.CycleProposalStatusPending {
		return nil, ErrProposalNotPending
	}
	if duration <= 0 {
		duration = DefaultSnoozeDuration
	}

	now := time.Now().UTC()
	snoozeUntil := now.Add(duration)
	row.Status = domain.CycleProposalStatusDeferred
	row.SnoozedUntil = &snoozeUntil
	row.ResolvedAt = &now

	if _, err := s.db.NewUpdate().
		Model(&row).
		Column("status", "snooze_until", "resolved_at").
		WherePK().
		Exec(ctx); err != nil {
		return nil, err
	}

	p := toProposal(row)
	slog.InfoContext(ctx, "heartbeat: proposal deferred",
		"proposal_id", proposalID,
		"instance_id", row.InstanceID,
		"snooze_until", snoozeUntil,
	)
	return &p, nil
}

// ---------------------------------------------------------------------------
// ExpireStaleProposals
// ---------------------------------------------------------------------------

// ExpireStaleProposals marks deferred proposals as expired once their snooze
// window has passed. Called at the start of each heartbeat tick so the instance
// becomes eligible for a new proposal.
func (s *Service) ExpireStaleProposals(ctx context.Context) (int, error) {
	res, err := s.db.NewUpdate().
		TableExpr("cycle_proposals").
		Set("status = ?", domain.CycleProposalStatusExpired).
		Set("resolved_at = now()").
		Where("status = ?", domain.CycleProposalStatusDeferred).
		Where("snooze_until IS NOT NULL AND snooze_until <= now()").
		Exec(ctx)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if n > 0 {
		slog.InfoContext(ctx, "heartbeat: expired stale proposals", "count", n)
	}
	return int(n), nil
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

// hasPendingProposal returns true if there is already a pending (or deferred
// but not yet expired) proposal for the instance.
func (s *Service) hasPendingProposal(ctx context.Context, instanceID uuid.UUID) bool {
	var count int
	_ = s.db.NewSelect().
		TableExpr("cycle_proposals").
		ColumnExpr("COUNT(*)").
		Where("instance_id = ?", instanceID).
		Where("status IN (?)", bun.List([]string{
			domain.CycleProposalStatusPending,
			domain.CycleProposalStatusDeferred,
		})).
		Where("(snooze_until IS NULL OR snooze_until > now())").
		Scan(ctx, &count)
	return count > 0
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// ErrProposalNotFound is returned when a proposal does not exist.
var ErrProposalNotFound = proposalNotFoundError{}

type proposalNotFoundError struct{}

func (e proposalNotFoundError) Error() string { return "cycle proposal not found" }

// ErrProposalNotPending is returned when trying to approve/defer a non-pending proposal.
var ErrProposalNotPending = proposalNotPendingError{}

type proposalNotPendingError struct{}

func (e proposalNotPendingError) Error() string {
	return "cycle proposal is not in pending state"
}

// ErrCycleAlreadyActive is returned when ApproveProposal fails because a run is already active.
var ErrCycleAlreadyActive = cycleAlreadyActiveError{}

type cycleAlreadyActiveError struct{}

func (e cycleAlreadyActiveError) Error() string { return "an AIM cycle is already running" }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func toProposal(row domain.CycleProposal) Proposal {
	return Proposal{
		ID:             row.ID,
		InstanceID:     row.InstanceID,
		TriggerReason:  row.TriggerReason,
		TriggerMessage: row.TriggerMessage,
		EvidenceCount:  row.EvidenceCount,
		SignalCount:    row.SignalCount,
		ContextPayload: row.ContextPayload,
		Status:         row.Status,
		SnoozedUntil:   row.SnoozedUntil,
		ApprovedRunID:  row.ApprovedRunID,
		ResolvedAt:     row.ResolvedAt,
		CreatedAt:      row.CreatedAt,
	}
}

func toProposals(rows []domain.CycleProposal) []Proposal {
	out := make([]Proposal, len(rows))
	for i, r := range rows {
		out[i] = toProposal(r)
	}
	return out
}
