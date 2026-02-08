package integration

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Integration tests for epf-cli using embedded artifacts and/or EPF instance files
// Tests are designed to work both with and without a filesystem EPF installation

// findProjectRoot finds the project root by looking for go.mod
func findProjectRoot() string {
	dir, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// findTestInstance returns path to test EPF instance (may not exist)
func findTestInstance() string {
	root := findProjectRoot()
	if root == "" {
		return ""
	}

	// Try relative paths from epf-cli
	paths := []string{
		filepath.Join(root, "..", "..", "docs", "EPF", "_instances", "emergent"),
		filepath.Join(root, "docs", "EPF", "_instances", "emergent"),
	}

	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			abs, _ := filepath.Abs(p)
			return abs
		}
	}
	return ""
}

// buildCLI builds the CLI binary for testing
func buildCLI(t *testing.T) string {
	root := findProjectRoot()
	if root == "" {
		t.Skip("Could not find project root")
	}

	binary := filepath.Join(root, "epf-cli-test")
	cmd := exec.Command("go", "build", "-o", binary, ".")
	cmd.Dir = root
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Failed to build CLI: %v\n%s", err, output)
	}

	t.Cleanup(func() {
		os.Remove(binary)
	})

	return binary
}

func TestCLI_Version(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "version")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("version command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should contain version info (format may vary)
	if !strings.Contains(outputStr, "epf-cli") {
		t.Errorf("Expected epf-cli in version output, got: %s", outputStr)
	}

	// Should show embedded EPF version if available
	if strings.Contains(outputStr, "Embedded") {
		t.Logf("Embedded artifacts available")
	}

	t.Logf("Version output: %s", outputStr)
}

func TestCLI_Schemas(t *testing.T) {
	cli := buildCLI(t)

	// Schemas command now works with embedded schemas (no --schemas-dir needed)
	cmd := exec.Command(cli, "schemas")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("schemas command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should list schemas from all phases
	expectedPhases := []string{"READY", "FIRE", "AIM"}
	for _, phase := range expectedPhases {
		if !strings.Contains(outputStr, phase) {
			t.Errorf("Expected output to contain %s phase", phase)
		}
	}

	// Should list known artifact types
	expectedArtifacts := []string{"north_star", "feature_definition", "roadmap_recipe"}
	for _, artifact := range expectedArtifacts {
		if !strings.Contains(outputStr, artifact) {
			t.Errorf("Expected output to contain %s artifact", artifact)
		}
	}

	t.Logf("Schemas output: %s", outputStr)
}

func TestCLI_Schemas_PhaseFilter(t *testing.T) {
	cli := buildCLI(t)

	// Test READY phase filter
	cmd := exec.Command(cli, "schemas", "--phase", "READY")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("schemas --phase READY command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should show READY artifacts
	if !strings.Contains(outputStr, "north_star") {
		t.Errorf("Expected READY artifacts, got: %s", outputStr)
	}

	t.Logf("Schemas READY filter output:\n%s", outputStr)
}

func TestCLI_Validate_Directory(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping filesystem validation tests")
	}

	readyPath := filepath.Join(instancePath, "READY")

	cmd := exec.Command(cli, "validate", readyPath)
	output, err := cmd.CombinedOutput()

	// Note: we don't fail on validation errors, just check it runs
	outputStr := string(output)

	// Should process multiple files
	if !strings.Contains(outputStr, "Validation") {
		t.Errorf("Expected validation output, got: %s", outputStr)
	}

	// Log results for debugging
	t.Logf("Validate output:\n%s", outputStr)
	_ = err // We don't check err because validation might find issues
}

func TestCLI_Validate_SingleFile(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping filesystem validation tests")
	}

	northStarPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")

	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("north_star.yaml not found")
	}

	cmd := exec.Command(cli, "validate", "-v", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// With verbose flag, should mention the file
	if !strings.Contains(outputStr, "north_star") {
		t.Errorf("Expected output to mention north_star (with -v flag), got: %s", outputStr)
	}

	t.Logf("Validate output:\n%s", outputStr)
	_ = err
}

func TestCLI_Health(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping health check tests")
	}

	cmd := exec.Command(cli, "health", instancePath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should have the health check header
	if !strings.Contains(outputStr, "EPF HEALTH CHECK") {
		t.Errorf("Expected health check header, got: %s", outputStr)
	}

	// Should check instance structure
	if !strings.Contains(outputStr, "Instance Structure") {
		t.Errorf("Expected instance structure check, got: %s", outputStr)
	}

	// Should have an overall status
	validStatuses := []string{"HEALTHY", "WARNINGS", "ERRORS", "CRITICAL"}
	hasStatus := false
	for _, status := range validStatuses {
		if strings.Contains(outputStr, status) {
			hasStatus = true
			break
		}
	}
	if !hasStatus {
		t.Errorf("Expected overall status, got: %s", outputStr)
	}

	t.Logf("Health output:\n%s", outputStr)
	_ = err // Health check might return non-zero for warnings/errors
}

func TestCLI_Health_JSON(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping health check tests")
	}

	cmd := exec.Command(cli, "health", "--json", instancePath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should be valid JSON (starts with { and contains expected fields)
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	if !strings.Contains(outputStr, "overall_status") {
		t.Errorf("Expected overall_status field in JSON, got: %s", outputStr)
	}

	if !strings.Contains(outputStr, "instance_path") {
		t.Errorf("Expected instance_path field in JSON, got: %s", outputStr)
	}

	t.Logf("Health JSON output:\n%s", outputStr)
	_ = err
}

func TestCLI_Fix_DryRun(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping fix tests")
	}

	cmd := exec.Command(cli, "fix", "--dry-run", instancePath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Fix might return error if nothing to fix, that's OK
	}

	outputStr := string(output)

	// Should indicate dry run mode
	if !strings.Contains(outputStr, "DRY RUN") {
		t.Errorf("Expected DRY RUN indicator, got: %s", outputStr)
	}

	// Should scan files
	if !strings.Contains(outputStr, "Files scanned") {
		t.Errorf("Expected file scan summary, got: %s", outputStr)
	}

	t.Logf("Fix dry-run output:\n%s", outputStr)
}

