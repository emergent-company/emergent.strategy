package ripple

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// SemanticAnalyzer performs embedding-based coherence analysis via Memory search.
// Since Memory embeddings are opaque (no raw vector access), we use search-based
// similarity: search for one artifact's content and analyze where related artifacts
// appear in the results.
type SemanticAnalyzer struct {
	mem *memory.Client
	db  *bun.DB
}

// NewSemanticAnalyzer creates a new analyzer. Returns nil if mem is nil.
func NewSemanticAnalyzer(mem *memory.Client, db *bun.DB) *SemanticAnalyzer {
	if mem == nil {
		return nil
	}
	return &SemanticAnalyzer{mem: mem, db: db}
}

// SemanticChangeClass represents the magnitude of a semantic change.
type SemanticChangeClass string

const (
	ChangeClassTrivial     SemanticChangeClass = "trivial"
	ChangeClassMinor       SemanticChangeClass = "minor"
	ChangeClassSignificant SemanticChangeClass = "significant"
	ChangeClassMajor       SemanticChangeClass = "major"
)

// SemanticChangeResult is the result of classifying a semantic change.
type SemanticChangeResult struct {
	Class         SemanticChangeClass `json:"class"`
	Score         float64             `json:"score"` // similarity (0-1, higher = more similar)
	AuthorityTier AuthorityTier       `json:"authority_tier"`
	Description   string              `json:"description"`
	Method        string              `json:"method"` // "embedding", "structural", "text_fallback"
}

// ClassifyChange estimates how semantically different the new content is from
// the old. Uses Memory search scores as the primary classifier: searches
// Memory using the NEW content and checks the search score of the artifact's
// own key (which still holds the OLD indexed content). High score = trivial
// change. Low score = major change.
//
// Falls back to textSimilarityRatio when Memory is unavailable, but tags the
// result so the authority model knows it lacks semantic verification.
func (a *SemanticAnalyzer) ClassifyChange(ctx context.Context, artifactKey string, oldPayload, newPayload json.RawMessage, cfg RippleConfig) (*SemanticChangeResult, error) {
	oldText := extractSearchableText(oldPayload)
	newText := extractSearchableText(newPayload)

	if oldText == "" || newText == "" {
		return &SemanticChangeResult{
			Class:         ChangeClassMinor,
			Score:         0.5,
			AuthorityTier: AuthorityGated,
			Description:   "Could not extract searchable text from payloads.",
			Method:        "text_fallback",
		}, nil
	}

	// If texts are identical, trivial.
	if oldText == newText {
		return &SemanticChangeResult{
			Class:         ChangeClassTrivial,
			Score:         1.0,
			AuthorityTier: AuthorityAutonomous,
			Description:   "Content is identical — no semantic change.",
			Method:        "text_fallback",
		}, nil
	}

	// Primary: search Memory using the NEW content as query.
	// The artifact's own key in results still holds the OLD indexed content,
	// so the search score measures how similar new is to old.
	query := truncateForSearch(newText, 500)
	results, err := a.mem.Search(ctx, memory.SearchRequest{
		Query: query,
		Limit: 20,
	})
	if err != nil {
		slog.WarnContext(ctx, "semantic: search failed for change classification, using text fallback", "key", artifactKey, "error", err)
		return a.classifyByTextFallback(oldText, newText, artifactKey, cfg), nil
	}

	// Find the artifact in results by key.
	var selfScore float64
	found := false
	for _, r := range results {
		if r.Object.Key == artifactKey {
			selfScore = r.Score
			found = true
			break
		}
	}

	if !found {
		// Artifact not in Memory graph yet — use text fallback.
		return a.classifyByTextFallback(oldText, newText, artifactKey, cfg), nil
	}

	// Use the Memory search score as the similarity measure.
	// Detect artifact type from the key for threshold lookup.
	artifactType := inferArtifactTypeFromKey(artifactKey)

	class, desc := classifyByScore(selfScore, artifactType, cfg)
	tier := ClassifyAuthority(selfScore, artifactType, cfg)

	return &SemanticChangeResult{
		Class:         class,
		Score:         selfScore,
		AuthorityTier: tier,
		Description:   desc,
		Method:        "embedding",
	}, nil
}

// classifyByTextFallback uses word-overlap ratio as a fallback classifier.
// Results are never autonomous without semantic verification.
func (a *SemanticAnalyzer) classifyByTextFallback(oldText, newText, artifactKey string, cfg RippleConfig) *SemanticChangeResult {
	ratio := textSimilarityRatio(oldText, newText)
	artifactType := inferArtifactTypeFromKey(artifactKey)

	class, desc := classifyByScore(ratio, artifactType, cfg)
	// Without embedding verification, never autonomous.
	tier := AuthorityGated
	if class == ChangeClassMajor {
		tier = AuthorityEscalated
	}

	return &SemanticChangeResult{
		Class:         class,
		Score:         ratio,
		AuthorityTier: tier,
		Description:   desc + " (text fallback — no semantic verification)",
		Method:        "text_fallback",
	}
}

