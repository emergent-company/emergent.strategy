package ripple

import "testing"

func TestClassifyAuthority(t *testing.T) {
	cfg := DefaultRippleConfig()

	tests := []struct {
		name         string
		score        float64
		artifactType string
		want         AuthorityTier
	}{
		{
			name:         "identical content is autonomous",
			score:        1.0,
			artifactType: "feature",
			want:         AuthorityAutonomous,
		},
		{
			name:         "high similarity feature is autonomous",
			score:        0.90,
			artifactType: "feature",
			want:         AuthorityAutonomous,
		},
		{
			name:         "moderate similarity feature is gated",
			score:        0.75,
			artifactType: "feature",
			want:         AuthorityGated,
		},
		{
			name:         "low similarity feature is escalated",
			score:        0.50,
			artifactType: "feature",
			want:         AuthorityEscalated,
		},
		{
			name:         "north star has tighter thresholds — high similarity still gated",
			score:        0.90,
			artifactType: "north_star",
			want:         AuthorityGated,
		},
		{
			name:         "north star very high similarity is autonomous",
			score:        0.95,
			artifactType: "north_star",
			want:         AuthorityAutonomous,
		},
		{
			name:         "north star moderate is escalated",
			score:        0.75,
			artifactType: "north_star",
			want:         AuthorityEscalated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ClassifyAuthority(tt.score, tt.artifactType, cfg)
			if got != tt.want {
				t.Errorf("ClassifyAuthority(%.2f, %s) = %s, want %s", tt.score, tt.artifactType, got, tt.want)
			}
		})
	}
}

func TestClassifyAuthorityStructural(t *testing.T) {
	tests := []struct {
		name            string
		artifactType    string
		downstreamCount int
		want            AuthorityTier
	}{
		{
			name:            "north star always escalated",
			artifactType:    "north_star",
			downstreamCount: 0,
			want:            AuthorityEscalated,
		},
		{
			name:            "strategy formula always escalated",
			artifactType:    "strategy_formula",
			downstreamCount: 1,
			want:            AuthorityEscalated,
		},
		{
			name:            "feature with few downstream is gated",
			artifactType:    "feature",
			downstreamCount: 2,
			want:            AuthorityGated,
		},
		{
			name:            "feature with many downstream is escalated",
			artifactType:    "feature",
			downstreamCount: 5,
			want:            AuthorityEscalated,
		},
		{
			name:            "never autonomous without semantic",
			artifactType:    "feature",
			downstreamCount: 0,
			want:            AuthorityGated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ClassifyAuthorityStructural(tt.artifactType, tt.downstreamCount)
			if got != tt.want {
				t.Errorf("ClassifyAuthorityStructural(%s, %d) = %s, want %s",
					tt.artifactType, tt.downstreamCount, got, tt.want)
			}
		})
	}
}