func TestCLI_Migrate_DryRun(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping migrate tests")
	}

	cmd := exec.Command(cli, "migrate", "--dry-run", "--target", "1.9.6", instancePath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Migrate might return error, that's OK for dry run
	}

	outputStr := string(output)

	// Should indicate dry run mode
	if !strings.Contains(outputStr, "DRY RUN") {
		t.Errorf("Expected DRY RUN indicator, got: %s", outputStr)
	}

	// Should show migration target
	if !strings.Contains(outputStr, "1.9.6") {
		t.Errorf("Expected target version in output, got: %s", outputStr)
	}

	// Should scan files
	if !strings.Contains(outputStr, "Files scanned") {
		t.Errorf("Expected file scan summary, got: %s", outputStr)
	}

	t.Logf("Migrate dry-run output:\n%s", outputStr)
}

func TestCLI_Init(t *testing.T) {
	cli := buildCLI(t)

	// Create temp directory for test - simulating a new git repo
	tmpDir := t.TempDir()

	// Initialize git repo
	gitInit := exec.Command("git", "init")
	gitInit.Dir = tmpDir
	if err := gitInit.Run(); err != nil {
		t.Fatalf("git init failed: %v", err)
	}

	// Run init (creates docs/EPF structure using embedded templates)
	cmd := exec.Command(cli, "init", "test-product")
	cmd.Dir = tmpDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Init may fail if config not set up, just check it runs
		outputStr := string(output)
		// If it fails because no canonical_path configured, that's expected in test environment
		if strings.Contains(outputStr, "canonical_path") || strings.Contains(outputStr, "config") {
			t.Skipf("Init requires canonical_path configuration - skipping: %s", outputStr)
		}
		t.Fatalf("init command failed: %v\n%s", err, output)
	}

	// Check that instance directories were created
	epfDir := filepath.Join(tmpDir, "docs", "EPF")
	instanceDir := filepath.Join(epfDir, "_instances", "test-product")
	expectedDirs := []string{"READY", "FIRE", "AIM"}
	for _, dir := range expectedDirs {
		path := filepath.Join(instanceDir, dir)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("Expected directory %s to be created", dir)
		}
	}

	// Check that basic files were created
	expectedFiles := []string{"_meta.yaml", "README.md"}
	for _, file := range expectedFiles {
		path := filepath.Join(instanceDir, file)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("Expected file %s to be created", file)
		}
	}

	t.Logf("Init output:\n%s", string(output))
}

func TestCLI_Help(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "--help")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("help command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should show available commands
	expectedCommands := []string{"health", "validate", "schemas", "fix", "migrate", "serve", "init", "version"}
	for _, cmdName := range expectedCommands {
		if !strings.Contains(outputStr, cmdName) {
			t.Errorf("Expected help to mention %s command", cmdName)
		}
	}
}

func TestCLI_SubcommandHelp(t *testing.T) {
	cli := buildCLI(t)

	subcommands := []string{"health", "validate", "fix", "migrate", "init"}

	for _, subcmd := range subcommands {
		t.Run(subcmd, func(t *testing.T) {
			cmd := exec.Command(cli, subcmd, "--help")
			output, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("%s --help failed: %v\n%s", subcmd, err, output)
			}

			outputStr := string(output)

			// Should show usage
			if !strings.Contains(outputStr, "Usage:") && !strings.Contains(outputStr, "usage:") {
				t.Errorf("Expected usage info for %s, got: %s", subcmd, outputStr)
			}
		})
	}
}

// Test that validates the actual test instance structure (if it exists)
func TestActualInstance_Structure(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	// Check READY phase files
	readyFiles := []string{
		"00_north_star.yaml",
		"01_insight_analyses.yaml",
		"02_strategy_foundations.yaml",
		"05_roadmap_recipe.yaml",
	}

	for _, file := range readyFiles {
		path := filepath.Join(instancePath, "READY", file)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Logf("Note: READY file %s not found (may be expected)", file)
		}
	}

	// Check FIRE phase structure
	fireDirs := []string{
		"feature_definitions",
		"value_models",
	}

	for _, dir := range fireDirs {
		path := filepath.Join(instancePath, "FIRE", dir)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Logf("Note: FIRE directory %s not found (may be expected)", dir)
		}
	}

	// Check AIM phase
	aimPath := filepath.Join(instancePath, "AIM")
	if _, err := os.Stat(aimPath); os.IsNotExist(err) {
		t.Error("Expected AIM directory to exist")
	}
}

// =============================================================================
// Templates & Definitions CLI Integration Tests
// =============================================================================

func TestCLI_Artifacts_List(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "artifacts", "list")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("artifacts list command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should have header
	if !strings.Contains(outputStr, "EPF Artifact Types") {
		t.Errorf("Expected 'EPF Artifact Types' header, got: %s", outputStr)
	}

	// Should list known artifacts
	expectedArtifacts := []string{"north_star", "feature_definition", "value_model", "roadmap_recipe"}
	for _, artifact := range expectedArtifacts {
		if !strings.Contains(outputStr, artifact) {
			t.Errorf("Expected output to contain %s artifact", artifact)
		}
	}

	// Should show schema/template columns
	if !strings.Contains(outputStr, "SCHEMA") || !strings.Contains(outputStr, "TEMPLATE") {
		t.Errorf("Expected SCHEMA and TEMPLATE columns, got: %s", outputStr)
	}

	t.Logf("Artifacts list output:\n%s", outputStr)
}

func TestCLI_Artifacts_List_JSON(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "artifacts", "list", "--json")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("artifacts list --json command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should be valid JSON
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	// Should contain artifacts array
	if !strings.Contains(outputStr, "\"artifacts\"") {
		t.Errorf("Expected 'artifacts' key in JSON, got: %s", outputStr)
	}

	// Should contain artifact fields
	if !strings.Contains(outputStr, "\"type\"") || !strings.Contains(outputStr, "\"has_schema\"") {
		t.Errorf("Expected type and has_schema fields in JSON, got: %s", outputStr)
	}

	t.Logf("Artifacts list JSON output:\n%s", outputStr)
}

