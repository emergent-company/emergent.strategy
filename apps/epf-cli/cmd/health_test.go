package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/checks"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
)

// Task 4.6: Test checkSubmoduleStatus

func TestCheckSubmoduleStatus_RegularRepo(t *testing.T) {
	// A regular directory with .git directory — not a submodule
	tmpDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tmpDir, ".git"), 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}

	instanceDir := filepath.Join(tmpDir, "docs", "epf", "_instances", "product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	result := checkSubmoduleStatus(instanceDir)
	if result.IsSubmodule {
		t.Error("Expected IsSubmodule = false for regular repo")
	}
	if result.IsUninitialized {
		t.Error("Expected IsUninitialized = false for regular repo")
	}
}

func TestCheckSubmoduleStatus_SubmoduleParent(t *testing.T) {
	// The instance is inside a directory tree where a parent has a .git file (submodule)
	tmpDir := t.TempDir()

	// Create a submodule-like structure: epf-data/.git is a file
	epfDataDir := filepath.Join(tmpDir, "epf-data")
	if err := os.MkdirAll(epfDataDir, 0755); err != nil {
		t.Fatalf("Failed to create epf-data dir: %v", err)
	}
	gitFile := filepath.Join(epfDataDir, ".git")
	if err := os.WriteFile(gitFile, []byte("gitdir: /parent/.git/modules/epf-data\n"), 0644); err != nil {
		t.Fatalf("Failed to write .git file: %v", err)
	}

	// Instance is nested inside the submodule
	instanceDir := filepath.Join(epfDataDir, "_instances", "product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	result := checkSubmoduleStatus(instanceDir)
	if !result.IsSubmodule {
		t.Error("Expected IsSubmodule = true when parent is a submodule")
	}
}

func TestCheckSubmoduleStatus_UninitializedSubmodule(t *testing.T) {
	// An empty instance directory referenced in .gitmodules
	parentDir := t.TempDir()

	// Empty instance directory
	instanceDir := filepath.Join(parentDir, "epf-instance")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	// .gitmodules references it
	gitmodulesContent := `[submodule "epf-instance"]
	path = epf-instance
	url = git@github.com:org/epf-instance.git
`
	if err := os.WriteFile(filepath.Join(parentDir, ".gitmodules"), []byte(gitmodulesContent), 0644); err != nil {
		t.Fatalf("Failed to write .gitmodules: %v", err)
	}

	result := checkSubmoduleStatus(instanceDir)
	if result.IsSubmodule {
		t.Error("Expected IsSubmodule = false for uninitialized submodule")
	}
	if !result.IsUninitialized {
		t.Error("Expected IsUninitialized = true for empty dir referenced in .gitmodules")
	}
	if result.UninitializedHint == "" {
		t.Error("Expected non-empty hint for uninitialized submodule")
	}
}

// Task 5.7: Test checkEnrollmentStatus()
// This function uses GetRepoConfig() which returns the package globals repoConfig and repoRoot.
// We set these globals directly and call checkEnrollmentStatus() with various filesystem states.

func TestCheckEnrollmentStatus_Enrolled(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()

	// Create the instance directory
	instanceDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", "product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	relPath, _ := filepath.Rel(tmpDir, instanceDir)

	// Set globals to simulate enrollment
	repoConfig = &config.RepoConfig{
		InstancePath: relPath,
		Mode:         "integrated",
		Schemas:      "embedded",
	}
	repoRoot = tmpDir
	cliConfig = &config.Config{}
	epfContext = nil

	result := checkEnrollmentStatus(instanceDir)

	if !result.Enrolled {
		t.Error("Expected Enrolled = true")
	}
	if result.ConfigSource != ".epf.yaml" {
		t.Errorf("ConfigSource = %q, want %q", result.ConfigSource, ".epf.yaml")
	}
	if result.Mode != "integrated" {
		t.Errorf("Mode = %q, want %q", result.Mode, "integrated")
	}
	if result.InstanceSource != "local" {
		t.Errorf("InstanceSource = %q, want %q", result.InstanceSource, "local")
	}
	if len(result.Warnings) > 0 {
		t.Errorf("Expected no warnings, got: %v", result.Warnings)
	}
}

func TestCheckEnrollmentStatus_NotEnrolled(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "instance")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	// No repoConfig — not enrolled
	repoConfig = nil
	repoRoot = ""
	cliConfig = &config.Config{}
	epfContext = nil

	result := checkEnrollmentStatus(instanceDir)

	if result.Enrolled {
		t.Error("Expected Enrolled = false")
	}
	if result.ConfigSource != "none" {
		t.Errorf("ConfigSource = %q, want %q", result.ConfigSource, "none")
	}
	if result.InstanceSource != "local" {
		t.Errorf("InstanceSource = %q, want %q", result.InstanceSource, "local")
	}
}

