// Package checks provides EPF content validation beyond schema validation.
package checks

import (
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/relationships"
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
	CoveragePercent float64 `json:"coverage_percent"`
	OrphanFeatures  int     `json:"orphan_features"` // Features with no contributes_to
	UncoveredL2s    int     `json:"uncovered_l2s"`   // L2 components with no features
	StrategicGaps   int     `json:"strategic_gaps"`  // KR targets without feature coverage

	// Detailed errors (limited to top 10 for display)
	Errors []RelationshipError `json:"errors,omitempty"`

	// Score 0-100
	Score int    `json:"score"`
	Grade string `json:"grade"`
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
		Valid:  true,
		Errors: make([]RelationshipError, 0),
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
		result.OrphanFeatures = len(coverageAnalysis.OrphanFeatures)
		result.UncoveredL2s = len(coverageAnalysis.UncoveredL2Components)
		result.StrategicGaps = len(coverageAnalysis.KRTargetsWithoutFeatures)
	}

	// Calculate score
	result.Score = c.calculateScore(result)
	result.Grade = c.calculateGrade(result.Score)

	return result, nil
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
