package strategy

// RunConsistencyCheck is a general-purpose instance health repair that runs
// periodically (wired into the heartbeat ticker). Each sub-check is independent —
// a failure in one does not block others. The check is idempotent: running it on
// a healthy instance produces no mutations.
//
// Sub-checks:
//   1. Value model alignment   — sync active flags to KR targets (auto-commits)
//   2. Stale skill run cleanup — mark stuck running runs as failed
//   3. Orphaned batch warning  — log batches staged > 24h (no auto-discard)

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

const (
	// staleRunTimeout is the duration after which a running skill run is considered stale.
	staleRunTimeout = 10 * time.Minute
	// orphanedBatchAge is the duration after which a staged batch is considered orphaned.
	orphanedBatchAge = 24 * time.Hour
)

// ConsistencyResult summarises the outcome of a full consistency check.
type ConsistencyResult struct {
	// Alignment holds the result of the value model alignment sub-check.
	Alignment AlignPortfolioResult
	// AlignmentErr is non-nil when the alignment sub-check failed.
	AlignmentErr error

	// StaleRunsCleaned is the number of stale skill runs marked as failed.
	StaleRunsCleaned int
	// StaleRunsErr is non-nil when the stale run cleanup sub-check failed.
	StaleRunsErr error

	// OrphanedBatchCount is the number of staged batches older than 24h.
	OrphanedBatchCount int
	// OrphanedBatchErr is non-nil when the orphaned batch detection sub-check failed.
	OrphanedBatchErr error
}

// RunConsistencyCheck runs all consistency sub-checks for the given instance.
// Each sub-check runs independently; errors are collected in the result.
func (s *Service) RunConsistencyCheck(ctx context.Context, instanceID uuid.UUID) (ConsistencyResult, error) {
	var result ConsistencyResult

	// Sub-check 1: Value model alignment.
	alignment, err := s.AlignPortfolio(ctx, instanceID)
	result.Alignment = alignment
	result.AlignmentErr = err
	if err != nil {
		slog.WarnContext(ctx, "consistency-check: alignment sub-check failed",
			"instance_id", instanceID, "err", err)
	} else if alignment.TracksChanged > 0 {
		slog.InfoContext(ctx, "consistency-check: alignment drift corrected",
			"instance_id", instanceID,
			"tracks_changed", alignment.TracksChanged,
			"activated", alignment.TotalActivated,
			"deactivated", alignment.TotalDeactivated,
		)
	}

	// Sub-check 2: Stale skill run cleanup.
	cleaned, err := s.cleanStaleSkillRuns(ctx, instanceID)
	result.StaleRunsCleaned = cleaned
	result.StaleRunsErr = err
	if err != nil {
		slog.WarnContext(ctx, "consistency-check: stale run cleanup failed",
			"instance_id", instanceID, "err", err)
	} else if cleaned > 0 {
		slog.InfoContext(ctx, "consistency-check: stale skill runs cleaned",
			"instance_id", instanceID, "count", cleaned)
	}

	// Sub-check 3: Orphaned staged batch detection (warn only — no auto-discard).
	count, err := s.detectOrphanedBatches(ctx, instanceID)
	result.OrphanedBatchCount = count
	result.OrphanedBatchErr = err
	if err != nil {
		slog.WarnContext(ctx, "consistency-check: orphaned batch detection failed",
			"instance_id", instanceID, "err", err)
	} else if count > 0 {
		slog.WarnContext(ctx, "consistency-check: orphaned staged batches detected",
			"instance_id", instanceID,
			"count", count,
			"hint", "Batches staged >24h without review. Consider discarding if stale.")
	}

	return result, nil
}

// cleanStaleSkillRuns marks any skill run in 'running' status for >staleRunTimeout as failed.
// Returns the number of runs cleaned.
func (s *Service) cleanStaleSkillRuns(ctx context.Context, instanceID uuid.UUID) (int, error) {
	// Query stale runs via direct DB access (skill_runs table).
	type staleRun struct {
		ID uuid.UUID `bun:"id"`
	}
	var staleRuns []staleRun

	cutoff := time.Now().UTC().Add(-staleRunTimeout)
	err := s.db.NewSelect().
		TableExpr("skill_runs").
		ColumnExpr("id").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "running").
		Where("started_at < ?", cutoff).
		Scan(ctx, &staleRuns)
	if err != nil {
		return 0, err
	}

	now := time.Now().UTC()
	count := 0
	for _, r := range staleRuns {
		res, err := s.db.NewUpdate().
			TableExpr("skill_runs").
			Set("status = ?", "failed").
			Set("completed_at = ?", now).
			Set("error = ?", "stale run: exceeded 10 minute timeout (consistency check)").
			Where("id = ?", r.ID).
			Where("status = ?", "running"). // re-check to prevent racing with the real runner
			Exec(ctx)
		if err != nil {
			slog.WarnContext(ctx, "consistency-check: failed to mark stale run",
				"run_id", r.ID, "err", err)
			continue
		}
		if n, _ := res.RowsAffected(); n > 0 {
			count++
			slog.InfoContext(ctx, "consistency-check: stale run marked failed",
				"run_id", r.ID, "instance_id", instanceID)
		}
	}
	return count, nil
}

// detectOrphanedBatches counts staged batches older than orphanedBatchAge.
// Does not discard them — returns the count for logging.
func (s *Service) detectOrphanedBatches(ctx context.Context, instanceID uuid.UUID) (int, error) {
	cutoff := time.Now().UTC().Add(-orphanedBatchAge)
	type batchRow struct {
		BatchID   uuid.UUID       `bun:"batch_id"`
		CreatedAt time.Time       `bun:"created_at"`
		Payload   json.RawMessage `bun:"payload"`
	}
	var rows []batchRow
	err := s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("batch_id, MIN(created_at) AS created_at, MIN(payload) AS payload").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "staged").
		Where("batch_id IS NOT NULL").
		GroupExpr("batch_id").
		Having("MIN(created_at) < ?", cutoff).
		Scan(ctx, &rows)
	if err != nil {
		return 0, err
	}
	return len(rows), nil
}

// ─── RunConsistencyCheckForAll ────────────────────────────────────────────────

// RunConsistencyCheckForAll runs the consistency check for all non-archived
// strategy instances. Implements heartbeat.InstanceConsistencyChecker.
// Each instance is processed independently — a failure for one does not block others.
func (s *Service) RunConsistencyCheckForAll(ctx context.Context) {
	var instanceIDs []uuid.UUID
	err := s.db.NewSelect().
		TableExpr("strategy_instances").
		ColumnExpr("id").
		Where("status != ?", "archived").
		Scan(ctx, &instanceIDs)
	if err != nil {
		slog.ErrorContext(ctx, "consistency-check: failed to load instance IDs", "err", err)
		return
	}

	for _, instID := range instanceIDs {
		result, err := s.RunConsistencyCheck(ctx, instID)
		if err != nil {
			slog.WarnContext(ctx, "consistency-check: instance check failed",
				"instance_id", instID, "err", err)
			continue
		}

		slog.InfoContext(ctx, "consistency-check: instance complete",
			"instance_id", instID,
			"alignment_tracks_changed", result.Alignment.TracksChanged,
			"stale_runs_cleaned", result.StaleRunsCleaned,
			"orphaned_batches", result.OrphanedBatchCount,
		)
	}
}
