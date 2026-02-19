package checks

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCheckSummary tests the CheckSummary type
func TestCheckSummary(t *testing.T) {
	summary := NewCheckSummary()

	if summary == nil {
		t.Fatal("NewCheckSummary() returned nil")
	}
	if len(summary.Results) != 0 {
		t.Error("NewCheckSummary() should start with empty results")
	}

	// Add a passing result
	summary.Add(&CheckResult{
		Check:    "test1",
		Passed:   true,
		Severity: SeverityInfo,
		Message:  "Test passed",
	})

	if summary.TotalChecks != 1 {
		t.Errorf("TotalChecks = %d, want 1", summary.TotalChecks)
	}
	if summary.Passed != 1 {
		t.Errorf("Passed = %d, want 1", summary.Passed)
	}

	// Add a failing error result
	summary.Add(&CheckResult{
		Check:    "test2",
		Passed:   false,
		Severity: SeverityError,
		Message:  "Test failed",
	})

	if summary.TotalChecks != 2 {
		t.Errorf("TotalChecks = %d, want 2", summary.TotalChecks)
	}
	if summary.Failed != 1 {
		t.Errorf("Failed = %d, want 1", summary.Failed)
	}
	if summary.Errors != 1 {
		t.Errorf("Errors = %d, want 1", summary.Errors)
	}

	// Add a critical result
	summary.Add(&CheckResult{
		Check:    "test3",
		Passed:   false,
		Severity: SeverityCritical,
		Message:  "Critical failure",
	})

	if summary.Critical != 1 {
		t.Errorf("Critical = %d, want 1", summary.Critical)
	}

	// Test HasCritical and HasErrors
	if !summary.HasCritical() {
		t.Error("HasCritical() should return true")
	}
	if !summary.HasErrors() {
		t.Error("HasErrors() should return true")
	}
}

// TestCheckSummaryNoErrors tests summary without errors
func TestCheckSummaryNoErrors(t *testing.T) {
	summary := NewCheckSummary()

	summary.Add(&CheckResult{
		Check:    "test1",
		Passed:   true,
		Severity: SeverityInfo,
	})
	summary.Add(&CheckResult{
		Check:    "test2",
		Passed:   false,
		Severity: SeverityWarning,
	})

	if summary.HasCritical() {
		t.Error("HasCritical() should return false")
	}
	if summary.HasErrors() {
		t.Error("HasErrors() should return false")
	}
}