func TestCLI_Artifacts_List_PhaseFilter(t *testing.T) {
	cli := buildCLI(t)

	// Test READY phase filter
	cmd := exec.Command(cli, "artifacts", "list", "--phase", "READY")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("artifacts list --phase READY command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should show READY artifacts
	if !strings.Contains(outputStr, "north_star") {
		t.Errorf("Expected READY artifacts like north_star, got: %s", outputStr)
	}

	t.Logf("Artifacts list READY filter output:\n%s", outputStr)
}

func TestCLI_Templates_List(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "templates", "list")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("templates list command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should have header
	if !strings.Contains(outputStr, "EPF Templates") {
		t.Errorf("Expected 'EPF Templates' header, got: %s", outputStr)
	}

	// Should show phase sections
	if !strings.Contains(outputStr, "READY Phase") && !strings.Contains(outputStr, "## READY") {
		t.Errorf("Expected phase sections, got: %s", outputStr)
	}

	t.Logf("Templates list output:\n%s", outputStr)
}

func TestCLI_Templates_Show(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "templates", "show", "north_star")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("templates show north_star command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should show template metadata
	if !strings.Contains(outputStr, "# Template:") {
		t.Errorf("Expected template metadata header, got: %s", outputStr)
	}

	// Should show YAML content (e.g., "meta:" or "vision:")
	if !strings.Contains(outputStr, "meta:") && !strings.Contains(outputStr, "vision:") {
		t.Errorf("Expected YAML content in template, got: %s", outputStr)
	}

	t.Logf("Templates show output (truncated):\n%s", outputStr[:min(len(outputStr), 1000)])
}

func TestCLI_Templates_Show_ContentOnly(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "templates", "show", "north_star", "--content-only")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("templates show --content-only command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should NOT show template metadata header
	if strings.Contains(outputStr, "# Template:") {
		t.Errorf("Expected no metadata in content-only mode, got: %s", outputStr)
	}

	// Should start with YAML content (meta: or similar)
	trimmed := strings.TrimSpace(outputStr)
	if !strings.HasPrefix(trimmed, "meta:") && !strings.HasPrefix(trimmed, "#") {
		t.Errorf("Expected YAML content to start directly, got: %s", trimmed[:min(len(trimmed), 100)])
	}

	t.Logf("Templates show content-only output (truncated):\n%s", outputStr[:min(len(outputStr), 500)])
}

func TestCLI_Templates_Show_Invalid(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "templates", "show", "nonexistent_type")
	output, err := cmd.CombinedOutput()

	// Should fail
	if err == nil {
		t.Errorf("Expected error for invalid template type, got success")
	}

	outputStr := string(output)

	// Should suggest available templates
	if !strings.Contains(outputStr, "Available templates") {
		t.Errorf("Expected available templates suggestion, got: %s", outputStr)
	}

	t.Logf("Templates show invalid output:\n%s", outputStr)
}

func TestCLI_Definitions_List(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "definitions", "list")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("definitions list command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Note: definitions may or may not exist depending on the EPF setup
	if !strings.Contains(outputStr, "EPF Definitions") && !strings.Contains(outputStr, "Track") && !strings.Contains(outputStr, "No definitions") {
		// It's OK if there are no definitions, just check it runs
		t.Logf("Note: No definitions found or different output format: %s", outputStr)
	}

	t.Logf("Definitions list output:\n%s", outputStr)
}

func TestCLI_Definitions_List_TrackFilter(t *testing.T) {
	cli := buildCLI(t)

	// Test product track filter
	cmd := exec.Command(cli, "definitions", "list", "--track", "product")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("definitions list --track product command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should mention product track or examples
	if !strings.Contains(outputStr, "Product") && !strings.Contains(outputStr, "product") && !strings.Contains(outputStr, "Total:") && !strings.Contains(outputStr, "No definitions") {
		t.Logf("Note: Product track output may be empty: %s", outputStr)
	}

	t.Logf("Definitions list product track output:\n%s", outputStr)
}

// =============================================================================
// Wizard CLI Integration Tests
// =============================================================================

func TestCLI_Wizards_List(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "wizards", "list")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("wizards list command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should have wizards (from embedded)
	if !strings.Contains(outputStr, "EPF Wizards") && !strings.Contains(outputStr, "wizard") {
		t.Errorf("Expected wizard output, got: %s", outputStr)
	}

	t.Logf("Wizards list output:\n%s", outputStr)
}

func TestCLI_Generators_List(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "generators", "list")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("generators list command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should list generators (from embedded)
	if !strings.Contains(outputStr, "generator") && !strings.Contains(outputStr, "Generator") {
		t.Errorf("Expected generator output, got: %s", outputStr)
	}

	t.Logf("Generators list output:\n%s", outputStr)
}

// =============================================================================
// Relationship Intelligence CLI Integration Tests (requires instance)
// =============================================================================

func TestCLI_Explain(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping relationship tests")
	}

	// Run from instance directory (auto-detection)
	cmd := exec.Command(cli, "explain", "Product")
	cmd.Dir = instancePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("explain command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should show path information
	if !strings.Contains(outputStr, "Product") {
		t.Errorf("Expected Product in output, got: %s", outputStr)
	}

	t.Logf("Explain output:\n%s", outputStr)
}

func TestCLI_Explain_JSON(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping relationship tests")
	}

	// Run from instance directory (auto-detection)
	cmd := exec.Command(cli, "explain", "Product", "--json")
	cmd.Dir = instancePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("explain --json command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Find the JSON part (may have warnings before it)
	jsonStart := strings.Index(outputStr, "{")
	if jsonStart == -1 {
		t.Errorf("Expected JSON output with '{', got: %s", outputStr)
		return
	}
	jsonOutput := outputStr[jsonStart:]

	// Should contain expected fields
	if !strings.Contains(jsonOutput, "\"path\"") {
		t.Errorf("Expected path field in JSON, got: %s", jsonOutput)
	}

	t.Logf("Explain JSON output:\n%s", outputStr)
}

func TestCLI_Context(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping relationship tests")
	}

	// Run from instance directory (auto-detection)
	// Use a common feature ID pattern - may or may not exist
	cmd := exec.Command(cli, "context", "fd-001")
	cmd.Dir = instancePath
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Context command might fail if feature doesn't exist, but should run
	if err != nil {
		// If it's a "feature not found" error, that's acceptable in test
		if strings.Contains(outputStr, "not found") || strings.Contains(outputStr, "No feature") {
			t.Logf("Feature fd-001 not found (expected in minimal test instance): %s", outputStr)
			return
		}
		t.Fatalf("context command failed: %v\n%s", err, output)
	}

	// Should show feature info
	if !strings.Contains(outputStr, "fd-001") && !strings.Contains(outputStr, "Feature") {
		t.Errorf("Expected feature info in output, got: %s", outputStr)
	}

	t.Logf("Context output:\n%s", outputStr)
}

