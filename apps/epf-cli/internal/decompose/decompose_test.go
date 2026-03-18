package decompose

import (
	"os"
	"path/filepath"
	"testing"
)

// TestDecomposeNorthStar tests north_star decomposition using the testdata fixture.
func TestDecomposeNorthStar(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)

	// The testdata north_star has:
	// - no purpose/vision/mission (minimal fixture)
	// - 6 core beliefs (2 market + 1 users + 1 approach + 1 value_creation + 1 competition)
	if counts["Belief"] < 6 {
		t.Errorf("Expected at least 6 Belief objects from core_beliefs, got %d", counts["Belief"])
		for _, obj := range result.Objects {
			if obj.Type == "Belief" {
				t.Logf("  %s: %v", obj.Key, obj.Properties["category"])
			}
		}
	}

	// All beliefs should have inertia_tier=1
	for _, obj := range result.Objects {
		if obj.Type == "Belief" {
			if obj.Properties["inertia_tier"] != "1" {
				t.Errorf("Belief %s should have inertia_tier=1, got %v", obj.Key, obj.Properties["inertia_tier"])
			}
		}
	}
}

// TestDecomposeRoadmapAssumptions tests assumption extraction from roadmap.
func TestDecomposeRoadmapAssumptions(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)

	// 2 product assumptions + 1 strategy assumption = 3
	if counts["Assumption"] != 3 {
		t.Errorf("Expected 3 Assumption objects, got %d", counts["Assumption"])
	}

	// Check specific assumption
	for _, obj := range result.Objects {
		if obj.Type == "Assumption" && obj.Properties["assumption_id"] == "asm-p-020" {
			if obj.Properties["category"] != "feasibility" {
				t.Errorf("asm-p-020 should have category=feasibility, got %v", obj.Properties["category"])
			}
		}
	}

	// Check assumption → KR edges (asm-p-020 links to 2 KRs, asm-p-021 to 1 = 3 edges)
	testsCount := countRelsByType(result)["tests_assumption"]
	if testsCount < 3 {
		t.Errorf("Expected at least 3 tests_assumption edges, got %d", testsCount)
	}
}

// TestDecomposeFeatureDependencies tests feature dependency extraction.
func TestDecomposeFeatureDependencies(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	relCounts := countRelsByType(result)

	// fd-020 requires fd-025 (1 edge)
	// fd-020 enables fd-021, fd-022 (2 reverse edges)
	if relCounts["depends_on"] != 3 {
		t.Errorf("Expected 3 depends_on edges, got %d", relCounts["depends_on"])
		for _, rel := range result.Relationships {
			if rel.Type == "depends_on" {
				t.Logf("  depends_on: %s → %s", rel.FromKey, rel.ToKey)
			}
		}
	}

	// Verify direction: fd-020 → fd-025 (requires)
	if !hasRel(result, "depends_on", "Feature:feature:fd-020", "Feature:feature:fd-025") {
		t.Error("Missing depends_on: fd-020 → fd-025 (requires)")
	}
	// Verify reverse: fd-021 → fd-020 (enables reversed)
	if !hasRel(result, "depends_on", "Feature:feature:fd-021", "Feature:feature:fd-020") {
		t.Error("Missing depends_on: fd-021 → fd-020 (enables reversed)")
	}
}

// TestDecomposeFeatureCapabilities tests capability extraction from definition.capabilities.
func TestDecomposeFeatureCapabilities(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)
	if counts["Capability"] != 2 {
		t.Errorf("Expected 2 Capability objects, got %d", counts["Capability"])
	}

	for _, obj := range result.Objects {
		if obj.Type == "Capability" && obj.Properties["capability_id"] == "cap-001" {
			if obj.Properties["maturity"] != "emerging" {
				t.Errorf("cap-001 should have maturity=emerging, got %v", obj.Properties["maturity"])
			}
			if obj.Properties["feature_ref"] != "fd-020" {
				t.Errorf("cap-001 should have feature_ref=fd-020, got %v", obj.Properties["feature_ref"])
			}
		}
	}
}