// TestInstanceChecker tests the instance structure checker
func TestInstanceChecker(t *testing.T) {
	// Create a temporary instance directory
	tmpDir := t.TempDir()

	// Test with nonexistent path
	checker := NewInstanceChecker(filepath.Join(tmpDir, "nonexistent"))
	summary := checker.Check()

	if summary.Critical != 1 {
		t.Error("Check() on nonexistent path should have critical error")
	}

	// Create a phased structure
	phasedDir := filepath.Join(tmpDir, "phased")
	os.MkdirAll(filepath.Join(phasedDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(phasedDir, "FIRE", "feature_definitions"), 0755)
	os.MkdirAll(filepath.Join(phasedDir, "FIRE", "value_models"), 0755)
	os.MkdirAll(filepath.Join(phasedDir, "AIM"), 0755)

	// Create required READY files
	for _, file := range RequiredREADYFiles {
		os.WriteFile(filepath.Join(phasedDir, "READY", file), []byte("test: true"), 0644)
	}

	checker = NewInstanceChecker(phasedDir)
	summary = checker.Check()

	if summary.HasCritical() {
		t.Error("Check() on valid phased structure should not have critical errors")
	}
}

// TestInstanceCheckerFlat tests flat (legacy) structure detection
func TestInstanceCheckerFlat(t *testing.T) {
	tmpDir := t.TempDir()

	// Create flat structure (no READY/FIRE/AIM dirs)
	flatDir := filepath.Join(tmpDir, "flat")
	os.MkdirAll(flatDir, 0755)

	// Create READY files directly in root
	for _, file := range RequiredREADYFiles {
		os.WriteFile(filepath.Join(flatDir, file), []byte("test: true"), 0644)
	}

	checker := NewInstanceChecker(flatDir)
	summary := checker.Check()

	// Should have warning about using flat structure
	hasWarning := false
	for _, r := range summary.Results {
		if r.Check == "phase_structure" && r.Severity == SeverityWarning {
			hasWarning = true
			break
		}
	}

	if !hasWarning {
		t.Error("Check() on flat structure should warn about legacy structure")
	}
}

// TestContentReadinessChecker tests the content readiness checker
func TestContentReadinessChecker(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a YAML file with placeholder content
	yamlContent := `
name: Test Feature
description: TBD
status: TODO
placeholder: [insert here]
real_content: This is actual content
`
	os.WriteFile(filepath.Join(tmpDir, "test.yaml"), []byte(yamlContent), 0644)

	checker := NewContentReadinessChecker(tmpDir)
	result, err := checker.Check()

	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if result.FilesChecked != 1 {
		t.Errorf("FilesChecked = %d, want 1", result.FilesChecked)
	}

	if len(result.Placeholders) < 3 {
		t.Errorf("Should find at least 3 placeholders, found %d", len(result.Placeholders))
	}

	// Score should be reduced due to placeholders
	if result.Score == 100 {
		t.Error("Score should be reduced due to placeholders")
	}
}

// TestContentReadinessClean tests content without placeholders
func TestContentReadinessClean(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a clean YAML file
	yamlContent := `
name: Test Feature
description: This is a well-written description
status: active
priority: high
`
	os.WriteFile(filepath.Join(tmpDir, "clean.yaml"), []byte(yamlContent), 0644)

	checker := NewContentReadinessChecker(tmpDir)
	result, err := checker.Check()

	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if len(result.Placeholders) != 0 {
		t.Errorf("Should find 0 placeholders in clean content, found %d", len(result.Placeholders))
	}

	if result.Score != 100 {
		t.Errorf("Score = %d, want 100 for clean content", result.Score)
	}

	if result.Grade != "A" {
		t.Errorf("Grade = %s, want A for clean content", result.Grade)
	}
}

// TestContentReadinessExclusions tests that exclusion patterns work
func TestContentReadinessExclusions(t *testing.T) {
	tmpDir := t.TempDir()

	// Create content that matches exclusion patterns
	yamlContent := `
description: For example, this is how it works
html: <div>content</div>
note: See the example usage below
`
	os.WriteFile(filepath.Join(tmpDir, "excluded.yaml"), []byte(yamlContent), 0644)

	checker := NewContentReadinessChecker(tmpDir)
	result, err := checker.Check()

	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// Exclusion patterns should prevent matches
	if len(result.Placeholders) > 0 {
		t.Errorf("Exclusion patterns should work, but found %d placeholders", len(result.Placeholders))
		for _, p := range result.Placeholders {
			t.Logf("  Found: %s", p.Content)
		}
	}
}

// TestPlaceholderPatterns tests individual placeholder patterns
func TestPlaceholderPatterns(t *testing.T) {
	tests := []struct {
		content  string
		expected bool // Should match a placeholder pattern
	}{
		{"TBD", true},
		{"tbd", true},
		{"TODO: fix this", true},
		{"FIXME: broken", true},
		{"[placeholder]", true},
		{"<insert name>", true},
		{"YYYY-MM-DD", true},
		{"lorem ipsum dolor", true},
		{"your name here", true},
		{"placeholder text", true},
		{"actual content here", false},
		{"completed task", false},
		{"real description", false},
	}

	for _, tt := range tests {
		matched := false
		for _, pattern := range PlaceholderPatterns {
			if pattern.MatchString(tt.content) {
				matched = true
				break
			}
		}

		if matched != tt.expected {
			t.Errorf("Content %q: matched=%v, want=%v", tt.content, matched, tt.expected)
		}
	}
}

// TestGradeCalculation tests score to grade conversion
func TestGradeCalculation(t *testing.T) {
	tmpDir := t.TempDir()

	tests := []struct {
		placeholderCount int
		expectedGrade    string
	}{
		{0, "A"},   // 100 score
		{1, "A"},   // 95 score
		{2, "A"},   // 90 score
		{3, "B"},   // 85 score
		{4, "B"},   // 80 score
		{5, "C"},   // 75 score
		{6, "C"},   // 70 score
		{7, "D"},   // 65 score
		{8, "D"},   // 60 score
		{10, "F"},  // 50 score
		{20, "F"},  // 0 score
		{100, "F"}, // 0 score (capped)
	}

	for _, tt := range tests {
		// Create a temp directory with specific placeholder count
		testDir := filepath.Join(tmpDir, "grade_test")
		os.MkdirAll(testDir, 0755)

		content := "name: Test\n"
		for i := 0; i < tt.placeholderCount; i++ {
			content += "field" + string(rune('a'+i)) + ": TBD\n"
		}
		os.WriteFile(filepath.Join(testDir, "test.yaml"), []byte(content), 0644)

		checker := NewContentReadinessChecker(testDir)
		result, err := checker.Check()
		if err != nil {
			t.Fatalf("Check() error: %v", err)
		}

		if result.Grade != tt.expectedGrade {
			t.Errorf("placeholders=%d: Grade=%s, want=%s (score=%d)",
				tt.placeholderCount, result.Grade, tt.expectedGrade, result.Score)
		}

		os.RemoveAll(testDir)
	}
}

// TestRequiredFiles tests that required file lists are non-empty
func TestRequiredFiles(t *testing.T) {
	if len(RequiredREADYFiles) == 0 {
		t.Error("RequiredREADYFiles should not be empty")
	}
	if len(RequiredFIREDirs) == 0 {
		t.Error("RequiredFIREDirs should not be empty")
	}
}

// TestTrackCompleteness_AllTracks tests that all 4 tracks produce a passing check
func TestTrackCompleteness_AllTracks(t *testing.T) {
	tmpDir := t.TempDir()

	// Create phased structure with value_models
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE", "feature_definitions"), 0755)
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	os.MkdirAll(vmDir, 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)

	// Create required READY files
	for _, file := range RequiredREADYFiles {
		os.WriteFile(filepath.Join(tmpDir, "READY", file), []byte("test: true"), 0644)
	}

	// Create all 4 value model files
	tracks := map[string]string{
		"product.value_model.yaml":    "track_name: Product\nlayers: []",
		"strategy.value_model.yaml":   "track_name: Strategy\nlayers: []",
		"org_ops.value_model.yaml":    "track_name: OrgOps\nlayers: []",
		"commercial.value_model.yaml": "track_name: Commercial\nlayers: []",
	}
	for filename, content := range tracks {
		os.WriteFile(filepath.Join(vmDir, filename), []byte(content), 0644)
	}

	checker := NewInstanceChecker(tmpDir)
	summary := checker.Check()

	// Find the track completeness result
	var found bool
	for _, r := range summary.Results {
		if r.Check == "value_models_track_completeness" {
			found = true
			if !r.Passed {
				t.Errorf("value_models_track_completeness should pass with all 4 tracks, message: %s", r.Message)
			}
			break
		}
	}

	if !found {
		t.Error("value_models_track_completeness check not found in results")
	}
}

// TestTrackCompleteness_MissingTracks tests that missing tracks produce a warning
func TestTrackCompleteness_MissingTracks(t *testing.T) {
	tmpDir := t.TempDir()

	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE", "feature_definitions"), 0755)
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	os.MkdirAll(vmDir, 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)

	for _, file := range RequiredREADYFiles {
		os.WriteFile(filepath.Join(tmpDir, "READY", file), []byte("test: true"), 0644)
	}

	// Only create Product value model — 3 tracks missing
	os.WriteFile(filepath.Join(vmDir, "product.value_model.yaml"),
		[]byte("track_name: Product\nlayers: []"), 0644)

	checker := NewInstanceChecker(tmpDir)
	summary := checker.Check()

	var found bool
	for _, r := range summary.Results {
		if r.Check == "value_models_track_completeness" {
			found = true
			if r.Passed {
				t.Error("value_models_track_completeness should fail with only 1 of 4 tracks")
			}
			if r.Severity != SeverityWarning {
				t.Errorf("expected SeverityWarning, got %s", r.Severity)
			}
			// Details should list the 3 missing tracks
			if len(r.Details) != 3 {
				t.Errorf("expected 3 missing tracks in Details, got %d: %v", len(r.Details), r.Details)
			}
			break
		}
	}

	if !found {
		t.Error("value_models_track_completeness check not found in results")
	}
}

// TestTrackCompleteness_NoValueModels tests with zero value model files
func TestTrackCompleteness_NoValueModels(t *testing.T) {
	tmpDir := t.TempDir()

	// Create phased structure (need READY for detection)
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)

	// Create FIRE/value_models with YAML files that have NO track_name
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	os.MkdirAll(vmDir, 0755)

	os.WriteFile(filepath.Join(vmDir, "vm-1.yaml"), []byte("layers: []\n"), 0644)

	checker := NewInstanceChecker(tmpDir)
	summary := checker.Check()

	var found bool
	for _, r := range summary.Results {
		if r.Check == "value_models_track_completeness" {
			found = true
			if r.Passed {
				t.Error("value_models_track_completeness should fail with 0 tracks")
			}
			if len(r.Details) != 4 {
				t.Errorf("expected 4 missing tracks in Details, got %d: %v", len(r.Details), r.Details)
			}
			break
		}
	}

	if !found {
		t.Error("value_models_track_completeness check not found in results")
	}
}

