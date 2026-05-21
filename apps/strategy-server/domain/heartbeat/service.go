// Package heartbeat evaluates AIM triggers for all active strategy instances
// on a periodic schedule and persists fired events as heartbeat_signals.
// It is the first step in making the READY-FIRE-AIM loop continuous.
package heartbeat

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// TriggerEvaluator is the interface used to check whether an AIM cycle is due.
// The aim.Service satisfies this interface.
type TriggerEvaluator interface {
	EvaluateTriggers(ctx context.Context, instanceID uuid.UUID) TriggerState
}

// EvidenceCounter is optionally implemented by domain/evidence.Service to
// provide unprocessed evidence counts for proposal context.
type EvidenceCounter interface {
	CountUnprocessed(ctx context.Context, instanceID uuid.UUID, tagFilter []string) (int, error)
}

// TriggerState mirrors aim.TriggerState so the heartbeat package does not
// import the aim package (avoids circular deps when aim imports heartbeat).
type TriggerState struct {
	Fired         bool
	Reason        string // "time" | "signals" | ""
	ReasonMessage string
}

// Signal is a persisted heartbeat event for a single instance.
type Signal struct {
	bun.BaseModel  `bun:"table:heartbeat_signals"`
	ID             uuid.UUID  `bun:"id,pk"          json:"id"`
	InstanceID     uuid.UUID  `bun:"instance_id"    json:"instance_id"`
	Reason         string     `bun:"reason"         json:"reason"`
	Message        string     `bun:"message"        json:"message"`
	AcknowledgedAt *time.Time `bun:"acknowledged_at" json:"acknowledged_at,omitempty"`
	CreatedAt      time.Time  `bun:"created_at"     json:"created_at"`
}

// TriggerResult bundles a fired signal with the instance that triggered it.
type TriggerResult struct {
	InstanceID uuid.UUID
	Signal     Signal
}

// Service runs periodic trigger evaluations across all active instances.
type Service struct {
	db        *bun.DB
	evaluator TriggerEvaluator
	evidence  EvidenceCounter // optional — nil = evidence count not included in proposals
}

// NewService creates a new heartbeat Service.
func NewService(db *bun.DB, evaluator TriggerEvaluator) *Service {
	return &Service{db: db, evaluator: evaluator}
}

// WithEvidenceCounter attaches an evidence counter for proposal context enrichment.
func (s *Service) WithEvidenceCounter(e EvidenceCounter) *Service {
	s.evidence = e
	return s
}

// ---------------------------------------------------------------------------
// EvaluateAll
// ---------------------------------------------------------------------------

// EvaluateAll queries all active instances, evaluates their AIM triggers in a
// single pass, persists new signals for fired triggers, creates cycle proposals
// for instances that need a cycle but have none pending, and returns the fired
// results. It is designed to be called on a ticker interval.
//
// Signal deduplication: if an unacknowledged signal already exists for an
// instance (same reason), a new one is NOT created to avoid noise.
func (s *Service) EvaluateAll(ctx context.Context) ([]TriggerResult, error) {
	// 0. Expire any deferred proposals whose snooze window has passed.
	if _, err := s.ExpireStaleProposals(ctx); err != nil {
		slog.WarnContext(ctx, "heartbeat: failed to expire stale proposals (degraded)", "err", err)
	}

	// 1. Fetch all active instance IDs in a single query.
	instanceIDs, err := s.listActiveInstanceIDs(ctx)
	if err != nil {
		return nil, err
	}
	if len(instanceIDs) == 0 {
		return nil, nil
	}

	// 2. Fetch critical signal counts for all instances in one batched query.
	criticalCounts, err := s.batchCriticalSignalCounts(ctx, instanceIDs)
	if err != nil {
		slog.WarnContext(ctx, "heartbeat: failed to batch signal counts (degraded)", "err", err)
		// Continue — EvaluateTriggers degrades gracefully.
	}

	// 3. Load existing unacknowledged heartbeat signals to deduplicate.
	existingByInstance, err := s.loadUnacknowledgedByInstance(ctx, instanceIDs)
	if err != nil {
		slog.WarnContext(ctx, "heartbeat: failed to load existing signals (degraded)", "err", err)
		// Continue with empty set — may produce duplicate signals, acceptable.
		existingByInstance = make(map[uuid.UUID]map[string]bool)
	}

	// 4. Evaluate each instance and collect fired triggers.
	var results []TriggerResult
	var toInsert []Signal

	for _, instID := range instanceIDs {
		state := s.evaluator.EvaluateTriggers(ctx, instID)
		if !state.Fired {
			continue
		}

		// Deduplicate: skip if an unacknowledged signal for this reason already exists.
		if existing, ok := existingByInstance[instID]; ok && existing[state.Reason] {
			slog.DebugContext(ctx, "heartbeat: skipping duplicate signal",
				"instance_id", instID, "reason", state.Reason)
			continue
		}

		sig := Signal{
			ID:         uuid.New(),
			InstanceID: instID,
			Reason:     state.Reason,
			Message:    state.ReasonMessage,
			CreatedAt:  time.Now(),
		}
		toInsert = append(toInsert, sig)
		results = append(results, TriggerResult{InstanceID: instID, Signal: sig})

		slog.InfoContext(ctx, "heartbeat: trigger fired",
			"instance_id", instID,
			"reason", state.Reason,
			"message", state.ReasonMessage,
			"critical_count", criticalCounts[instID],
		)

		// 4b. Create a cycle proposal if none is pending for this instance.
		evCount := 0
		if s.evidence != nil {
			evCount, _ = s.evidence.CountUnprocessed(ctx, instID, nil)
		}
		s.maybeCreateProposal(ctx, CreateProposalParams{
			InstanceID:     instID,
			TriggerReason:  state.Reason,
			TriggerMessage: state.ReasonMessage,
			EvidenceCount:  evCount,
			SignalCount:    criticalCounts[instID],
			ContextPayload: map[string]any{
				"critical_signal_count": criticalCounts[instID],
				"evidence_count":        evCount,
			},
		})
	}

	// 5. Persist all new signals in a single INSERT.
	if len(toInsert) > 0 {
		if _, err := s.db.NewInsert().Model(&toInsert).Exec(ctx); err != nil {
			slog.ErrorContext(ctx, "heartbeat: failed to persist signals", "err", err, "count", len(toInsert))
			// Return results anyway — signals were detected even if persistence failed.
		}
	}

	slog.InfoContext(ctx, "heartbeat: evaluation complete",
		"instances_checked", len(instanceIDs),
		"triggers_fired", len(results),
	)

	return results, nil
}