// classifyByScore maps a similarity score to a change class using config thresholds.
func classifyByScore(score float64, artifactType string, cfg RippleConfig) (SemanticChangeClass, string) {
	thresholds := cfg.ThresholdsForType(artifactType)

	switch {
	case score >= thresholds.AutonomousAbove:
		return ChangeClassTrivial, "Very minor changes — likely typo fixes or formatting."
	case score >= (thresholds.AutonomousAbove+thresholds.GatedAbove)/2:
		return ChangeClassMinor, "Moderate changes — clarifications or detail additions."
	case score >= thresholds.GatedAbove:
		return ChangeClassSignificant, "Significant content changes — scope or emphasis shift likely."
	default:
		return ChangeClassMajor, "Major content rewrite — direction change or pivot likely."
	}
}

// inferArtifactTypeFromKey guesses artifact type from key patterns.
func inferArtifactTypeFromKey(key string) string {
	switch {
	case key == "north_star":
		return "north_star"
	case key == "strategy_formula":
		return "strategy_formula"
	case key == "strategy_foundations":
		return "strategy_foundations"
	case key == "roadmap_recipe":
		return "roadmap_recipe"
	case key == "insight_analyses":
		return "insight_analyses"
	case len(key) > 3 && key[:3] == "fd-":
		return "feature"
	case len(key) > 3 && key[:3] == "vm-":
		return "value_model"
	default:
		return "_default"
	}
}

// ClassifyChangeStructural provides a fallback classification when the
// SemanticAnalyzer is nil (Memory unavailable). Uses downstream count
// as a structural proxy.
func ClassifyChangeStructural(artifactType string, downstreamCount int) *SemanticChangeResult {
	tier := ClassifyAuthorityStructural(artifactType, downstreamCount)

	class := ChangeClassMinor
	desc := "Structural classification — no semantic analysis available."
	switch tier {
	case AuthorityEscalated:
		class = ChangeClassSignificant
		desc = "Foundational artifact or large blast radius — requires human review."
	case AuthorityGated:
		class = ChangeClassMinor
		desc = "Moderate blast radius — requires human review."
	}

	return &SemanticChangeResult{
		Class:         class,
		Score:         0.5,
		AuthorityTier: tier,
		Description:   desc,
		Method:        "structural",
	}
}

// DriftSignal represents a detected semantic drift between an artifact and its
// declared value path.
type DriftSignal struct {
	ArtifactKey      string  `json:"artifact_key"`
	DeclaredPath     string  `json:"declared_path"`
	BetterMatch      string  `json:"better_match,omitempty"`
	BetterMatchScore float64 `json:"better_match_score,omitempty"`
	Description      string  `json:"description"`
}

