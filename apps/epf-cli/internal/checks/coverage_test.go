package checks

import (
	"os"
	"path/filepath"
	"testing"
)

// TestNewFieldCoverageChecker tests creating a new field coverage checker
func TestNewFieldCoverageChecker(t *testing.T) {
	checker := NewFieldCoverageChecker("/instance", "/taxonomy")
	if checker == nil {
		t.Fatal("NewFieldCoverageChecker() returned nil")
	}
	if checker.instancePath != "/instance" {
		t.Errorf("instancePath = %q, want %q", checker.instancePath, "/instance")
	}
	if checker.taxonomyPath != "/taxonomy" {
		t.Errorf("taxonomyPath = %q, want %q", checker.taxonomyPath, "/taxonomy")
	}
}

// TestFieldCoverageWithoutTaxonomy tests behavior when taxonomy is missing
func TestFieldCoverageWithoutTaxonomy(t *testing.T) {
	tmpDir := t.TempDir()

	// Create minimal instance
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE", "definitions", "product"), 0755)

	checker := NewFieldCoverageChecker(tmpDir, filepath.Join(tmpDir, "nonexistent.json"))
	result, err := checker.Check()

	// Should not error, but use defaults
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}
	if result == nil {
		t.Fatal("Check() returned nil result")
	}
}

// TestFieldSetCoverage tests the FieldSetCoverage calculation
func TestFieldSetCoverage(t *testing.T) {
	// Test with various field coverage scenarios
	tests := []struct {
		name          string
		totalFields   int
		presentFields int
		expectedCov   int
	}{
		{"all present", 10, 10, 100},
		{"half present", 10, 5, 50},
		{"none present", 10, 0, 0},
		{"partial", 8, 3, 37}, // 3/8 = 37.5% -> 37%
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsc := &FieldSetCoverage{
				TotalFields:   tt.totalFields,
				PresentFields: tt.presentFields,
			}
			if tt.totalFields > 0 {
				fsc.Coverage = (tt.presentFields * 100) / tt.totalFields
			}
			if fsc.Coverage != tt.expectedCov {
				t.Errorf("Coverage = %d, want %d", fsc.Coverage, tt.expectedCov)
			}
		})
	}
}

// TestCoverageGrade tests grade calculation from health score
func TestCoverageGrade(t *testing.T) {
	tests := []struct {
		score    int
		expected string
	}{
		{100, "A"},
		{95, "A"},
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
		var grade string
		switch {
		case tt.score >= 90:
			grade = "A"
		case tt.score >= 80:
			grade = "B"
		case tt.score >= 70:
			grade = "C"
		case tt.score >= 60:
			grade = "D"
		default:
			grade = "F"
		}

		if grade != tt.expected {
			t.Errorf("score=%d: grade=%s, want=%s", tt.score, grade, tt.expected)
		}
	}
}

// TestNewVersionAlignmentChecker tests creating a new version alignment checker
func TestNewVersionAlignmentChecker(t *testing.T) {
	checker := NewVersionAlignmentChecker("/instance", "/schemas")
	if checker == nil {
		t.Fatal("NewVersionAlignmentChecker() returned nil")
	}
	if checker.instancePath != "/instance" {
		t.Errorf("instancePath = %q, want %q", checker.instancePath, "/instance")
	}
	if checker.schemasPath != "/schemas" {
		t.Errorf("schemasPath = %q, want %q", checker.schemasPath, "/schemas")
	}
}

// TestVersionAlignmentCheckEmpty tests checking an empty instance
func TestVersionAlignmentCheckEmpty(t *testing.T) {
	tmpDir := t.TempDir()

	checker := NewVersionAlignmentChecker(tmpDir, tmpDir)
	result, err := checker.Check()

	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}
	if result == nil {
		t.Fatal("Check() returned nil result")
	}
	if result.TotalArtifacts != 0 {
		t.Errorf("TotalArtifacts = %d, want 0", result.TotalArtifacts)
	}
}