// =============================================================================
// Metadata Consistency Tests
// =============================================================================

func TestCheckMetadataConsistency_WrongInstance(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	os.MkdirAll(readyDir, 0755)

	content := `meta:
  instance: "WrongProduct"
  last_updated: "2026-01-01"
purpose:
  statement: "Test"
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(content), 0644)

	result := CheckMetadataConsistency(dir, "CorrectProduct", 6)

	if result.FilesChecked != 1 {
		t.Errorf("expected 1 file checked, got %d", result.FilesChecked)
	}
	if result.InstanceMismatches != 1 {
		t.Errorf("expected 1 instance mismatch, got %d", result.InstanceMismatches)
	}
	if len(result.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(result.Issues))
	}
	if result.Issues[0].IssueType != "wrong_instance" {
		t.Errorf("expected issue type 'wrong_instance', got '%s'", result.Issues[0].IssueType)
	}
}

func TestCheckMetadataConsistency_MatchingInstance(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	os.MkdirAll(readyDir, 0755)

	content := `meta:
  instance: "MyProduct"
  last_updated: "2026-01-01"
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(content), 0644)

	result := CheckMetadataConsistency(dir, "MyProduct", 6)

	if result.InstanceMismatches != 0 {
		t.Errorf("expected 0 mismatches for matching instance, got %d", result.InstanceMismatches)
	}
}

