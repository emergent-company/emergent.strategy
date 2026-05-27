// Package heartbeat evaluates AIM triggers for all active strategy instances
// on a periodic schedule and persists fired events as heartbeat_signals.
// It is the first step in making the READY-FIRE-AIM loop continuous.
package heartbeat

import (
	"context"
	"log/slog"
	"strings"
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

// ActivityRecorder is optionally implemented by domain/activity.Service to
// record significant heartbeat events in the activity stream.
// Using an interface avoids a direct import of domain/activity from heartbeat.
type ActivityRecorder interface {
	Record(ctx context.Context, req ActivityEvent)
}

// InstanceConsistencyChecker is optionally implemented by domain/strategy.Service
// to run instance health repairs during heartbeat ticks.
// Using an interface avoids a direct import of domain/strategy from heartbeat.
type InstanceConsistencyChecker interface {
	// RunConsistencyCheckForAll runs checks across all non-archived instances.
	RunConsistencyCheckForAll(ctx context.Context)
}

// MemoryDriftRepairer is optionally implemented by a service that can detect and
// repair Memory graph drift (e.g. after Memory server restart wipes the graph).
type MemoryDriftRepairer interface {
	// RepairMemoryDrift checks if Memory is healthy and re-queues ingestion for
	// any instance whose Memory objects appear to have been lost.
	RepairMemoryDrift(ctx context.Context)
}

// ActiveRunChecker checks whether an orchestration run is already active for
// a given instance. Used by the heartbeat to suppress proposal creation when
// a cycle is already running.
type ActiveRunChecker interface {
	HasActiveRun(ctx context.Context, instanceID string) bool
}

// ActivityEvent is the minimal event shape accepted by the heartbeat package.
// It mirrors activity.RecordRequest without importing that package.
type ActivityEvent struct {
	InstanceID uuid.UUID
	EventType  string
	Payload    map[string]any
}

// TriggerState mirrors aim.TriggerState so the heartbeat package does not
// import the aim package (avoids circular deps when aim imports heartbeat).
type TriggerState struct {
	Fired            bool
	Reason           string // "time" | "signals" | "evidence" | ""
	ReasonMessage    string
	TriggerSignalIDs []string  // IDs of ripple signals that fired the trigger (signals reason only)
	LastAssessmentAt time.Time // zero when no prior assessment exists
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
	db                  *bun.DB
	evaluator           TriggerEvaluator
	evidence            EvidenceCounter            // optional — nil = evidence count not included in proposals
	activity            ActivityRecorder           // optional — nil = activity stream disabled
	consistencyChecker  InstanceConsistencyChecker // optional — nil = consistency checks disabled
	memoryDriftRepairer MemoryDriftRepairer        // optional — nil = memory drift repair disabled
	activeRunChecker    ActiveRunChecker           // optional — nil = active-run guard skipped
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

// WithActivityRecorder attaches an activity recorder for the activity stream.
// When set, significant proposal lifecycle events are recorded (Stage 5.7).
func (s *Service) WithActivityRecorder(r ActivityRecorder) *Service {
	s.activity = r
	return s
}

// WithConsistencyChecker attaches a consistency checker that runs after each
// trigger evaluation pass. If nil, consistency checks are skipped.
func (s *Service) WithConsistencyChecker(c InstanceConsistencyChecker) *Service {
	s.consistencyChecker = c
	return s
}

// WithMemoryDriftRepairer attaches a memory drift repairer that runs after each
// trigger evaluation pass. If nil, memory drift repair is skipped.
func (s *Service) WithMemoryDriftRepairer(r MemoryDriftRepairer) *Service {
	s.memoryDriftRepairer = r
	return s
}

// WithActiveRunChecker attaches an active-run checker. When set,
// maybeCreateProposal skips proposal creation if a cycle is already running.
func (s *Service) WithActiveRunChecker(c ActiveRunChecker) *Service {
	s.activeRunChecker = c
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

	// 2. Fetch last assessment timestamps — needed for signal novelty filter.
	lastAssessments, err := s.batchLastAssessmentTimes(ctx, instanceIDs)
	if err != nil {
		slog.WarnContext(ctx, "heartbeat: failed to batch assessment times (degraded)", "err", err)
		lastAssessments = make(map[uuid.UUID]time.Time)
	}

	// 3a. Fetch novel critical signal counts (only signals since each instance's
	//     last assessment) for all instances in one batched query.
	criticalCounts, err := s.batchCriticalSignalCounts(ctx, instanceIDs, lastAssessments)
	if err != nil {
		slog.WarnContext(ctx, "heartbeat: failed to batch signal counts (degraded)", "err", err)
		// Continue — EvaluateTriggers degrades gracefully.
	}

	// 3b. Load existing unacknowledged heartbeat signals to deduplicate.
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
		ctxPayload := map[string]any{
			"critical_signal_count": criticalCounts[instID],
			"evidence_count":        evCount,
		}
		if len(state.TriggerSignalIDs) > 0 {
			ctxPayload["trigger_signal_ids"] = state.TriggerSignalIDs
		}
		if !state.LastAssessmentAt.IsZero() {
			ctxPayload["last_assessment_at"] = state.LastAssessmentAt.UTC().Format(time.RFC3339)
		}
		s.maybeCreateProposal(ctx, CreateProposalParams{
			InstanceID:     instID,
			TriggerReason:  state.Reason,
			TriggerMessage: state.ReasonMessage,
			EvidenceCount:  evCount,
			SignalCount:    criticalCounts[instID],
			ContextPayload: ctxPayload,
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

// batchLastAssessmentTimes returns a map of instance_id → latest assessment_report
// updated_at for all given instances. Used to apply the novelty filter consistently
// with EvaluateTriggers.
func (s *Service) batchLastAssessmentTimes(ctx context.Context, instanceIDs []uuid.UUID) (map[uuid.UUID]time.Time, error) {
	type row struct {
		InstanceID uuid.UUID `bun:"instance_id"`
		UpdatedAt  time.Time `bun:"updated_at"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("instance_id, MAX(updated_at) AS updated_at").
		Where("instance_id IN (?)", bun.List(instanceIDs)).
		Where("artifact_type = ?", "assessment_report").
		GroupExpr("instance_id").
		Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}
	result := make(map[uuid.UUID]time.Time, len(rows))
	for _, r := range rows {
		result[r.InstanceID] = r.UpdatedAt
	}
	return result, nil
}

// batchCriticalSignalCounts returns a map of instance_id → novel critical signal count.
// "Novel" means created after the instance's last committed assessment_report, so
// chronic backlogs don't inflate the count and keep re-firing the trigger.
// Uses a single SQL query with a per-instance cutoff via a lateral join.
func (s *Service) batchCriticalSignalCounts(ctx context.Context, instanceIDs []uuid.UUID, lastAssessments map[uuid.UUID]time.Time) (map[uuid.UUID]int, error) {
	type row struct {
		InstanceID uuid.UUID `bun:"instance_id"`
		Count      int       `bun:"count"`
	}

	// Build a VALUES list of (instance_id, cutoff_timestamp) pairs so we can
	// filter per-instance in a single query without N+1 round-trips.
	// For instances with no prior assessment the cutoff is epoch (zero time),
	// meaning all signals count.
	type cutoffRow struct {
		InstanceID uuid.UUID `bun:"instance_id"`
		Cutoff     time.Time `bun:"cutoff"`
	}
	cutoffs := make([]cutoffRow, 0, len(instanceIDs))
	for _, id := range instanceIDs {
		cutoffs = append(cutoffs, cutoffRow{InstanceID: id, Cutoff: lastAssessments[id]})
	}

	// Build a raw VALUES clause with explicit column aliases so Postgres can
	// reference c.instance_id and c.cutoff in the JOIN condition.
	// bun.NewValues does not emit named columns when used inside JOIN subqueries.
	// Use bun's '?' placeholder format (not $N) so bun rewrites them to $1, $2...
	// when it assembles the final query. Passing $N literals directly causes bun
	// to log "has args but no placeholders" because it doesn't scan the JOIN string.
	valArgs := make([]any, 0, len(cutoffs)*2)
	valPlaceholders := make([]string, 0, len(cutoffs))
	for _, c := range cutoffs {
		valPlaceholders = append(valPlaceholders, "(?::uuid, ?::timestamptz)")
		valArgs = append(valArgs, c.InstanceID, c.Cutoff)
	}
	valSQL := "(VALUES " + strings.Join(valPlaceholders, ", ") + ") AS c(instance_id, cutoff)"

	var rows []row
	err := s.db.NewSelect().
		TableExpr("ripple_signals AS rs").
		ColumnExpr("rs.instance_id, COUNT(*) AS count").
		Join("JOIN "+valSQL+" ON c.instance_id = rs.instance_id AND rs.created_at > c.cutoff", valArgs...).
		Where("rs.instance_id IN (?)", bun.List(instanceIDs)).
		Where("rs.status = ?", "active").
		Where("rs.severity = ?", "critical").
		GroupExpr("rs.instance_id").
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