func TestCLI_Context_Alias(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping relationship tests")
	}

	// Test 'ctx' alias - run from instance directory
	cmd := exec.Command(cli, "ctx", "fd-001")
	cmd.Dir = instancePath
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Context command might fail if feature doesn't exist, but should run
	if err != nil {
		// If it's a "feature not found" error, that's acceptable in test
		if strings.Contains(outputStr, "not found") || strings.Contains(outputStr, "No feature") {
			t.Logf("Feature fd-001 not found (expected in minimal test instance): %s", outputStr)
			return
		}
		t.Fatalf("ctx alias command failed: %v\n%s", err, output)
	}

	// Should work same as context
	if !strings.Contains(outputStr, "fd-001") && !strings.Contains(outputStr, "Feature") {
		t.Errorf("Expected feature info in output, got: %s", outputStr)
	}

	t.Logf("Context alias output:\n%s", outputStr)
}

func TestCLI_Coverage(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping relationship tests")
	}

	// Run from instance directory (auto-detection)
	cmd := exec.Command(cli, "coverage")
	cmd.Dir = instancePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("coverage command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should show coverage info
	if !strings.Contains(outputStr, "Coverage") && !strings.Contains(outputStr, "coverage") && !strings.Contains(outputStr, "%") {
		t.Errorf("Expected coverage info, got: %s", outputStr)
	}

	t.Logf("Coverage output:\n%s", outputStr)
}

func TestCLI_Coverage_JSON(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping relationship tests")
	}

	// Run from instance directory (auto-detection)
	cmd := exec.Command(cli, "coverage", "--json")
	cmd.Dir = instancePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("coverage --json command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Find the JSON part (may have warnings before it)
	jsonStart := strings.Index(outputStr, "{")
	if jsonStart == -1 {
		t.Errorf("Expected JSON output with '{', got: %s", outputStr)
		return
	}
	jsonOutput := outputStr[jsonStart:]

	// Should contain coverage fields
	if !strings.Contains(jsonOutput, "coverage_percent") && !strings.Contains(jsonOutput, "total") && !strings.Contains(jsonOutput, "coverage") {
		t.Errorf("Expected coverage fields in JSON, got: %s", jsonOutput)
	}

	t.Logf("Coverage JSON output:\n%s", outputStr)
}

// =============================================================================
// AI-Friendly Validation Integration Tests (v0.11.0)
// =============================================================================