func TestCheckMetadataConsistency_StaleDate(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	os.MkdirAll(readyDir, 0755)

	content := `meta:
  instance: "MyProduct"
  last_updated: "2020-01-01"
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(content), 0644)

	result := CheckMetadataConsistency(dir, "MyProduct", 6)

	if result.StaleDates != 1 {
		t.Errorf("expected 1 stale date, got %d", result.StaleDates)
	}
	if len(result.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(result.Issues))
	}
	if result.Issues[0].IssueType != "stale_date" {
		t.Errorf("expected issue type 'stale_date', got '%s'", result.Issues[0].IssueType)
	}
}

func TestCheckMetadataConsistency_FreshDate(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	os.MkdirAll(readyDir, 0755)

	content := `meta:
  instance: "MyProduct"
  last_updated: "2026-02-15"
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(content), 0644)

	result := CheckMetadataConsistency(dir, "MyProduct", 6)

	if result.StaleDates != 0 {
		t.Errorf("expected 0 stale dates for fresh date, got %d", result.StaleDates)
	}
}

func TestCheckMetadataConsistency_MetadataKey(t *testing.T) {
	dir := t.TempDir()
	fireDir := filepath.Join(dir, "FIRE", "feature_definitions")
	os.MkdirAll(fireDir, 0755)

	content := `metadata:
  instance: "WrongName"
  last_updated: "2020-03-01"
`
	os.WriteFile(filepath.Join(fireDir, "fd-001.yaml"), []byte(content), 0644)

	result := CheckMetadataConsistency(dir, "RightName", 6)

	if result.InstanceMismatches != 1 {
		t.Errorf("expected 1 instance mismatch with 'metadata' key, got %d", result.InstanceMismatches)
	}
	if result.StaleDates != 1 {
		t.Errorf("expected 1 stale date with 'metadata' key, got %d", result.StaleDates)
	}
}

