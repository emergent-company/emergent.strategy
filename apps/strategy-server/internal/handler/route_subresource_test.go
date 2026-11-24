package handler

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// subResources seeds one record of each kind that a URL can name next to the
// instance, for each of the two tenants.
type subResources struct{ batch, proposal, signal, aimRun, skillRun uuid.UUID }

func (tn *tenancy) seedSubResources(t *testing.T, instanceID uuid.UUID) subResources {
	t.Helper()
	ctx := importCtx()
	r := subResources{batch: uuid.New(), proposal: uuid.New(), signal: uuid.New(), aimRun: uuid.New(), skillRun: uuid.New()}
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := tn.db.ExecContext(ctx, query, args...); err != nil {
			t.Fatalf("seed: %v\n%s", err, query)
		}
	}
	exec(`INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, batch_id, status)
	      VALUES (?, ?, 'north_star', 'north_star', 'create', '{}'::jsonb, ?, 'staged')`, uuid.New(), instanceID, r.batch)
	exec(`INSERT INTO cycle_proposals (id, instance_id, trigger_reason, trigger_message) VALUES (?, ?, 'manual', 'm')`, r.proposal, instanceID)
	exec(`INSERT INTO ripple_signals (id, instance_id, signal_type, severity, source_key, target_key, description)
	      VALUES (?, ?, 'drift', 'info', 'a', 'b', 'd')`, r.signal, instanceID)
	exec(`INSERT INTO aim_cycle_runs (id, workflow_name, concurrency_key, status, dbos_workflow_id)
	      VALUES (?, 'aim_cycle', ?, 'completed', ?)`, r.aimRun, instanceID.String(), uuid.NewString())
	exec(`INSERT INTO skill_runs (id, instance_id, skill_name) VALUES (?, ?, 'x')`, r.skillRun, instanceID)
	return r
}

// subResourceRoute is a real route that names a sub-resource, with the id it
// takes from a set of seeded records.
type subResourceRoute struct {
	method, pattern string
	id              func(subResources) uuid.UUID
	param           string
}

var subResourceRoutes = []subResourceRoute{
	{"GET", "/strategies/:id/aim/draft-review/:batchID", func(r subResources) uuid.UUID { return r.batch }, ":batchID"},
	{"POST", "/strategies/:id/aim/draft-review/:batchID/commit", func(r subResources) uuid.UUID { return r.batch }, ":batchID"},
	{"POST", "/strategies/:id/aim/draft-review/:batchID/discard", func(r subResources) uuid.UUID { return r.batch }, ":batchID"},
	{"POST", "/strategies/:id/aim/proposals/:proposalID/approve", func(r subResources) uuid.UUID { return r.proposal }, ":proposalID"},
	{"POST", "/strategies/:id/aim/proposals/:proposalID/defer", func(r subResources) uuid.UUID { return r.proposal }, ":proposalID"},
	{"POST", "/strategies/:id/aim/proposals/:proposalID/dismiss", func(r subResources) uuid.UUID { return r.proposal }, ":proposalID"},
	{"POST", "/strategies/:id/aim/coherence/signals/:signalID/acknowledge", func(r subResources) uuid.UUID { return r.signal }, ":signalID"},
	{"POST", "/strategies/:id/aim/coherence/signals/:signalID/resolve", func(r subResources) uuid.UUID { return r.signal }, ":signalID"},
	{"POST", "/strategies/:id/aim/coherence/signals/:signalID/dismiss", func(r subResources) uuid.UUID { return r.signal }, ":signalID"},
	{"GET", "/strategies/:id/aim/runs/:runID", func(r subResources) uuid.UUID { return r.aimRun }, ":runID"},
	{"GET", "/strategies/:id/aim/runs/:runID/stream", func(r subResources) uuid.UUID { return r.aimRun }, ":runID"},
	{"POST", "/strategies/:id/aim/runs/:runID/abort", func(r subResources) uuid.UUID { return r.aimRun }, ":runID"},
	{"POST", "/strategies/:id/aim/runs/:runID/retry", func(r subResources) uuid.UUID { return r.aimRun }, ":runID"},
	{"GET", "/strategies/:id/skill-runs/:runID", func(r subResources) uuid.UUID { return r.skillRun }, ":runID"},
}

func (r subResourceRoute) url(instance, sub string) string {
	return strings.NewReplacer(":id", instance, r.param, sub).Replace(r.pattern)
}