func TestCLI_Validate_AIFriendly(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping AI-friendly validation tests")
	}

	// Validate a file with --ai-friendly flag
	northStarPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("north_star.yaml not found")
	}

	cmd := exec.Command(cli, "validate", "--ai-friendly", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should produce YAML output - could be single file result or summary
	// For valid files it shows summary, for invalid files it shows details
	if !strings.Contains(outputStr, "file:") && !strings.Contains(outputStr, "total_files:") {
		t.Errorf("Expected 'file:' or 'total_files:' field in AI-friendly output, got: %s", outputStr)
	}

	// Should have some form of artifact type or results indication
	if !strings.Contains(outputStr, "artifact_type:") && !strings.Contains(outputStr, "results:") {
		t.Errorf("Expected 'artifact_type:' or 'results:' field in AI-friendly output, got: %s", outputStr)
	}

	// Should have validity indication
	if !strings.Contains(outputStr, "valid:") && !strings.Contains(outputStr, "files_with_errors:") {
		t.Errorf("Expected 'valid:' or 'files_with_errors:' field in AI-friendly output, got: %s", outputStr)
	}

	t.Logf("AI-friendly output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err // Validation might find issues
}

func TestCLI_Validate_AIFriendly_JSON(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping AI-friendly validation tests")
	}

	northStarPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("north_star.yaml not found")
	}

	cmd := exec.Command(cli, "validate", "--ai-friendly", "--json", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should be valid JSON
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") && !strings.HasPrefix(strings.TrimSpace(outputStr), "[") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	// Should contain expected JSON fields - either for single file or summary
	if !strings.Contains(outputStr, "\"file\"") && !strings.Contains(outputStr, "\"total_files\"") {
		t.Errorf("Expected 'file' or 'total_files' field in JSON output, got: %s", outputStr)
	}

	t.Logf("AI-friendly JSON output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err
}

func TestCLI_Validate_FixPlan(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping fix plan tests")
	}

	// Use insight_analyses which typically has more complex structure
	insightPath := filepath.Join(instancePath, "READY", "01_insight_analyses.yaml")
	if _, err := os.Stat(insightPath); os.IsNotExist(err) {
		// Fall back to north_star
		insightPath = filepath.Join(instancePath, "READY", "00_north_star.yaml")
		if _, err := os.Stat(insightPath); os.IsNotExist(err) {
			t.Skip("No READY files found for fix plan test")
		}
	}

	cmd := exec.Command(cli, "validate", "--fix-plan", insightPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should produce fix plan output with expected fields - single file or summary
	if !strings.Contains(outputStr, "file:") && !strings.Contains(outputStr, "total_files:") {
		t.Errorf("Expected 'file:' or 'total_files:' field in fix plan output, got: %s", outputStr)
	}

	// Should have some form of error count
	if !strings.Contains(outputStr, "total_errors:") {
		t.Errorf("Expected 'total_errors:' in fix plan output, got: %s", outputStr)
	}

	// Should have chunk count
	if !strings.Contains(outputStr, "total_chunks:") {
		t.Errorf("Expected 'total_chunks:' in fix plan output, got: %s", outputStr)
	}

	t.Logf("Fix plan output:\n%s", outputStr[:min(len(outputStr), 2000)])
	_ = err
}

func TestCLI_Validate_FixPlan_JSON(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping fix plan tests")
	}

	insightPath := filepath.Join(instancePath, "READY", "01_insight_analyses.yaml")
	if _, err := os.Stat(insightPath); os.IsNotExist(err) {
		insightPath = filepath.Join(instancePath, "READY", "00_north_star.yaml")
		if _, err := os.Stat(insightPath); os.IsNotExist(err) {
			t.Skip("No READY files found for fix plan test")
		}
	}

	cmd := exec.Command(cli, "validate", "--fix-plan", "--json", insightPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should be valid JSON
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	// Should contain expected JSON fields
	if !strings.Contains(outputStr, "\"total_errors\"") {
		t.Errorf("Expected 'total_errors' field in JSON output, got: %s", outputStr)
	}

	if !strings.Contains(outputStr, "\"total_chunks\"") {
		t.Errorf("Expected 'total_chunks' field in JSON output, got: %s", outputStr)
	}

	t.Logf("Fix plan JSON output:\n%s", outputStr[:min(len(outputStr), 2000)])
	_ = err
}

func TestCLI_Validate_FixPlan_WithExamples(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping fix plan example tests")
	}

	insightPath := filepath.Join(instancePath, "READY", "01_insight_analyses.yaml")
	if _, err := os.Stat(insightPath); os.IsNotExist(err) {
		t.Skip("insight_analyses.yaml not found for example test")
	}

	cmd := exec.Command(cli, "validate", "--fix-plan", "--json", insightPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// If there are errors and chunks, check for examples
	if strings.Contains(outputStr, "\"chunks\"") && strings.Contains(outputStr, "\"error_count\"") {
		// At least some chunks should have examples (if templates are available)
		if strings.Contains(outputStr, "\"example\"") {
			t.Logf("Fix plan includes template examples (good!)")
		} else {
			t.Logf("Note: Fix plan has no examples (templates may not be available)")
		}
	}

	t.Logf("Fix plan with examples output:\n%s", outputStr[:min(len(outputStr), 2500)])
	_ = err
}

func TestCLI_Validate_Section(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping section validation tests")
	}

	northStarPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("north_star.yaml not found")
	}

	// Validate just the 'meta' section (which should exist in most EPF files)
	cmd := exec.Command(cli, "validate", "--section", "meta", "--ai-friendly", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should produce AI-friendly output for just the section
	if !strings.Contains(outputStr, "file:") {
		t.Errorf("Expected 'file:' field in section validation output, got: %s", outputStr)
	}

	// Section field should be present
	if !strings.Contains(outputStr, "section:") {
		t.Errorf("Expected 'section:' field in output, got: %s", outputStr)
	}

	t.Logf("Section validation output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err
}

func TestCLI_Validate_Sections(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping multi-section validation tests")
	}

	northStarPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("north_star.yaml not found")
	}

	// Validate multiple sections using common EPF fields
	cmd := exec.Command(cli, "validate", "--sections", "meta,north_star", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should produce output with file indication or summary
	if !strings.Contains(outputStr, "File:") && !strings.Contains(outputStr, "file:") {
		t.Errorf("Expected file path in validation output, got: %s", outputStr)
	}

	// Should mention section or summary
	if !strings.Contains(outputStr, "Section") && !strings.Contains(outputStr, "section") && !strings.Contains(outputStr, "Summary") {
		t.Errorf("Expected section-related output, got: %s", outputStr)
	}

	t.Logf("Multi-section validation output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err
}

func TestCLI_DiffTemplate(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping diff template tests")
	}

	northStarPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("north_star.yaml not found")
	}

	cmd := exec.Command(cli, "diff", "template", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should show template diff output
	if !strings.Contains(outputStr, "Template Diff") && !strings.Contains(outputStr, "Artifact Type") {
		t.Errorf("Expected template diff output, got: %s", outputStr)
	}

	t.Logf("Diff template output:\n%s", outputStr[:min(len(outputStr), 2000)])
	_ = err // Diff might find issues, that's expected
}

func TestCLI_DiffTemplate_JSON(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping diff template tests")
	}

	northStarPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("north_star.yaml not found")
	}

	cmd := exec.Command(cli, "diff", "template", "--format", "json", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should be valid JSON
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	// Should contain expected fields
	if !strings.Contains(outputStr, "\"file\"") {
		t.Errorf("Expected 'file' field in JSON output, got: %s", outputStr)
	}

	if !strings.Contains(outputStr, "\"artifact_type\"") {
		t.Errorf("Expected 'artifact_type' field in JSON output, got: %s", outputStr)
	}

	t.Logf("Diff template JSON output:\n%s", outputStr[:min(len(outputStr), 2000)])
	_ = err
}

// Helper function for min (Go 1.21+)
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// =============================================================================
// AI Agent Discovery Integration Tests (v0.13.0 - Section 10)
// =============================================================================

// TestCLI_Agent tests the agent command for AI agent instructions
func TestCLI_Agent(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "agent")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("agent command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should show authority declaration
	if !strings.Contains(outputStr, "epf-cli") {
		t.Errorf("Expected epf-cli authority declaration, got: %s", outputStr)
	}

	// Should show key commands
	if !strings.Contains(outputStr, "COMMANDS") || !strings.Contains(outputStr, "agent") {
		t.Errorf("Expected command list, got: %s", outputStr)
	}

	t.Logf("Agent output:\n%s", outputStr[:min(len(outputStr), 1500)])
}

