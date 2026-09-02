package adk_test

import (
	"testing"
	"time"

	adksession "google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/session/sessiontestsuite"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// TestSessionStore_ADKConformance runs ADK's own session.Service conformance
// suite against the bun-backed store.
//
// This is the load-bearing test for Part B: ADK reconstructs an interrupted
// run by replaying a session's event stream, so any divergence from ADK's
// expected semantics — state scoping, partial-event handling, event ordering —
// would surface as a workflow that silently fails to resume correctly. Running
// upstream's suite verifies equivalence with ADK's reference implementation
// rather than with our own assumptions about it.
func TestSessionStore_ADKConformance(t *testing.T) {
	sessiontestsuite.RunServiceTests(t,
		sessiontestsuite.SuiteOptions{
			SupportsUserProvidedSessionID: true,
			ProvidesServerAssignedEventID: true,
			AppName:                       "strategy-server",
		},
		func(t *testing.T) adksession.Service {
			return adk.NewSessionStore(database.TestDB(t))
		},
	)
}

// TestSessionStore_SurvivesProcessRestart is the durability guarantee stated in
// the agent-runtime spec: a run paused at a human gate must resume after the
// server restarts.
//
// A restart is simulated by discarding the in-memory session view entirely and
// re-reading through a freshly constructed store, which is exactly what happens
// when the process comes back up against the same database.
func TestSessionStore_SurvivesProcessRestart(t *testing.T) {
	db := database.TestDB(t)
	ctx := t.Context()

	const (
		appName   = "strategy-server"
		userID    = "user-1"
		sessionID = "aim-cycle-1"
	)

	// --- before the "restart" ---
	before := adk.NewSessionStore(db)

	created, err := before.Create(ctx, &adksession.CreateRequest{
		AppName:   appName,
		UserID:    userID,
		SessionID: sessionID,
		State:     map[string]any{"step": "draft_assessment"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	ev := adksession.NewEvent(ctx, "inv-1")
	ev.Author = "aim"
	ev.Timestamp = time.Now().UTC()
	ev.Actions.StateDelta = map[string]any{
		"step":            "draft_calibration",
		"awaiting_human":  true,
		"temp:scratchpad": "discard me",
	}
	if err := before.AppendEvent(ctx, created.Session, ev); err != nil {
		t.Fatalf("append event: %v", err)
	}

	// --- restart: new store, no shared in-memory state ---
	after := adk.NewSessionStore(db)

	got, err := after.Get(ctx, &adksession.GetRequest{
		AppName: appName, UserID: userID, SessionID: sessionID,
	})
	if err != nil {
		t.Fatalf("get after restart: %v", err)
	}

	state := got.Session.State()

	if v, err := state.Get("step"); err != nil || v != "draft_calibration" {
		t.Errorf("step=%v (err=%v), want draft_calibration — the state delta did not survive", v, err)
	}
	if v, err := state.Get("awaiting_human"); err != nil || v != true {
		t.Errorf("awaiting_human=%v (err=%v), want true — the pause marker did not survive", v, err)
	}

	// temp: state is invocation-scoped and must not come back.
	if v, err := state.Get("temp:scratchpad"); err == nil {
		t.Errorf("temp:scratchpad survived the restart with value %v; temp state must never persist", v)
	}

	// The event stream is what ADK replays to rebuild run position.
	if n := got.Session.Events().Len(); n != 1 {
		t.Fatalf("events=%d, want 1 — the replay log did not survive", n)
	}
	replayed := got.Session.Events().At(0)
	if replayed.Author != "aim" {
		t.Errorf("event author=%q, want aim", replayed.Author)
	}
	if replayed.InvocationID != "inv-1" {
		t.Errorf("event invocation=%q, want inv-1", replayed.InvocationID)
	}
	if _, ok := replayed.Actions.StateDelta["temp:scratchpad"]; ok {
		t.Error("persisted event still carries a temp: key; replay would resurrect invocation state")
	}
	if replayed.Actions.StateDelta["step"] != "draft_calibration" {
		t.Errorf("persisted delta lost its non-temp keys: %+v", replayed.Actions.StateDelta)
	}
}

// TestSessionStore_EventOrderingAndFilters covers the read paths ADK uses to
// rebuild state: full chronological replay, the "most recent N" window, and the
// timestamp cutoff. NumRecentEvents in particular is implemented by querying
// descending and reversing, so an off-by-one or a missed reversal would hand
// ADK the event stream backwards.
func TestSessionStore_EventOrderingAndFilters(t *testing.T) {
	db := database.TestDB(t)
	ctx := t.Context()
	store := adk.NewSessionStore(db)

	const appName, userID, sessionID = "strategy-server", "u", "s"

	created, err := store.Create(ctx, &adksession.CreateRequest{
		AppName: appName, UserID: userID, SessionID: sessionID,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	base := time.Now().UTC().Truncate(time.Millisecond)
	authors := []string{"first", "second", "third"}
	for i, author := range authors {
		ev := adksession.NewEvent(ctx, "inv")
		ev.Author = author
		ev.Timestamp = base.Add(time.Duration(i) * time.Second)
		if err := store.AppendEvent(ctx, created.Session, ev); err != nil {
			t.Fatalf("append %s: %v", author, err)
		}
	}

	authorsOf := func(s adksession.Session) []string {
		var out []string
		for ev := range s.Events().All() {
			out = append(out, ev.Author)
		}
		return out
	}
	equal := func(a, b []string) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return true
	}

	t.Run("full replay is chronological", func(t *testing.T) {
		got, err := store.Get(ctx, &adksession.GetRequest{
			AppName: appName, UserID: userID, SessionID: sessionID,
		})
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if want := authors; !equal(authorsOf(got.Session), want) {
			t.Errorf("events=%v, want %v", authorsOf(got.Session), want)
		}
	})

	t.Run("NumRecentEvents returns the newest N, still chronological", func(t *testing.T) {
		got, err := store.Get(ctx, &adksession.GetRequest{
			AppName: appName, UserID: userID, SessionID: sessionID,
			NumRecentEvents: 2,
		})
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		want := []string{"second", "third"}
		if !equal(authorsOf(got.Session), want) {
			t.Errorf("events=%v, want %v (newest N, oldest-first)", authorsOf(got.Session), want)
		}
	})

	t.Run("After filters by timestamp", func(t *testing.T) {
		got, err := store.Get(ctx, &adksession.GetRequest{
			AppName: appName, UserID: userID, SessionID: sessionID,
			After: base.Add(1 * time.Second),
		})
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		want := []string{"second", "third"}
		if !equal(authorsOf(got.Session), want) {
			t.Errorf("events=%v, want %v", authorsOf(got.Session), want)
		}
	})
}

// TestSessionStore_DeleteCascadesEvents guards the foreign key: orphaned event
// rows would accumulate silently and could be replayed into a recreated
// session with the same id.
func TestSessionStore_DeleteCascadesEvents(t *testing.T) {
	db := database.TestDB(t)
	ctx := t.Context()
	store := adk.NewSessionStore(db)

	const appName, userID, sessionID = "strategy-server", "u", "s"

	created, err := store.Create(ctx, &adksession.CreateRequest{
		AppName: appName, UserID: userID, SessionID: sessionID,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	ev := adksession.NewEvent(ctx, "inv")
	ev.Author = "a"
	if err := store.AppendEvent(ctx, created.Session, ev); err != nil {
		t.Fatalf("append: %v", err)
	}

	if err := store.Delete(ctx, &adksession.DeleteRequest{
		AppName: appName, UserID: userID, SessionID: sessionID,
	}); err != nil {
		t.Fatalf("delete: %v", err)
	}

	var remaining int
	if err := db.NewSelect().
		Table("adk_session_events").
		ColumnExpr("count(*)").
		Where("session_id = ?", sessionID).
		Scan(ctx, &remaining); err != nil {
		t.Fatalf("count events: %v", err)
	}
	if remaining != 0 {
		t.Errorf("%d event rows survived the session delete; cascade is not working", remaining)
	}

	// Recreating the same id must start from an empty stream.
	recreated, err := store.Create(ctx, &adksession.CreateRequest{
		AppName: appName, UserID: userID, SessionID: sessionID,
	})
	if err != nil {
		t.Fatalf("recreate: %v", err)
	}
	if n := recreated.Session.Events().Len(); n != 0 {
		t.Errorf("recreated session has %d events, want 0", n)
	}
}