// DetectDrift checks if artifacts have semantically drifted from their declared
// value model paths. For each feature with contributes_to relationships, searches
// Memory using the feature's content and checks if the declared value path appears
// in top results.
func (a *SemanticAnalyzer) DetectDrift(ctx context.Context, instanceID uuid.UUID) ([]DriftSignal, error) {
	// Load features with their contributes_to relationships.
	var rels []domain.StrategyRelationship
	err := a.db.NewSelect().Model(&rels).
		Where("sr.instance_id = ?", instanceID).
		Where("sr.relationship = ?", domain.RelContributesTo).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load contributes_to rels: %w", err)
	}

	if len(rels) == 0 {
		return nil, nil
	}

	// Group by source (feature key).
	featurePaths := make(map[string][]string)
	for _, r := range rels {
		featurePaths[r.SourceKey] = append(featurePaths[r.SourceKey], r.TargetKey)
	}

	// Load feature payloads.
	featureKeys := make([]string, 0, len(featurePaths))
	for k := range featurePaths {
		featureKeys = append(featureKeys, k)
	}
	var features []*domain.StrategyArtifact
	err = a.db.NewSelect().Model(&features).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.artifact_key IN (?)", bun.In(featureKeys)).
		Where("sa.status = ?", domain.ArtifactStatusActive).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load features for drift: %w", err)
	}

	var drifts []DriftSignal
	for _, feat := range features {
		paths := featurePaths[feat.ArtifactKey]
		if len(paths) == 0 {
			continue
		}

		// Search using feature content.
		text := extractSearchableText(feat.Payload)
		if text == "" {
			continue
		}
		query := truncateForSearch(text, 400)
		results, searchErr := a.mem.Search(ctx, memory.SearchRequest{
			Query: query,
			Limit: 15,
		})
		if searchErr != nil {
			slog.WarnContext(ctx, "semantic: drift search failed", "feature", feat.ArtifactKey, "error", searchErr)
			continue
		}

		// Check if declared paths appear in top results.
		pathScores := make(map[string]float64)
		var bestNonDeclared string
		var bestNonDeclaredScore float64
		for _, r := range results {
			for _, p := range paths {
				if r.Object.Key == p {
					pathScores[p] = r.Score
				}
			}
			// Track best non-declared value model match.
			if r.Object.Type == "value_model" || strings.Contains(r.Object.Key, "value_model") {
				isDeclared := false
				for _, p := range paths {
					if r.Object.Key == p {
						isDeclared = true
						break
					}
				}
				if !isDeclared && r.Score > bestNonDeclaredScore {
					bestNonDeclared = r.Object.Key
					bestNonDeclaredScore = r.Score
				}
			}
		}

		// If a declared path doesn't appear at all, or scores lower than a
		// non-declared path, emit drift signal.
		for _, p := range paths {
			declaredScore, found := pathScores[p]
			if !found {
				drifts = append(drifts, DriftSignal{
					ArtifactKey:      feat.ArtifactKey,
					DeclaredPath:     p,
					BetterMatch:      bestNonDeclared,
					BetterMatchScore: bestNonDeclaredScore,
					Description:      fmt.Sprintf("%s declares contributes_to %s, but %s does not appear in semantic search results for the feature's content.", feat.ArtifactKey, p, p),
				})
			} else if bestNonDeclaredScore > 0 && bestNonDeclaredScore > declaredScore*1.2 {
				drifts = append(drifts, DriftSignal{
					ArtifactKey:      feat.ArtifactKey,
					DeclaredPath:     p,
					BetterMatch:      bestNonDeclared,
					BetterMatchScore: bestNonDeclaredScore,
					Description:      fmt.Sprintf("%s may be drifting from %s (score %.2f) — %s is a stronger semantic match (score %.2f).", feat.ArtifactKey, p, declaredScore, bestNonDeclared, bestNonDeclaredScore),
				})
			}
		}
	}

	return drifts, nil
}

// ClusteringSignal represents two semantically similar but unconnected artifacts.
type ClusteringSignal struct {
	ArtifactKeyA string  `json:"artifact_key_a"`
	ArtifactKeyB string  `json:"artifact_key_b"`
	Score        float64 `json:"score"`
	Description  string  `json:"description"`
}

// DetectClustering finds semantically similar artifacts that lack structural
// relationships, suggesting missing connections.
func (a *SemanticAnalyzer) DetectClustering(ctx context.Context, instanceID uuid.UUID) ([]ClusteringSignal, error) {
	// Load all active artifacts.
	var artifacts []*domain.StrategyArtifact
	err := a.db.NewSelect().Model(&artifacts).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.status = ?", domain.ArtifactStatusActive).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load artifacts for clustering: %w", err)
	}

	// Load all relationships for the instance.
	var rels []domain.StrategyRelationship
	err = a.db.NewSelect().Model(&rels).
		Where("sr.instance_id = ?", instanceID).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load relationships for clustering: %w", err)
	}

	// Build connected set.
	connected := make(map[string]bool)
	for _, r := range rels {
		key := r.SourceKey + "|" + r.TargetKey
		connected[key] = true
		connected[r.TargetKey+"|"+r.SourceKey] = true // bidirectional
	}

	var signals []ClusteringSignal
	checked := make(map[string]bool)

	// For each artifact, search and find high-scoring matches that aren't connected.
	for _, art := range artifacts {
		text := extractSearchableText(art.Payload)
		if text == "" {
			continue
		}

		query := truncateForSearch(text, 300)
		results, searchErr := a.mem.Search(ctx, memory.SearchRequest{
			Query: query,
			Limit: 10,
		})
		if searchErr != nil {
			continue
		}

		for _, r := range results {
			if r.Object.Key == art.ArtifactKey {
				continue // skip self
			}
			if r.Score < 0.75 {
				continue // not similar enough
			}

			// Check if already connected.
			pairKey := art.ArtifactKey + "|" + r.Object.Key
			if connected[pairKey] {
				continue // already structurally connected
			}

			// Avoid duplicate pairs.
			reversePair := r.Object.Key + "|" + art.ArtifactKey
			if checked[pairKey] || checked[reversePair] {
				continue
			}
			checked[pairKey] = true

			signals = append(signals, ClusteringSignal{
				ArtifactKeyA: art.ArtifactKey,
				ArtifactKeyB: r.Object.Key,
				Score:        r.Score,
				Description:  fmt.Sprintf("%s and %s are semantically similar (score %.2f) but have no structural relationship. Consider adding a connection.", art.ArtifactKey, r.Object.Key, r.Score),
			})
		}
	}

	return signals, nil
}

