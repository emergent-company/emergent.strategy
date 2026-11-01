package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

const (
	defaultKeywordLimit = 10
	maxKeywordLimit     = 25
)

// KeywordHit is a keyword match in the instance's own strategy, pointing at the
// smallest object that contains it.
type KeywordHit struct {
	ArtifactType string  `json:"artifact_type"`
	ArtifactKey  string  `json:"artifact_key"`
	Path         string  `json:"path"`
	Field        string  `json:"field,omitempty"`
	Snippet      string  `json:"snippet"`
	Score        float64 `json:"score"`
	SizeChars    int     `json:"size_chars"`
	ReadWith     string  `json:"read_with"`
	// MatchedTerms and MissingTerms: see strategyread.Hit.
	MatchedTerms []string `json:"matched_terms,omitempty"`
	MissingTerms []string `json:"missing_terms,omitempty"`
}

type searchRow struct {
	bun.BaseModel `bun:"table:strategy_artifacts,alias:sa"`
	ArtifactType  string          `bun:"artifact_type"`
	ArtifactKey   string          `bun:"artifact_key"`
	Payload       json.RawMessage `bun:"payload"`
}

// SearchAuthored finds where the query's words occur in the instance's current,
// authored artifacts. It reads only this instance, and leaves out framework
// content, evidence and archived artifacts. It returns at most 25 hits, 10 when
// limit is not positive, best first.
func (s *Service) SearchAuthored(ctx context.Context, instanceID uuid.UUID, query string, limit int) ([]KeywordHit, error) {
	if limit <= 0 {
		limit = defaultKeywordLimit
	}
	if limit > maxKeywordLimit {
		limit = maxKeywordLimit
	}
	if len(strategyread.QueryTerms(query)) == 0 {
		return []KeywordHit{}, nil
	}

	var rows []searchRow
	err := s.db.NewSelect().Model(&rows).
		Column("artifact_type", "artifact_key", "payload").
		Where("instance_id = ? AND status != ? AND artifact_type != ?", instanceID, domain.ArtifactStatusArchived, "evidence").
		Where("integrity_class IS NULL OR integrity_class NOT IN (?)", bun.List(frameworkClasses)).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("search artifacts: %w", err)
	}

	hits := []KeywordHit{}
	for _, row := range rows {
		var payload any
		if err := json.Unmarshal(row.Payload, &payload); err != nil {
			slog.WarnContext(ctx, "keyword search skipped an artifact with an unreadable payload",
				"instance_id", instanceID, "artifact", row.ArtifactKey, "err", err)
			continue
		}
		for _, h := range strategyread.Search(row.ArtifactType, payload, query) {
			hits = append(hits, KeywordHit{
				ArtifactType: row.ArtifactType,
				ArtifactKey:  row.ArtifactKey,
				Path:         h.Path,
				Field:        h.Field,
				Snippet:      h.Snippet,
				Score:        h.Score,
				SizeChars:    h.SizeChars,
				ReadWith:     readWith(row.ArtifactKey, h.Path),
				MatchedTerms: h.MatchedTerms,
				MissingTerms: h.MissingTerms,
			})
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		a, b := hits[i], hits[j]
		switch {
		case a.Score != b.Score:
			return a.Score > b.Score
		case a.SizeChars != b.SizeChars:
			return a.SizeChars < b.SizeChars
		case a.ArtifactKey != b.ArtifactKey:
			return a.ArtifactKey < b.ArtifactKey
		}
		return a.Path < b.Path
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits, nil
}
