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

	cmd := exec.Command(cli, "validate", northStarPath)
	output, err := cmd.CombinedOutput()

	outputStr := string(output)

	// Should mention the file
	if !strings.Contains(outputStr, "north_star") {
		t.Errorf("Expected output to mention north_star, got: %s", outputStr)
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

// Helper function for min (Go 1.21+)
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
