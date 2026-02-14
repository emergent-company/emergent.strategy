// Package checks provides EPF content validation beyond schema validation.
package checks

import (
	"fmt"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/relationships"
)

// RelationshipsChecker validates EPF artifact relationships.
// This includes:
// - Feature contributes_to paths pointing to valid value model components
// - KR value_model_target paths pointing to valid value model components
// - Coverage analysis showing orphan features and strategic gaps
type RelationshipsChecker struct {
	instancePath string
}

// NewRelationshipsChecker creates a new relationships checker.
func NewRelationshipsChecker(instancePath string) *RelationshipsChecker {
	return &RelationshipsChecker{instancePath: instancePath}
}

// TrackCoverage contains coverage statistics for a single value model track.
type TrackCoverage struct {
	TrackName        string   `json:"track_name"`
	TotalL2          int      `json:"total_l2"`
	CoveredL2        int      `json:"covered_l2"`
	CoveragePercent  float64  `json:"coverage_percent"`
	UncoveredL2Paths []string `json:"uncovered_l2_paths,omitempty"`
}

// RelationshipsResult contains the results of relationship validation.
type RelationshipsResult struct {
	// Overall validation status
	Valid bool `json:"valid"`

	// Counts
	TotalFeaturesChecked int `json:"total_features_checked"`
	TotalKRsChecked      int `json:"total_krs_checked"`
	TotalPathsChecked    int `json:"total_paths_checked"`
	ValidPaths           int `json:"valid_paths"`
	InvalidPaths         int `json:"invalid_paths"`

	// Coverage metrics
	CoveragePercent     float64 `json:"coverage_percent"`
	TotalL2Components   int     `json:"total_l2_components"`   // Total L2 components across all tracks
	CoveredL2Components int     `json:"covered_l2_components"` // Covered L2 components
	OrphanFeatures      int     `json:"orphan_features"`       // Features with no contributes_to
	UncoveredL2s        int     `json:"uncovered_l2s"`         // L2 components with no features
	StrategicGaps       int     `json:"strategic_gaps"`        // KR targets without feature coverage

	// Per-track coverage breakdown
	CoverageByTrack map[string]*TrackCoverage `json:"coverage_by_track,omitempty"`

	// Detailed errors (limited to top 10 for display)
	Errors []RelationshipError `json:"errors,omitempty"`

	// Actionable suggestions to improve relationships
	Suggestions []RelationshipSuggestion `json:"suggestions,omitempty"`

	// Score 0-100
	Score int    `json:"score"`
	Grade string `json:"grade"`
}

// RelationshipSuggestion represents an actionable suggestion to improve relationships.
type RelationshipSuggestion struct {
	// Priority: "high", "medium", "low"
	Priority string `json:"priority"`
	// Category: "missing_link", "low_coverage", "orphan_feature", "strategic_gap"
	Category string `json:"category"`
	// The artifact that needs updating (e.g., "fd-012")
	Source string `json:"source,omitempty"`
	// Human-readable suggestion
	Message string `json:"message"`
	// Specific action to take
	Action string `json:"action"`
	// MCP tool to use (if applicable)
	MCPTool string `json:"mcp_tool,omitempty"`
	// Example parameters for the MCP tool
	MCPParams map[string]string `json:"mcp_params,omitempty"`
}

// RelationshipError represents a single relationship validation error.
type RelationshipError struct {
	Source      string `json:"source"`       // e.g., "fd-001"
	SourceType  string `json:"source_type"`  // "feature" or "key_result"
	Field       string `json:"field"`        // e.g., "contributes_to"
	InvalidPath string `json:"invalid_path"` // The path that failed
	Message     string `json:"message"`      // Error description
	DidYouMean  string `json:"did_you_mean,omitempty"`
}

