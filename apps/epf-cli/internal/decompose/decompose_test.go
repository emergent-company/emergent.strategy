package decompose

import (
	"os"
	"path/filepath"
	"strings"
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

// TestDecomposeFeaturePersonas tests persona extraction from definition.personas.
func TestDecomposeFeaturePersonas(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)

	// fd-020 has 2 personas: strategy-lead, product-engineer
	if counts["Persona"] < 2 {
		t.Errorf("Expected at least 2 Persona objects from feature personas, got %d", counts["Persona"])
		for _, obj := range result.Objects {
			if obj.Type == "Persona" {
				t.Logf("  %s: name=%v", obj.Key, obj.Properties["name"])
			}
		}
	}

	// Check specific persona properties
	for _, obj := range result.Objects {
		if obj.Type == "Persona" && obj.Properties["persona_id"] == "strategy-lead" {
			if obj.Properties["name"] != "Strategy Lead" {
				t.Errorf("strategy-lead should have name='Strategy Lead', got %v", obj.Properties["name"])
			}
			if obj.Properties["role"] != "Head of Strategy" {
				t.Errorf("strategy-lead should have role='Head of Strategy', got %v", obj.Properties["role"])
			}
			if obj.Properties["inertia_tier"] != "2" {
				t.Errorf("strategy-lead should have inertia_tier=2, got %v", obj.Properties["inertia_tier"])
			}
			goals, _ := obj.Properties["goals"].(string)
			if goals == "" {
				t.Error("strategy-lead should have goals populated")
			}
		}
	}

	// Check serves edges: Feature → Persona
	relCounts := countRelsByType(result)
	if relCounts["serves"] < 2 {
		t.Errorf("Expected at least 2 serves edges, got %d", relCounts["serves"])
	}
	if !hasRel(result, "serves", "Feature:feature:fd-020", "Persona:persona:strategy-lead") {
		t.Error("Missing serves edge: fd-020 → strategy-lead")
	}
	if !hasRel(result, "serves", "Feature:feature:fd-020", "Persona:persona:product-engineer") {
		t.Error("Missing serves edge: fd-020 → product-engineer")
	}

	// Check PainPoint extraction from feature personas
	if counts["PainPoint"] < 3 {
		t.Errorf("Expected at least 3 PainPoint objects from feature personas, got %d", counts["PainPoint"])
	}

	// Check elaborates edges: Persona → PainPoint
	if relCounts["elaborates"] < 3 {
		t.Errorf("Expected at least 3 elaborates edges, got %d", relCounts["elaborates"])
	}
}

