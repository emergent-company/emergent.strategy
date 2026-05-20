package aim

import (
	"testing"
)

// ---------------------------------------------------------------------------
// calibrationDecision — rule-based decision logic
// ---------------------------------------------------------------------------

func TestCalibrationDecision(t *testing.T) {
	tests := []struct {
		name             string
		hitRatePct       int
		invalidatedCount int
		want             string
	}{
		{
			name:             "persevere - high hit rate no invalidations",
			hitRatePct:       80,
			invalidatedCount: 0,
			want:             "persevere",
		},
		{
			name:             "persevere - exactly 60 pct hit rate",
			hitRatePct:       60,
			invalidatedCount: 0,
			want:             "persevere",
		},
		{
			name:             "pivot - below 60 pct hit rate",
			hitRatePct:       50,
			invalidatedCount: 0,
			want:             "pivot",
		},
		{
			name:             "pivot - above threshold but has invalidation",
			hitRatePct:       70,
			invalidatedCount: 1,
			want:             "pivot",
		},
		{
			name:             "pull_the_plug - very low hit rate and multiple invalidations",
			hitRatePct:       20,
			invalidatedCount: 3,
			want:             "pull_the_plug",
		},
		{
			name:             "pull_the_plug - exactly at boundary",
			hitRatePct:       29,
			invalidatedCount: 2,
			want:             "pull_the_plug",
		},
		{
			name:             "pivot not pull_the_plug - low hit rate but only 1 invalidation",
			hitRatePct:       20,
			invalidatedCount: 1,
			want:             "pivot",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := calibrationDecision(tt.hitRatePct, tt.invalidatedCount)
			if got != tt.want {
				t.Errorf("calibrationDecision(%d, %d) = %q, want %q", tt.hitRatePct, tt.invalidatedCount, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// computeOKRHitRate
// ---------------------------------------------------------------------------

func TestComputeOKRHitRate(t *testing.T) {
	tests := []struct {
		name        string
		payload     map[string]any
		wantRate    int
		wantTotal   int
		wantHitCount int
	}{
		{
			name:        "empty okr assessments",
			payload:     map[string]any{"okr_assessments": []any{}},
			wantRate:    0,
			wantTotal:   0,
			wantHitCount: 0,
		},
		{
			name: "all on track",
			payload: map[string]any{
				"okr_assessments": []any{
					map[string]any{"okr_id": "okr-1", "status": "on_track"},
					map[string]any{"okr_id": "okr-2", "status": "on_track"},
				},
			},
			wantRate:    100,
			wantTotal:   2,
			wantHitCount: 2,
		},
		{
			name: "half on track",
			payload: map[string]any{
				"okr_assessments": []any{
					map[string]any{"okr_id": "okr-1", "status": "on_track"},
					map[string]any{"okr_id": "okr-2", "status": "missed"},
				},
			},
			wantRate:    50,
			wantTotal:   2,
			wantHitCount: 1,
		},
		{
			name: "none on track",
			payload: map[string]any{
				"okr_assessments": []any{
					map[string]any{"okr_id": "okr-1", "status": "pending"},
					map[string]any{"okr_id": "okr-2", "status": "at_risk"},
				},
			},
			wantRate:    0,
			wantTotal:   2,
			wantHitCount: 0,
		},
		{
			name: "completed status also counts as hit",
			payload: map[string]any{
				"okr_assessments": []any{
					map[string]any{"okr_id": "okr-1", "status": "completed"},
					map[string]any{"okr_id": "okr-2", "status": "pending"},
				},
			},
			wantRate:    50,
			wantTotal:   2,
			wantHitCount: 1,
		},
		{
			name:        "missing okr_assessments key",
			payload:     map[string]any{},
			wantRate:    0,
			wantTotal:   0,
			wantHitCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rate, total, hit := computeOKRHitRate(tt.payload)
			if rate != tt.wantRate {
				t.Errorf("hit rate: got %d, want %d", rate, tt.wantRate)
			}
			if total != tt.wantTotal {
				t.Errorf("total: got %d, want %d", total, tt.wantTotal)
			}
			if hit != tt.wantHitCount {
				t.Errorf("hit count: got %d, want %d", hit, tt.wantHitCount)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// countInvalidatedAssumptions
// ---------------------------------------------------------------------------

func TestCountInvalidatedAssumptions(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		want    int
	}{
		{
			name:    "empty",
			payload: map[string]any{},
			want:    0,
		},
		{
			name: "two invalidated",
			payload: map[string]any{
				"assumption_validations": []any{
					map[string]any{"assumption_id": "a-1", "status": "invalidated"},
					map[string]any{"assumption_id": "a-2", "status": "validated"},
					map[string]any{"assumption_id": "a-3", "status": "invalidated"},
				},
			},
			want: 2,
		},
		{
			name: "none invalidated",
			payload: map[string]any{
				"assumption_validations": []any{
					map[string]any{"assumption_id": "a-1", "status": "pending"},
				},
			},
			want: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := countInvalidatedAssumptions(tt.payload)
			if got != tt.want {
				t.Errorf("countInvalidatedAssumptions = %d, want %d", got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// buildReasoningSummary
// ---------------------------------------------------------------------------

func TestBuildReasoningSummary(t *testing.T) {
	tests := []struct {
		name       string
		decision   string
		hitRate    int
		total      int
		hit        int
		invalidated int
		contains   string
	}{
		{
			name:       "persevere",
			decision:   "persevere",
			hitRate:    80,
			total:      5,
			hit:        4,
			invalidated: 0,
			contains:   "80%",
		},
		{
			name:       "pivot low hit rate",
			decision:   "pivot",
			hitRate:    40,
			total:      5,
			hit:        2,
			invalidated: 0,
			contains:   "40%",
		},
		{
			name:       "pull_the_plug",
			decision:   "pull_the_plug",
			hitRate:    20,
			total:      5,
			hit:        1,
			invalidated: 3,
			contains:   "20%",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildReasoningSummary(tt.decision, tt.hitRate, tt.total, tt.hit, tt.invalidated)
			if got == "" {
				t.Error("expected non-empty reasoning summary")
			}
			if tt.contains != "" && !containsStr(got, tt.contains) {
				t.Errorf("reasoning %q does not contain %q", got, tt.contains)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// extractStringField
// ---------------------------------------------------------------------------

func TestExtractStringField(t *testing.T) {
	m := map[string]any{
		"roadmap": map[string]any{
			"cycle": "Q2 2026",
		},
	}
	got := extractStringField(m, "roadmap.cycle")
	if got != "Q2 2026" {
		t.Errorf("got %q, want %q", got, "Q2 2026")
	}

	got = extractStringField(m, "missing.key")
	if got != "" {
		t.Errorf("expected empty string for missing key, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// defaultTriggerConfig
// ---------------------------------------------------------------------------

func TestDefaultTriggerConfig(t *testing.T) {
	cfg := defaultTriggerConfig()
	if cfg.DaysBetweenAssessments != 90 {
		t.Errorf("DaysBetweenAssessments = %d, want 90", cfg.DaysBetweenAssessments)
	}
	if cfg.CriticalSignalThreshold != 3 {
		t.Errorf("CriticalSignalThreshold = %d, want 3", cfg.CriticalSignalThreshold)
	}
}

// ---------------------------------------------------------------------------
// calibrationDecisionLabel
// ---------------------------------------------------------------------------

func TestCalibrationDecisionLabel(t *testing.T) {
	tests := []struct {
		decision string
		want     string
	}{
		{"persevere", "Persevere"},
		{"pivot", "Pivot"},
		{"pull_the_plug", "Pull the Plug"},
		{"unknown", "unknown"},
	}
	for _, tt := range tests {
		got := calibrationDecisionLabel(tt.decision)
		if got != tt.want {
			t.Errorf("calibrationDecisionLabel(%q) = %q, want %q", tt.decision, got, tt.want)
		}
	}
}

// ---------------------------------------------------------------------------
// flagStrategicBets
// ---------------------------------------------------------------------------

func TestFlagStrategicBets(t *testing.T) {
	formulaPayload := map[string]any{
		"strategy": map[string]any{
			"strategic_bets": []any{
				map[string]any{"id": "bet-1", "name": "Bet one"},
				map[string]any{"id": "bet-2", "name": "Bet two"},
			},
		},
	}

	svc := &Service{}
	affected := svc.flagStrategicBets(formulaPayload, "test reasoning")

	if len(affected) != 2 {
		t.Fatalf("expected 2 affected bets, got %d", len(affected))
	}

	strategy, _ := formulaPayload["strategy"].(map[string]any)
	bets, _ := strategy["strategic_bets"].([]any)
	for i, bet := range bets {
		betMap, _ := bet.(map[string]any)
		flag, _ := betMap["review_flag"].(bool)
		if !flag {
			t.Errorf("bet %d: expected review_flag=true, got false", i)
		}
	}
}

// ---------------------------------------------------------------------------
// helper
// ---------------------------------------------------------------------------

func containsStr(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		func() bool {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
			return false
		}())
}