// Check runs the relationships check.
func (c *RelationshipsChecker) Check() (*RelationshipsResult, error) {
	result := &RelationshipsResult{
		Valid:       true,
		Errors:      make([]RelationshipError, 0),
		Suggestions: make([]RelationshipSuggestion, 0),
	}

	// Create analyzer and load data
	analyzer := relationships.NewAnalyzer(c.instancePath)
	if err := analyzer.Load(); err != nil {
		// Can't load data - return partial result
		result.Valid = false
		result.Score = 0
		result.Grade = "F"
		result.Errors = append(result.Errors, RelationshipError{
			Source:     "analyzer",
			SourceType: "system",
			Field:      "load",
			Message:    err.Error(),
		})
		return result, nil
	}

	// Run validation
	validationResult := analyzer.ValidateAll()

	// Populate counts from validation
	result.TotalFeaturesChecked = validationResult.Stats.TotalFeaturesChecked
	result.TotalKRsChecked = validationResult.Stats.TotalKRsChecked
	result.TotalPathsChecked = validationResult.Stats.TotalPathsChecked
	result.ValidPaths = validationResult.Stats.ValidPaths
	result.InvalidPaths = validationResult.Stats.InvalidPaths
	result.Valid = validationResult.Valid

	// Convert errors (limit to 10 for display)
	for i, err := range validationResult.Errors {
		if i >= 10 {
			break
		}
		result.Errors = append(result.Errors, RelationshipError{
			Source:      err.Source,
			SourceType:  err.SourceType,
			Field:       err.Field,
			InvalidPath: err.InvalidPath,
			Message:     err.Message,
			DidYouMean:  err.DidYouMean,
		})
	}

	// Run coverage analysis
	coverageAnalysis := analyzer.AnalyzeCoverage("all")
	if coverageAnalysis != nil {
		result.CoveragePercent = coverageAnalysis.CoveragePercent
		result.TotalL2Components = coverageAnalysis.TotalL2Components
		result.CoveredL2Components = coverageAnalysis.CoveredL2Components
		result.OrphanFeatures = len(coverageAnalysis.OrphanFeatures)
		result.UncoveredL2s = len(coverageAnalysis.UncoveredL2Components)
		result.StrategicGaps = len(coverageAnalysis.KRTargetsWithoutFeatures)

		// Get detailed per-track coverage
		trackDetails := analyzer.GetDetailedCoverageByTrack()
		result.CoverageByTrack = make(map[string]*TrackCoverage)
		for trackName, detail := range trackDetails {
			result.CoverageByTrack[trackName] = &TrackCoverage{
				TrackName:        detail.TrackName,
				TotalL2:          detail.TotalL2,
				CoveredL2:        detail.CoveredL2,
				CoveragePercent:  detail.CoveragePercent,
				UncoveredL2Paths: detail.UncoveredL2Paths,
			}
		}

		// Generate actionable suggestions
		result.Suggestions = c.generateSuggestions(validationResult, coverageAnalysis, analyzer)
	}

	// Calculate score
	result.Score = c.calculateScore(result)
	result.Grade = c.calculateGrade(result.Score)

	return result, nil
}

