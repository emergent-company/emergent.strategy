package checks

import (
	"testing"
)

// TestCalculateScoreNoCanonicalGapPenalty verifies that calculateScore does not
// penalize for strategic gaps already filtered to product-only.
func TestCalculateScoreNoCanonicalGapPenalty(t *testing.T) {
	checker := NewRelationshipsChecker("/test")

	// Case 1: No strategic gaps (already filtered) — should get full score
	result := &RelationshipsResult{
		TotalPathsChecked: 10,
		ValidPaths:        10,
		InvalidPaths:      0,
		OrphanFeatures:    0,
		StrategicGaps:     0,
		CoveragePercent:   90,
		CoverageByTrack: map[string]*TrackCoverage{
			"Product": {
				TrackName:       "Product",
				TotalL2:         10,
				CoveredL2:       9,
				CoveragePercent: 90,
			},
		},
	}

	score := checker.calculateScore(result)
	if score != 100+10 { // 100 base + 10 bonus for 90% coverage, capped at 100
		// Score should be 100 (capped)
		if score != 100 {
			t.Errorf("Expected score 100, got %d", score)
		}
	}
}

// TestCalculateScoreProductOnlyCoverageBonus verifies that the coverage bonus
// uses product-track coverage instead of overall coverage.
func TestCalculateScoreProductOnlyCoverageBonus(t *testing.T) {
	checker := NewRelationshipsChecker("/test")

	// Overall coverage is 30% (canonical tracks dragging it down),
	// but Product track is 80% — should still get the 10-point bonus
	result := &RelationshipsResult{
		TotalPathsChecked: 5,
		ValidPaths:        5,
		InvalidPaths:      0,
		OrphanFeatures:    0,
		StrategicGaps:     0,
		CoveragePercent:   30, // Low overall — diluted by canonical tracks
		CoverageByTrack: map[string]*TrackCoverage{
			"Product": {
				TrackName:       "Product",
				TotalL2:         5,
				CoveredL2:       4,
				CoveragePercent: 80, // High product-only coverage
			},
			"Strategy": {
				TrackName:       "Strategy",
				TotalL2:         10,
				CoveredL2:       0,
				CoveragePercent: 0, // No features in canonical track
			},
			"OrgOps": {
				TrackName:       "OrgOps",
				TotalL2:         10,
				CoveredL2:       0,
				CoveragePercent: 0,
			},
		},
	}

	score := checker.calculateScore(result)
	// 100 base + 10 bonus (product at 80%) = 110, capped at 100
	if score != 100 {
		t.Errorf("Expected score 100 (with product coverage bonus), got %d", score)
	}
}

// TestCalculateScoreProductGapPenaltyOnly verifies that only product track
// strategic gaps affect the score.
func TestCalculateScoreProductGapPenaltyOnly(t *testing.T) {
	checker := NewRelationshipsChecker("/test")

	// 2 product track gaps — should penalize
	result := &RelationshipsResult{
		TotalPathsChecked: 5,
		ValidPaths:        5,
		InvalidPaths:      0,
		OrphanFeatures:    0,
		StrategicGaps:     2, // These are product gaps (already filtered in Check())
		CoveragePercent:   60,
		CoverageByTrack: map[string]*TrackCoverage{
			"Product": {
				TrackName:       "Product",
				TotalL2:         5,
				CoveredL2:       3,
				CoveragePercent: 60,
			},
		},
	}

	score := checker.calculateScore(result)
	// 100 - 6 (2 gaps * 3) + 5 (60% coverage bonus) = 99
	expected := 99
	if score != expected {
		t.Errorf("Expected score %d, got %d", expected, score)
	}
}

// TestCalculateScoreFallbackToOverallCoverage verifies that when product track
// coverage data is not available, the overall coverage is used.
func TestCalculateScoreFallbackToOverallCoverage(t *testing.T) {
	checker := NewRelationshipsChecker("/test")

	// No per-track breakdown — should fall back to overall
	result := &RelationshipsResult{
		TotalPathsChecked: 5,
		ValidPaths:        5,
		InvalidPaths:      0,
		OrphanFeatures:    0,
		StrategicGaps:     0,
		CoveragePercent:   80,
		CoverageByTrack:   nil, // No per-track data
	}

	score := checker.calculateScore(result)
	// 100 + 10 (80% coverage bonus) = 110, capped at 100
	if score != 100 {
		t.Errorf("Expected score 100 (with overall coverage bonus), got %d", score)
	}
}

// TestCalculateGrade verifies grade boundaries
func TestCalculateGradeRelationships(t *testing.T) {
	checker := NewRelationshipsChecker("/test")

	tests := []struct {
		score int
		grade string
	}{
		{100, "A"},
		{90, "A"},
		{89, "B"},
		{80, "B"},
		{79, "C"},
		{70, "C"},
		{69, "D"},
		{60, "D"},
		{59, "F"},
		{0, "F"},
	}

	for _, tt := range tests {
		grade := checker.calculateGrade(tt.score)
		if grade != tt.grade {
			t.Errorf("score=%d: got grade %s, want %s", tt.score, grade, tt.grade)
		}
	}
}
