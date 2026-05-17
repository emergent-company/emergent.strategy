package ripple

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// TensionResult describes the measured tension between two tracks.
type TensionResult struct {
	TrackA        string  `json:"track_a"`
	TrackB        string  `json:"track_b"`
	MeasuredScore float64 `json:"measured_score"` // semantic similarity (higher = more aligned)
	Baseline      float64 `json:"baseline"`
	Excess        float64 `json:"excess"` // positive = tension beyond baseline
}

// DetectCrossTrackTension measures semantic divergence between tracks by
// using Memory search. For each track, it builds a synthetic query from
// the track's artifact content and searches for artifacts from other tracks.
// High similarity = aligned, low similarity = tension.
//
// Returns tension signals only for excess divergence (measured divergence
// exceeding the natural baseline).
func DetectCrossTrackTension(ctx context.Context, db *bun.DB, mem *memory.Client, instanceID uuid.UUID, cfg RippleConfig) ([]*domain.RippleSignal, []TensionResult, error) {
	if mem == nil {
		return nil, nil, nil
	}

	// Load all active artifacts.
	var artifacts []*domain.StrategyArtifact
	err := db.NewSelect().Model(&artifacts).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.status = ?", domain.ArtifactStatusActive).
		Scan(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("load artifacts for tension: %w", err)
	}

	// Load contributes_to relationships to infer track membership.
	var rels []domain.StrategyRelationship
	err = db.NewSelect().Model(&rels).
		Where("sr.instance_id = ?", instanceID).
		Where("sr.relationship = ?", domain.RelContributesTo).
		Scan(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("load contributes_to rels: %w", err)
	}

	// Build track membership: infer from explicit Track field, contributes_to
	// targets (value model keys like "vm-product" → product track), and
	// artifact type conventions.
	trackArtifacts := make(map[string][]*domain.StrategyArtifact)
	artByKey := make(map[string]*domain.StrategyArtifact)
	for _, a := range artifacts {
		artByKey[a.ArtifactKey] = a
	}

	// Map from artifact key → inferred track.
	artTrack := make(map[string]string)

	// First pass: explicit Track field.
	for _, a := range artifacts {
		if a.Track != nil && *a.Track != "" {
			artTrack[a.ArtifactKey] = strings.ToLower(*a.Track)
		}
	}

	// Second pass: infer from value model artifact keys (vm-product → product).
	for _, a := range artifacts {
		if a.ArtifactType == "value_model" {
			key := strings.ToLower(a.ArtifactKey)
			for _, track := range []string{"product", "commercial", "strategy", "org_ops"} {
				if strings.Contains(key, track) {
					artTrack[a.ArtifactKey] = track
					break
				}
			}
		}
	}

	// Third pass: infer from contributes_to targets.
	for _, r := range rels {
		targetTrack, ok := artTrack[r.TargetKey]
		if !ok {
			// Try to infer from target key pattern.
			target := strings.ToLower(r.TargetKey)
			for _, track := range []string{"product", "commercial", "strategy", "org_ops"} {
				if strings.Contains(target, track) {
					targetTrack = track
					break
				}
			}
		}
		if targetTrack != "" {
			if _, alreadySet := artTrack[r.SourceKey]; !alreadySet {
				artTrack[r.SourceKey] = targetTrack
			}
		}
	}

	// Build grouped map.
	for key, track := range artTrack {
		if a, ok := artByKey[key]; ok {
			trackArtifacts[track] = append(trackArtifacts[track], a)
		}
	}

	// Need at least 2 tracks to detect tension.
	tracks := make([]string, 0, len(trackArtifacts))
	for t := range trackArtifacts {
		tracks = append(tracks, t)
	}
	if len(tracks) < 2 {
		return nil, nil, nil
	}
	sort.Strings(tracks)

	var signals []*domain.RippleSignal
	var results []TensionResult

	// For each pair of tracks, measure cross-track similarity.
	for i := 0; i < len(tracks); i++ {
		for j := i + 1; j < len(tracks); j++ {
			trackA, trackB := tracks[i], tracks[j]

			// Build a representative query from track A's content.
			queryA := buildTrackQuery(trackArtifacts[trackA])
			if queryA == "" {
				continue
			}

			// Collect the artifact types present in track B so we can
			// filter the search to only return those types.
			trackBTypes := make(map[string]bool)
			for _, b := range trackArtifacts[trackB] {
				trackBTypes[b.ArtifactType] = true
			}
			typeFilter := make([]string, 0, len(trackBTypes))
			for t := range trackBTypes {
				typeFilter = append(typeFilter, t)
			}

			// Search Memory with track A's content, filtered to track B's types.
			searchResults, searchErr := mem.Search(ctx, memory.SearchRequest{
				Query: truncateForSearch(queryA, 500),
				Limit: 30,
				Types: typeFilter,
			})
			if searchErr != nil {
				slog.WarnContext(ctx, "tension: search failed",
					"trackA", trackA, "trackB", trackB, "error", searchErr)
				continue
			}

			// Measure how well track B's artifacts appear in results when
			// querying with track A's content. High scores = aligned.
			trackBKeys := make(map[string]bool)
			for _, a := range trackArtifacts[trackB] {
				trackBKeys[a.ArtifactKey] = true
			}

			var totalScore float64
			var matchCount int
			for _, r := range searchResults {
				if trackBKeys[r.Object.Key] {
					totalScore += r.Score
					matchCount++
				}
			}

			// Average similarity of track B artifacts found in track A query.
			var avgSimilarity float64
			if matchCount > 0 {
				avgSimilarity = totalScore / float64(matchCount)
			}
			// If no track B artifacts found at all, similarity is very low.

			// Convert similarity to divergence: higher divergence = more tension.
			// Divergence = 1.0 - similarity.
			divergence := 1.0 - avgSimilarity
			baseline := cfg.TensionBaseline(trackA, trackB)
			excess := divergence - baseline
			if excess < 0 {
				excess = 0
			}

			result := TensionResult{
				TrackA:        trackA,
				TrackB:        trackB,
				MeasuredScore: avgSimilarity,
				Baseline:      baseline,
				Excess:        excess,
			}
			results = append(results, result)

			// Only emit signals for excess tension.
			if excess > 0 {
				severity := domain.SignalSeverityWarning
				if excess >= 0.15 {
					severity = domain.SignalSeverityCritical
				}

				desc := fmt.Sprintf("Tracks %s and %s show excess semantic tension (divergence %.2f, baseline %.2f, excess %.2f). The tracks may be strategically misaligned.",
					trackA, trackB, divergence, baseline, excess)

				signals = append(signals, &domain.RippleSignal{
					InstanceID:  instanceID,
					SignalType:  domain.SignalTypeTension,
					Severity:    severity,
					SourceKey:   trackA,
					TargetKey:   trackB,
					Description: desc,
				})
			}
		}
	}

	return signals, results, nil
}

// buildTrackQuery concatenates the first N words from each artifact in a track
// to form a representative search query.
func buildTrackQuery(artifacts []*domain.StrategyArtifact) string {
	var parts []string
	for _, a := range artifacts {
		text := extractSearchableText(a.Payload)
		if text == "" {
			continue
		}
		// Take first ~100 chars from each artifact.
		if len(text) > 100 {
			text = text[:100]
		}
		parts = append(parts, text)
	}
	return strings.Join(parts, " ")
}
