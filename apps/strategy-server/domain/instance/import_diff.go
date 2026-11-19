package instance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ImportDiff says what replacing an instance's artifacts with a source would do.
type ImportDiff struct {
	// Added are in the source and not on the server.
	Added []string
	// Removed are on the server and not in the source.
	Removed []string
	// Changed are on both with different content.
	Changed []string
	// Unchanged counts artifacts with the same content on both.
	Unchanged int
	// Lost are the Changed and Removed artifacts whose content was not imported:
	// written on the server by an MCP client, the web UI or the system. A re-import
	// replaces or deletes them.
	Lost []string
	// StagedMutations counts staged, uncommitted mutations. A re-import deletes
	// every mutation of the instance, staged ones included.
	StagedMutations int
}

// WouldLoseWork reports whether the import would discard something that did not
// come from an import.
func (d *ImportDiff) WouldLoseWork() bool {
	return len(d.Lost) > 0 || d.StagedMutations > 0
}

// PreviewReimport compares payloads, as an import would write them, with what the
// instance holds now, without changing anything. An artifact counts as imported
// when the latest mutation applied to it came from an import.
func (s *Service) PreviewReimport(ctx context.Context, id uuid.UUID, payloads map[string]any) (*ImportDiff, error) {
	var held []struct {
		Key     string          `bun:"artifact_key"`
		Payload json.RawMessage `bun:"payload"`
		Source  string          `bun:"source"`
	}
	if err := s.db.NewSelect().
		TableExpr("strategy_artifacts AS a").
		ColumnExpr("a.artifact_key, a.payload, m.source").
		Join("JOIN strategy_mutations AS m ON m.id = a.mutation_id").
		Where("a.instance_id = ?", id).
		Where("a.status != ?", domain.ArtifactStatusArchived).
		Scan(ctx, &held); err != nil {
		return nil, fmt.Errorf("load held artifacts: %w", err)
	}

	staged, err := s.db.NewSelect().
		TableExpr("strategy_mutations").
		Where("instance_id = ?", id).
		Where("status = ?", domain.MutationStatusStaged).
		Count(ctx)
	if err != nil {
		return nil, fmt.Errorf("count staged mutations: %w", err)
	}

	diff := &ImportDiff{StagedMutations: staged}
	seen := make(map[string]struct{}, len(held))
	for _, h := range held {
		seen[h.Key] = struct{}{}
		incoming, inSource := payloads[h.Key]
		switch {
		case !inSource:
			diff.Removed = append(diff.Removed, h.Key)
		case sameContent(h.Payload, incoming):
			diff.Unchanged++
			continue
		default:
			diff.Changed = append(diff.Changed, h.Key)
		}
		if h.Source != domain.MutationSourceImport {
			diff.Lost = append(diff.Lost, h.Key)
		}
	}
	for key := range payloads {
		if _, ok := seen[key]; !ok {
			diff.Added = append(diff.Added, key)
		}
	}
	sort.Strings(diff.Added)
	sort.Strings(diff.Removed)
	sort.Strings(diff.Changed)
	sort.Strings(diff.Lost)
	return diff, nil
}

// sameContent compares a stored payload with an incoming one by value. Both go
// through JSON, so a number read from a YAML file and the same number read back
// from the database compare equal.
func sameContent(stored json.RawMessage, incoming any) bool {
	var a, b any
	if err := json.Unmarshal(stored, &a); err != nil {
		return false
	}
	raw, err := json.Marshal(incoming)
	if err != nil {
		return false
	}
	if err := json.Unmarshal(raw, &b); err != nil {
		return false
	}
	return reflect.DeepEqual(a, b)
}

// FindActiveByName returns the newest non-deleted instance with this name in the
// workspace, or nil when there is none.
func (s *Service) FindActiveByName(ctx context.Context, workspaceID uuid.UUID, name string) (*domain.StrategyInstance, error) {
	var inst domain.StrategyInstance
	err := s.db.NewSelect().
		Model(&inst).
		Where("workspace_id = ?", workspaceID).
		Where("name = ?", name).
		Where("deleted_at IS NULL").
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find instance by name: %w", err)
	}
	return &inst, nil
}