// FullSemanticAnalysis runs all semantic checks and returns signals.
func (a *SemanticAnalyzer) FullSemanticAnalysis(ctx context.Context, instanceID uuid.UUID) []*domain.RippleSignal {
	return a.FullSemanticAnalysisWithConfig(ctx, instanceID, DefaultRippleConfig())
}

// FullSemanticAnalysisWithConfig runs all semantic checks using the provided
// config for tension baselines and thresholds.
func (a *SemanticAnalyzer) FullSemanticAnalysisWithConfig(ctx context.Context, instanceID uuid.UUID, cfg RippleConfig) []*domain.RippleSignal {
	var signals []*domain.RippleSignal

	// Drift detection.
	drifts, err := a.DetectDrift(ctx, instanceID)
	if err != nil {
		slog.WarnContext(ctx, "semantic: drift detection failed", "error", err)
	}
	for _, d := range drifts {
		signals = append(signals, &domain.RippleSignal{
			InstanceID:  instanceID,
			SignalType:  domain.SignalTypeDrift,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   d.ArtifactKey,
			TargetKey:   d.DeclaredPath,
			Description: d.Description,
		})
	}

	// Clustering detection.
	clusters, err := a.DetectClustering(ctx, instanceID)
	if err != nil {
		slog.WarnContext(ctx, "semantic: clustering detection failed", "error", err)
	}
	for _, c := range clusters {
		signals = append(signals, &domain.RippleSignal{
			InstanceID:  instanceID,
			SignalType:  domain.SignalTypeClustering,
			Severity:    domain.SignalSeverityInfo,
			SourceKey:   c.ArtifactKeyA,
			TargetKey:   c.ArtifactKeyB,
			Description: c.Description,
		})
	}

	// Cross-track tension detection (horizontal alignment).
	tensionSignals, _, tensionErr := DetectCrossTrackTension(ctx, a.db, a.mem, instanceID, cfg)
	if tensionErr != nil {
		slog.WarnContext(ctx, "semantic: tension detection failed", "error", tensionErr)
	}
	signals = append(signals, tensionSignals...)

	// Vertical alignment detection (top-down / bottom-up).
	verticalSignals, _, verticalErr := DetectVerticalMisalignment(ctx, a.db, a.mem, instanceID, cfg)
	if verticalErr != nil {
		slog.WarnContext(ctx, "semantic: vertical alignment detection failed", "error", verticalErr)
	}
	signals = append(signals, verticalSignals...)

	return signals
}

// --- Helpers ---

// extractSearchableText pulls a flat text summary from a JSON payload
// by concatenating all string values.
func extractSearchableText(payload json.RawMessage) string {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return ""
	}
	var parts []string
	collectStrings(raw, &parts)
	return strings.Join(parts, " ")
}

func collectStrings(v any, parts *[]string) {
	switch val := v.(type) {
	case string:
		if len(val) > 5 { // skip very short strings (IDs, codes)
			*parts = append(*parts, val)
		}
	case map[string]any:
		for _, child := range val {
			collectStrings(child, parts)
		}
	case []any:
		for _, child := range val {
			collectStrings(child, parts)
		}
	}
}

func truncateForSearch(text string, maxLen int) string {
	if len(text) <= maxLen {
		return text
	}
	return text[:maxLen]
}

// textSimilarityRatio computes a simple character-level similarity ratio
// between two strings. Uses longest common subsequence length / max length.
// This is a rough proxy when we can't access embedding vectors directly.
func textSimilarityRatio(a, b string) float64 {
	if a == b {
		return 1.0
	}
	if len(a) == 0 || len(b) == 0 {
		return 0.0
	}

	// Use word-level overlap for efficiency (not char-level LCS which is O(n*m)).
	wordsA := strings.Fields(strings.ToLower(a))
	wordsB := strings.Fields(strings.ToLower(b))

	setA := make(map[string]bool, len(wordsA))
	for _, w := range wordsA {
		setA[w] = true
	}

	overlap := 0
	for _, w := range wordsB {
		if setA[w] {
			overlap++
		}
	}

	maxLen := len(wordsA)
	if len(wordsB) > maxLen {
		maxLen = len(wordsB)
	}
	if maxLen == 0 {
		return 1.0
	}
	return float64(overlap) / float64(maxLen)
}