func TestCheckEnrollmentStatus_PathMismatchWarning(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()

	// Create two instance directories
	configuredDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", "product-a")
	if err := os.MkdirAll(configuredDir, 0755); err != nil {
		t.Fatalf("Failed to create configured dir: %v", err)
	}
	actualDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", "product-b")
	if err := os.MkdirAll(actualDir, 0755); err != nil {
		t.Fatalf("Failed to create actual dir: %v", err)
	}

	relConfiguredPath, _ := filepath.Rel(tmpDir, configuredDir)

	// Config points to product-a but we're checking product-b
	repoConfig = &config.RepoConfig{
		InstancePath: relConfiguredPath,
		Mode:         "integrated",
	}
	repoRoot = tmpDir
	cliConfig = &config.Config{}
	epfContext = nil

	result := checkEnrollmentStatus(actualDir)

	if !result.Enrolled {
		t.Error("Expected Enrolled = true (config exists)")
	}

	// Should have a warning about path mismatch
	hasPathWarning := false
	for _, w := range result.Warnings {
		if strings.Contains(w, ".epf.yaml points to") {
			hasPathWarning = true
			break
		}
	}
	if !hasPathWarning {
		t.Errorf("Expected path mismatch warning, got warnings: %v", result.Warnings)
	}
}

func TestCheckEnrollmentStatus_MissingInstancePathWarning(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()

	// Config points to a path that doesn't exist on disk
	repoConfig = &config.RepoConfig{
		InstancePath: "docs/EPF/_instances/nonexistent",
		Mode:         "integrated",
	}
	repoRoot = tmpDir
	cliConfig = &config.Config{}
	epfContext = nil

	// The actual instancePath we pass is also nonexistent for this test,
	// but we just need the function to run and check warnings
	instanceDir := filepath.Join(tmpDir, "some-instance")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	result := checkEnrollmentStatus(instanceDir)

	if !result.Enrolled {
		t.Error("Expected Enrolled = true (config exists)")
	}

	// Should have a warning about configured path not existing
	hasMissingWarning := false
	for _, w := range result.Warnings {
		if strings.Contains(w, "does not exist on disk") {
			hasMissingWarning = true
			break
		}
	}
	if !hasMissingWarning {
		t.Errorf("Expected 'does not exist' warning, got warnings: %v", result.Warnings)
	}
}

func TestCheckEnrollmentStatus_SubmoduleMode_NotActualSubmodule(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()

	// Create a regular directory (not a submodule — .git is a directory, not a file)
	instanceDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", "product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	relPath, _ := filepath.Rel(tmpDir, instanceDir)

	// Config says submodule mode, but it's not actually a submodule
	repoConfig = &config.RepoConfig{
		InstancePath: relPath,
		Mode:         "submodule",
	}
	repoRoot = tmpDir
	cliConfig = &config.Config{}
	epfContext = nil

	result := checkEnrollmentStatus(instanceDir)

	if !result.Enrolled {
		t.Error("Expected Enrolled = true")
	}

	// Should warn that mode=submodule but not actually a submodule
	hasSubmoduleWarning := false
	for _, w := range result.Warnings {
		if strings.Contains(w, "not inside a git submodule") {
			hasSubmoduleWarning = true
			break
		}
	}
	if !hasSubmoduleWarning {
		t.Errorf("Expected submodule mismatch warning, got warnings: %v", result.Warnings)
	}
}

