package sync

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// StatusNoChanges is the SyncResult status of a sync that wrote nothing because
// every artifact is already in the repository as the server holds it.
const StatusNoChanges = "no_changes"

const (
	maxSummaryBatches = 30
	maxSummaryKeys    = 20
)

// changeBatch is one described change set: the artifacts committed together.
type changeBatch struct {
	Description string // empty when the batch was not described
	Keys        []string
}

// syncSummary says what a sync wrote, for the pull request body.
type syncSummary struct {
	Changed   int
	Unchanged int
	// Full is true when every artifact was written, not only the changed ones.
	Full    bool
	Batches []changeBatch
}

// changedSince returns the artifacts the repository does not yet have in their
// current form, with the batches that changed them.
//
// An artifact counts as changed when the latest mutation applied to it
// (strategy_artifacts.mutation_id) did not come from an import, and it was
// updated after the last merged sync. An artifact whose latest mutation is an
// import holds exactly what the source holds. An artifact never imported has
// only authored mutations, so a first push writes everything.
//
// The "after the last merged sync" half compares the artifact's update time with
// the time that sync started, both read from the application clock. A sync whose
// pull request is still open or was closed has not reached the base branch, so it
// does not move the baseline: the result is then a superset, never a miss.
func (s *Service) changedSince(ctx context.Context, instanceID uuid.UUID) (map[string]struct{}, []changeBatch, error) {
	var since sql.NullTime
	if err := s.db.NewSelect().
		TableExpr("github_sync_log").
		ColumnExpr("MAX(created_at)").
		Where("instance_id = ?", instanceID).
		Where("direction = ?", domain.SyncDirectionExport).
		Where("status = ?", domain.SyncStatusMerged).
		Scan(ctx, &since); err != nil {
		return nil, nil, fmt.Errorf("load last merged sync: %w", err)
	}

	var rows []struct {
		Key         string     `bun:"artifact_key"`
		BatchID     *uuid.UUID `bun:"batch_id"`
		Description *string    `bun:"batch_description"`
	}
	q := s.db.NewSelect().
		TableExpr("strategy_artifacts AS a").
		ColumnExpr("a.artifact_key, m.batch_id, m.batch_description").
		Join("JOIN strategy_mutations AS m ON m.id = a.mutation_id").
		Where("a.instance_id = ?", instanceID).
		Where("a.status != ?", domain.ArtifactStatusArchived).
		Where("m.source != ?", domain.MutationSourceImport)
	if since.Valid {
		q = q.Where("a.updated_at > ?", since.Time)
	}
	if err := q.OrderExpr("a.artifact_key").Scan(ctx, &rows); err != nil {
		return nil, nil, fmt.Errorf("load changed artifacts: %w", err)
	}

	keys := make(map[string]struct{}, len(rows))
	type groupKey struct {
		batch uuid.UUID
		key   string // used when an artifact has no batch
	}
	groups := map[groupKey]*changeBatch{}
	var order []groupKey
	for _, r := range rows {
		keys[r.Key] = struct{}{}
		g := groupKey{}
		if r.BatchID != nil {
			g.batch = *r.BatchID
		} else {
			g.key = r.Key
		}
		b, ok := groups[g]
		if !ok {
			b = &changeBatch{}
			if r.Description != nil {
				b.Description = strings.TrimSpace(*r.Description)
			}
			groups[g] = b
			order = append(order, g)
		}
		b.Keys = append(b.Keys, r.Key)
	}

	batches := make([]changeBatch, 0, len(order))
	for _, g := range order {
		sort.Strings(groups[g].Keys)
		batches = append(batches, *groups[g])
	}
	sort.SliceStable(batches, func(i, j int) bool {
		if (batches[i].Description == "") != (batches[j].Description == "") {
			return batches[i].Description != ""
		}
		if batches[i].Description != batches[j].Description {
			return batches[i].Description < batches[j].Description
		}
		return batches[i].Keys[0] < batches[j].Keys[0]
	})
	return keys, batches, nil
}

// selectEntries returns the export entries to write. With full set it returns
// every entry. Otherwise it returns the entries for changed artifacts only, and
// the repository keeps every other file as it is, comments included.
func (s *Service) selectEntries(ctx context.Context, instanceID uuid.UUID, export *strategy.ExportResult, full bool) ([]strategy.ExportEntry, syncSummary, error) {
	if full {
		return export.Files, syncSummary{Changed: len(export.Files), Full: true}, nil
	}

	keys, batches, err := s.changedSince(ctx, instanceID)
	if err != nil {
		return nil, syncSummary{}, err
	}
	selected := make([]strategy.ExportEntry, 0, len(keys))
	for _, e := range export.Files {
		if _, ok := keys[e.ArtifactKey]; ok {
			selected = append(selected, e)
		}
	}
	return selected, syncSummary{
		Changed:   len(selected),
		Unchanged: len(export.Files) - len(selected),
		Batches:   batches,
	}, nil
}

// writeChanges appends the list of changes to a pull request body.
func (sum syncSummary) writeChanges(sb *strings.Builder) {
	if sum.Full {
		fmt.Fprintf(sb, "**Artifacts:** %d files (full export)\n\n", sum.Changed)
		return
	}
	fmt.Fprintf(sb, "**Artifacts:** %d changed, %d left as they are in the repository\n\n", sum.Changed, sum.Unchanged)
	if len(sum.Batches) == 0 {
		return
	}

	sb.WriteString("### Changes\n\n")
	shown := sum.Batches
	if len(shown) > maxSummaryBatches {
		shown = shown[:maxSummaryBatches]
	}
	for _, b := range shown {
		keys := b.Keys
		more := 0
		if len(keys) > maxSummaryKeys {
			more = len(keys) - maxSummaryKeys
			keys = keys[:maxSummaryKeys]
		}
		quoted := make([]string, len(keys))
		for i, k := range keys {
			quoted[i] = "`" + k + "`"
		}
		list := strings.Join(quoted, ", ")
		if more > 0 {
			list += fmt.Sprintf(" and %d more", more)
		}
		if b.Description == "" {
			fmt.Fprintf(sb, "- _No description_: %s\n", list)
		} else {
			fmt.Fprintf(sb, "- **%s**: %s\n", b.Description, list)
		}
	}
	if hidden := len(sum.Batches) - len(shown); hidden > 0 {
		fmt.Fprintf(sb, "- and %d more changes\n", hidden)
	}
	sb.WriteString("\n")
}

// syncStartedAt is read before the export so that an artifact changed while the
// export runs is still newer than the sync and is written by the next one.
func syncStartedAt() time.Time { return time.Now().UTC() }