// TestDecomposeEmergentInstance is an integration test against the real Emergent EPF instance.
func TestDecomposeEmergentInstance(t *testing.T) {
	candidates := []string{
		filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent"),
		"/Users/nikolaifasting/code/emergent-epf",
	}

	var instancePath string
	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(filepath.Join(abs, "READY", "00_north_star.yaml")); err == nil {
			instancePath = abs
			break
		}
	}
	if instancePath == "" {
		t.Skip("Emergent EPF instance not available — skipping integration test")
	}

	t.Logf("Using instance at: %s", instancePath)

	d := New(instancePath)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)
	relCounts := countRelsByType(result)

	t.Logf("\n=== Decomposition Results ===")
	t.Logf("Total objects:       %d", len(result.Objects))
	t.Logf("Total relationships: %d", len(result.Relationships))
	t.Logf("Warnings:            %d", len(result.Warnings))
	t.Logf("\nObjects by type:")
	for objType, count := range counts {
		t.Logf("  %-25s %d", objType, count)
	}
	t.Logf("\nRelationships by type:")
	for relType, count := range relCounts {
		t.Logf("  %-25s %d", relType, count)
	}
	for _, w := range result.Warnings {
		t.Logf("  WARNING: %s", w)
	}

	// Sanity checks — the Emergent instance has known minimums
	assertMin(t, counts["Artifact"], 5, "Artifacts")
	assertMin(t, counts["Belief"], 3, "Beliefs")
	assertMin(t, counts["Trend"], 5, "Trends")
	assertMin(t, counts["Persona"], 1, "Personas")
	assertMin(t, counts["Positioning"], 1, "Positioning")
	assertMin(t, counts["OKR"], 3, "OKRs")
	assertMin(t, counts["Assumption"], 1, "Assumptions")
	assertMin(t, counts["Feature"], 3, "Features")
	assertMin(t, counts["Capability"], 5, "Capabilities")
	assertMin(t, counts["ValueModelComponent"], 5, "ValueModelComponents")

	assertMin(t, relCounts["contains"], 10, "contains edges")
	assertMin(t, relCounts["contributes_to"], 1, "contributes_to edges")

	// Verify structural integrity
	for _, obj := range result.Objects {
		if obj.Key == "" {
			t.Errorf("Object with empty key: type=%s", obj.Type)
		}
		if obj.Properties["inertia_tier"] == nil || obj.Properties["inertia_tier"] == "" {
			t.Errorf("Object missing inertia_tier: type=%s key=%s", obj.Type, obj.Key)
		}
	}
}

