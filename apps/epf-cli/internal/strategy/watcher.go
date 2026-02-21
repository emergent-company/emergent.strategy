package strategy

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Watcher monitors EPF strategy files for changes and triggers reloads.
// It uses debouncing to avoid excessive reloads during rapid file changes.
type Watcher struct {
	instancePath string
	debounceMs   int
	onReload     func()

	fsWatcher *fsnotify.Watcher
	store     *FileSystemSource

	mu       sync.Mutex
	running  bool
	stopChan chan struct{}
	doneChan chan struct{}

	// debounce state
	debounceTimer *time.Timer
	pendingReload bool
}

// NewWatcher creates a new file watcher for the given strategy store.
func NewWatcher(store *FileSystemSource, instancePath string, debounceMs int, onReload func()) *Watcher {
	if debounceMs <= 0 {
		debounceMs = 200
	}

	return &Watcher{
		instancePath: instancePath,
		debounceMs:   debounceMs,
		onReload:     onReload,
		store:        store,
	}
}

// Start begins watching for file changes.
// Returns an error if the watcher is already running or cannot be initialized.
func (w *Watcher) Start(ctx context.Context) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.running {
		return nil // already running
	}

	var err error
	w.fsWatcher, err = fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	// Watch the instance path and key subdirectories
	dirsToWatch := w.getWatchDirs()
	for _, dir := range dirsToWatch {
		if err := w.fsWatcher.Add(dir); err != nil {
			// Don't fail if a directory doesn't exist
			continue
		}
	}

	w.stopChan = make(chan struct{})
	w.doneChan = make(chan struct{})
	w.running = true

	go w.watchLoop(ctx)

	return nil
}

// Stop stops the file watcher.
func (w *Watcher) Stop() error {
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return nil
	}
	w.running = false
	close(w.stopChan)
	w.mu.Unlock()

	// Wait for the watch loop to finish
	<-w.doneChan

	if w.fsWatcher != nil {
		return w.fsWatcher.Close()
	}
	return nil
}

// IsRunning returns true if the watcher is currently active.
func (w *Watcher) IsRunning() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.running
}

// getWatchDirs returns the directories that should be monitored for changes.
func (w *Watcher) getWatchDirs() []string {
	dirs := []string{w.instancePath}

	// Add READY, FIRE, and AIM directories
	phases := []string{"READY", "FIRE", "AIM"}
	for _, phase := range phases {
		dirs = append(dirs, filepath.Join(w.instancePath, phase))
	}

	// Add definitions/product subdirectory
	dirs = append(dirs, filepath.Join(w.instancePath, "FIRE", "definitions", "product"))

	return dirs
}

// watchLoop is the main event loop that processes file change events.
func (w *Watcher) watchLoop(ctx context.Context) {
	defer close(w.doneChan)

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopChan:
			return
		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}
			if w.isRelevantChange(event) {
				w.scheduleReload()
			}
		case _, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
			// Log errors but continue watching
			// In production, you might want to expose these via a callback
		}
	}
}

// isRelevantChange determines if a file change event should trigger a reload.
func (w *Watcher) isRelevantChange(event fsnotify.Event) bool {
	// Only care about write and create events
	if event.Op&(fsnotify.Write|fsnotify.Create) == 0 {
		return false
	}

	// Only care about YAML files
	ext := strings.ToLower(filepath.Ext(event.Name))
	if ext != ".yaml" && ext != ".yml" {
		return false
	}

	// Ignore hidden files and temporary files
	base := filepath.Base(event.Name)
	if strings.HasPrefix(base, ".") || strings.HasSuffix(base, "~") {
		return false
	}

	return true
}

// scheduleReload schedules a reload with debouncing.
// Multiple rapid changes will only trigger a single reload.
func (w *Watcher) scheduleReload() {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Cancel any pending timer
	if w.debounceTimer != nil {
		w.debounceTimer.Stop()
	}

	// Schedule a new reload
	w.pendingReload = true
	w.debounceTimer = time.AfterFunc(time.Duration(w.debounceMs)*time.Millisecond, func() {
		w.executeReload()
	})
}

// executeReload performs the actual reload after debounce.
func (w *Watcher) executeReload() {
	w.mu.Lock()
	if !w.pendingReload {
		w.mu.Unlock()
		return
	}
	w.pendingReload = false
	w.mu.Unlock()

	// Perform the reload
	ctx := context.Background()
	if err := w.store.Reload(ctx); err != nil {
		// In production, you might want to expose errors via a callback
		return
	}

	// Call the watcher's onReload callback if provided
	// Note: This is separate from the store's onReload callback
	// The watcher callback is for "file change detected" events
	if w.onReload != nil {
		w.onReload()
	}
}
