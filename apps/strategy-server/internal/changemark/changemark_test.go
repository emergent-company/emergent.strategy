package changemark_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	orgID, wsID, instID := uuid.New(), uuid.New(), uuid.New()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, 'o', ?, now(), now())", []any{orgID, "o-" + orgID.String()[:8]}},
		{"INSERT INTO workspaces (id, github_owner, org_id) VALUES (?, ?, ?)", []any{wsID, "ws-" + wsID.String()[:8], orgID}},
		{"INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, 'i')", []any{instID, wsID}},
	} {
		if _, err := db.ExecContext(ctx, q.sql, q.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	return instID
}

type state struct {
	Dirty *time.Time `bun:"memory_dirty_since"`
	Seq   int64      `bun:"memory_change_seq"`
}

func load(t *testing.T, db *bun.DB, id uuid.UUID) state {
	t.Helper()
	var s state
	if err := db.NewRaw("SELECT memory_dirty_since, memory_change_seq FROM strategy_instances WHERE id = ?", id).
		Scan(context.Background(), &s); err != nil {
		t.Fatalf("load: %v", err)
	}
	return s
}

type recorder struct {
	mu  sync.Mutex
	ids []uuid.UUID
}

func (r *recorder) InstanceChanged(_ context.Context, id uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ids = append(r.ids, id)
}

func TestMark_SetsDirtyOnceAndBumpsSequenceEveryTime(t *testing.T) {
	db := database.TestDB(t)
	id := seedInstance(t, db)
	m := changemark.New(db)
	ctx := context.Background()

	if s := load(t, db, id); s.Dirty != nil || s.Seq != 0 {
		t.Fatalf("fresh instance: %+v", s)
	}
	if err := m.Mark(ctx, db, id); err != nil {
		t.Fatalf("mark: %v", err)
	}
	first := load(t, db, id)
	if first.Dirty == nil || first.Seq != 1 {
		t.Fatalf("after first mark: %+v", first)
	}

	time.Sleep(10 * time.Millisecond)
	if err := m.Mark(ctx, db, id); err != nil {
		t.Fatalf("mark 2: %v", err)
	}
	second := load(t, db, id)
	if !second.Dirty.Equal(*first.Dirty) {
		t.Errorf("dirty_since moved from %v to %v; the oldest unprocessed change must be kept", first.Dirty, second.Dirty)
	}
	if second.Seq != 2 {
		t.Errorf("seq = %d, want 2", second.Seq)
	}
}

func TestMark_ParticipatesInCallerTransaction(t *testing.T) {
	db := database.TestDB(t)
	id := seedInstance(t, db)
	m := changemark.New(db)
	ctx := context.Background()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if err := m.Mark(ctx, tx, id); err != nil {
		t.Fatalf("mark in tx: %v", err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback: %v", err)
	}
	if s := load(t, db, id); s.Dirty != nil || s.Seq != 0 {
		t.Fatalf("a rolled-back change must not leave the instance dirty: %+v", s)
	}
}

func TestMark_UnknownInstanceIsNotAnError(t *testing.T) {
	db := database.TestDB(t)
	if err := changemark.New(db).Mark(context.Background(), db, uuid.New()); err != nil {
		t.Fatalf("marking a missing instance should be a no-op, got %v", err)
	}
}

func TestChanged_MarksThenNotifies(t *testing.T) {
	db := database.TestDB(t)
	id := seedInstance(t, db)
	rec := &recorder{}
	m := changemark.New(db)
	m.SetNotifier(rec)

	m.Changed(context.Background(), id)

	if s := load(t, db, id); s.Dirty == nil || s.Seq != 1 {
		t.Fatalf("Changed must mark: %+v", s)
	}
	if len(rec.ids) != 1 || rec.ids[0] != id {
		t.Fatalf("notifier calls = %v, want [%s]", rec.ids, id)
	}
}

func TestNilMarker_IsSafe(t *testing.T) {
	var m *changemark.Marker
	id := uuid.New()
	if err := m.Mark(context.Background(), nil, id); err != nil {
		t.Fatalf("nil marker Mark: %v", err)
	}
	m.Changed(context.Background(), id)
	m.Notify(context.Background(), id)
}
