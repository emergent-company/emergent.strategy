package checks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestYamlPathTracker verifies that the YAML path tracker correctly follows indentation.
func TestYamlPathTracker(t *testing.T) {
	tests := []struct {
		name     string
		lines    []string
		expected []string // expected path after processing each line
	}{
		{
			name: "simple nested keys",
			lines: []string{
				"north_star:",
				"  purpose:",
				"    statement: TBD",
			},
			expected: []string{
				"north_star",
				"north_star.purpose",
				"north_star.purpose.statement",
			},
		},
		{
			name: "sibling keys at same level",
			lines: []string{
				"meta:",
				"  version: 1.0",
				"  name: test",
				"north_star:",
				"  mission: TBD",
			},
			expected: []string{
				"meta",
				"meta.version",
				"meta.name",
				"north_star",
				"north_star.mission",
			},
		},
		{
			name: "list items with keys",
			lines: []string{
				"personas:",
				"  - id: p-1",
				"    name: User",
			},
			expected: []string{
				"personas",
				"personas.id",
				"personas.name",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tracker := &yamlPathTracker{}
			for i, line := range tt.lines {
				tracker.update(line)
				got := tracker.path()
				if got != tt.expected[i] {
					t.Errorf("after line %d (%q): got path %q, want %q", i, line, got, tt.expected[i])
				}
			}
		})
	}
}

// TestContentReadinessFieldPath verifies that PlaceholderMatch includes field_path.
func TestContentReadinessFieldPath(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a YAML file with a TBD inside a nested field
	content := `north_star:
  purpose:
    statement: TBD
  mission:
    what_we_do: "Build stuff"
  values:
    - name: TODO
`
	os.WriteFile(filepath.Join(tmpDir, "north_star.yaml"), []byte(content), 0644)

	checker := NewContentReadinessChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check failed: %v", err)
	}

	if len(result.Placeholders) < 2 {
		t.Fatalf("Expected at least 2 placeholders, got %d", len(result.Placeholders))
	}

	// Check that field paths are populated
	foundPurpose := false
	foundValues := false
	for _, p := range result.Placeholders {
		if strings.Contains(p.FieldPath, "purpose.statement") {
			foundPurpose = true
		}
		if strings.Contains(p.FieldPath, "values.name") {
			foundValues = true
		}
	}
	if !foundPurpose {
		t.Errorf("Expected a placeholder with field_path containing 'purpose.statement', got: %+v", result.Placeholders)
	}
	if !foundValues {
		t.Errorf("Expected a placeholder with field_path containing 'values.name', got: %+v", result.Placeholders)
	}
}

// TestFeatureQualityScoreImpact verifies that quality issues include score_impact annotations.
func TestFeatureQualityScoreImpact(t *testing.T) {
	tmpDir := t.TempDir()
	fdDir := filepath.Join(tmpDir, "FIRE", "feature_definitions")
	os.MkdirAll(fdDir, 0755)

	// Create a minimal feature missing personas — should trigger critical issue
	content := `id: "fd-001"
name: "Test Feature"
slug: "test-feature"
status: "draft"
definition:
  job_to_be_done: "When I need to test, I want to test, so I can verify."
  solution_approach: "We build tests."
`
	os.WriteFile(filepath.Join(fdDir, "fd-001.yaml"), []byte(content), 0644)

	checker := NewFeatureQualityChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check failed: %v", err)
	}

	if len(result.Results) == 0 {
		t.Fatal("Expected at least 1 feature result")
	}

	fr := result.Results[0]

	// Should have critical issues for missing personas
	hasScoreImpact := false
	hasImprovementAction := false
	for _, issue := range fr.Issues {
		if issue.ScoreImpact != 0 {
			hasScoreImpact = true
		}
		if issue.ImprovementAction != "" {
			hasImprovementAction = true
		}
	}

	if !hasScoreImpact {
		t.Error("Expected at least one issue with non-zero score_impact")
	}
	if !hasImprovementAction {
		t.Error("Expected at least one issue with non-empty improvement_action")
	}

	// Check that critical issue has -20 impact
	for _, issue := range fr.Issues {
		if issue.Severity == SeverityCritical && issue.ScoreImpact != -20 {
			t.Errorf("Critical issue has score_impact=%d, want -20", issue.ScoreImpact)
		}
		if issue.Severity == SeverityError && issue.ScoreImpact != -10 {
			t.Errorf("Error issue has score_impact=%d, want -10", issue.ScoreImpact)
		}
		if issue.Severity == SeverityWarning && issue.ScoreImpact != -5 {
			t.Errorf("Warning issue has score_impact=%d, want -5", issue.ScoreImpact)
		}
	}
}

// TestImprovementActionFor verifies improvement action suggestions.
func TestImprovementActionFor(t *testing.T) {
	tests := []struct {
		field    string
		severity Severity
		message  string
		wantNon  bool // should return non-empty
	}{
		{"definition", SeverityCritical, "Missing 'definition' block", true},
		{"definition.personas", SeverityCritical, "Missing 'personas' array", true},
		{"scenarios", SeverityWarning, "No scenarios defined", true},
		{"contexts", SeverityWarning, "No contexts defined", true},
		{"strategic_context.contributes_to", SeverityWarning, "Missing contributes_to", true},
		{"other_field", SeverityCritical, "something broke", true},
	}

	for _, tt := range tests {
		action := improvementActionFor(tt.field, tt.severity, tt.message)
		if tt.wantNon && action == "" {
			t.Errorf("improvementActionFor(%q, %q, %q) returned empty, wanted non-empty", tt.field, tt.severity, tt.message)
		}
	}
}
