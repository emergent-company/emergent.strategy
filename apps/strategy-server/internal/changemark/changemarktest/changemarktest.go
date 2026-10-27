// Package changemarktest holds helpers for tests that check a writer marks its
// instance as changed.
package changemarktest

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark"
)

// Recorder is a changemark.Notifier that remembers the instances it was told about.
type Recorder struct {
	mu  sync.Mutex
	ids []uuid.UUID
}

// InstanceChanged implements changemark.Notifier.
func (r *Recorder) InstanceChanged(_ context.Context, id uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ids = append(r.ids, id)
}

// Count returns how many times id was notified.
func (r *Recorder) Count(id uuid.UUID) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, x := range r.ids {
		if x == id {
			n++
		}
	}
	return n
}

// New returns a Marker on db wired to a fresh Recorder.
func New(db *bun.DB) (*changemark.Marker, *Recorder) {
	m := changemark.New(db)
	r := &Recorder{}
	m.SetNotifier(r)
	return m, r
}

// State is an instance's change bookkeeping.
type State struct {
	Dirty *time.Time `bun:"memory_dirty_since"`
	Seq   int64      `bun:"memory_change_seq"`
}

// Load reads the change bookkeeping of an instance.
func Load(t testing.TB, db *bun.DB, id uuid.UUID) State {
	t.Helper()
	var s State
	if err := db.NewRaw("SELECT memory_dirty_since, memory_change_seq FROM strategy_instances WHERE id = ?", id).
		Scan(context.Background(), &s); err != nil {
		t.Fatalf("load change state: %v", err)
	}
	return s
}

// Reset clears the bookkeeping, so a test can ignore the marks made while seeding.
func Reset(t testing.TB, db *bun.DB, id uuid.UUID) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(),
		"UPDATE strategy_instances SET memory_dirty_since = NULL, memory_change_seq = 0 WHERE id = ?", id); err != nil {
		t.Fatalf("reset change state: %v", err)
	}
}