// Every route that names a record next to the instance is a route of the real
// server: if this list drifts from RegisterRoutes the test says so.
func TestSubResourceRoutesAreRealRoutes(t *testing.T) {
	e := echo.New()
	(&Server{}).RegisterRoutes(e)
	real := map[string]bool{}
	for _, r := range e.Routes() {
		real[r.Method+" "+r.Path] = true
	}
	for _, r := range subResourceRoutes {
		if !real[r.method+" "+r.pattern] {
			t.Errorf("%s %s is not a registered route", r.method, r.pattern)
		}
	}
	// And no registered route takes a record id that this list does not cover.
	listed := map[string]bool{}
	for _, r := range subResourceRoutes {
		listed[r.method+" "+r.pattern] = true
	}
	for _, r := range e.Routes() {
		if !strings.HasPrefix(r.Path, "/strategies/:id/") || r.Path == "/strategies/:id/aim/versions/:versionID" ||
			r.Path == "/strategies/:id/aim/versions/:versionID/restore" {
			continue // the version routes are scoped by their service (instance id and version id together)
		}
		for _, p := range []string{":batchID", ":proposalID", ":signalID", ":runID"} {
			if strings.Contains(r.Path, p) && !listed[r.Method+" "+r.Path] {
				t.Errorf("%s %s names %s but is not covered by subResourceRoutes", r.Method, r.Path, p)
			}
		}
	}
}

// The guard, route by route: a user's own instance with another tenant's record
// is refused as not found; their own record passes; an id that names nothing, or
// is not an id at all, passes to the handler, which keeps its own 404 or 400.
func TestGuardRefusesAnotherTenantsRecordNamedUnderYourOwnInstance(t *testing.T) {
	tn := newTenancy(t)
	mine := tn.seedSubResources(t, tn.instA.ID)
	theirs := tn.seedSubResources(t, tn.instB.ID)

	e := echo.New()
	ok := func(c echo.Context) error { return c.String(http.StatusOK, "ran") }
	for _, r := range subResourceRoutes {
		e.Add(r.method, r.pattern, ok, tn.s.webAccess)
	}
	instance := tn.instA.ID.String()
	for _, r := range subResourceRoutes {
		name := r.method + " " + r.pattern
		cases := []struct {
			what string
			id   string
			want int
		}{
			{"own record", r.id(mine).String(), http.StatusOK},
			{"another tenant's record", r.id(theirs).String(), http.StatusNotFound},
			{"a record that does not exist", uuid.NewString(), http.StatusOK},
			{"an id that is not an id", "not-a-uuid", http.StatusOK},
		}
		for _, c := range cases {
			if got := do(e, asUser(tn.alice), r.method, r.url(instance, c.id), nil).Code; got != c.want {
				t.Errorf("%s with %s answered %d, want %d", name, c.what, got, c.want)
			}
		}
	}
}

// And against the real handlers: nothing of the other tenant's changes.
func TestForeignRecordsAreUntouchedThroughTheRealRoutes(t *testing.T) {
	tn := newTenancy(t)
	theirs := tn.seedSubResources(t, tn.instB.ID)
	e := echo.New()
	tn.s.RegisterRoutes(e)
	instance := tn.instA.ID.String()
	for _, r := range subResourceRoutes {
		rec := do(e, asUser(tn.alice), r.method, r.url(instance, r.id(theirs).String()), nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s %s answered %d with another tenant's record, want 404", r.method, r.pattern, rec.Code)
		}
	}
	count := func(query string, args ...any) int {
		t.Helper()
		var n int
		if err := tn.db.NewRaw(query, args...).Scan(importCtx(), &n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := count(`SELECT count(*) FROM strategy_mutations WHERE batch_id = ? AND status = 'staged'`, theirs.batch); n != 1 {
		t.Errorf("the other tenant's staged batch changed: %d staged rows", n)
	}
	if n := count(`SELECT count(*) FROM cycle_proposals WHERE id = ? AND status = 'pending'`, theirs.proposal); n != 1 {
		t.Errorf("the other tenant's proposal changed")
	}
	if n := count(`SELECT count(*) FROM ripple_signals WHERE id = ? AND status = 'active'`, theirs.signal); n != 1 {
		t.Errorf("the other tenant's signal changed")
	}
	if n := count(`SELECT count(*) FROM aim_cycle_runs WHERE id = ? AND status = 'completed'`, theirs.aimRun); n != 1 {
		t.Errorf("the other tenant's run changed")
	}
}

// When the ownership lookup itself fails, the request is refused with a server
// error and the handler does not run: failing to ask is not consent.
func TestGuardRefusesWhenTheRecordLookupFails(t *testing.T) {
	tn := newTenancy(t)
	if _, err := tn.db.ExecContext(importCtx(), `DROP TABLE skill_runs CASCADE`); err != nil {
		t.Fatal(err)
	}
	ran := false
	e := echo.New()
	e.GET("/strategies/:id/skill-runs/:runID", func(c echo.Context) error {
		ran = true
		return c.String(http.StatusOK, "ran")
	}, tn.s.webAccess)
	rec := do(e, asUser(tn.alice), "GET", "/strategies/"+tn.instA.ID.String()+"/skill-runs/"+uuid.NewString(), nil)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("answered %d, want 500", rec.Code)
	}
	if ran {
		t.Error("the handler ran although the record lookup failed")
	}
}