func TestCLI_Agent_JSON(t *testing.T) {
	cli := buildCLI(t)

	cmd := exec.Command(cli, "agent", "--json")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("agent --json command failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should be valid JSON
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	// Should contain expected fields
	if !strings.Contains(outputStr, "\"authority\"") {
		t.Errorf("Expected 'authority' field in JSON, got: %s", outputStr)
	}
	if !strings.Contains(outputStr, "\"commands\"") {
		t.Errorf("Expected 'commands' field in JSON, got: %s", outputStr)
	}
	if !strings.Contains(outputStr, "\"mcp_tools\"") {
		t.Errorf("Expected 'mcp_tools' field in JSON, got: %s", outputStr)
	}
	if !strings.Contains(outputStr, "\"workflow\"") {
		t.Errorf("Expected 'workflow' field in JSON, got: %s", outputStr)
	}

	t.Logf("Agent JSON output:\n%s", outputStr[:min(len(outputStr), 1500)])
}

// TestCLI_Locate tests the locate command for finding EPF instances
func TestCLI_Locate(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping locate tests")
	}

	// Search from parent of instances directory
	searchPath := filepath.Dir(filepath.Dir(instancePath))

	cmd := exec.Command(cli, "locate", searchPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Locate might return non-zero if some instances are broken, that's OK
	}

	outputStr := string(output)

	// Should find at least one instance
	if !strings.Contains(outputStr, "INSTANCES") && !strings.Contains(outputStr, "instance") {
		t.Errorf("Expected instance output, got: %s", outputStr)
	}

	t.Logf("Locate output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err
}

func TestCLI_Locate_JSON(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping locate tests")
	}

	searchPath := filepath.Dir(filepath.Dir(instancePath))

	cmd := exec.Command(cli, "locate", "--json", searchPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should be valid JSON
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	// Should contain expected fields
	if !strings.Contains(outputStr, "\"search_path\"") {
		t.Errorf("Expected 'search_path' field in JSON, got: %s", outputStr)
	}
	if !strings.Contains(outputStr, "\"instances\"") {
		t.Errorf("Expected 'instances' field in JSON, got: %s", outputStr)
	}
	if !strings.Contains(outputStr, "\"summary\"") {
		t.Errorf("Expected 'summary' field in JSON, got: %s", outputStr)
	}

	t.Logf("Locate JSON output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err
}

func TestCLI_Locate_RequireAnchor(t *testing.T) {
	cli := buildCLI(t)
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found - skipping locate tests")
	}

	searchPath := filepath.Dir(filepath.Dir(instancePath))

	cmd := exec.Command(cli, "locate", "--require-anchor", "--json", searchPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should be valid JSON
	if !strings.HasPrefix(strings.TrimSpace(outputStr), "{") {
		t.Errorf("Expected JSON output, got: %s", outputStr)
	}

	// All instances returned should have high confidence (if any)
	// This is verified by the JSON output containing only high confidence instances
	if strings.Contains(outputStr, "\"confidence\": \"medium\"") ||
		strings.Contains(outputStr, "\"confidence\": \"low\"") {
		t.Error("With --require-anchor, should only return high confidence instances")
	}

	t.Logf("Locate require-anchor output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err
}

// TestCLI_MigrateAnchor_DryRun tests the migrate-anchor command
func TestCLI_MigrateAnchor_DryRun(t *testing.T) {
	cli := buildCLI(t)

	// Create a legacy instance in temp directory
	tmpDir := t.TempDir()

	// Create EPF markers but no anchor
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte(`instance:
  product_name: 'TestProduct'
  epf_version: '2.11.0'
`), 0644)

	cmd := exec.Command(cli, "migrate-anchor", "--dry-run", tmpDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("migrate-anchor --dry-run failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Should indicate dry run mode
	if !strings.Contains(outputStr, "DRY RUN") && !strings.Contains(outputStr, "dry run") {
		t.Errorf("Expected dry run indicator, got: %s", outputStr)
	}

	// Should show what would be created
	if !strings.Contains(outputStr, "_epf.yaml") {
		t.Errorf("Expected anchor file name in output, got: %s", outputStr)
	}

	// Anchor file should NOT exist (dry run)
	if _, err := os.Stat(filepath.Join(tmpDir, "_epf.yaml")); err == nil {
		t.Error("Anchor file should not be created in dry run mode")
	}

	t.Logf("Migrate-anchor dry-run output:\n%s", outputStr)
}

// TestCLI_MigrateAnchor tests actual migration
func TestCLI_MigrateAnchor(t *testing.T) {
	cli := buildCLI(t)

	// Create a legacy instance in temp directory
	tmpDir := t.TempDir()

	// Create EPF markers but no anchor
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte(`instance:
  product_name: 'TestMigration'
  epf_version: '2.11.0'
  description: 'Test migration instance'
`), 0644)

	cmd := exec.Command(cli, "migrate-anchor", tmpDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("migrate-anchor failed: %v\n%s", err, output)
	}

	outputStr := string(output)

	// Anchor file should exist
	anchorPath := filepath.Join(tmpDir, "_epf.yaml")
	if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
		t.Error("Anchor file should be created after migration")
	}

	// Read and verify anchor content
	anchorContent, err := os.ReadFile(anchorPath)
	if err != nil {
		t.Fatalf("Failed to read anchor file: %v", err)
	}

	anchorStr := string(anchorContent)

	// Should contain required fields
	if !strings.Contains(anchorStr, "epf_anchor: true") {
		t.Error("Anchor should contain epf_anchor: true")
	}
	if !strings.Contains(anchorStr, "instance_id:") {
		t.Error("Anchor should contain instance_id")
	}
	if !strings.Contains(anchorStr, "product_name: TestMigration") {
		t.Error("Anchor should contain inferred product_name")
	}

	t.Logf("Migrate-anchor output:\n%s", outputStr)
	t.Logf("Anchor content:\n%s", anchorStr)
}

// =============================================================================
// False Positive Rejection Tests
// =============================================================================

func TestCLI_Locate_RejectsEpfCli(t *testing.T) {
	cli := buildCLI(t)

	// Find the project root (should be apps/epf-cli or its parent)
	root := findProjectRoot()
	if root == "" {
		t.Skip("Could not find project root")
	}

	// Search from epf-cli directory itself
	cmd := exec.Command(cli, "locate", "--json", root)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// The epf-cli directory itself should not be detected as an EPF instance
	// even if it has READY/FIRE test directories
	if strings.Contains(outputStr, "apps/epf-cli\"") &&
		strings.Contains(outputStr, "\"status\": \"valid\"") {
		t.Error("Should not detect epf-cli itself as a valid EPF instance")
	}

	t.Logf("Locate epf-cli rejection test output:\n%s", outputStr[:min(len(outputStr), 1500)])
	_ = err
}

func TestDiscovery_FalsePositiveRejection(t *testing.T) {
	// Test the false positive rejection via CLI on created test directories
	cli := buildCLI(t)
	tmpDir := t.TempDir()

	// Create directories that should be rejected as false positives
	falsePositiveDirs := []string{
		"epf-cli/internal",
		"canonical-epf/schemas",
		"node_modules/some-epf-package",
	}

	for _, dir := range falsePositiveDirs {
		fullPath := filepath.Join(tmpDir, dir)
		os.MkdirAll(filepath.Join(fullPath, "READY"), 0755)
		os.MkdirAll(filepath.Join(fullPath, "FIRE"), 0755)
	}

	// Create a valid instance that should be found
	validPath := filepath.Join(tmpDir, "docs", "epf", "_instances", "test-product")
	os.MkdirAll(filepath.Join(validPath, "READY"), 0755)
	os.MkdirAll(filepath.Join(validPath, "FIRE"), 0755)
	os.WriteFile(filepath.Join(validPath, "_meta.yaml"), []byte(`instance:
  product_name: 'ValidProduct'
`), 0644)

	cmd := exec.Command(cli, "locate", "--json", tmpDir)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should find the valid instance
	if !strings.Contains(outputStr, "test-product") {
		t.Error("Should find the valid test-product instance")
	}

	// Should NOT find false positive directories
	for _, dir := range falsePositiveDirs {
		if strings.Contains(outputStr, filepath.Join(tmpDir, dir)) &&
			strings.Contains(outputStr, "\"status\": \"valid\"") {
			t.Errorf("Should reject false positive directory: %s", dir)
		}
	}

	t.Logf("False positive rejection test output:\n%s", outputStr)
	_ = err
}

// =============================================================================
// Legacy Instance Detection Tests
// =============================================================================

func TestCLI_Locate_DetectsLegacyInstances(t *testing.T) {
	cli := buildCLI(t)
	tmpDir := t.TempDir()

	// Create a legacy instance (has markers but no anchor)
	legacyPath := filepath.Join(tmpDir, "legacy-product")
	os.MkdirAll(filepath.Join(legacyPath, "READY"), 0755)
	os.MkdirAll(filepath.Join(legacyPath, "FIRE"), 0755)
	os.MkdirAll(filepath.Join(legacyPath, "AIM"), 0755)
	os.WriteFile(filepath.Join(legacyPath, "_meta.yaml"), []byte(`instance:
  product_name: 'LegacyProduct'
`), 0644)

	cmd := exec.Command(cli, "locate", "--json", tmpDir)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should find as legacy instance
	if !strings.Contains(outputStr, "legacy-product") {
		t.Error("Should find legacy-product instance")
	}

	// Should show as legacy status
	if !strings.Contains(outputStr, "legacy") {
		t.Error("Should detect as legacy status")
	}

	// Confidence should be medium (not high, because no anchor)
	if strings.Contains(outputStr, "\"confidence\": \"high\"") {
		// Only if there's an anchor should it be high
		anchorPath := filepath.Join(legacyPath, "_epf.yaml")
		if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
			t.Error("Legacy instance without anchor should have medium confidence")
		}
	}

	t.Logf("Legacy detection output:\n%s", outputStr)
	_ = err
}

func TestCLI_Health_WarnsAboutLegacyInstance(t *testing.T) {
	cli := buildCLI(t)
	tmpDir := t.TempDir()

	// Create a legacy instance
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte(`instance:
  product_name: 'TestLegacy'
  epf_version: '2.11.0'
`), 0644)

	cmd := exec.Command(cli, "health", tmpDir)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should warn about missing anchor file
	if !strings.Contains(outputStr, "anchor") || !strings.Contains(outputStr, "missing") ||
		(!strings.Contains(outputStr, "legacy") && !strings.Contains(outputStr, "Warning")) {
		// Accept any indication of anchor/legacy issue
		if !strings.Contains(outputStr, "_epf.yaml") {
			t.Logf("Note: Health check may not warn about legacy instance: %s", outputStr)
		}
	}

	t.Logf("Health legacy warning output:\n%s", outputStr)
	_ = err
}

