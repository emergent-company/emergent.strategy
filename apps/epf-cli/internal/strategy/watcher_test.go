package strategy

import (
	"context"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
)

func TestWatcher_StartStop(t *testing.T) {
	// Create temp directory with EPF structure
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a minimal north star file
	northStarContent := `
meta:
  epf_version: "2.0.0"
purpose:
  statement: "Test purpose"
`
	if err := os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(northStarContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Create store
	store := NewFileSystemSource(tmpDir)
	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatal(err)
	}

	// Create watcher
	watcher := NewWatcher(store, tmpDir, 50, nil) // 50ms debounce for faster tests

	// Test start
	if err := watcher.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if !watcher.IsRunning() {
		t.Error("Watcher should be running after Start")
	}

	// Test double start (should be no-op)
	if err := watcher.Start(ctx); err != nil {
		t.Errorf("Double start should not error: %v", err)
	}

	// Test stop
	if err := watcher.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if watcher.IsRunning() {
		t.Error("Watcher should not be running after Stop")
	}

	// Test double stop (should be no-op)
	if err := watcher.Stop(); err != nil {
		t.Errorf("Double stop should not error: %v", err)
	}
}

func TestWatcher_DetectsFileChanges(t *testing.T) {
	// Create temp directory with EPF structure
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a minimal north star file
	northStarContent := `
meta:
  epf_version: "2.0.0"
purpose:
  statement: "Original purpose"
`
	northStarPath := filepath.Join(readyDir, "00_north_star.yaml")
	if err := os.WriteFile(northStarPath, []byte(northStarContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Create store
	store := NewFileSystemSource(tmpDir)
	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatal(err)
	}

	// Track reload calls
	var reloadCount int32
	onReload := func() {
		atomic.AddInt32(&reloadCount, 1)
	}

	// Create and start watcher
	watcher := NewWatcher(store, tmpDir, 50, onReload) // 50ms debounce
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Stop()

	// Give watcher time to start
	time.Sleep(100 * time.Millisecond)

	// Modify the file
	updatedContent := `
meta:
  epf_version: "2.0.0"
purpose:
  statement: "Updated purpose"
`
	if err := os.WriteFile(northStarPath, []byte(updatedContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Wait for debounce + processing
	time.Sleep(200 * time.Millisecond)

	if atomic.LoadInt32(&reloadCount) == 0 {
		t.Error("Expected reload to be called after file change")
	}
}

func TestWatcher_DebounceMultipleChanges(t *testing.T) {
	// Create temp directory with EPF structure
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a minimal north star file
	northStarContent := `
meta:
  epf_version: "2.0.0"
purpose:
  statement: "Test purpose"
`
	northStarPath := filepath.Join(readyDir, "00_north_star.yaml")
	if err := os.WriteFile(northStarPath, []byte(northStarContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Create store
	store := NewFileSystemSource(tmpDir)
	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatal(err)
	}

	// Track reload calls
	var reloadCount int32
	onReload := func() {
		atomic.AddInt32(&reloadCount, 1)
	}

	// Create and start watcher with 100ms debounce
	watcher := NewWatcher(store, tmpDir, 100, onReload)
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Stop()

	// Give watcher time to start
	time.Sleep(50 * time.Millisecond)

	// Make multiple rapid changes (within debounce window)
	for i := 0; i < 5; i++ {
		content := []byte("meta:\n  epf_version: \"2.0.0\"\npurpose:\n  statement: \"Change " + string(rune('0'+i)) + "\"")
		if err := os.WriteFile(northStarPath, content, 0644); err != nil {
			t.Fatal(err)
		}
		time.Sleep(20 * time.Millisecond) // 20ms between changes, less than 100ms debounce
	}

	// Wait for debounce to complete
	time.Sleep(250 * time.Millisecond)

	// Should have only one or two reloads due to debouncing
	count := atomic.LoadInt32(&reloadCount)
	if count > 2 {
		t.Errorf("Expected at most 2 reloads due to debouncing, got %d", count)
	}
	if count == 0 {
		t.Error("Expected at least one reload")
	}
}

func TestWatcher_IgnoresNonYAMLFiles(t *testing.T) {
	// Create temp directory with EPF structure
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a minimal north star file
	northStarContent := `
meta:
  epf_version: "2.0.0"
purpose:
  statement: "Test purpose"
`
	if err := os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(northStarContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Create store
	store := NewFileSystemSource(tmpDir)
	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatal(err)
	}

	// Track reload calls
	var reloadCount int32
	onReload := func() {
		atomic.AddInt32(&reloadCount, 1)
	}

	// Create and start watcher
	watcher := NewWatcher(store, tmpDir, 50, onReload)
	if err := watcher.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer watcher.Stop()

	// Give watcher time to start
	time.Sleep(100 * time.Millisecond)

	// Create non-YAML files
	if err := os.WriteFile(filepath.Join(readyDir, "notes.txt"), []byte("some notes"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(readyDir, ".hidden.yaml"), []byte("hidden: true"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(readyDir, "backup.yaml~"), []byte("backup: true"), 0644); err != nil {
		t.Fatal(err)
	}

	// Wait for potential processing
	time.Sleep(200 * time.Millisecond)

	if atomic.LoadInt32(&reloadCount) > 0 {
		t.Error("Non-YAML files should not trigger reload")
	}
}

func TestWatcher_DefaultDebounce(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewFileSystemSource(tmpDir)

	// Test with 0 debounce (should default to 200)
	watcher := NewWatcher(store, tmpDir, 0, nil)
	if watcher.debounceMs != 200 {
		t.Errorf("Expected default debounce of 200ms, got %d", watcher.debounceMs)
	}

	// Test with negative debounce (should default to 200)
	watcher2 := NewWatcher(store, tmpDir, -100, nil)
	if watcher2.debounceMs != 200 {
		t.Errorf("Expected default debounce of 200ms for negative value, got %d", watcher2.debounceMs)
	}
}

func TestIsRelevantChange(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewFileSystemSource(tmpDir)
	watcher := NewWatcher(store, tmpDir, 200, nil)

	tests := []struct {
		name     string
		event    fsnotify.Event
		expected bool
	}{
		{
			name:     "YAML write",
			event:    fsnotify.Event{Name: "/path/to/file.yaml", Op: fsnotify.Write},
			expected: true,
		},
		{
			name:     "YML write",
			event:    fsnotify.Event{Name: "/path/to/file.yml", Op: fsnotify.Write},
			expected: true,
		},
		{
			name:     "YAML create",
			event:    fsnotify.Event{Name: "/path/to/file.yaml", Op: fsnotify.Create},
			expected: true,
		},
		{
			name:     "YAML delete (ignored)",
			event:    fsnotify.Event{Name: "/path/to/file.yaml", Op: fsnotify.Remove},
			expected: false,
		},
		{
			name:     "YAML rename (ignored)",
			event:    fsnotify.Event{Name: "/path/to/file.yaml", Op: fsnotify.Rename},
			expected: false,
		},
		{
			name:     "non-YAML file",
			event:    fsnotify.Event{Name: "/path/to/file.txt", Op: fsnotify.Write},
			expected: false,
		},
		{
			name:     "hidden file",
			event:    fsnotify.Event{Name: "/path/to/.hidden.yaml", Op: fsnotify.Write},
			expected: false,
		},
		{
			name:     "backup file",
			event:    fsnotify.Event{Name: "/path/to/file.yaml~", Op: fsnotify.Write},
			expected: false,
		},
		{
			name:     "uppercase YAML",
			event:    fsnotify.Event{Name: "/path/to/file.YAML", Op: fsnotify.Write},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := watcher.isRelevantChange(tt.event)
			if result != tt.expected {
				t.Errorf("isRelevantChange(%v) = %v, want %v", tt.event, result, tt.expected)
			}
		})
	}
}
