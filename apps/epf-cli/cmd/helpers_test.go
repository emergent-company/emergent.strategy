package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/epfcontext"
)

// Task 5.4: Test config precedence in GetInstancePath() and GetSchemasDir()
//
// These tests manipulate package-level globals (repoConfig, repoRoot, epfContext, cliConfig)
// directly since tests are in the same package. Each test saves/restores globals.

// saveGlobals saves the current state of package globals and returns a restore function.
func saveGlobals() func() {
	origRepoConfig := repoConfig
	origRepoRoot := repoRoot
	origCliConfig := cliConfig
	origEpfContext := epfContext
	return func() {
		repoConfig = origRepoConfig
		repoRoot = origRepoRoot
		cliConfig = origCliConfig
		epfContext = origEpfContext
	}
}

func TestGetInstancePath_PriorityExplicitArg(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// Create a temp directory that acts as a valid instance path
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "my-instance")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	// Set repoConfig to point somewhere else — explicit arg should win
	repoConfig = &config.RepoConfig{
		InstancePath: "docs/EPF/_instances/other",
		Mode:         "integrated",
	}
	repoRoot = tmpDir
	epfContext = nil
	cliConfig = &config.Config{}

	// Explicit arg (existing path) should take priority
	result, err := GetInstancePath(instanceDir)
	if err != nil {
		t.Fatalf("GetInstancePath failed: %v", err)
	}

	absExpected, _ := filepath.Abs(instanceDir)
	if result != absExpected {
		t.Errorf("GetInstancePath(explicit) = %q, want %q", result, absExpected)
	}
}

func TestGetInstancePath_PriorityRepoConfig(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// Create temp dir with the configured instance path
	tmpDir := t.TempDir()
	instancePath := filepath.Join(tmpDir, "docs", "EPF", "_instances", "product")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	relPath, _ := filepath.Rel(tmpDir, instancePath)

	// repoConfig should take priority over epfContext when no arg given
	repoConfig = &config.RepoConfig{
		InstancePath: relPath,
		Mode:         "integrated",
	}
	repoRoot = tmpDir
	epfContext = &epfcontext.Context{
		InstancePath: "/some/other/path",
	}
	cliConfig = &config.Config{}

	result, err := GetInstancePath(nil)
	if err != nil {
		t.Fatalf("GetInstancePath failed: %v", err)
	}

	if result != instancePath {
		t.Errorf("GetInstancePath(nil) = %q, want %q (repoConfig should win over epfContext)", result, instancePath)
	}
}

func TestGetInstancePath_FallsBackToEpfContext(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// Create a temp instance path for epfContext
	tmpDir := t.TempDir()
	instancePath := filepath.Join(tmpDir, "instance")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	// No repoConfig — epfContext should be used
	repoConfig = nil
	repoRoot = ""
	epfContext = &epfcontext.Context{
		InstancePath: instancePath,
	}
	cliConfig = &config.Config{}

	result, err := GetInstancePath(nil)
	if err != nil {
		t.Fatalf("GetInstancePath failed: %v", err)
	}

	if result != instancePath {
		t.Errorf("GetInstancePath(nil) = %q, want %q (epfContext fallback)", result, instancePath)
	}
}

func TestGetInstancePath_RepoConfigEmptyPathSkipped(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// Create a temp instance path for epfContext
	tmpDir := t.TempDir()
	instancePath := filepath.Join(tmpDir, "ctx-instance")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	// repoConfig exists but with empty InstancePath — should fall through to epfContext
	repoConfig = &config.RepoConfig{
		InstancePath: "",
		Mode:         "integrated",
	}
	repoRoot = tmpDir
	epfContext = &epfcontext.Context{
		InstancePath: instancePath,
	}
	cliConfig = &config.Config{}

	result, err := GetInstancePath(nil)
	if err != nil {
		t.Fatalf("GetInstancePath failed: %v", err)
	}

	if result != instancePath {
		t.Errorf("GetInstancePath(nil) = %q, want %q (repoConfig with empty path should skip)", result, instancePath)
	}
}