func TestCheckEnrollmentStatus_SubmoduleDetected(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()

	// Create a submodule-like structure: parent/.git file (not dir)
	submoduleDir := filepath.Join(tmpDir, "epf-data")
	if err := os.MkdirAll(submoduleDir, 0755); err != nil {
		t.Fatalf("Failed to create submodule dir: %v", err)
	}
	// .git as a file = submodule
	gitFile := filepath.Join(submoduleDir, ".git")
	if err := os.WriteFile(gitFile, []byte("gitdir: /parent/.git/modules/epf-data\n"), 0644); err != nil {
		t.Fatalf("Failed to write .git file: %v", err)
	}

	// Instance nested inside the submodule
	instanceDir := filepath.Join(submoduleDir, "_instances", "product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	relPath, _ := filepath.Rel(tmpDir, instanceDir)

	repoConfig = &config.RepoConfig{
		InstancePath: relPath,
		Mode:         "submodule",
	}
	repoRoot = tmpDir
	cliConfig = &config.Config{}
	epfContext = nil

	result := checkEnrollmentStatus(instanceDir)

	if !result.Enrolled {
		t.Error("Expected Enrolled = true")
	}
	if result.InstanceSource != "submodule" {
		t.Errorf("InstanceSource = %q, want %q", result.InstanceSource, "submodule")
	}
	// No warnings expected — mode matches reality
	hasSubmoduleWarning := false
	for _, w := range result.Warnings {
		if strings.Contains(w, "not inside a git submodule") {
			hasSubmoduleWarning = true
		}
	}
	if hasSubmoduleWarning {
		t.Error("Should NOT have submodule mismatch warning when actually in a submodule")
	}
}

func TestCheckEnrollmentStatus_StandaloneMode_NotAtRoot(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()

	// Instance is in a subdirectory, but mode is standalone (mismatch)
	instanceDir := filepath.Join(tmpDir, "some", "subdir")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	repoConfig = &config.RepoConfig{
		InstancePath: "some/subdir",
		Mode:         "standalone",
	}
	repoRoot = tmpDir
	cliConfig = &config.Config{}
	epfContext = nil

	result := checkEnrollmentStatus(instanceDir)

	if !result.Enrolled {
		t.Error("Expected Enrolled = true")
	}

	// Should warn that standalone mode but instance is not at repo root
	hasStandaloneWarning := false
	for _, w := range result.Warnings {
		if strings.Contains(w, "standalone") && strings.Contains(w, "not at repo root") {
			hasStandaloneWarning = true
			break
		}
	}
	if !hasStandaloneWarning {
		t.Errorf("Expected standalone mode mismatch warning, got warnings: %v", result.Warnings)
	}
}

func TestCheckEnrollmentStatus_InstanceNotFound(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	tmpDir := t.TempDir()

	// Point to a nonexistent instance path
	instanceDir := filepath.Join(tmpDir, "nonexistent")

	repoConfig = nil
	repoRoot = ""
	cliConfig = &config.Config{}
	epfContext = nil

	result := checkEnrollmentStatus(instanceDir)

	if result.Enrolled {
		t.Error("Expected Enrolled = false")
	}
	if result.InstanceSource != "not_found" {
		t.Errorf("InstanceSource = %q, want %q", result.InstanceSource, "not_found")
	}
}

// =============================================================================
// Section 9: Semantic Quality Testing
// =============================================================================

// Task 9.1: Test semantic trigger mapping evaluates correctly for each check category

func TestEvaluateSemanticTriggers_FeatureQualityLowScore(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(),
		FeatureQuality: &checks.FeatureQualitySummary{
			TotalFeatures: 5,
			PassedCount:   3,
			FailedCount:   0,
			AverageScore:  70, // below 80 threshold
		},
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "feature_quality_review" && rec.TriggerCheck == "FeatureQuality" {
			found = true
			if rec.Severity != "warning" {
				t.Errorf("FeatureQuality trigger severity = %q, want %q", rec.Severity, "warning")
			}
			if rec.Reason == "" {
				t.Error("FeatureQuality trigger has empty reason")
			}
		}
	}
	if !found {
		t.Error("Expected feature_quality_review recommendation for low feature quality score")
	}
}