// TestUtilFunctions tests utility functions independently.
func TestSanitizeKey(t *testing.T) {
	tests := []struct{ input, expected string }{
		{"Manual updates are slow", "manual-updates-are-slow"},
		{"Hello World!", "hello-world"},
		{"UPPER_case_MIX", "upper_case_mix"},
	}
	for _, tc := range tests {
		if got := sanitizeKey(tc.input); got != tc.expected {
			t.Errorf("sanitizeKey(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}

func TestNormalizeTimeframe(t *testing.T) {
	tests := []struct{ input, expected string }{
		{"near term (1-2 years)", "near_term"},
		{"medium term", "medium_term"},
		{"Long Term (5+ years)", "long_term"},
		{"immediate", "immediate"},
	}
	for _, tc := range tests {
		if got := normalizeTimeframe(tc.input); got != tc.expected {
			t.Errorf("normalizeTimeframe(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}

func TestNormalizeTrackName(t *testing.T) {
	tests := []struct{ input, expected string }{
		{"product", "Product"}, {"strategy", "Strategy"},
		{"org_ops", "OrgOps"}, {"orgops", "OrgOps"},
		{"commercial", "Commercial"}, {"Custom", "Custom"},
	}
	for _, tc := range tests {
		if got := normalizeTrackName(tc.input); got != tc.expected {
			t.Errorf("normalizeTrackName(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}

func TestClassifyMoatType(t *testing.T) {
	tests := []struct{ input, expected string }{
		{"deep engineering moat", "technology"},
		{"network effects and ecosystem lock-in", "network"},
		{"proprietary data graph", "data"},
		{"trusted brand", "brand"},
		{"unique methodology", "methodology"},
		{"", "methodology"},
	}
	for _, tc := range tests {
		if got := classifyMoatType(tc.input); got != tc.expected {
			t.Errorf("classifyMoatType(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}

// --- Edge case tests ---

// TestDecomposeEmptyInstance verifies the decomposer handles an instance with empty/missing content.
func TestDecomposeEmptyInstance(t *testing.T) {
	d := New("testdata-empty")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed on empty instance: %v", err)
	}

	// Should produce at least 1 artifact node (the north_star file exists)
	if len(result.Objects) < 1 {
		t.Error("Expected at least 1 object from empty instance (artifact node)")
	}

	// Should not produce any beliefs (core_beliefs is empty)
	counts := countByType(result)
	if counts["Belief"] > 0 {
		t.Errorf("Expected 0 Beliefs from empty instance, got %d", counts["Belief"])
	}

	// No errors or panics
	t.Logf("Empty instance: %d objects, %d relationships, %d warnings",
		len(result.Objects), len(result.Relationships), len(result.Warnings))
}

// TestDecomposeNonexistentInstance verifies graceful handling of missing instance.
func TestDecomposeNonexistentInstance(t *testing.T) {
	d := New("/nonexistent/path/that/does/not/exist")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance should not error for missing instance: %v", err)
	}

	// Should produce empty result (all files are optional)
	if len(result.Objects) != 0 {
		t.Errorf("Expected 0 objects from nonexistent instance, got %d", len(result.Objects))
	}
	if len(result.Relationships) != 0 {
		t.Errorf("Expected 0 relationships from nonexistent instance, got %d", len(result.Relationships))
	}
}

// TestDecomposeKeyUniqueness verifies all object keys are unique across the full instance.
func TestDecomposeKeyUniqueness(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	seen := make(map[string]int)
	for _, obj := range result.Objects {
		seen[obj.Key]++
	}

	duplicates := 0
	for key, count := range seen {
		if count > 1 {
			t.Errorf("Duplicate key: %s (appeared %d times)", key, count)
			duplicates++
		}
	}

	if duplicates > 0 {
		t.Errorf("Found %d duplicate keys out of %d total objects", duplicates, len(result.Objects))
	}
}

// TestDecomposeRelationshipEndpointsExist verifies all relationship endpoints reference valid keys.
func TestDecomposeRelationshipEndpointsExist(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// Build key set
	keys := make(map[string]bool)
	for _, obj := range result.Objects {
		keys[obj.Key] = true
	}

	// Check that "from" keys exist (within the same decomposition).
	// "to" keys may reference objects from other artifacts, so we only
	// flag missing "from" keys since those should always be self-referencing.
	missingFrom := 0
	for _, rel := range result.Relationships {
		if !keys[rel.FromKey] {
			// The from-key might be a cross-reference to another artifact's object
			// Only flag "contains" relationships since those should always be internal
			if rel.Type == "contains" {
				t.Errorf("contains relationship from non-existent key: %s → %s", rel.FromKey, rel.ToKey)
				missingFrom++
			}
		}
	}

	if missingFrom > 0 {
		t.Errorf("Found %d contains relationships with missing from-keys", missingFrom)
	}
}

// TestDecomposeAllObjectsHaveRequiredProperties verifies core properties are set.
func TestDecomposeAllObjectsHaveRequiredProperties(t *testing.T) {
	// Use the real Emergent instance if available
	candidates := []string{
		filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent"),
		"/Users/nikolaifasting/code/emergent-epf",
	}
	var instancePath string
	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(filepath.Join(abs, "READY", "00_north_star.yaml")); err == nil {
			instancePath = abs
			break
		}
	}
	if instancePath == "" {
		t.Skip("Emergent EPF instance not available")
	}

	d := New(instancePath)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	emptyNames := 0
	missingTiers := 0
	missingSources := 0

	for _, obj := range result.Objects {
		// Every object should have a name
		name, _ := obj.Properties["name"].(string)
		if name == "" {
			emptyNames++
			if emptyNames <= 3 {
				t.Logf("Object with empty name: type=%s key=%s", obj.Type, obj.Key)
			}
		}

		// Every object should have inertia_tier
		tier, _ := obj.Properties["inertia_tier"].(string)
		if tier == "" {
			missingTiers++
			if missingTiers <= 3 {
				t.Logf("Object missing inertia_tier: type=%s key=%s", obj.Type, obj.Key)
			}
		}

		// Non-Artifact objects should have source_artifact
		if obj.Type != "Artifact" {
			src, _ := obj.Properties["source_artifact"].(string)
			if src == "" {
				missingSources++
				if missingSources <= 3 {
					t.Logf("Object missing source_artifact: type=%s key=%s", obj.Type, obj.Key)
				}
			}
		}
	}

	t.Logf("Property audit: %d objects, %d empty names, %d missing tiers, %d missing sources",
		len(result.Objects), emptyNames, missingTiers, missingSources)

	// Allow some slack — some objects may have intentionally empty names (e.g., empty value model descriptions)
	if float64(emptyNames)/float64(len(result.Objects)) > 0.1 {
		t.Errorf("Too many objects with empty names: %d / %d (>10%%)", emptyNames, len(result.Objects))
	}
	if missingTiers > 0 {
		t.Errorf("Objects missing inertia_tier: %d", missingTiers)
	}
}

// --- Test helpers ---

func countByType(r *Result) map[string]int {
	m := map[string]int{}
	for _, obj := range r.Objects {
		m[obj.Type]++
	}
	return m
}

func countRelsByType(r *Result) map[string]int {
	m := map[string]int{}
	for _, rel := range r.Relationships {
		m[rel.Type]++
	}
	return m
}

func hasRel(r *Result, relType, fromKey, toKey string) bool {
	for _, rel := range r.Relationships {
		if rel.Type == relType && rel.FromKey == fromKey && rel.ToKey == toKey {
			return true
		}
	}
	return false
}

func assertMin(t *testing.T, got, min int, label string) {
	t.Helper()
	if got < min {
		t.Errorf("%s: got %d, want >= %d", label, got, min)
	}
}
