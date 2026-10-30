package ingest

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// PurgeInstance removes a deleted instance's data from Memory and records it.
// It takes the instance lock, so it never runs alongside an ingest.
func (s *Service) PurgeInstance(ctx context.Context, instanceID uuid.UUID) error {
	if s.client == nil {
		return fmt.Errorf("ingest: Memory client not configured")
	}
	lock, err := lockInstance(ctx, s.db, instanceID)
	if err != nil {
		return err
	}
	defer s.release(ctx, lock, instanceID)
	return s.purgeLocked(ctx, instanceID)
}

// purgeLocked deletes every object carrying the instance's owner label (single
// deletes, which also remove the objects' relationships) and every scenario
// branch of the instance, deletes the manifest rows, then records memory_purged_at. An instance that was
// never synced needs no Memory calls. Any failure returns an error and leaves
// the purge owed; the heartbeat retries it.
func (s *Service) purgeLocked(ctx context.Context, instanceID uuid.UUID) error {
	var syncStatus *string
	if err := s.db.NewRaw("SELECT memory_sync_status FROM strategy_instances WHERE id = ?", instanceID).
		Scan(ctx, &syncStatus); err != nil {
		return fmt.Errorf("purge %s: load state: %w", instanceID, err)
	}

	if syncStatus != nil {
		owned, err := s.listOwned(ctx, instanceID)
		if err != nil {
			return fmt.Errorf("purge %s: %w", instanceID, err)
		}
		var failed int
		for _, o := range owned {
			if err := s.client.DeleteObject(ctx, o.StableID(), memory.DeleteObjectRequest{Reason: "instance " + instanceID.String() + " deleted"}); err != nil {
				failed++
				slog.Warn("ingest: purge: failed to delete object", "instance_id", instanceID, "key", o.Key, "err", err)
			}
		}
		if failed > 0 {
			return fmt.Errorf("purge %s: %d of %d objects not deleted", instanceID, failed, len(owned))
		}

		branches, err := s.client.ListBranches(ctx)
		if err != nil {
			return fmt.Errorf("purge %s: list branches: %w", instanceID, err)
		}
		prefix := memory.ScenarioBranchPrefix(instanceID)
		for _, b := range branches {
			if !strings.HasPrefix(b.Name, prefix) {
				continue
			}
			if err := s.client.DeleteBranch(ctx, b.ID); err != nil {
				return fmt.Errorf("purge %s: delete branch %s: %w", instanceID, b.Name, err)
			}
		}
	}

	if _, err := s.db.NewRaw(`DELETE FROM memory_projection WHERE instance_id = ?`, instanceID).Exec(ctx); err != nil {
		return fmt.Errorf("purge %s: delete manifest: %w", instanceID, err)
	}
	if _, err := s.db.NewUpdate().
		TableExpr("strategy_instances").
		Set("memory_purged_at = ?", time.Now().UTC()).
		Set("memory_dirty_since = NULL").
		Where("id = ?", instanceID).
		Exec(ctx); err != nil {
		return fmt.Errorf("purge %s: record: %w", instanceID, err)
	}
	slog.Info("ingest: purged deleted instance from Memory", "instance_id", instanceID)
	return nil
}