func TestEvaluateSemanticTriggers_FeatureQualityFailed(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(),
		FeatureQuality: &checks.FeatureQualitySummary{
			TotalFeatures: 5,
			PassedCount:   3,
			FailedCount:   2,
			AverageScore:  85, // above threshold but has failures
		},
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "feature_quality_review" && rec.TriggerCheck == "FeatureQuality" {
			found = true
		}
	}
	if !found {
		t.Error("Expected feature_quality_review recommendation when features have failed")
	}
}

func TestEvaluateSemanticTriggers_UncoveredL2s(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(),
		Relationships: &checks.RelationshipsResult{
			UncoveredL2s: 3,
		},
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "feature_quality_review" && rec.TriggerCheck == "Coverage" {
			found = true
			if rec.Severity != "info" {
				t.Errorf("Coverage trigger severity = %q, want %q", rec.Severity, "info")
			}
		}
	}
	if !found {
		t.Error("Expected feature_quality_review recommendation for uncovered L2 components")
	}
}

func TestEvaluateSemanticTriggers_ValueModelQuality(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(),
		ValueModelQuality: &valuemodel.QualityReport{
			OverallScore: 60, // below 80 threshold
		},
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "value_model_review" && rec.TriggerCheck == "ValueModelQuality" {
			found = true
			if rec.Severity != "warning" {
				t.Errorf("ValueModelQuality trigger severity = %q, want %q", rec.Severity, "warning")
			}
		}
	}
	if !found {
		t.Error("Expected value_model_review recommendation for low value model quality score")
	}
}

func TestEvaluateSemanticTriggers_CrossRefs(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(),
		CrossReferences: &checks.CrossReferenceResult{
			BrokenLinks: []checks.BrokenLink{
				{SourceFile: "test.yaml", TargetID: "fd-999"},
			},
		},
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "strategic_coherence_review" && rec.TriggerCheck == "CrossRefs" {
			found = true
			if rec.Severity != "warning" {
				t.Errorf("CrossRefs trigger severity = %q, want %q", rec.Severity, "warning")
			}
		}
	}
	if !found {
		t.Error("Expected strategic_coherence_review recommendation for broken cross-references")
	}
}

func TestEvaluateSemanticTriggers_InvalidRelationshipPaths(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(),
		Relationships: &checks.RelationshipsResult{
			InvalidPaths: 2,
		},
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "strategic_coherence_review" && rec.TriggerCheck == "CrossRefs" {
			found = true
		}
	}
	if !found {
		t.Error("Expected strategic_coherence_review recommendation for invalid relationship paths")
	}
}

func TestEvaluateSemanticTriggers_AIMStaleness(t *testing.T) {
	// Create a temp directory with an AIM dir but no LRA
	tmpDir := t.TempDir()
	aimDir := filepath.Join(tmpDir, "AIM")
	if err := os.MkdirAll(aimDir, 0755); err != nil {
		t.Fatalf("Failed to create AIM dir: %v", err)
	}

	result := &HealthResult{
		InstancePath: tmpDir,
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "strategic_reality_check" && rec.TriggerCheck == "AIMStaleness" {
			found = true
			if rec.Severity != "info" {
				t.Errorf("AIMStaleness trigger severity = %q, want %q", rec.Severity, "info")
			}
		}
	}
	if !found {
		t.Error("Expected strategic_reality_check recommendation when AIM exists but no LRA")
	}
}

func TestEvaluateSemanticTriggers_RoadmapCoverage_SingleTrack(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(),
		Relationships: &checks.RelationshipsResult{
			CoverageByTrack: map[string]*checks.TrackCoverage{
				"Product": {
					TrackName:       "Product",
					TotalL2:         5,
					CoveredL2:       3,
					CoveragePercent: 60,
				},
				"Strategy": {
					TrackName:       "Strategy",
					TotalL2:         4,
					CoveredL2:       0, // No coverage
					CoveragePercent: 0,
				},
			},
		},
	}

	recs := evaluateSemanticTriggers(result)

	found := false
	for _, rec := range recs {
		if rec.Wizard == "balance_checker" && rec.TriggerCheck == "RoadmapCoverage" {
			found = true
			if rec.Severity != "info" {
				t.Errorf("RoadmapCoverage trigger severity = %q, want %q", rec.Severity, "info")
			}
		}
	}
	if !found {
		t.Error("Expected balance_checker recommendation when only 1 track has coverage")
	}
}

