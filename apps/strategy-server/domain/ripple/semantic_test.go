package ripple

import (
	"encoding/json"
	"testing"
)

func TestExtractSearchableText(t *testing.T) {
	payload := json.RawMessage(`{
		"name": "User Authentication",
		"id": "fd-001",
		"definition": {
			"job_to_be_done": "When I need to access the platform securely, I want to authenticate with my credentials, so I can reach my workspace safely.",
			"solution_approach": "Multi-factor authentication with SSO support"
		},
		"personas": [
			{"name": "Enterprise Admin", "current_situation": "Managing dozens of user accounts across multiple tools with inconsistent security policies."}
		]
	}`)

	text := extractSearchableText(payload)
	if text == "" {
		t.Fatal("expected non-empty text")
	}
	if len(text) < 100 {
		t.Errorf("text too short (%d chars) — expected substantial extraction", len(text))
	}
	t.Logf("extracted %d chars: %.100s...", len(text), text)
}

func TestExtractSearchableText_Empty(t *testing.T) {
	text := extractSearchableText(json.RawMessage(`{}`))
	if text != "" {
		t.Errorf("expected empty text for empty payload, got %q", text)
	}
}

func TestExtractSearchableText_Invalid(t *testing.T) {
	text := extractSearchableText(json.RawMessage(`not json`))
	if text != "" {
		t.Errorf("expected empty text for invalid JSON, got %q", text)
	}
}

func TestTextSimilarityRatio_Identical(t *testing.T) {
	ratio := textSimilarityRatio("hello world foo bar", "hello world foo bar")
	if ratio != 1.0 {
		t.Errorf("identical text: ratio=%f, want 1.0", ratio)
	}
}

func TestTextSimilarityRatio_Completely_Different(t *testing.T) {
	ratio := textSimilarityRatio("alpha beta gamma", "delta epsilon zeta")
	if ratio != 0.0 {
		t.Errorf("completely different: ratio=%f, want 0.0", ratio)
	}
}

func TestTextSimilarityRatio_Partial(t *testing.T) {
	ratio := textSimilarityRatio(
		"enterprise data governance platform for regulated industries",
		"enterprise data analytics platform for small businesses",
	)
	// Should be moderate — shares "enterprise", "data", "platform", "for"
	if ratio < 0.3 || ratio > 0.8 {
		t.Errorf("partial overlap: ratio=%f, expected 0.3-0.8", ratio)
	}
	t.Logf("partial overlap ratio: %f", ratio)
}

func TestTextSimilarityRatio_Empty(t *testing.T) {
	ratio := textSimilarityRatio("", "something")
	if ratio != 0.0 {
		t.Errorf("one empty: ratio=%f, want 0.0", ratio)
	}
}

func TestTruncateForSearch(t *testing.T) {
	short := "hello"
	if got := truncateForSearch(short, 100); got != short {
		t.Errorf("short text: got %q, want %q", got, short)
	}

	long := "a very long string that exceeds the limit"
	got := truncateForSearch(long, 10)
	if len(got) != 10 {
		t.Errorf("long text: got len %d, want 10", len(got))
	}
}

func TestClassifyChangeResult_FromRatio(t *testing.T) {
	tests := []struct {
		name    string
		old     string
		new     string
		wantMin SemanticChangeClass
	}{
		{
			name:    "identical",
			old:     "enterprise data governance platform",
			new:     "enterprise data governance platform",
			wantMin: ChangeClassTrivial,
		},
		{
			name:    "typo fix",
			old:     "enterprise data governace platform for regulated industries with compliance requirements",
			new:     "enterprise data governance platform for regulated industries with compliance requirements",
			wantMin: ChangeClassTrivial,
		},
		{
			name:    "major pivot",
			old:     "democratize data analytics for everyone regardless of technical expertise",
			new:     "enterprise compliance and regulatory governance for financial institutions",
			wantMin: ChangeClassSignificant,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ratio := textSimilarityRatio(tt.old, tt.new)
			var class SemanticChangeClass
			switch {
			case ratio > 0.95:
				class = ChangeClassTrivial
			case ratio > 0.80:
				class = ChangeClassMinor
			case ratio > 0.60:
				class = ChangeClassSignificant
			default:
				class = ChangeClassMajor
			}
			t.Logf("%s: ratio=%f class=%s", tt.name, ratio, class)

			// For "identical", must be trivial.
			if tt.name == "identical" && class != ChangeClassTrivial {
				t.Errorf("identical text should be trivial, got %s", class)
			}
			// For "major pivot", must be at least significant.
			if tt.name == "major pivot" && class != ChangeClassSignificant && class != ChangeClassMajor {
				t.Errorf("major pivot should be significant or major, got %s (ratio=%f)", class, ratio)
			}
		})
	}
}

func TestGenerateSignalsFromRipple_WithOrphansAndAssumptions(t *testing.T) {
	instanceID := [16]byte{1}
	report := &StructuralRippleReport{
		ChangedKey:  "north_star",
		ChangedType: "north_star",
		AffectedArtifacts: []AffectedArtifact{
			{ArtifactKey: "fd-001", Direction: "downstream", StaleDays: 45, Relationship: "contributes_to"},
			{ArtifactKey: "fd-002", Direction: "downstream", StaleDays: 5, Relationship: "contributes_to"},
			{ArtifactKey: "vm-product", Direction: "upstream", StaleDays: 0, Relationship: "contributes_to"},
		},
		OrphanedPaths: []OrphanedPath{
			{ValuePath: "vm-product/analytics", ArtifactKey: "vm-product", ArtifactType: "value_model"},
		},
		UntestedAssumptions: []UntestedAssumption{
			{AssumptionKey: "assumption-market-fit"},
		},
	}

	signals := GenerateSignalsFromRipple(instanceID, report)

	// fd-001 (45 days stale) → critical propagation signal
	// fd-002 (5 days stale) → info propagation signal
	// vm-product (upstream) → no signal
	// orphan → warning orphan signal
	// untested → warning staleness signal
	if len(signals) != 4 {
		t.Fatalf("got %d signals, want 4", len(signals))
	}

	// Check severities.
	severities := make(map[string]int)
	for _, s := range signals {
		severities[s.Severity]++
	}
	if severities["critical"] != 1 {
		t.Errorf("critical=%d, want 1 (fd-001 at 45 days)", severities["critical"])
	}
	if severities["warning"] != 2 {
		t.Errorf("warning=%d, want 2 (orphan + untested)", severities["warning"])
	}
	if severities["info"] != 1 {
		t.Errorf("info=%d, want 1 (fd-002 at 5 days)", severities["info"])
	}
}