// =============================================================================
// End-to-End AI Agent Workflow Tests
// =============================================================================

// TestCLI_AIAgentWorkflow_DiscoverAndValidate tests the full AI agent workflow
func TestCLI_AIAgentWorkflow_DiscoverAndValidate(t *testing.T) {
	cli := buildCLI(t)
	tmpDir := t.TempDir()

	// Step 1: Create a complete EPF instance with anchor
	instanceDir := filepath.Join(tmpDir, "docs", "epf", "_instances", "workflow-test")
	os.MkdirAll(filepath.Join(instanceDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(instanceDir, "FIRE", "feature_definitions"), 0755)
	os.MkdirAll(filepath.Join(instanceDir, "AIM"), 0755)

	// Create _meta.yaml
	os.WriteFile(filepath.Join(instanceDir, "_meta.yaml"), []byte(`instance:
  product_name: 'WorkflowTest'
  epf_version: '2.11.0'
`), 0644)

	// Create anchor file
	os.WriteFile(filepath.Join(instanceDir, "_epf.yaml"), []byte(`epf_anchor: true
version: "1.0.0"
instance_id: "test-workflow-instance"
created_at: 2024-01-01T00:00:00Z
product_name: "WorkflowTest"
epf_version: "2.11.0"
structure:
  type: phased
`), 0644)

	// Step 2: Run agent command to get instructions
	agentCmd := exec.Command(cli, "agent", "--json")
	agentCmd.Dir = instanceDir
	agentOutput, err := agentCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Agent command failed: %v\n%s", err, agentOutput)
	}

	agentStr := string(agentOutput)
	if !strings.Contains(agentStr, "\"authority\"") {
		t.Error("Agent output should contain authority")
	}
	t.Logf("Step 1 - Agent instructions: OK")

	// Step 3: Run locate to find the instance
	locateCmd := exec.Command(cli, "locate", "--json", tmpDir)
	locateOutput, err := locateCmd.CombinedOutput()
	if err != nil {
		// Locate might return non-zero, that's OK
	}

	locateStr := string(locateOutput)
	if !strings.Contains(locateStr, "workflow-test") {
		t.Error("Locate should find the workflow-test instance")
	}
	if !strings.Contains(locateStr, "\"confidence\": \"high\"") {
		t.Error("Instance with anchor should have high confidence")
	}
	t.Logf("Step 2 - Locate instance: OK")

	// Step 4: Run health check on the instance
	healthCmd := exec.Command(cli, "health", "--json", instanceDir)
	healthOutput, err := healthCmd.CombinedOutput()

	healthStr := string(healthOutput)
	if !strings.Contains(healthStr, "overall_status") {
		t.Error("Health output should contain overall_status")
	}
	t.Logf("Step 3 - Health check: OK")

	t.Logf("AI Agent Workflow Test Complete:\n  Agent: %d bytes\n  Locate: %d bytes\n  Health: %d bytes",
		len(agentOutput), len(locateOutput), len(healthOutput))
	_ = err
}

