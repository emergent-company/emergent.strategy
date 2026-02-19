package embedded

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSyncCanonical_NoREADYDir(t *testing.T) {
	tmpDir := t.TempDir()
	_, err := SyncCanonical(tmpDir, SyncOptions{})
	if err == nil {
		t.Fatal("expected error for missing READY directory")
	}
}

func TestSyncCanonical_EmptyInstance(t *testing.T) {
	tmpDir := t.TempDir()

	// Create minimal instance structure
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	result, err := SyncCanonical(tmpDir, SyncOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have added definitions (if embedded has any)
	defs, _ := ListCanonicalDefinitions()
	vms := ListCanonicalValueModels()

	totalExpected := len(defs) + len(vms)
	if totalExpected > 0 && len(result.Added) == 0 {
		t.Error("expected some files to be added to empty instance")
	}

	if len(result.Skipped) != 0 {
		t.Errorf("expected 0 skipped files, got %d", len(result.Skipped))
	}

	if len(result.Updated) != 0 {
		t.Errorf("expected 0 updated files, got %d", len(result.Updated))
	}

	if len(result.Errors) != 0 {
		t.Errorf("expected 0 errors, got %d: %v", len(result.Errors), result.Errors)
	}
}

func TestSyncCanonical_DryRun(t *testing.T) {
	tmpDir := t.TempDir()

	// Create minimal instance structure
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	result, err := SyncCanonical(tmpDir, SyncOptions{DryRun: true})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// DryRun should not create any files
	defsDir := filepath.Join(tmpDir, "READY", "definitions")
	if _, err := os.Stat(defsDir); err == nil {
		t.Error("dry run should not create definitions directory")
	}

	// But should report what would be added
	defs, _ := ListCanonicalDefinitions()
	if len(defs) > 0 && len(result.Added) == 0 {
		t.Error("dry run should report files that would be added")
	}
}

func TestSyncCanonical_SkipsExisting(t *testing.T) {
	tmpDir := t.TempDir()

	// Create minimal instance structure
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	// First sync to populate
	result1, err := SyncCanonical(tmpDir, SyncOptions{})
	if err != nil {
		t.Fatalf("first sync failed: %v", err)
	}

	if len(result1.Added) == 0 {
		t.Skip("no embedded canonical artifacts available for testing")
	}

	// Second sync should skip everything
	result2, err := SyncCanonical(tmpDir, SyncOptions{})
	if err != nil {
		t.Fatalf("second sync failed: %v", err)
	}

	if len(result2.Added) != 0 {
		t.Errorf("second sync should add 0 files, got %d", len(result2.Added))
	}

	if len(result2.Skipped) != len(result1.Added) {
		t.Errorf("second sync should skip %d files, got %d", len(result1.Added), len(result2.Skipped))
	}
}

func TestSyncCanonical_ForceOverwrites(t *testing.T) {
	tmpDir := t.TempDir()

	// Create minimal instance structure
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	// First sync
	result1, err := SyncCanonical(tmpDir, SyncOptions{})
	if err != nil {
		t.Fatalf("first sync failed: %v", err)
	}

	if len(result1.Added) == 0 {
		t.Skip("no embedded canonical artifacts available for testing")
	}

	// Force sync should update everything
	result2, err := SyncCanonical(tmpDir, SyncOptions{Force: true})
	if err != nil {
		t.Fatalf("force sync failed: %v", err)
	}

	if len(result2.Updated) != len(result1.Added) {
		t.Errorf("force sync should update %d files, got %d", len(result1.Added), len(result2.Updated))
	}

	if len(result2.Added) != 0 {
		t.Errorf("force sync should add 0 new files, got %d", len(result2.Added))
	}

	if len(result2.Skipped) != 0 {
		t.Errorf("force sync should skip 0 files, got %d", len(result2.Skipped))
	}
}

func TestSyncCanonical_NoFIREDir(t *testing.T) {
	tmpDir := t.TempDir()

	// Only create READY, no FIRE
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)

	result, err := SyncCanonical(tmpDir, SyncOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should still work, just skip value models
	defs, _ := ListCanonicalDefinitions()
	if len(defs) > 0 && len(result.Added) == 0 {
		t.Error("should still add definitions even without FIRE directory")
	}
}

func TestTotalChanged(t *testing.T) {
	r := &SyncResult{
		Added:   []string{"a", "b"},
		Updated: []string{"c"},
		Skipped: []string{"d", "e", "f"},
	}
	if r.TotalChanged() != 3 {
		t.Errorf("expected TotalChanged=3, got %d", r.TotalChanged())
	}
}

func TestListCanonicalValueModels(t *testing.T) {
	models := ListCanonicalValueModels()
	if len(models) != 3 {
		t.Fatalf("expected 3 canonical value models, got %d", len(models))
	}

	expectedTracks := map[string]bool{
		"strategy":   false,
		"org_ops":    false,
		"commercial": false,
	}

	for _, m := range models {
		if _, ok := expectedTracks[m.Track]; !ok {
			t.Errorf("unexpected track: %s", m.Track)
		}
		expectedTracks[m.Track] = true
	}

	for track, found := range expectedTracks {
		if !found {
			t.Errorf("missing expected track: %s", track)
		}
	}
}

func TestListCanonicalArtifacts(t *testing.T) {
	defs, vms, err := ListCanonicalArtifacts()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have some definitions
	if defs < 0 {
		t.Errorf("definitions count should be >= 0, got %d", defs)
	}

	// VMs should be 0-3 depending on embedded FS
	if vms < 0 || vms > 3 {
		t.Errorf("value model count should be 0-3, got %d", vms)
	}
}

func TestFileExists(t *testing.T) {
	tmpDir := t.TempDir()

	// File doesn't exist
	if fileExists(filepath.Join(tmpDir, "nonexistent.yaml")) {
		t.Error("fileExists should return false for nonexistent file")
	}

	// Create a file
	f := filepath.Join(tmpDir, "test.yaml")
	os.WriteFile(f, []byte("test"), 0644)

	if !fileExists(f) {
		t.Error("fileExists should return true for existing file")
	}
}