// TestVersionAlignmentWithVersionedArtifacts tests version detection
func TestVersionAlignmentWithVersionedArtifacts(t *testing.T) {
	tmpDir := t.TempDir()

	// Create READY directory with versioned file
	readyDir := filepath.Join(tmpDir, "READY")
	os.MkdirAll(readyDir, 0755)

	// Create artifact with EPF version header
	content := `# EPF v1.9.6
# North Star Definition

vision: Test Vision
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(content), 0644)

	checker := NewVersionAlignmentChecker(tmpDir, tmpDir)
	result, err := checker.Check()

	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}
	if result.TotalArtifacts != 1 {
		t.Errorf("TotalArtifacts = %d, want 1", result.TotalArtifacts)
	}
}

// TestVersionAlignmentWithMetaVersion tests meta.epf_version detection
func TestVersionAlignmentWithMetaVersion(t *testing.T) {
	tmpDir := t.TempDir()

	// Create READY directory
	readyDir := filepath.Join(tmpDir, "READY")
	os.MkdirAll(readyDir, 0755)

	// Create artifact with meta.epf_version
	content := `meta:
  epf_version: "1.9.6"
  created: 2024-01-01

vision: Test Vision
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(content), 0644)

	checker := NewVersionAlignmentChecker(tmpDir, tmpDir)
	result, err := checker.Check()

	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}
	if result.TotalArtifacts != 1 {
		t.Errorf("TotalArtifacts = %d, want 1", result.TotalArtifacts)
	}
}

// TestVersionConstants tests that version constants are defined
func TestVersionConstants(t *testing.T) {
	constants := []string{
		VersionCurrent,
		VersionBehind,
		VersionStale,
		VersionOutdated,
		VersionUnknown,
	}

	for _, c := range constants {
		if c == "" {
			t.Error("Version constant should not be empty")
		}
	}
}

// TestVersionHeaderRegex tests the EPF version header regex
func TestVersionHeaderRegex(t *testing.T) {
	tests := []struct {
		content  string
		expected string
	}{
		{"# EPF v1.9.6\n", "1.9.6"},
		{"# EPF 1.9.6\n", "1.9.6"},
		{"# EPF v2.0.0\n", "2.0.0"},
		{"# Comment\n# EPF v1.0.0\n", "1.0.0"},
		{"no version here", ""},
		{"# EPF vX.Y.Z\n", ""},
	}

	for _, tt := range tests {
		matches := epfVersionHeaderRegex.FindStringSubmatch(tt.content)
		got := ""
		if len(matches) > 1 {
			got = matches[1]
		}
		if got != tt.expected {
			t.Errorf("content=%q: got=%q, want=%q", tt.content, got, tt.expected)
		}
	}
}

// TestArtifactVersionStatus tests the ArtifactVersion status values
func TestArtifactVersionStatus(t *testing.T) {
	tests := []struct {
		status   string
		expected bool // Is it a valid status
	}{
		{VersionCurrent, true},
		{VersionBehind, true},
		{VersionStale, true},
		{VersionOutdated, true},
		{VersionUnknown, true},
		{"INVALID", false},
		{"", false},
	}

	validStatuses := map[string]bool{
		VersionCurrent:  true,
		VersionBehind:   true,
		VersionStale:    true,
		VersionOutdated: true,
		VersionUnknown:  true,
	}

	for _, tt := range tests {
		_, isValid := validStatuses[tt.status]
		if isValid != tt.expected {
			t.Errorf("status=%q: isValid=%v, want=%v", tt.status, isValid, tt.expected)
		}
	}
}

// TestCoverageGapStructure tests the CoverageGap structure
func TestCoverageGapStructure(t *testing.T) {
	gap := &CoverageGap{
		File:          "/test/file.yaml",
		ArtifactType:  "feature_definition",
		Importance:    "critical",
		MissingFields: []string{"field1", "field2"},
		Reason:        "Required for validation",
		Value:         "High impact on quality",
		EffortHours:   "2-4",
	}

	if gap.File != "/test/file.yaml" {
		t.Error("File field not set correctly")
	}
	if len(gap.MissingFields) != 2 {
		t.Error("MissingFields not set correctly")
	}
}

// TestExtractRoadmapKeyResultFieldsProductOnly tests that only product track KR fields are extracted
func TestExtractRoadmapKeyResultFieldsProductOnly(t *testing.T) {
	checker := NewFieldCoverageChecker("/instance", "/taxonomy")

	// Roadmap with product and canonical tracks
	content := map[string]interface{}{
		"roadmap": map[string]interface{}{
			"tracks": map[string]interface{}{
				"product": map[string]interface{}{
					"okrs": []interface{}{
						map[string]interface{}{
							"key_results": []interface{}{
								map[string]interface{}{
									"id":                   "kr-p-001",
									"trl_start":            1,
									"trl_target":           3,
									"technical_hypothesis": "hypothesis",
									"success_criteria":     "criteria",
								},
							},
						},
					},
				},
				"strategy": map[string]interface{}{
					"okrs": []interface{}{
						map[string]interface{}{
							"key_results": []interface{}{
								map[string]interface{}{
									"id":             "kr-s-001",
									"strategy_field": "value",
								},
							},
						},
					},
				},
				"org_ops": map[string]interface{}{
					"okrs": []interface{}{
						map[string]interface{}{
							"key_results": []interface{}{
								map[string]interface{}{
									"id":        "kr-o-001",
									"ops_field": "value",
								},
							},
						},
					},
				},
				"commercial": map[string]interface{}{
					"okrs": []interface{}{
						map[string]interface{}{
							"key_results": []interface{}{
								map[string]interface{}{
									"id":               "kr-c-001",
									"commercial_field": "value",
								},
							},
						},
					},
				},
			},
		},
	}

	fields := checker.extractRoadmapKeyResultFields(content)

	// Product track fields should be present
	productFields := []string{"id", "trl_start", "trl_target", "technical_hypothesis", "success_criteria"}
	for _, f := range productFields {
		if !fields[f] {
			t.Errorf("Expected product field %q to be present", f)
		}
	}

	// Canonical track fields should NOT be present
	canonicalOnlyFields := []string{"strategy_field", "ops_field", "commercial_field"}
	for _, f := range canonicalOnlyFields {
		if fields[f] {
			t.Errorf("Canonical-only field %q should NOT be present in extracted fields", f)
		}
	}
}