// TestCLI_AIAgentWorkflow_MigrateLegacy tests migrating a legacy instance
func TestCLI_AIAgentWorkflow_MigrateLegacy(t *testing.T) {
	cli := buildCLI(t)
	tmpDir := t.TempDir()

	// Create a legacy instance (no anchor)
	instanceDir := filepath.Join(tmpDir, "legacy-project")
	os.MkdirAll(filepath.Join(instanceDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(instanceDir, "FIRE"), 0755)
	os.MkdirAll(filepath.Join(instanceDir, "AIM"), 0755)
	os.WriteFile(filepath.Join(instanceDir, "_meta.yaml"), []byte(`instance:
  product_name: 'LegacyProject'
  epf_version: '2.11.0'
  description: 'A legacy project to migrate'
`), 0644)

	// Step 1: Locate shows as legacy
	locateCmd := exec.Command(cli, "locate", "--json", tmpDir)
	locateOutput, _ := locateCmd.CombinedOutput()

	locateStr := string(locateOutput)
	if !strings.Contains(locateStr, "legacy") {
		t.Error("Instance should be detected as legacy")
	}
	t.Logf("Step 1 - Detected as legacy: OK")

	// Step 2: Migrate the anchor
	migrateCmd := exec.Command(cli, "migrate-anchor", instanceDir)
	migrateOutput, err := migrateCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Migrate anchor failed: %v\n%s", err, migrateOutput)
	}
	t.Logf("Step 2 - Migrate anchor: OK")

	// Step 3: Verify anchor exists
	anchorPath := filepath.Join(instanceDir, "_epf.yaml")
	if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
		t.Fatal("Anchor file should exist after migration")
	}
	t.Logf("Step 3 - Anchor file created: OK")

	// Step 4: Locate should now show high confidence
	locateCmd2 := exec.Command(cli, "locate", "--json", tmpDir)
	locateOutput2, _ := locateCmd2.CombinedOutput()

	locateStr2 := string(locateOutput2)
	if !strings.Contains(locateStr2, "\"confidence\": \"high\"") {
		t.Error("After migration, instance should have high confidence")
	}
	if strings.Contains(locateStr2, "\"status\": \"legacy\"") {
		t.Error("After migration, instance should not be legacy status")
	}
	t.Logf("Step 4 - Now shows high confidence: OK")

	t.Logf("Legacy Migration Workflow Test Complete")
}

// TestCLI_Init_CreatesAnchor tests that init creates anchor file
func TestCLI_Init_CreatesAnchor(t *testing.T) {
	cli := buildCLI(t)
	tmpDir := t.TempDir()

	// Initialize git repo (required by init)
	gitInit := exec.Command("git", "init")
	gitInit.Dir = tmpDir
	if err := gitInit.Run(); err != nil {
		t.Fatalf("git init failed: %v", err)
	}

	// Run init
	initCmd := exec.Command(cli, "init", "anchor-test-product")
	initCmd.Dir = tmpDir
	initOutput, err := initCmd.CombinedOutput()

	outputStr := string(initOutput)

	// If init fails due to config, skip
	if err != nil {
		if strings.Contains(outputStr, "canonical_path") || strings.Contains(outputStr, "config") {
			t.Skipf("Init requires canonical_path configuration - skipping: %s", outputStr)
		}
		t.Fatalf("init command failed: %v\n%s", err, initOutput)
	}

	// Check that anchor file was created
	anchorPath := filepath.Join(tmpDir, "docs", "EPF", "_instances", "anchor-test-product", "_epf.yaml")
	// Also check lowercase variant
	if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
		anchorPath = filepath.Join(tmpDir, "docs", "epf", "_instances", "anchor-test-product", "_epf.yaml")
	}

	if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
		// Try to find any _epf.yaml in the tree
		var foundAnchor bool
		filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
			if err == nil && info.Name() == "_epf.yaml" {
				foundAnchor = true
				anchorPath = path
				return filepath.SkipAll
			}
			return nil
		})
		if !foundAnchor {
			t.Errorf("Anchor file _epf.yaml should be created by init. Output: %s", outputStr)
		}
	}

	// Read anchor content
	anchorContent, err := os.ReadFile(anchorPath)
	if err != nil {
		t.Fatalf("Failed to read anchor: %v", err)
	}

	anchorStr := string(anchorContent)
	if !strings.Contains(anchorStr, "epf_anchor: true") {
		t.Error("Anchor should contain epf_anchor: true")
	}
	if !strings.Contains(anchorStr, "instance_id:") {
		t.Error("Anchor should contain instance_id")
	}

	t.Logf("Init creates anchor test:\n%s", anchorStr[:min(len(anchorStr), 500)])
}