// Task 9.2: Test health check output includes semantic_review_recommendations when triggers fire

func TestEvaluateSemanticTriggers_MultipleTriggersPopulateRecommendations(t *testing.T) {
	tmpDir := t.TempDir()
	aimDir := filepath.Join(tmpDir, "AIM")
	if err := os.MkdirAll(aimDir, 0755); err != nil {
		t.Fatalf("Failed to create AIM dir: %v", err)
	}

	result := &HealthResult{
		InstancePath: tmpDir,
		FeatureQuality: &checks.FeatureQualitySummary{
			TotalFeatures: 3,
			PassedCount:   1,
			FailedCount:   2,
			AverageScore:  50,
		},
		ValueModelQuality: &valuemodel.QualityReport{
			OverallScore: 40,
		},
	}

	recs := evaluateSemanticTriggers(result)

	if len(recs) < 2 {
		t.Errorf("Expected at least 2 recommendations, got %d", len(recs))
	}

	// Check that each recommendation has required fields
	for i, rec := range recs {
		if rec.Wizard == "" {
			t.Errorf("Recommendation[%d] has empty Wizard", i)
		}
		if rec.Reason == "" {
			t.Errorf("Recommendation[%d] has empty Reason", i)
		}
		if rec.Severity == "" {
			t.Errorf("Recommendation[%d] has empty Severity", i)
		}
		if rec.TriggerCheck == "" {
			t.Errorf("Recommendation[%d] has empty TriggerCheck", i)
		}
	}
}

// Task 9.3: Test health check output has empty semantic_review_recommendations when all checks pass

func TestEvaluateSemanticTriggers_NoTriggersWhenClean(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(), // No AIM dir, so AIM staleness won't trigger
		FeatureQuality: &checks.FeatureQualitySummary{
			TotalFeatures: 5,
			PassedCount:   5,
			FailedCount:   0,
			AverageScore:  95, // above 80 threshold
		},
		ValueModelQuality: &valuemodel.QualityReport{
			OverallScore: 90, // above 80 threshold
		},
		CrossReferences: &checks.CrossReferenceResult{
			BrokenLinks: []checks.BrokenLink{}, // no broken links
		},
		Relationships: &checks.RelationshipsResult{
			UncoveredL2s: 0,
			InvalidPaths: 0,
			CoverageByTrack: map[string]*checks.TrackCoverage{
				"Product":  {CoveredL2: 3},
				"Strategy": {CoveredL2: 2},
			},
		},
	}

	recs := evaluateSemanticTriggers(result)

	if len(recs) != 0 {
		t.Errorf("Expected 0 recommendations when all checks pass, got %d:", len(recs))
		for _, rec := range recs {
			t.Logf("  - wizard=%s trigger=%s reason=%s", rec.Wizard, rec.TriggerCheck, rec.Reason)
		}
	}
}

func TestEvaluateSemanticTriggers_NilChecksNoTriggersNoPanic(t *testing.T) {
	result := &HealthResult{
		InstancePath: t.TempDir(), // No AIM dir
		// All check results are nil - should not panic and produce no recommendations
	}

	recs := evaluateSemanticTriggers(result)

	if len(recs) != 0 {
		t.Errorf("Expected 0 recommendations for nil checks, got %d", len(recs))
	}
}

func TestEvaluateSemanticTriggers_NoDuplicateWizards(t *testing.T) {
	// FeatureQuality AND Coverage both recommend feature_quality_review
	// Should only get one recommendation for that wizard
	result := &HealthResult{
		InstancePath: t.TempDir(),
		FeatureQuality: &checks.FeatureQualitySummary{
			TotalFeatures: 3,
			FailedCount:   1,
			AverageScore:  70,
		},
		Relationships: &checks.RelationshipsResult{
			UncoveredL2s: 5,
		},
	}

	recs := evaluateSemanticTriggers(result)

	wizardCounts := make(map[string]int)
	for _, rec := range recs {
		wizardCounts[rec.Wizard]++
	}

	for wizard, count := range wizardCounts {
		if count > 1 {
			t.Errorf("Wizard %q appears %d times in recommendations, expected at most 1", wizard, count)
		}
	}
}
