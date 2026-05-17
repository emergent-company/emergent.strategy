package ripple

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// EPF layers ordered from top (foundational) to bottom (execution/assessment).
// Vertical coherence checks that content at each layer semantically aligns
// with its upstream anchors.
var epfLayers = []string{
	"north_star",
	"strategy_formula",
	"strategy_foundations",
	"roadmap_recipe",
	"feature",
	"value_model",
}

// VerticalAlignmentResult describes the semantic alignment between two artifacts
// at different EPF layers.
type VerticalAlignmentResult struct {
	UpstreamKey   string  `json:"upstream_key"`
	UpstreamType  string  `json:"upstream_type"`
	DownstreamKey string  `json:"downstream_key"`
	DownstreamType string `json:"downstream_type"`
	Similarity    float64 `json:"similarity"`   // 0-1, higher = more aligned
	Description   string  `json:"description"`
}

// DetectVerticalMisalignment checks that downstream artifacts semantically
// align with their upstream anchors. Uses Memory search: queries with
// upstream content and checks whether downstream artifacts appear in the
// results (and vice versa).
//
// Checks performed:
//   - North Star → features: does each feature's content align with the vision?
//   - North Star → strategy formula: do strategic bets align with the vision?
//   - Strategy formula → roadmap OKRs: do OKRs pursue the stated bets?
//   - Roadmap → features: do features connect to roadmap key results?
func DetectVerticalMisalignment(ctx context.Context, db *bun.DB, mem *memory.Client, instanceID uuid.UUID, cfg RippleConfig) ([]*domain.RippleSignal, []VerticalAlignmentResult, error) {
	if mem == nil {
		return nil, nil, nil
	}

	// Load all active artifacts grouped by type.
	var artifacts []*domain.StrategyArtifact
	err := db.NewSelect().Model(&artifacts).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.status = ?", domain.ArtifactStatusActive).
		Scan(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("load artifacts for vertical check: %w", err)
	}

	byType := make(map[string][]*domain.StrategyArtifact)
	byKey := make(map[string]*domain.StrategyArtifact)
	for _, a := range artifacts {
		byType[a.ArtifactType] = append(byType[a.ArtifactType], a)
		byKey[a.ArtifactKey] = a
	}

	var signals []*domain.RippleSignal
	var results []VerticalAlignmentResult

	// Define the vertical alignment checks: upstream type → downstream type.
	checks := []struct {
		upstreamType   string
		downstreamType string
		label          string
		threshold      float64 // min similarity score below which a signal is generated
	}{
		{"north_star", "strategy_formula", "vision → strategic bets", 0.20},
		{"north_star", "feature", "vision → features", 0.10},
		{"strategy_formula", "roadmap_recipe", "strategic bets → roadmap", 0.15},
		{"roadmap_recipe", "feature", "roadmap → features", 0.10},
	}

	for _, check := range checks {
		upstreams := byType[check.upstreamType]
		downstreams := byType[check.downstreamType]

		if len(upstreams) == 0 || len(downstreams) == 0 {
			continue
		}

		for _, upstream := range upstreams {
			upText := extractSearchableText(upstream.Payload)
			if upText == "" {
				continue
			}

			// Search Memory with upstream content.
			query := truncateForSearch(upText, 500)
			searchResults, searchErr := mem.Search(ctx, memory.SearchRequest{
				Query: query,
				Limit: 30,
			})
			if searchErr != nil {
				slog.WarnContext(ctx, "vertical: search failed",
					"upstream", upstream.ArtifactKey, "error", searchErr)
				continue
			}

			// Build a map of downstream artifact keys to their scores.
			downstreamKeys := make(map[string]bool)
			for _, d := range downstreams {
				downstreamKeys[d.ArtifactKey] = true
			}

			downstreamScores := make(map[string]float64)
			for _, r := range searchResults {
				if downstreamKeys[r.Object.Key] {
					downstreamScores[r.Object.Key] = r.Score
				}
			}

			// Check each downstream artifact for alignment.
			for _, downstream := range downstreams {
				score, found := downstreamScores[downstream.ArtifactKey]

				result := VerticalAlignmentResult{
					UpstreamKey:    upstream.ArtifactKey,
					UpstreamType:   upstream.ArtifactType,
					DownstreamKey:  downstream.ArtifactKey,
					DownstreamType: downstream.ArtifactType,
					Similarity:     score,
				}

				if !found {
					// Downstream not found at all in upstream's semantic neighborhood.
					result.Description = fmt.Sprintf("%s (%s) does not appear in the semantic neighborhood of %s (%s). The %s may not align with the %s.",
						downstream.ArtifactKey, downstream.ArtifactType,
						upstream.ArtifactKey, upstream.ArtifactType,
						check.downstreamType, check.upstreamType)

					signals = append(signals, &domain.RippleSignal{
						InstanceID:  instanceID,
						SignalType:  domain.SignalTypeDrift,
						Severity:    domain.SignalSeverityWarning,
						SourceKey:   upstream.ArtifactKey,
						TargetKey:   downstream.ArtifactKey,
						Description: result.Description,
					})
				} else if score < check.threshold {
					// Found but weak alignment.
					result.Description = fmt.Sprintf("%s (%s) has weak semantic alignment (score %.2f) with %s (%s). The %s content may have drifted from the %s direction.",
						downstream.ArtifactKey, downstream.ArtifactType, score,
						upstream.ArtifactKey, upstream.ArtifactType,
						check.downstreamType, check.upstreamType)

					severity := domain.SignalSeverityInfo
					if score < check.threshold/2 {
						severity = domain.SignalSeverityWarning
					}

					signals = append(signals, &domain.RippleSignal{
						InstanceID:  instanceID,
						SignalType:  domain.SignalTypeDrift,
						Severity:    severity,
						SourceKey:   upstream.ArtifactKey,
						TargetKey:   downstream.ArtifactKey,
						Description: result.Description,
					})
				} else {
					result.Description = fmt.Sprintf("Aligned (score %.2f)", score)
				}

				results = append(results, result)
			}
		}
	}

	return signals, results, nil
}