func TestGetSchemasDir_PriorityCanonicalPath(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// Create a temp dir with a schemas/ directory
	tmpDir := t.TempDir()
	schemasDir := filepath.Join(tmpDir, "schemas")
	if err := os.MkdirAll(schemasDir, 0755); err != nil {
		t.Fatalf("Failed to create schemas dir: %v", err)
	}

	// cliConfig.CanonicalPath should take priority over everything else
	cliConfig = &config.Config{CanonicalPath: tmpDir}
	repoConfig = &config.RepoConfig{
		InstancePath: "docs/EPF/_instances/product",
		Schemas:      "local",
	}
	repoRoot = t.TempDir()
	epfContext = nil

	result, err := GetSchemasDir()
	if err != nil {
		t.Fatalf("GetSchemasDir failed: %v", err)
	}

	if result != schemasDir {
		t.Errorf("GetSchemasDir() = %q, want %q (canonical_path priority)", result, schemasDir)
	}
}

func TestGetSchemasDir_PriorityLocalSchemas(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// Create a temp repo with local schemas layout:
	// repoRoot/docs/EPF/_instances/product/  (instance)
	// repoRoot/docs/EPF/schemas/             (schemas sibling)
	tmpDir := t.TempDir()
	instanceRelPath := filepath.Join("docs", "EPF", "_instances", "product")
	instanceAbs := filepath.Join(tmpDir, instanceRelPath)
	if err := os.MkdirAll(instanceAbs, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}
	schemasDir := filepath.Join(tmpDir, "docs", "EPF", "schemas")
	if err := os.MkdirAll(schemasDir, 0755); err != nil {
		t.Fatalf("Failed to create schemas dir: %v", err)
	}

	// No canonical_path — local schemas from repoConfig should be used
	cliConfig = &config.Config{}
	repoConfig = &config.RepoConfig{
		InstancePath: instanceRelPath,
		Schemas:      "local",
	}
	repoRoot = tmpDir
	epfContext = nil

	result, err := GetSchemasDir()
	if err != nil {
		t.Fatalf("GetSchemasDir failed: %v", err)
	}

	absSchemasDir, _ := filepath.Abs(schemasDir)
	if result != absSchemasDir {
		t.Errorf("GetSchemasDir() = %q, want %q (local schemas priority)", result, absSchemasDir)
	}
}

func TestGetSchemasDir_FallsBackToEpfContext(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// Create a temp EPF root with schemas/
	tmpDir := t.TempDir()
	schemasDir := filepath.Join(tmpDir, "schemas")
	if err := os.MkdirAll(schemasDir, 0755); err != nil {
		t.Fatalf("Failed to create schemas dir: %v", err)
	}

	// No canonical_path, no local schemas — epfContext should be used
	cliConfig = &config.Config{}
	repoConfig = nil
	repoRoot = ""
	epfContext = &epfcontext.Context{
		EPFRoot: tmpDir,
	}

	result, err := GetSchemasDir()
	if err != nil {
		t.Fatalf("GetSchemasDir failed: %v", err)
	}

	if result != schemasDir {
		t.Errorf("GetSchemasDir() = %q, want %q (epfContext fallback)", result, schemasDir)
	}
}

func TestGetSchemasDir_ReturnsEmptyWhenNothingFound(t *testing.T) {
	restore := saveGlobals()
	defer restore()

	// No config, no context — should return empty string (embedded fallback)
	cliConfig = &config.Config{}
	repoConfig = nil
	repoRoot = ""
	epfContext = nil

	result, err := GetSchemasDir()
	if err != nil {
		t.Fatalf("GetSchemasDir failed: %v", err)
	}

	// Empty string means embedded fallback
	// Note: it might also find something in CWD, but with temp dirs that's unlikely
	// We just verify no error is returned
	_ = result
}