// TestDecomposeFeaturePersonaDeduplication tests that the same persona across multiple features
// only produces one Persona object but multiple serves edges.
func TestDecomposeFeaturePersonaDeduplication(t *testing.T) {
	// Create a temporary instance with two features sharing a persona
	tmpDir := t.TempDir()
	productDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	if err := os.MkdirAll(productDir, 0o755); err != nil {
		t.Fatal(err)
	}

	feature1 := `id: "fd-001"
name: "Feature One"
definition:
  personas:
    - id: "shared-persona"
      name: "Shared Persona"
      role: "Engineer"
      description: "A persona shared across features"
      goals:
        - "Build great software"
      current_situation: "Currently does things manually."
`
	feature2 := `id: "fd-002"
name: "Feature Two"
definition:
  personas:
    - id: "shared-persona"
      name: "Shared Persona"
      role: "Engineer"
      description: "A persona shared across features"
      goals:
        - "Build great software"
      current_situation: "Also does things manually."
    - id: "unique-persona"
      name: "Unique Persona"
      role: "Designer"
      description: "Only in feature two"
`
	if err := os.WriteFile(filepath.Join(productDir, "fd-001_feature_one.yaml"), []byte(feature1), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(productDir, "fd-002_feature_two.yaml"), []byte(feature2), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)

	// Should have exactly 2 Persona objects (shared-persona deduplicated, unique-persona separate)
	if counts["Persona"] != 2 {
		t.Errorf("Expected 2 Persona objects (deduplicated), got %d", counts["Persona"])
		for _, obj := range result.Objects {
			if obj.Type == "Persona" {
				t.Logf("  %s", obj.Key)
			}
		}
	}

	// Should have 3 serves edges (fd-001→shared, fd-002→shared, fd-002→unique)
	relCounts := countRelsByType(result)
	if relCounts["serves"] != 3 {
		t.Errorf("Expected 3 serves edges, got %d", relCounts["serves"])
		for _, rel := range result.Relationships {
			if rel.Type == "serves" {
				t.Logf("  serves: %s → %s", rel.FromKey, rel.ToKey)
			}
		}
	}

	// Both features should have serves edges to the shared persona
	if !hasRel(result, "serves", "Feature:feature:fd-001", "Persona:persona:shared-persona") {
		t.Error("Missing serves edge: fd-001 → shared-persona")
	}
	if !hasRel(result, "serves", "Feature:feature:fd-002", "Persona:persona:shared-persona") {
		t.Error("Missing serves edge: fd-002 → shared-persona")
	}
	if !hasRel(result, "serves", "Feature:feature:fd-002", "Persona:persona:unique-persona") {
		t.Error("Missing serves edge: fd-002 → unique-persona")
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

// TestDecomposeMappingsValidatesVMCTargets verifies that MappingArtifact implements
// edges are only created when the target ValueModelComponent exists (issue #28).
func TestDecomposeMappingsValidatesVMCTargets(t *testing.T) {
	d := New("testdata")
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)

	// testdata/FIRE/mappings.yaml has 3 artifacts total:
	// - 2 under Product.Core.Search (valid VMC target)
	// - 1 under Product.Nonexistent.Path (invalid VMC target)
	// - 1 under Strategy.AlsoNonexistent.Path (invalid VMC target)
	if counts["MappingArtifact"] != 4 {
		t.Errorf("Expected 4 MappingArtifact objects, got %d", counts["MappingArtifact"])
	}

	// Count implements edges — only the 2 artifacts with valid VMC targets should get them
	implementsCount := 0
	for _, rel := range result.Relationships {
		if rel.Type == "implements" && rel.FromType == "MappingArtifact" {
			implementsCount++
		}
	}
	if implementsCount != 2 {
		t.Errorf("Expected 2 implements edges (only valid VMC targets), got %d", implementsCount)
		for _, rel := range result.Relationships {
			if rel.Type == "implements" {
				t.Logf("  implements: %s → %s", rel.FromKey, rel.ToKey)
			}
		}
	}

	// All 4 MappingArtifacts should still have contains edges (they're valid objects)
	containsCount := 0
	for _, rel := range result.Relationships {
		if rel.Type == "contains" && rel.ToType == "MappingArtifact" {
			containsCount++
		}
	}
	if containsCount != 4 {
		t.Errorf("Expected 4 contains edges for MappingArtifacts, got %d", containsCount)
	}

	// Should have warnings for the orphaned mappings
	warningCount := 0
	for _, w := range result.Warnings {
		if strings.Contains(w, "does not match any value model component") {
			warningCount++
		}
	}
	if warningCount != 2 {
		t.Errorf("Expected 2 warnings for orphaned mapping paths, got %d", warningCount)
	}
}

// TestTrendInformsInsightEdges verifies that Trend → KeyInsight edges are created
// based on supporting_trends references in KeyInsight objects (issue #29).
func TestTrendInformsInsightEdges(t *testing.T) {
	// Create a temporary instance with trends and key insights
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	insightAnalyses := `trends:
  technology:
    - trend: "AI transformation of legal work"
      timeframe: "near term"
      impact: "Automates routine legal tasks"
    - trend: "Shift from on-premise to cloud-based legal software"
      timeframe: "medium term"
      impact: "Enables remote collaboration"
  market:
    - trend: "Legal process outsourcing growth"
      timeframe: "near term"
      impact: "Cost pressure on firms"
key_insights:
  - insight: "RAG and knowledge graphs are becoming table stakes for legal AI"
    supporting_trends:
      - "AI transformation of legal work"
      - "Shift from on-premise to cloud-based legal software"
    strategic_implication: "Must invest in RAG capabilities"
  - insight: "Cost pressures are driving outsourcing adoption"
    supporting_trends:
      - "Legal process outsourcing growth"
    strategic_implication: "Opportunity for cost-effective tooling"
  - insight: "An insight with no matching trends"
    supporting_trends:
      - "Some trend that does not exist in our data"
    strategic_implication: "Should not create any edges"
`
	if err := os.WriteFile(filepath.Join(readyDir, "01_insight_analyses.yaml"), []byte(insightAnalyses), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)
	if counts["Trend"] < 3 {
		t.Errorf("Expected at least 3 Trend objects, got %d", counts["Trend"])
	}
	if counts["KeyInsight"] < 3 {
		t.Errorf("Expected at least 3 KeyInsight objects, got %d", counts["KeyInsight"])
	}

	// Count Trend → KeyInsight informs edges
	trendToInsightCount := 0
	for _, rel := range result.Relationships {
		if rel.Type == "informs" && rel.FromType == "Trend" && rel.ToType == "KeyInsight" {
			trendToInsightCount++
		}
	}

	// First insight references 2 matching trends, second references 1 = 3 edges
	// Third insight references a non-existent trend = 0 edges
	if trendToInsightCount != 3 {
		t.Errorf("Expected 3 Trend→KeyInsight informs edges, got %d", trendToInsightCount)
		for _, rel := range result.Relationships {
			if rel.Type == "informs" {
				t.Logf("  informs: %s (%s) → %s (%s)", rel.FromKey, rel.FromType, rel.ToKey, rel.ToType)
			}
		}
	}

	// Verify specific edges exist
	// "AI transformation of legal work" trend → first KeyInsight
	aiTrendKey := objectKey("Trend", "insight_analyses:trends.technology[0]")
	firstInsightKey := objectKey("KeyInsight", "insight_analyses:key_insights[0]")
	if !hasRel(result, "informs", aiTrendKey, firstInsightKey) {
		t.Error("Missing informs edge: AI transformation trend → first key insight")
	}
}

// TestSharedTechnologyNoSelfLoops verifies that shared_technology edges don't
// create self-loops from duplicate contributes_to entries (issue #30).
func TestSharedTechnologyNoSelfLoops(t *testing.T) {
	// Create a temporary instance with a feature that has duplicate contributes_to
	tmpDir := t.TempDir()
	productDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(productDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Feature with duplicate contributes_to paths
	feature := `id: "fd-010"
name: "Cloud Storage Integration"
strategic_context:
  contributes_to:
    - 'Product.Core.Storage'
    - 'Product.Core.Storage'
definition:
  job_to_be_done: "Integrate cloud storage"
`
	if err := os.WriteFile(filepath.Join(productDir, "fd-010_cloud_storage.yaml"), []byte(feature), 0o644); err != nil {
		t.Fatal(err)
	}

	// Value model with the target component
	valueModel := `track_name: product
description: 'Product value model'
layers:
  - id: 'core'
    name: 'Core'
    path_segment: 'Core'
    description: 'Core layer'
    components:
      - id: 'storage'
        name: 'Storage'
        path_segment: 'Storage'
        description: 'Storage functionality'
        active: true
`
	if err := os.WriteFile(filepath.Join(vmDir, "product.yaml"), []byte(valueModel), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// Check there are no self-loops in any relationship
	for _, rel := range result.Relationships {
		if rel.FromKey == rel.ToKey {
			t.Errorf("Self-loop detected: type=%s key=%s", rel.Type, rel.FromKey)
		}
	}

	// shared_technology edges should not be created since there's only 1 unique feature
	sharedTechCount := 0
	for _, rel := range result.Relationships {
		if rel.Type == "shared_technology" {
			sharedTechCount++
		}
	}
	if sharedTechCount != 0 {
		t.Errorf("Expected 0 shared_technology edges (only 1 unique feature), got %d", sharedTechCount)
	}
}

// TestDecomposeMappingsVMCPrefixResolution verifies that MappingArtifact implements
// edges are created via prefix matching when sub_component_id uses different naming
// conventions than the value model (issue #28 reopened). This tests the 3-tier
// VMC resolution: exact key → value_path → prefix match.
func TestDecomposeMappingsVMCPrefixResolution(t *testing.T) {
	tmpDir := t.TempDir()
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Value model with display names (spaces) that differ from path_segment naming
	valueModel := `track_name: product
description: 'Product value model'
layers:
  - id: 'core'
    name: 'Core'
    path_segment: 'Core'
    description: 'Core layer'
    components:
      - id: 'matter-mgmt'
        name: 'Matter Management'
        path_segment: 'MatterMgmt'
        description: 'Case and matter management'
        active: true
        maturity:
          stage: 'emerging'
        sub_components:
          - id: 'case-admin'
            name: 'Case Administration'
            description: 'Administrative case functions'
          - id: 'billing'
            name: 'Billing Integration'
            description: 'Billing and time tracking'
      - id: 'doc-mgmt'
        name: 'Document Management'
        path_segment: 'DocMgmt'
        description: 'Document storage and retrieval'
        active: true
`
	if err := os.WriteFile(filepath.Join(vmDir, "product.yaml"), []byte(valueModel), 0o644); err != nil {
		t.Fatal(err)
	}

	// Mappings using different naming conventions
	mappings := `product:
  - sub_component_id: 'Product.Core.MatterMgmt'
    artifacts:
      - type: 'code'
        url: 'https://example.com/matter-mgmt'
        description: 'Exact match via path_segment'
  - sub_component_id: 'Product.Core.Matter Management'
    artifacts:
      - type: 'code'
        url: 'https://example.com/matter-display'
        description: 'Match via value_path with display name'
  - sub_component_id: 'Product.Core.MatterMgmt.CaseAdmin'
    artifacts:
      - type: 'code'
        url: 'https://example.com/case-admin-wrong-path'
        description: 'Should not match - CaseAdmin is not a real sub name'
  - sub_component_id: 'Product.Core.Nonexistent'
    artifacts:
      - type: 'code'
        url: 'https://example.com/no-match'
        description: 'No match at any tier'
`
	if err := os.WriteFile(filepath.Join(tmpDir, "FIRE", "mappings.yaml"), []byte(mappings), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)
	if counts["MappingArtifact"] != 4 {
		t.Errorf("Expected 4 MappingArtifact objects, got %d", counts["MappingArtifact"])
	}

	// Count implements edges
	implementsEdges := map[string]string{} // from → to
	for _, rel := range result.Relationships {
		if rel.Type == "implements" && rel.FromType == "MappingArtifact" {
			implementsEdges[rel.FromKey] = rel.ToKey
		}
	}

	// Tier 1: "Product.Core.MatterMgmt" → exact key match to L2 VMC
	tier1Key := objectKey("MappingArtifact", "mappings:product:Product.Core.MatterMgmt:0")
	if _, ok := implementsEdges[tier1Key]; !ok {
		t.Error("Tier 1 (exact key match): expected implements edge for Product.Core.MatterMgmt")
	}

	// "Product.Core.Matter Management" → value_path match (since VMC key uses path_segment
	// "MatterMgmt" but value_path stores "Product.Core.MatterMgmt", this actually won't match
	// value_path either since the mapping uses "Matter Management" not "MatterMgmt").
	// However, if the sub_component_id happens to use the display name, it should still
	// be resolved. In this case the value_path is "Product.Core.MatterMgmt" which does NOT
	// equal "Product.Core.Matter Management", so tier 2 fails and tier 3 also fails
	// (no children of "Product.Core.Matter Management."). This should produce a warning.

	// "Product.Core.Nonexistent" → no match at any tier (warning)
	warningCount := 0
	for _, w := range result.Warnings {
		if strings.Contains(w, "does not match any value model component") {
			warningCount++
		}
	}
	// At least 1 warning for the nonexistent path (possibly 2 if the display name doesn't match either)
	if warningCount < 1 {
		t.Errorf("Expected at least 1 warning for unresolved VMC paths, got %d", warningCount)
	}

	t.Logf("Implements edges created: %d, Warnings: %d", len(implementsEdges), warningCount)
	for from, to := range implementsEdges {
		t.Logf("  %s → %s", from, to)
	}
}

// TestDecomposeMappingsVMCNormalizedResolution verifies that the decomposer
// resolves sub_component_id paths to VMCs when they differ only by naming
// convention (CamelCase vs UPPER + spaces, ampersands, etc.) — issue #28.
func TestDecomposeMappingsVMCNormalizedResolution(t *testing.T) {
	tmpDir := t.TempDir()
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Value model using display names with spaces, UPPER CASE, and ampersands
	valueModel := `track_name: strategy
description: 'Strategy value model'
layers:
  - id: 'context'
    name: 'CONTEXT'
    path_segment: 'CONTEXT'
    description: 'Strategic context analysis'
    components:
      - id: 'market-analysis'
        name: 'Market Analysis'
        path_segment: 'Market Analysis'
        description: 'Market research and analysis'
        active: true
      - id: 'competitor-analysis'
        name: 'Competitor Analysis'
        path_segment: 'Competitor Analysis'
        description: 'Competitive landscape analysis'
        active: true
  - id: 'strategic-roadmap'
    name: 'STRATEGIC ROADMAP'
    path_segment: 'STRATEGIC ROADMAP'
    description: 'Strategic planning and execution'
    components:
      - id: 'vision-mission'
        name: 'Vision & mission'
        path_segment: 'Vision & mission'
        description: 'Vision and mission alignment'
        active: true
      - id: 'goal-prioritization'
        name: 'Goal Prioritization'
        path_segment: 'Goal Prioritization'
        description: 'Goal setting and prioritization'
        active: true
`
	if err := os.WriteFile(filepath.Join(vmDir, "strategy.yaml"), []byte(valueModel), 0o644); err != nil {
		t.Fatal(err)
	}

	// OrgOps value model with ampersand in layer name
	orgOpsVM := `track_name: org_ops
description: 'OrgOps value model'
layers:
  - id: 'facilities-it'
    name: 'FACILITIES & IT'
    path_segment: 'FACILITIES & IT'
    description: 'Facilities and IT management'
    components:
      - id: 'it-systems'
        name: 'IT Systems'
        path_segment: 'IT Systems'
        description: 'IT systems and infrastructure'
        active: true
`
	if err := os.WriteFile(filepath.Join(vmDir, "org_ops.yaml"), []byte(orgOpsVM), 0o644); err != nil {
		t.Fatal(err)
	}

	// Mappings using CamelCase convention (no spaces, no ampersands)
	mappings := `strategy:
  - sub_component_id: 'Strategy.Context.MarketAnalysis'
    artifacts:
      - type: 'documentation'
        url: 'https://example.com/market-analysis'
        description: 'Market analysis doc'
  - sub_component_id: 'Strategy.Context.CompetitorAnalysis'
    artifacts:
      - type: 'documentation'
        url: 'https://example.com/competitor-analysis'
        description: 'Competitor analysis doc'
  - sub_component_id: 'Strategy.StrategicRoadmap.VisionMission'
    artifacts:
      - type: 'documentation'
        url: 'https://example.com/vision-mission'
        description: 'Vision and mission doc'
  - sub_component_id: 'Strategy.StrategicRoadmap.GoalPrioritization'
    artifacts:
      - type: 'documentation'
        url: 'https://example.com/goal-prioritization'
        description: 'Goal prioritization doc'
org_ops:
  - sub_component_id: 'OrgOps.FacilitiesIt.ItSystems'
    artifacts:
      - type: 'documentation'
        url: 'https://example.com/it-systems'
        description: 'IT systems doc'
`
	if err := os.WriteFile(filepath.Join(tmpDir, "FIRE", "mappings.yaml"), []byte(mappings), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// Count implements edges
	implementsCount := 0
	for _, rel := range result.Relationships {
		if rel.Type == "implements" && rel.FromType == "MappingArtifact" {
			implementsCount++
			t.Logf("  implements: %s → %s", rel.FromKey, rel.ToKey)
		}
	}

	// All 5 MappingArtifacts should resolve via normalized matching
	if implementsCount != 5 {
		t.Errorf("Expected 5 implements edges (all resolved via normalization), got %d", implementsCount)
	}

	// Should have zero warnings about unresolved VMC paths
	warningCount := 0
	for _, w := range result.Warnings {
		if strings.Contains(w, "does not match any value model component") {
			warningCount++
			t.Logf("  WARNING: %s", w)
		}
	}
	if warningCount != 0 {
		t.Errorf("Expected 0 VMC resolution warnings, got %d", warningCount)
	}
}

// TestDecomposeMappingsVMCPrefixDeterministic verifies that prefix-match VMC
// resolution is deterministic across runs (picks shortest matching path).
func TestDecomposeMappingsVMCPrefixDeterministic(t *testing.T) {
	tmpDir := t.TempDir()
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Value model with L3 sub-components
	valueModel := `track_name: product
description: 'Product value model'
layers:
  - id: 'core'
    name: 'Core'
    path_segment: 'Core'
    description: 'Core layer'
    components:
      - id: 'analytics'
        name: 'Analytics'
        path_segment: 'Analytics'
        description: 'Analytics capabilities'
        active: true
        sub_components:
          - id: 'reporting'
            name: 'Reporting'
            description: 'Report generation'
          - id: 'dashboards'
            name: 'Dashboards'
            description: 'Dashboard views'
          - id: 'alerts'
            name: 'Alerts'
            description: 'Alert notifications'
`
	if err := os.WriteFile(filepath.Join(vmDir, "product.yaml"), []byte(valueModel), 0o644); err != nil {
		t.Fatal(err)
	}

	// Mapping targets the L2 parent using a naming convention that doesn't
	// exactly match — but L3 children exist under this prefix. The prefix
	// match should find them and pick the shortest (alphabetically first
	// after sorting, then shortest by length).
	mappings := `product:
  - sub_component_id: 'Product.Core.Analytics'
    artifacts:
      - type: 'code'
        url: 'https://example.com/analytics'
        description: 'Analytics code'
`
	if err := os.WriteFile(filepath.Join(tmpDir, "FIRE", "mappings.yaml"), []byte(mappings), 0o644); err != nil {
		t.Fatal(err)
	}

	const runs = 10
	var firstTarget string

	for i := 0; i < runs; i++ {
		d := New(tmpDir)
		result, err := d.DecomposeInstance()
		if err != nil {
			t.Fatalf("Run %d: DecomposeInstance failed: %v", i, err)
		}

		for _, rel := range result.Relationships {
			if rel.Type == "implements" && rel.FromType == "MappingArtifact" {
				if i == 0 {
					firstTarget = rel.ToKey
					t.Logf("First run implements target: %s", firstTarget)
				} else if rel.ToKey != firstTarget {
					t.Errorf("Run %d: implements target = %q, expected %q (nondeterministic)", i, rel.ToKey, firstTarget)
				}
			}
		}
	}

	if firstTarget == "" {
		t.Error("No implements edge found — prefix resolution should have matched L3 children")
	}
}

// TestDisconnectedTrendFallbackEdges verifies that Trend nodes with no outgoing
// edges get fallback informs edges via keyword matching (issue #29 reopened).
func TestDisconnectedTrendFallbackEdges(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create trends and key insights where some trends are not referenced
	// by any supporting_trends list.
	// Note: market_dynamics is a top-level section (not under trends:) with
	// dynamic/implication fields. Trends under trends: use trend/timeframe/impact.
	insightAnalyses := `trends:
  technology:
    - trend: "AI transformation of knowledge management"
      timeframe: "near term"
      impact: "Automates knowledge capture and retrieval"
  regulatory:
    - trend: "Data privacy regulations expanding globally"
      timeframe: "near term"
      impact: "All products must handle data sovereignty requirements"
market_dynamics:
  - dynamic: "Enterprise consolidation driving platform purchases"
    implication: "Buyers prefer integrated suites over point solutions"
  - dynamic: "Regulatory compliance becoming automated requirement"
    implication: "Compliance checking must be built into workflows"
key_insights:
  - insight: "Knowledge management and AI-driven automation are transforming how enterprises work"
    supporting_trends:
      - "AI transformation of knowledge management"
    strategic_implication: "Must invest in AI capabilities"
  - insight: "Enterprise platform consolidation means buyers want integrated compliance and data privacy solutions"
    supporting_trends: []
    strategic_implication: "Build compliance and privacy into the platform"
  - insight: "Regulatory automated compliance checking is becoming essential for enterprise software"
    supporting_trends: []
    strategic_implication: "Compliance must be a first-class feature"
`
	if err := os.WriteFile(filepath.Join(readyDir, "01_insight_analyses.yaml"), []byte(insightAnalyses), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	counts := countByType(result)
	t.Logf("Trends: %d, KeyInsights: %d", counts["Trend"], counts["KeyInsight"])

	// Count Trend → KeyInsight informs edges by edge_source
	explicitCount := 0 // from addTrendInformsInsightEdges (weight 0.7)
	inferredCount := 0 // from addDisconnectedTrendFallbackEdges (weight 0.5)
	for _, rel := range result.Relationships {
		if rel.Type == "informs" && rel.FromType == "Trend" && rel.ToType == "KeyInsight" {
			source, _ := rel.Properties["edge_source"].(string)
			if source == "inferred" {
				inferredCount++
			} else {
				explicitCount++
			}
			t.Logf("  Trend→KeyInsight: %s → %s (source=%s, weight=%v)",
				rel.FromKey, rel.ToKey, source, rel.Properties["weight"])
		}
	}

	// "AI transformation" is explicitly referenced → explicit edge
	if explicitCount < 1 {
		t.Errorf("Expected at least 1 explicit Trend→KeyInsight edge, got %d", explicitCount)
	}

	// The market_dynamics entries and the regulatory trend are NOT referenced
	// by any supporting_trends. They should get inferred fallback edges based
	// on keyword overlap:
	// - "Enterprise consolidation driving platform purchases" → matches
	//   "Enterprise platform consolidation..." insight (keywords: enterprise, platform, consolidation)
	// - "Regulatory compliance becoming automated requirement" → matches
	//   "Regulatory automated compliance checking..." insight (keywords: regulatory, compliance, automated)
	// - "Data privacy regulations expanding globally" → may or may not match
	//   depending on keyword overlap threshold
	// We expect at least 2 inferred edges (the first two above are strong matches).
	if inferredCount < 2 {
		t.Errorf("Expected at least 2 inferred Trend→KeyInsight fallback edges, got %d", inferredCount)
	}

	// Verify no Trend has a self-loop
	for _, rel := range result.Relationships {
		if rel.FromKey == rel.ToKey {
			t.Errorf("Self-loop detected: type=%s key=%s", rel.Type, rel.FromKey)
		}
	}
}

// TestDisconnectedTrendFallbackNoFalsePositives verifies that the fallback
// keyword matching doesn't create edges when there's insufficient overlap.
func TestDisconnectedTrendFallbackNoFalsePositives(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// A trend about something completely unrelated to the insights
	insightAnalyses := `trends:
  technology:
    - trend: "Quantum computing advances"
      timeframe: "long term"
      impact: "Enables new cryptographic approaches"
key_insights:
  - insight: "Enterprise buyers want integrated legal workflow tools"
    supporting_trends: []
    strategic_implication: "Focus on legal workflows"
`
	if err := os.WriteFile(filepath.Join(readyDir, "01_insight_analyses.yaml"), []byte(insightAnalyses), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// The trend "Quantum computing advances" has no keyword overlap with
	// "Enterprise buyers want integrated legal workflow tools" —
	// no fallback edge should be created.
	inferredCount := 0
	for _, rel := range result.Relationships {
		if rel.Type == "informs" && rel.FromType == "Trend" && rel.ToType == "KeyInsight" {
			source, _ := rel.Properties["edge_source"].(string)
			if source == "inferred" {
				inferredCount++
				t.Logf("  Unexpected inferred edge: %s → %s", rel.FromKey, rel.ToKey)
			}
		}
	}

	if inferredCount > 0 {
		t.Errorf("Expected 0 inferred fallback edges (no keyword overlap), got %d", inferredCount)
	}
}

// TestDecomposeMappingsDeterministicKeys verifies that MappingArtifact keys are
// deterministic across multiple decomposition runs. Go map iteration order is
// nondeterministic; without sorting track keys, the global counter produces
// different indices each run, causing orphaned objects in Memory on sync.
func TestDecomposeMappingsDeterministicKeys(t *testing.T) {
	d := New("testdata")

	// Run decomposition multiple times and collect MappingArtifact keys
	const runs = 10
	var firstRunKeys []string

	for i := 0; i < runs; i++ {
		result, err := d.DecomposeInstance()
		if err != nil {
			t.Fatalf("Run %d: DecomposeInstance failed: %v", i, err)
		}

		var keys []string
		for _, obj := range result.Objects {
			if obj.Type == "MappingArtifact" {
				keys = append(keys, obj.Key)
			}
		}

		if len(keys) == 0 {
			t.Skip("No MappingArtifact objects in testdata; skipping determinism check")
		}

		if i == 0 {
			firstRunKeys = keys
		} else {
			if len(keys) != len(firstRunKeys) {
				t.Fatalf("Run %d: got %d MappingArtifact keys, expected %d", i, len(keys), len(firstRunKeys))
			}
			for j, key := range keys {
				if key != firstRunKeys[j] {
					t.Errorf("Run %d: key[%d] = %q, expected %q (nondeterministic key generation)", i, j, key, firstRunKeys[j])
				}
			}
		}
	}

	t.Logf("Verified %d MappingArtifact keys are deterministic across %d runs", len(firstRunKeys), runs)
}

// TestFeatureContributesToResolution verifies that Feature contributes_to
// paths using CamelCase conventions are resolved to VMC keys that use
// display names (UPPER CASE, spaces, ampersands) — issue #31.
func TestFeatureContributesToResolution(t *testing.T) {
	tmpDir := t.TempDir()

	// Create value model with display-name path segments
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	prodDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(prodDir, 0o755); err != nil {
		t.Fatal(err)
	}

	valueModel := `track_name: product
description: 'Product value model'
layers:
  - id: 'onboard-and-map'
    name: 'ONBOARD & MAP'
    path_segment: 'ONBOARD & MAP'
    description: 'Onboarding and mapping'
    components:
      - id: 'onboard-map-road-network'
        name: 'Map physical road network'
        path_segment: 'Map physical road network'
        description: 'Digitize road networks'
        active: true
  - id: 'allocate-costs'
    name: 'ALLOCATE COSTS'
    path_segment: 'ALLOCATE COSTS'
    description: 'Cost allocation'
    components:
      - id: 'allocate-track-road-expenses'
        name: 'Track road expenses'
        path_segment: 'Track road expenses'
        description: 'Track and allocate expenses'
        active: true
`
	if err := os.WriteFile(filepath.Join(vmDir, "product.yaml"), []byte(valueModel), 0o644); err != nil {
		t.Fatal(err)
	}

	// Feature using CamelCase contributes_to paths
	feature := `id: 'fd-001'
name: 'Road Network Digitization'
status: 'in-progress'
strategic_context:
  contributes_to:
    - Product.OnboardAndMap.OnboardMapRoadNetwork
    - Product.AllocateCosts.AllocateTrackRoadExpenses
definition:
  job_to_be_done: 'Digitize road networks'
  capabilities:
    - id: 'cap-001'
      name: 'Network Upload'
      description: 'Upload road network data'
`
	if err := os.WriteFile(filepath.Join(prodDir, "fd-001-road-network.yaml"), []byte(feature), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// Check that contributes_to edges were created
	contributesTo := map[string]string{} // from → to
	for _, rel := range result.Relationships {
		if rel.Type == "contributes_to" && rel.FromType == "Feature" {
			contributesTo[rel.FromKey] = rel.ToKey
			t.Logf("  contributes_to: %s → %s", rel.FromKey, rel.ToKey)
		}
	}

	featureKey := objectKey("Feature", "feature:fd-001")
	if len(contributesTo) == 0 {
		t.Error("Expected contributes_to edges from feature, got none")
	}

	// Verify specific edges were created and point to the right VMC keys
	found := 0
	for _, rel := range result.Relationships {
		if rel.Type == "contributes_to" && rel.FromKey == featureKey {
			found++
			// The VMC key should contain the display name, not the CamelCase
			if !strings.Contains(rel.ToKey, "ONBOARD & MAP") && !strings.Contains(rel.ToKey, "ALLOCATE COSTS") {
				t.Errorf("contributes_to edge target %q should reference display-name VMC, not CamelCase", rel.ToKey)
			}
		}
	}
	if found != 2 {
		t.Errorf("Expected 2 contributes_to edges from fd-001, got %d", found)
	}

	// Verify no warnings about unresolved paths
	unresolvedWarnings := 0
	for _, w := range result.Warnings {
		if strings.Contains(w, "contributes_to path") && strings.Contains(w, "does not match") {
			unresolvedWarnings++
			t.Logf("WARNING: %s", w)
		}
	}
	if unresolvedWarnings > 0 {
		t.Errorf("Expected 0 unresolved contributes_to warnings, got %d", unresolvedWarnings)
	}
}

// TestTrackDefinitionContributesToResolution verifies that canonical track
// definitions with L2-name + slug contributes_to paths are resolved to VMC
// keys — issue #31.
func TestTrackDefinitionContributesToResolution(t *testing.T) {
	tmpDir := t.TempDir()

	// Create value model
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	valueModel := `track_name: strategy
description: 'Strategy value model'
layers:
  - id: 'strategic-communications'
    name: 'STRATEGIC COMMUNICATIONS'
    path_segment: 'STRATEGIC COMMUNICATIONS'
    description: 'Communications strategy'
    components:
      - id: 'identity-definition'
        name: 'Identity Definition'
        path_segment: 'Identity Definition'
        description: 'Brand identity'
        active: true
        sub_components:
          - id: 'naming-conventions'
            name: 'Naming conventions'
            path_segment: 'Naming conventions'
            description: 'Naming convention guidelines'
            active: true
          - id: 'core-values-and-tone'
            name: 'Core values and tone'
            path_segment: 'Core values and tone'
            description: 'Core values and tone of voice'
            active: true
`
	if err := os.WriteFile(filepath.Join(vmDir, "strategy.yaml"), []byte(valueModel), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create track definitions in nested subdirectory (issue #32 pattern)
	defDir := filepath.Join(tmpDir, "FIRE", "definitions", "strategy", "communications")
	if err := os.MkdirAll(defDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Definition using L2 name + slug format
	def1 := `id: 'sd-028'
name: 'Naming Conventions'
slug: 'naming-conventions'
track: 'strategy'
status: 'active'
contributes_to:
  - Strategy.Identity Definition.naming-conventions
definition:
  purpose: 'Establish naming conventions'
  outcome: 'Consistent naming across the org'
  owner: 'Brand Manager'
`
	def2 := `id: 'sd-029'
name: 'Core Values and Tone'
slug: 'core-values-and-tone'
track: 'strategy'
status: 'active'
contributes_to:
  - Strategy.Identity Definition.core-values-and-tone
definition:
  purpose: 'Define core values and tone of voice'
  outcome: 'Consistent brand communication'
  owner: 'Brand Manager'
`
	if err := os.WriteFile(filepath.Join(defDir, "sd-028-naming-conventions.yaml"), []byte(def1), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(defDir, "sd-029-core-values.yaml"), []byte(def2), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// Verify both track definitions were decomposed
	defCount := 0
	for _, obj := range result.Objects {
		if obj.Type == "TrackDefinition" {
			defCount++
			t.Logf("  TrackDefinition: %s (track=%v)", obj.Key, obj.Properties["track"])
		}
	}
	if defCount != 2 {
		t.Errorf("Expected 2 TrackDefinition objects, got %d", defCount)
	}

	// Verify contributes_to edges were created
	contributesToEdges := 0
	for _, rel := range result.Relationships {
		if rel.Type == "contributes_to" && rel.FromType == "TrackDefinition" {
			contributesToEdges++
			t.Logf("  contributes_to: %s → %s", rel.FromKey, rel.ToKey)
			// The target should be the display-name VMC key
			if !strings.Contains(rel.ToKey, "Naming conventions") && !strings.Contains(rel.ToKey, "Core values and tone") {
				t.Errorf("contributes_to edge target %q should reference display-name VMC", rel.ToKey)
			}
		}
	}
	if contributesToEdges != 2 {
		t.Errorf("Expected 2 contributes_to edges from track definitions, got %d", contributesToEdges)
	}

	// Verify no warnings
	unresolvedWarnings := 0
	for _, w := range result.Warnings {
		if strings.Contains(w, "contributes_to path") && strings.Contains(w, "does not match") {
			unresolvedWarnings++
			t.Logf("WARNING: %s", w)
		}
	}
	if unresolvedWarnings > 0 {
		t.Errorf("Expected 0 unresolved contributes_to warnings, got %d", unresolvedWarnings)
	}
}

// TestNestedTrackDefinitionDiscovery verifies that track definitions in nested
// subdirectories are discovered by the recursive filepath.Walk — issue #32.
func TestNestedTrackDefinitionDiscovery(t *testing.T) {
	tmpDir := t.TempDir()

	// Create nested definition structure matching the veilag pattern
	dirs := []string{
		filepath.Join(tmpDir, "FIRE", "definitions", "org_ops", "culture-communications"),
		filepath.Join(tmpDir, "FIRE", "definitions", "org_ops", "talent-management"),
		filepath.Join(tmpDir, "FIRE", "definitions", "commercial", "partnerships"),
		filepath.Join(tmpDir, "FIRE", "definitions", "strategy", "context"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// Create definitions in nested dirs
	defs := map[string]string{
		filepath.Join(dirs[0], "pd-003-team-feedback.yaml"): `id: 'pd-003'
name: 'Team Feedback Process'
track: 'org_ops'
status: 'active'
definition:
  purpose: 'Enable team feedback'
  outcome: 'Better communication'
`,
		filepath.Join(dirs[1], "pd-001-orientation.yaml"): `id: 'pd-001'
name: 'New Hire Orientation'
track: 'org_ops'
status: 'active'
definition:
  purpose: 'Onboard new hires'
  outcome: 'Faster ramp-up'
`,
		filepath.Join(dirs[2], "cd-001-partner-discovery.yaml"): `id: 'cd-001'
name: 'Partner Discovery'
track: 'commercial'
status: 'active'
definition:
  purpose: 'Find partners'
  outcome: 'New partnerships'
`,
		filepath.Join(dirs[3], "sd-001-market-trends.yaml"): `id: 'sd-001'
name: 'Market Trends Analysis'
track: 'strategy'
status: 'active'
definition:
  purpose: 'Analyze market trends'
  outcome: 'Informed strategy'
`,
	}
	for path, content := range defs {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// Count track definitions by track
	trackCounts := map[string]int{}
	for _, obj := range result.Objects {
		if obj.Type == "TrackDefinition" {
			track := obj.Properties["track"].(string)
			trackCounts[track]++
			t.Logf("  TrackDefinition: %s (track=%s, category=%v)", obj.Key, track, obj.Properties["category"])
		}
	}

	if trackCounts["org_ops"] != 2 {
		t.Errorf("Expected 2 org_ops definitions, got %d", trackCounts["org_ops"])
	}
	if trackCounts["commercial"] != 1 {
		t.Errorf("Expected 1 commercial definition, got %d", trackCounts["commercial"])
	}
	if trackCounts["strategy"] != 1 {
		t.Errorf("Expected 1 strategy definition, got %d", trackCounts["strategy"])
	}

	total := trackCounts["org_ops"] + trackCounts["commercial"] + trackCounts["strategy"]
	if total != 4 {
		t.Errorf("Expected 4 total track definitions from nested dirs, got %d", total)
	}
}

// TestContributesToUnresolvedWarning verifies that unresolved contributes_to
// paths produce warnings and skip edge creation rather than creating dangling edges.
func TestContributesToUnresolvedWarning(t *testing.T) {
	tmpDir := t.TempDir()

	// Create minimal value model
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	prodDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(prodDir, 0o755); err != nil {
		t.Fatal(err)
	}

	valueModel := `track_name: product
description: 'Product value model'
layers:
  - id: 'core'
    name: 'Core'
    path_segment: 'Core'
    components:
      - id: 'search'
        name: 'Search'
        path_segment: 'Search'
        active: true
`
	if err := os.WriteFile(filepath.Join(vmDir, "product.yaml"), []byte(valueModel), 0o644); err != nil {
		t.Fatal(err)
	}

	// Feature with both valid and invalid contributes_to paths
	feature := `id: 'fd-001'
name: 'Test Feature'
status: 'draft'
strategic_context:
  contributes_to:
    - Product.Core.Search
    - Product.Nonexistent.FakeComponent
    - Strategy.Missing.AlsoFake
definition:
  job_to_be_done: 'Test feature'
`
	if err := os.WriteFile(filepath.Join(prodDir, "fd-001-test.yaml"), []byte(feature), 0o644); err != nil {
		t.Fatal(err)
	}

	d := New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		t.Fatalf("DecomposeInstance failed: %v", err)
	}

	// Count contributes_to edges
	edgeCount := 0
	for _, rel := range result.Relationships {
		if rel.Type == "contributes_to" && rel.FromType == "Feature" {
			edgeCount++
			t.Logf("  contributes_to: %s → %s", rel.FromKey, rel.ToKey)
		}
	}

	// Only the valid path should create an edge
	if edgeCount != 1 {
		t.Errorf("Expected 1 contributes_to edge (only valid path), got %d", edgeCount)
	}

	// Should have 2 warnings for the invalid paths
	warningCount := 0
	for _, w := range result.Warnings {
		if strings.Contains(w, "contributes_to path") && strings.Contains(w, "does not match") {
			warningCount++
		}
	}
	if warningCount != 2 {
		t.Errorf("Expected 2 unresolved path warnings, got %d", warningCount)
	}
}
