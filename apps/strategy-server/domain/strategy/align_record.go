package strategy

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// alignBatchKind marks the mutations an alignment run wrote, in batch_metadata.
const alignBatchKind = "align_portfolio"

// skipAlignPortfolioKey is the field of the instance's aim_trigger_config that
// turns the automatic runs of AlignPortfolio off: the heartbeat's consistency
// check and the AIM cycle's align_portfolio step. An explicit call still runs.
const skipAlignPortfolioKey = "skip_align_portfolio"

// AlignmentRecord says when an alignment last changed value model activation and
// what it considered. It lives on the mutations the run wrote, so a re-import,
// which replaces the mutation history, clears it.
type AlignmentRecord struct {
	AppliedAt        time.Time      `json:"applied_at"`
	Summary          string         `json:"summary"`
	TracksChanged    int            `json:"tracks_changed"`
	TotalActivated   int            `json:"total_activated"`
	TotalDeactivated int            `json:"total_deactivated"`
	KRsFound         int            `json:"krs_found"`
	KRsWithTargets   int            `json:"krs_with_targets"`
	KRsByGroup       map[string]int `json:"krs_by_group,omitempty"`
}

type alignMetadata struct {
	Kind             string         `json:"kind"`
	TracksChanged    int            `json:"tracks_changed"`
	TotalActivated   int            `json:"total_activated"`
	TotalDeactivated int            `json:"total_deactivated"`
	KRsFound         int            `json:"krs_found"`
	KRsWithTargets   int            `json:"krs_with_targets"`
	KRsByGroup       map[string]int `json:"krs_by_group,omitempty"`
}

// recordAlignment attaches a summary and what the run considered to the
// mutations of the batch it wrote, so the change can be traced afterwards and a
// sync pull request lists it with a description.
func (s *Service) recordAlignment(ctx context.Context, batchID uuid.UUID, result AlignPortfolioResult) error {
	meta, err := json.Marshal(alignMetadata{
		Kind:             alignBatchKind,
		TracksChanged:    result.TracksChanged,
		TotalActivated:   result.TotalActivated,
		TotalDeactivated: result.TotalDeactivated,
		KRsFound:         result.KRsFound,
		KRsWithTargets:   result.KRsWithTargets,
		KRsByGroup:       result.KRsByGroup,
	})
	if err != nil {
		return fmt.Errorf("marshal alignment metadata: %w", err)
	}
	if _, err := s.db.NewUpdate().
		Model((*domain.StrategyMutation)(nil)).
		Set("batch_description = ?", alignmentSummary(result)).
		Set("batch_metadata = ?::jsonb", string(meta)).
		Where("batch_id = ?", batchID).
		Exec(ctx); err != nil {
		return fmt.Errorf("record alignment: %w", err)
	}
	return nil
}

func alignmentSummary(r AlignPortfolioResult) string {
	groups := make([]string, 0, len(r.KRsByGroup))
	for g, n := range r.KRsByGroup {
		groups = append(groups, fmt.Sprintf("%s %d", g, n))
	}
	sort.Strings(groups)

	var sb strings.Builder
	fmt.Fprintf(&sb, "Portfolio alignment: %d activated, %d deactivated in %s, from %s",
		r.TotalActivated, r.TotalDeactivated, plural(r.TracksChanged, "track", "tracks"), plural(r.KRsFound, "Key Result", "Key Results"))
	fmt.Fprintf(&sb, " (%d with a value model target", r.KRsWithTargets)
	if len(groups) > 0 {
		fmt.Fprintf(&sb, "; %s", strings.Join(groups, ", "))
	}
	sb.WriteString(")")
	return sb.String()
}

func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, one)
	}
	return fmt.Sprintf("%d %s", n, many)
}

// LastAlignment returns the record of the last alignment that changed anything,
// or nil when none has. A run that changes nothing writes no mutation and so
// leaves the record as it was.
func (s *Service) LastAlignment(ctx context.Context, instanceID uuid.UUID) (*AlignmentRecord, error) {
	var row struct {
		CreatedAt   time.Time       `bun:"created_at"`
		Description *string         `bun:"batch_description"`
		Metadata    json.RawMessage `bun:"batch_metadata"`
	}
	err := s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("created_at, batch_description, batch_metadata").
		Where("instance_id = ?", instanceID).
		Where("batch_metadata->>'kind' = ?", alignBatchKind).
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx, &row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load last alignment: %w", err)
	}

	var meta alignMetadata
	if err := json.Unmarshal(row.Metadata, &meta); err != nil {
		return nil, fmt.Errorf("read alignment metadata: %w", err)
	}
	rec := &AlignmentRecord{
		AppliedAt:        row.CreatedAt,
		TracksChanged:    meta.TracksChanged,
		TotalActivated:   meta.TotalActivated,
		TotalDeactivated: meta.TotalDeactivated,
		KRsFound:         meta.KRsFound,
		KRsWithTargets:   meta.KRsWithTargets,
		KRsByGroup:       meta.KRsByGroup,
	}
	if row.Description != nil {
		rec.Summary = *row.Description
	}
	return rec, nil
}

// AlignmentAutomatic reports whether the automatic runs of AlignPortfolio are
// on for the instance. They are unless its aim_trigger_config sets
// skip_align_portfolio. An unreadable config leaves them on.
func (s *Service) AlignmentAutomatic(ctx context.Context, instanceID uuid.UUID) bool {
	raw, err := s.GetCurrentArtifact(ctx, instanceID, "aim_trigger_config")
	if err != nil {
		return true
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return true
	}
	skip, _ := cfg[skipAlignPortfolioKey].(bool)
	return !skip
}