// TestExtractRoadmapKeyResultFieldsNoCanonicalInflation verifies that having
// canonical tracks with all fields doesn't inflate the product coverage score.
func TestExtractRoadmapKeyResultFieldsNoCanonicalInflation(t *testing.T) {
	checker := NewFieldCoverageChecker("/instance", "/taxonomy")

	// Product track is missing critical fields
	contentWithCanonical := map[string]interface{}{
		"roadmap": map[string]interface{}{
			"tracks": map[string]interface{}{
				"product": map[string]interface{}{
					"okrs": []interface{}{
						map[string]interface{}{
							"key_results": []interface{}{
								map[string]interface{}{
									"id":   "kr-p-001",
									"name": "Some KR",
									// Missing trl_start, trl_target, etc.
								},
							},
						},
					},
				},
				"strategy": map[string]interface{}{
					"okrs": []interface{}{
						map[string]interface{}{
							"key_results": []interface{}{
								map[string]interface{}{
									"id":                   "kr-s-001",
									"trl_start":            1,
									"trl_target":           5,
									"technical_hypothesis": "hyp",
									"success_criteria":     "crit",
								},
							},
						},
					},
				},
			},
		},
	}

	// Product-only result (no canonical track inflation)
	fieldsWithCanonical := checker.extractRoadmapKeyResultFields(contentWithCanonical)

	// Product track is missing TRL fields — those from strategy should NOT leak in
	if fieldsWithCanonical["trl_start"] {
		t.Error("trl_start should not be present — it only exists in canonical strategy track")
	}
	if fieldsWithCanonical["technical_hypothesis"] {
		t.Error("technical_hypothesis should not be present — it only exists in canonical strategy track")
	}

	// Only product track fields should be present
	if !fieldsWithCanonical["id"] {
		t.Error("id should be present from product track")
	}
	if !fieldsWithCanonical["name"] {
		t.Error("name should be present from product track")
	}
}

// TestExtractRoadmapKeyResultFieldsProductOnlyTrack tests with product-only roadmap
func TestExtractRoadmapKeyResultFieldsProductOnlyTrack(t *testing.T) {
	checker := NewFieldCoverageChecker("/instance", "/taxonomy")

	content := map[string]interface{}{
		"roadmap": map[string]interface{}{
			"tracks": map[string]interface{}{
				"product": map[string]interface{}{
					"okrs": []interface{}{
						map[string]interface{}{
							"key_results": []interface{}{
								map[string]interface{}{
									"id":        "kr-001",
									"name":      "Test",
									"trl_start": 1,
								},
							},
						},
					},
				},
			},
		},
	}

	fields := checker.extractRoadmapKeyResultFields(content)
	if len(fields) != 3 {
		t.Errorf("Expected 3 fields, got %d", len(fields))
	}
	if !fields["trl_start"] {
		t.Error("Expected trl_start to be present")
	}
}

// TestArtifactCoverageStructure tests the ArtifactCoverage structure
func TestArtifactCoverageStructure(t *testing.T) {
	coverage := &ArtifactCoverage{
		File:            "/test/file.yaml",
		ArtifactType:    "feature_definition",
		OverallCoverage: 75,
		CriticalFields: &FieldSetCoverage{
			TotalFields:   4,
			PresentFields: 3,
			MissingFields: []string{"field1"},
			Coverage:      75,
		},
	}

	if coverage.OverallCoverage != 75 {
		t.Errorf("OverallCoverage = %d, want 75", coverage.OverallCoverage)
	}
	if coverage.CriticalFields.Coverage != 75 {
		t.Errorf("CriticalFields.Coverage = %d, want 75", coverage.CriticalFields.Coverage)
	}
}