// generateSuggestions creates actionable suggestions based on validation and coverage results.
func (c *RelationshipsChecker) generateSuggestions(
	validationResult *relationships.ValidationResult,
	coverageAnalysis *relationships.CoverageAnalysis,
	analyzer *relationships.Analyzer,
) []RelationshipSuggestion {
	suggestions := make([]RelationshipSuggestion, 0)

	// 1. High priority: Fix invalid paths with "did you mean" suggestions
	for _, err := range validationResult.Errors {
		if err.DidYouMean != "" {
			suggestions = append(suggestions, RelationshipSuggestion{
				Priority: "high",
				Category: "invalid_path",
				Source:   err.Source,
				Message:  fmt.Sprintf("%s has invalid path '%s' - did you mean '%s'?", err.Source, err.InvalidPath, err.DidYouMean),
				Action:   fmt.Sprintf("Update %s in %s from '%s' to '%s'", err.Field, err.Source, err.InvalidPath, err.DidYouMean),
			})
		}
	}

	// 2. High priority: Strategic gaps (KR targets without features)
	for _, gap := range coverageAnalysis.KRTargetsWithoutFeatures {
		suggestions = append(suggestions, RelationshipSuggestion{
			Priority: "high",
			Category: "strategic_gap",
			Message:  fmt.Sprintf("KR targets '%s' but no features contribute to it", gap),
			Action:   "Create a feature definition with contributes_to including this path, or add this path to an existing feature's contributes_to",
			MCPTool:  "epf_suggest_relationships",
			MCPParams: map[string]string{
				"artifact_type": "feature",
				"artifact_path": "FIRE/feature_definitions/",
			},
		})
		// Limit strategic gap suggestions
		if len(suggestions) >= 3 {
			break
		}
	}

	// 3. Medium priority: Orphan features (no contributes_to)
	for _, feature := range coverageAnalysis.OrphanFeatures {
		suggestions = append(suggestions, RelationshipSuggestion{
			Priority: "medium",
			Category: "orphan_feature",
			Source:   feature.ID,
			Message:  fmt.Sprintf("Feature %s (%s) has no contributes_to paths", feature.ID, feature.Name),
			Action:   "Add contributes_to paths to link this feature to the value model",
			MCPTool:  "epf_suggest_relationships",
			MCPParams: map[string]string{
				"artifact_type": "feature",
				"artifact_path": fmt.Sprintf("FIRE/feature_definitions/%s.yaml", feature.ID),
			},
		})
		// Limit orphan suggestions
		if len(suggestions) >= 5 {
			break
		}
	}

	// 4. Low priority: Low coverage advice
	if coverageAnalysis.CoveragePercent < 20 && len(coverageAnalysis.UncoveredL2Components) > 0 {
		// Find the Product track uncovered components (most likely relevant)
		var productUncovered []string
		for _, path := range coverageAnalysis.UncoveredL2Components {
			if len(path) > 8 && path[:8] == "Product." {
				productUncovered = append(productUncovered, path)
			}
		}

		if len(productUncovered) > 0 {
			// Show up to 3 uncovered Product paths
			showPaths := productUncovered
			if len(showPaths) > 3 {
				showPaths = showPaths[:3]
			}
			pathList := ""
			for _, p := range showPaths {
				pathList += "\n      - " + p
			}

			suggestions = append(suggestions, RelationshipSuggestion{
				Priority: "low",
				Category: "low_coverage",
				Message:  fmt.Sprintf("Only %.0f%% of value model is covered by features. Key uncovered Product paths:%s", coverageAnalysis.CoveragePercent, pathList),
				Action:   "Review existing features and add contributes_to paths, or create new features for uncovered components",
			})
		}
	}

	// 5. Suggest running suggest_relationships for analysis
	if len(suggestions) > 0 && coverageAnalysis.CoveragePercent < 50 {
		suggestions = append(suggestions, RelationshipSuggestion{
			Priority: "low",
			Category: "analysis",
			Message:  "Run relationship analysis on your features to discover missing links",
			Action:   "Use epf_suggest_relationships tool to analyze each feature",
			MCPTool:  "epf_suggest_relationships",
			MCPParams: map[string]string{
				"artifact_type":         "feature",
				"include_code_analysis": "true",
			},
		})
	}

	return suggestions
}

// calculateScore computes a 0-100 score for relationship health.
func (c *RelationshipsChecker) calculateScore(result *RelationshipsResult) int {
	if result.TotalPathsChecked == 0 {
		return 100 // No paths to check = no errors
	}

	score := 100

	// Deduct for invalid paths (major issue) - 10 points each, max 50
	invalidPenalty := result.InvalidPaths * 10
	if invalidPenalty > 50 {
		invalidPenalty = 50
	}
	score -= invalidPenalty

	// Deduct for orphan features (warning) - 5 points each, max 20
	orphanPenalty := result.OrphanFeatures * 5
	if orphanPenalty > 20 {
		orphanPenalty = 20
	}
	score -= orphanPenalty

	// Deduct for strategic gaps (warning) - 3 points each, max 15
	gapPenalty := result.StrategicGaps * 3
	if gapPenalty > 15 {
		gapPenalty = 15
	}
	score -= gapPenalty

	// Bonus for high coverage (up to 10 points back)
	if result.CoveragePercent >= 80 {
		score += 10
	} else if result.CoveragePercent >= 60 {
		score += 5
	}

	// Clamp to 0-100
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}

	return score
}

// calculateGrade converts score to letter grade.
func (c *RelationshipsChecker) calculateGrade(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 80:
		return "B"
	case score >= 70:
		return "C"
	case score >= 60:
		return "D"
	default:
		return "F"
	}
}

// HasErrors returns true if there are relationship errors.
func (r *RelationshipsResult) HasErrors() bool {
	return r.InvalidPaths > 0
}

// HasWarnings returns true if there are orphan features or strategic gaps.
func (r *RelationshipsResult) HasWarnings() bool {
	return r.OrphanFeatures > 0 || r.StrategicGaps > 0
}