func TestCheckMetadataConsistency_NoMetaBlock(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	os.MkdirAll(readyDir, 0755)

	content := `purpose:
  statement: "Test"
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(content), 0644)

	result := CheckMetadataConsistency(dir, "MyProduct", 6)

	if result.FilesChecked != 1 {
		t.Errorf("expected 1 file checked, got %d", result.FilesChecked)
	}
	if len(result.Issues) != 0 {
		t.Errorf("expected 0 issues for file with no meta block, got %d", len(result.Issues))
	}
}

func TestCheckMetadataConsistency_SkipsUnderscoreFiles(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	os.MkdirAll(readyDir, 0755)

	content := `meta:
  instance: "WrongProduct"
`
	os.WriteFile(filepath.Join(readyDir, "_meta.yaml"), []byte(content), 0644)

	result := CheckMetadataConsistency(dir, "CorrectProduct", 6)

	if result.FilesChecked != 0 {
		t.Errorf("expected 0 files checked (underscore files skipped), got %d", result.FilesChecked)
	}
}

// =============================================================================
// Canonical Artifact Content Readiness Tests
// =============================================================================

// TestContentReadinessCanonicalExclusion verifies canonical artifacts don't affect scoring
func TestContentReadinessCanonicalExclusion(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a canonical definition file (sd-* prefix = strategy = canonical)
	defDir := filepath.Join(tmpDir, "READY", "definitions", "strategy")
	os.MkdirAll(defDir, 0755)
	canonicalContent := `id: sd-001
name: Strategic Planning
description: TBD
active: false
status: TODO
`
	os.WriteFile(filepath.Join(defDir, "sd-001.yaml"), []byte(canonicalContent), 0644)

	// Create a product feature file (fd-* prefix = product = not canonical)
	fdDir := filepath.Join(tmpDir, "FIRE", "feature_definitions")
	os.MkdirAll(fdDir, 0755)
	productContent := `id: fd-001
name: My Feature
description: This is a real feature
`
	os.WriteFile(filepath.Join(fdDir, "fd-001.yaml"), []byte(productContent), 0644)

	checker := NewContentReadinessChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// The canonical file has TBD and TODO, but they should NOT be in Placeholders
	if len(result.Placeholders) > 0 {
		t.Errorf("Expected 0 product placeholders, got %d: %v", len(result.Placeholders), result.Placeholders)
	}

	// They SHOULD be in CanonicalPlaceholders
	if len(result.CanonicalPlaceholders) < 2 {
		t.Errorf("Expected at least 2 canonical placeholders (TBD, TODO), got %d", len(result.CanonicalPlaceholders))
	}

	// Score should be 100 since canonical placeholders are excluded
	if result.Score != 100 {
		t.Errorf("Score = %d, want 100 (canonical placeholders should be excluded)", result.Score)
	}

	// CanonicalFiles should be 1
	if result.CanonicalFiles != 1 {
		t.Errorf("CanonicalFiles = %d, want 1", result.CanonicalFiles)
	}
}

// TestContentReadinessCanonicalAndProductMixed tests mixed canonical + product placeholders
func TestContentReadinessCanonicalAndProductMixed(t *testing.T) {
	tmpDir := t.TempDir()

	// Create canonical file with placeholders
	defDir := filepath.Join(tmpDir, "READY", "definitions", "commercial")
	os.MkdirAll(defDir, 0755)
	os.WriteFile(filepath.Join(defDir, "cd-001.yaml"), []byte("name: TBD\nstatus: TODO\n"), 0644)

	// Create product file WITH placeholders
	os.WriteFile(filepath.Join(tmpDir, "product.yaml"), []byte("name: TBD\nstatus: TODO\n"), 0644)

	checker := NewContentReadinessChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// Product file should have 2 placeholders in Placeholders
	if len(result.Placeholders) != 2 {
		t.Errorf("Expected 2 product placeholders, got %d", len(result.Placeholders))
	}

	// Canonical file should have 2 placeholders in CanonicalPlaceholders
	if len(result.CanonicalPlaceholders) != 2 {
		t.Errorf("Expected 2 canonical placeholders, got %d", len(result.CanonicalPlaceholders))
	}

	// Score should only reflect the 2 product placeholders (100 - 2*5 = 90)
	if result.Score != 90 {
		t.Errorf("Score = %d, want 90 (only product placeholders should count)", result.Score)
	}
}

// TestContentReadinessOrgOpsCanonical tests org_ops definition detection
func TestContentReadinessOrgOpsCanonical(t *testing.T) {
	tmpDir := t.TempDir()

	// Create org_ops canonical definition (pd-* prefix)
	defDir := filepath.Join(tmpDir, "READY", "definitions", "org_ops")
	os.MkdirAll(defDir, 0755)
	os.WriteFile(filepath.Join(defDir, "pd-010.yaml"), []byte("name: TBD\ndescription: TODO\n"), 0644)

	checker := NewContentReadinessChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if result.CanonicalFiles != 1 {
		t.Errorf("CanonicalFiles = %d, want 1 for pd-* file", result.CanonicalFiles)
	}
	if len(result.Placeholders) != 0 {
		t.Errorf("Product placeholders = %d, want 0 (pd-* should be canonical)", len(result.Placeholders))
	}
	if result.Score != 100 {
		t.Errorf("Score = %d, want 100", result.Score)
	}
}

func TestExtractMetadataDate_Formats(t *testing.T) {
	tests := []struct {
		name  string
		input interface{}
		empty bool
	}{
		{"ISO date", "2024-06-15", false},
		{"RFC3339", "2024-06-15T10:30:00Z", false},
		{"invalid string", "not-a-date", true},
		{"nil", nil, true},
		{"integer", 12345, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractMetadataDate(tt.input)
			if tt.empty && !result.IsZero() {
				t.Errorf("expected zero time for input %v, got %v", tt.input, result)
			}
			if !tt.empty && result.IsZero() {
				t.Errorf("expected non-zero time for input %v", tt.input)
			}
		})
	}
}