// ---------------------------------------------------------------------------
// Signal management
// ---------------------------------------------------------------------------

// ListSignals returns unacknowledged heartbeat signals for an instance,
// ordered newest first.
func (s *Service) ListSignals(ctx context.Context, instanceID uuid.UUID) ([]Signal, error) {
	var sigs []Signal
	err := s.db.NewSelect().
		Model(&sigs).
		Where("instance_id = ?", instanceID).
		Where("acknowledged_at IS NULL").
		OrderExpr("created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return sigs, nil
}

// ListAllSignals returns all heartbeat signals (both acknowledged and not)
// for an instance, ordered newest first, limited to the most recent 100.
func (s *Service) ListAllSignals(ctx context.Context, instanceID uuid.UUID) ([]Signal, error) {
	var sigs []Signal
	err := s.db.NewSelect().
		Model(&sigs).
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC").
		Limit(100).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return sigs, nil
}

// Acknowledge marks a heartbeat signal as seen.
func (s *Service) Acknowledge(ctx context.Context, signalID uuid.UUID) error {
	now := time.Now()
	res, err := s.db.NewUpdate().
		Model((*Signal)(nil)).
		Set("acknowledged_at = ?", now).
		Where("id = ?", signalID).
		Where("acknowledged_at IS NULL").
		Exec(ctx)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrSignalNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

var ErrSignalNotFound = &signalNotFoundError{}

type signalNotFoundError struct{}

func (e *signalNotFoundError) Error() string {
	return "heartbeat signal not found or already acknowledged"
}

func (s *Service) listActiveInstanceIDs(ctx context.Context) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := s.db.NewSelect().
		TableExpr("strategy_instances").
		ColumnExpr("id").
		Where("status != ?", "archived").
		Scan(ctx, &ids)
	return ids, err
}

// batchCriticalSignalCounts returns a map of instance_id → critical signal count
// using a single SQL GROUP BY query.
func (s *Service) batchCriticalSignalCounts(ctx context.Context, instanceIDs []uuid.UUID) (map[uuid.UUID]int, error) {
	type row struct {
		InstanceID uuid.UUID `bun:"instance_id"`
		Count      int       `bun:"count"`
	}

	var rows []row
	err := s.db.NewSelect().
		TableExpr("ripple_signals").
		ColumnExpr("instance_id, COUNT(*) AS count").
		Where("instance_id IN (?)", bun.List(instanceIDs)).
		Where("status = ?", "active").
		Where("severity = ?", "critical").
		GroupExpr("instance_id").
		Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}

	counts := make(map[uuid.UUID]int, len(rows))
	for _, r := range rows {
		counts[r.InstanceID] = r.Count
	}
	return counts, nil
}

// loadUnacknowledgedByInstance returns existing unacknowledged signals grouped
// by instance_id → set of reasons, used for deduplication.
func (s *Service) loadUnacknowledgedByInstance(ctx context.Context, instanceIDs []uuid.UUID) (map[uuid.UUID]map[string]bool, error) {
	type row struct {
		InstanceID uuid.UUID `bun:"instance_id"`
		Reason     string    `bun:"reason"`
	}

	var rows []row
	err := s.db.NewSelect().
		TableExpr("heartbeat_signals AS hs").
		ColumnExpr("hs.instance_id, hs.reason").
		Where("hs.instance_id IN (?)", bun.List(instanceIDs)).
		Where("hs.acknowledged_at IS NULL").
		Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}

	result := make(map[uuid.UUID]map[string]bool)
	for _, r := range rows {
		if result[r.InstanceID] == nil {
			result[r.InstanceID] = make(map[string]bool)
		}
		result[r.InstanceID][r.Reason] = true
	}
	return result, nil
}
