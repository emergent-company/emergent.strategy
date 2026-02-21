package migration

import (
	"os"
	"path/filepath"
	"testing"
)

// helper: create a minimal EPF instance with old-structure directories and files
func setupOldStructureInstance(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	// Old product feature definitions
	oldFD := filepath.Join(root, "FIRE", "feature_definitions")
	if err := os.MkdirAll(oldFD, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldFD, "fd-001_test.yaml"), []byte("id: fd-001\nname: Test Feature\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldFD, "fd-002_other.yaml"), []byte("id: fd-002\nname: Other Feature\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Old strategy definitions in READY
	oldStrategy := filepath.Join(root, "READY", "definitions", "strategy")
	if err := os.MkdirAll(oldStrategy, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldStrategy, "sd-001.yaml"), []byte("id: sd-001\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Old org_ops definitions in READY
	oldOrgOps := filepath.Join(root, "READY", "definitions", "org_ops")
	if err := os.MkdirAll(oldOrgOps, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldOrgOps, "pd-001.yaml"), []byte("id: pd-001\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Old commercial definitions in READY
	oldCommercial := filepath.Join(root, "READY", "definitions", "commercial")
	if err := os.MkdirAll(oldCommercial, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldCommercial, "cd-001.yaml"), []byte("id: cd-001\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create FIRE/definitions to ensure it exists (but empty)
	if err := os.MkdirAll(filepath.Join(root, "FIRE", "definitions"), 0o755); err != nil {
		t.Fatal(err)
	}

	return root
}

func TestDetectDefinitionMigration_NeedsMigrate(t *testing.T) {
	root := setupOldStructureInstance(t)

	result, err := DetectDefinitionMigration(root)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !result.NeedsMigrate {
		t.Error("expected NeedsMigrate=true, got false")
	}
	if result.DryRun != true {
		t.Error("detect should always set DryRun=true")
	}

	// Should find 5 files to move: 2 product FDs + 1 strategy + 1 org_ops + 1 commercial
	if len(result.Moves) != 5 {
		t.Errorf("expected 5 moves, got %d", len(result.Moves))
		for _, m := range result.Moves {
			t.Logf("  %s → %s", m.OldPath, m.NewPath)
		}
	}

	// Verify move paths
	moveMap := map[string]string{}
	for _, m := range result.Moves {
		moveMap[m.OldPath] = m.NewPath
	}

	expected := map[string]string{
		filepath.Join("FIRE", "feature_definitions", "fd-001_test.yaml"):   filepath.Join("FIRE", "definitions", "product", "fd-001_test.yaml"),
		filepath.Join("FIRE", "feature_definitions", "fd-002_other.yaml"):  filepath.Join("FIRE", "definitions", "product", "fd-002_other.yaml"),
		filepath.Join("READY", "definitions", "strategy", "sd-001.yaml"):   filepath.Join("FIRE", "definitions", "strategy", "sd-001.yaml"),
		filepath.Join("READY", "definitions", "org_ops", "pd-001.yaml"):    filepath.Join("FIRE", "definitions", "org_ops", "pd-001.yaml"),
		filepath.Join("READY", "definitions", "commercial", "cd-001.yaml"): filepath.Join("FIRE", "definitions", "commercial", "cd-001.yaml"),
	}

	for oldPath, newPath := range expected {
		if actual, ok := moveMap[oldPath]; !ok {
			t.Errorf("missing expected move: %s", oldPath)
		} else if actual != newPath {
			t.Errorf("wrong destination for %s: expected %s, got %s", oldPath, newPath, actual)
		}
	}
}

func TestDetectDefinitionMigration_NoMigrationNeeded(t *testing.T) {
	root := t.TempDir()

	// Create only new-structure directories
	newDirs := []string{
		"FIRE/definitions/product",
		"FIRE/definitions/strategy",
		"FIRE/definitions/org_ops",
		"FIRE/definitions/commercial",
		"FIRE/value_models",
	}
	for _, d := range newDirs {
		if err := os.MkdirAll(filepath.Join(root, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "FIRE", "definitions", "product", "fd-001.yaml"), []byte("id: fd-001\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := DetectDefinitionMigration(root)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.NeedsMigrate {
		t.Error("expected NeedsMigrate=false, got true")
	}
	if len(result.Moves) != 0 {
		t.Errorf("expected 0 moves, got %d", len(result.Moves))
	}
}

func TestMigrateDefinitions_DryRun(t *testing.T) {
	root := setupOldStructureInstance(t)

	result, err := MigrateDefinitions(root, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !result.DryRun {
		t.Error("expected DryRun=true")
	}
	if !result.NeedsMigrate {
		t.Error("expected NeedsMigrate=true")
	}
	if len(result.Moves) != 5 {
		t.Errorf("expected 5 moves planned, got %d", len(result.Moves))
	}

	// Verify files were NOT actually moved (dry run)
	oldFD := filepath.Join(root, "FIRE", "feature_definitions", "fd-001_test.yaml")
	if _, err := os.Stat(oldFD); os.IsNotExist(err) {
		t.Error("dry run should not move files — old file is missing")
	}

	newFD := filepath.Join(root, "FIRE", "definitions", "product", "fd-001_test.yaml")
	if _, err := os.Stat(newFD); err == nil {
		t.Error("dry run should not create files at new location")
	}
}

func TestMigrateDefinitions_ActualMigration(t *testing.T) {
	root := setupOldStructureInstance(t)

	result, err := MigrateDefinitions(root, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.DryRun {
		t.Error("expected DryRun=false")
	}
	if !result.NeedsMigrate {
		t.Error("expected NeedsMigrate=true")
	}
	if len(result.Moves) != 5 {
		t.Errorf("expected 5 moves, got %d", len(result.Moves))
	}

	// Verify files ARE at new locations
	newFiles := []string{
		"FIRE/definitions/product/fd-001_test.yaml",
		"FIRE/definitions/product/fd-002_other.yaml",
		"FIRE/definitions/strategy/sd-001.yaml",
		"FIRE/definitions/org_ops/pd-001.yaml",
		"FIRE/definitions/commercial/cd-001.yaml",
	}
	for _, f := range newFiles {
		path := filepath.Join(root, f)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("expected file at new location: %s", f)
		}
	}

	// Verify old directories are cleaned up
	oldDirs := []string{
		"FIRE/feature_definitions",
		"READY/definitions/strategy",
		"READY/definitions/org_ops",
		"READY/definitions/commercial",
	}
	for _, d := range oldDirs {
		path := filepath.Join(root, d)
		if _, err := os.Stat(path); err == nil {
			t.Errorf("old directory should be removed: %s", d)
		}
	}

	// Verify file content is preserved
	content, err := os.ReadFile(filepath.Join(root, "FIRE", "definitions", "product", "fd-001_test.yaml"))
	if err != nil {
		t.Fatalf("failed to read migrated file: %v", err)
	}
	if string(content) != "id: fd-001\nname: Test Feature\n" {
		t.Errorf("file content was corrupted during migration: %q", string(content))
	}
}

func TestMigrateDefinitions_Idempotent(t *testing.T) {
	root := setupOldStructureInstance(t)

	// First migration
	_, err := MigrateDefinitions(root, false)
	if err != nil {
		t.Fatalf("first migration failed: %v", err)
	}

	// Second migration should report no work needed
	result, err := MigrateDefinitions(root, false)
	if err != nil {
		t.Fatalf("second migration failed: %v", err)
	}

	if result.NeedsMigrate {
		t.Error("expected NeedsMigrate=false after second run (idempotent)")
	}
	if len(result.Moves) != 0 {
		t.Errorf("expected 0 moves on second run, got %d", len(result.Moves))
	}
}

func TestMigrateDefinitions_ConflictHandling(t *testing.T) {
	root := setupOldStructureInstance(t)

	// Pre-create a file at the destination to cause a conflict
	conflictDir := filepath.Join(root, "FIRE", "definitions", "product")
	if err := os.MkdirAll(conflictDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(conflictDir, "fd-001_test.yaml"), []byte("existing content\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := MigrateDefinitions(root, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have warnings about the conflict
	hasConflictWarning := false
	for _, w := range result.Warnings {
		if w != "" {
			hasConflictWarning = true
			break
		}
	}
	if !hasConflictWarning {
		t.Error("expected conflict warning when destination file already exists")
	}

	// The existing file at destination should be preserved (not overwritten)
	content, err := os.ReadFile(filepath.Join(conflictDir, "fd-001_test.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "existing content\n" {
		t.Errorf("existing file should not be overwritten, got: %q", string(content))
	}
}

func TestMigrateDefinitions_PartialOldStructure(t *testing.T) {
	root := t.TempDir()

	// Only create old feature_definitions, no READY/definitions
	oldFD := filepath.Join(root, "FIRE", "feature_definitions")
	if err := os.MkdirAll(oldFD, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldFD, "fd-001.yaml"), []byte("id: fd-001\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := MigrateDefinitions(root, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !result.NeedsMigrate {
		t.Error("expected NeedsMigrate=true")
	}
	if len(result.Moves) != 1 {
		t.Errorf("expected 1 move, got %d", len(result.Moves))
	}

	// Verify file moved
	if _, err := os.Stat(filepath.Join(root, "FIRE", "definitions", "product", "fd-001.yaml")); os.IsNotExist(err) {
		t.Error("file should have been moved to FIRE/definitions/product/")
	}
}

func TestMigrateDefinitions_EmptyOldDirectories(t *testing.T) {
	root := t.TempDir()

	// Create old directories but with no files
	if err := os.MkdirAll(filepath.Join(root, "FIRE", "feature_definitions"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "READY", "definitions", "strategy"), 0o755); err != nil {
		t.Fatal(err)
	}

	result, err := DetectDefinitionMigration(root)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Empty directories have no files to move
	if result.NeedsMigrate {
		t.Error("expected NeedsMigrate=false for empty directories")
	}
	if len(result.Moves) != 0 {
		t.Errorf("expected 0 moves for empty directories, got %d", len(result.Moves))
	}
}

func TestDetectDefinitionMigration_NonExistentPath(t *testing.T) {
	result, err := DetectDefinitionMigration("/nonexistent/path/that/does/not/exist")
	if err != nil {
		t.Fatalf("should not error on non-existent path: %v", err)
	}
	if result.NeedsMigrate {
		t.Error("non-existent path should not need migration")
	}
}
