package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// --- every route has a class ------------------------------------------------

// The web counterpart of TestEveryToolIsClassified: a route that is registered
// without being classified is open or broken, so the build fails for it.
func TestEveryWebRouteIsClassified(t *testing.T) {
	e := echo.New()
	(&Server{}).RegisterRoutes(e)
	routes := e.Routes()
	if len(routes) < 50 {
		t.Fatalf("only %d routes registered; the test would prove little", len(routes))
	}
	var missing []string
	for _, r := range routes {
		if _, ok := classifyRoute(r.Method, r.Path); !ok {
			missing = append(missing, r.Method+" "+r.Path)
		}
	}
	sort.Strings(missing)
	for _, m := range missing {
		t.Errorf("route %s has no access class; add it to classifyRoute", m)
	}
}

func TestRouteClasses(t *testing.T) {
	cases := []struct {
		method, pattern string
		want            accessClass
	}{
		{"GET", "/strategies/:id/ready/north-star", accessInstanceRead},
		{"GET", "/strategies/:id/aim/runs/:runID/stream", accessInstanceRead},
		{"POST", "/strategies/:id/aim/publish", accessInstanceWrite},
		{"POST", "/strategies/:id/ready/draft-:key", accessInstanceWrite},
		{"POST", "/strategies/:id/move", accessInstanceWrite},
		{"POST", "/strategies/:id/delete", accessInstanceWrite},
		{"GET", "/", accessList},
		{"GET", "/settings", accessList},
		{"POST", "/settings/sync", accessInstanceInForm},
		{"POST", "/settings/import", accessInstanceInForm},
		{"POST", "/settings/lang", accessAuthenticated},
		{"GET", "/github/connect", accessAuthenticated},
		{"POST", "/github/connect/import", accessAuthenticated},
	}
	for _, c := range cases {
		got, ok := classifyRoute(c.method, c.pattern)
		if !ok || got != c.want {
			t.Errorf("%s %s = %v (ok=%v), want %v", c.method, c.pattern, got, ok, c.want)
		}
	}
	if _, ok := classifyRoute("GET", "/not/a/route"); ok {
		t.Error("an unknown route must not be classified")
	}
	if _, ok := classifyRoute("DELETE", "/strategies/:id/ready/north-star"); !ok {
		t.Error("a write method on an instance route is classified (as a write), not unknown")
	}
}

// --- the guard, role by role --------------------------------------------------

// guardedStubs registers a stub handler under the guard for one route of each
// class. The guard sees only the method, the route pattern and the caller, so a
// stub is as good as the real handler for deciding who gets through.
func guardedStubs(s *Server) *echo.Echo {
	e := echo.New()
	ok := func(c echo.Context) error { return c.String(http.StatusOK, "ran") }
	e.GET("/strategies/:id/ready/north-star", ok, s.webAccess)
	e.POST("/strategies/:id/aim/publish", ok, s.webAccess)
	e.POST("/strategies/:id/delete", ok, s.webAccess)
	e.POST("/settings/sync", ok, s.webAccess)
	e.GET("/settings", ok, s.webAccess)
	e.POST("/settings/lang", ok, s.webAccess)
	e.GET("/unclassified/route", ok, s.webAccess)
	return e
}

func do(e *echo.Echo, ctx context.Context, method, target string, form url.Values) *httptest.ResponseRecorder {
	var body *strings.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	} else {
		body = strings.NewReader("")
	}
	req := httptest.NewRequest(method, target, body).WithContext(ctx)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestGuardLetsMembersReadAndAdminsWrite(t *testing.T) {
	tn := newTenancy(t)
	e := guardedStubs(tn.s)
	read := "/strategies/" + tn.instA.ID.String() + "/ready/north-star"
	write := "/strategies/" + tn.instA.ID.String() + "/aim/publish"
	del := "/strategies/" + tn.instA.ID.String() + "/delete"

	cases := []struct {
		who    string
		ctx    context.Context
		method string
		target string
		want   int
	}{
		{"admin reads", asUser(tn.alice), "GET", read, 200},
		{"admin writes", asUser(tn.alice), "POST", write, 200},
		{"admin deletes", asUser(tn.alice), "POST", del, 200},
		{"viewer reads", asUser(tn.vic), "GET", read, 200},
		{"viewer cannot write", asUser(tn.vic), "POST", write, 404},
		{"viewer cannot delete", asUser(tn.vic), "POST", del, 404},
		{"member of B cannot read A", asUser(tn.bob), "GET", read, 404},
		{"member of B cannot write A", asUser(tn.bob), "POST", write, 404},
		{"member of B cannot delete A", asUser(tn.bob), "POST", del, 404},
		{"a user in no organisation cannot read", asUser(tn.eve), "GET", read, 404},
		{"no principal cannot read", importCtx(), "GET", read, 401},
	}
	for _, c := range cases {
		if got := do(e, c.ctx, c.method, c.target, nil).Code; got != c.want {
			t.Errorf("%s: %s %s answered %d, want %d", c.who, c.method, c.target, got, c.want)
		}
	}
}

// A request for an instance that does not exist and one for an instance the
// caller may not reach are answered the same way, so ids cannot be probed.
func TestGuardAnswersAForeignInstanceLikeAMissingOne(t *testing.T) {
	tn := newTenancy(t)
	e := guardedStubs(tn.s)
	foreign := do(e, asUser(tn.alice), "GET", "/strategies/"+tn.instB.ID.String()+"/ready/north-star", nil)
	missing := do(e, asUser(tn.alice), "GET", "/strategies/"+uuid.NewString()+"/ready/north-star", nil)
	malformed := do(e, asUser(tn.alice), "GET", "/strategies/not-a-uuid/ready/north-star", nil)
	for name, rec := range map[string]*httptest.ResponseRecorder{"foreign": foreign, "missing": missing, "malformed id": malformed} {
		if rec.Code != 404 {
			t.Errorf("%s answered %d, want 404", name, rec.Code)
		}
	}
	if foreign.Body.String() != missing.Body.String() {
		t.Errorf("a foreign and a missing instance differ in the body:\n%q\n%q", foreign.Body.String(), missing.Body.String())
	}
}

func TestGuardChecksTheInstanceNamedInAForm(t *testing.T) {
	tn := newTenancy(t)
	e := guardedStubs(tn.s)
	post := func(who *domain.User, inst *domain.StrategyInstance) int {
		return do(e, asUser(who), "POST", "/settings/sync", url.Values{"instance_id": {inst.ID.String()}}).Code
	}
	if got := post(tn.alice, tn.instA); got != 200 {
		t.Errorf("admin of A syncing an instance of A answered %d, want 200", got)
	}
	if got := post(tn.alice, tn.instB); got != 404 {
		t.Errorf("admin of A syncing an instance of B answered %d, want 404", got)
	}
	if got := post(tn.vic, tn.instA); got != 404 {
		t.Errorf("a viewer syncing an instance answered %d, want 404", got)
	}
	if got := do(e, asUser(tn.alice), "POST", "/settings/sync", url.Values{"instance_id": {"nope"}}).Code; got != 404 {
		t.Errorf("a malformed instance id answered %d, want 404", got)
	}
	if got := do(e, asUser(tn.alice), "POST", "/settings/sync", nil).Code; got != 404 {
		t.Errorf("no instance id answered %d, want 404", got)
	}
}

func TestGuardLetsAnySignedInUserUseTheirOwnPages(t *testing.T) {
	tn := newTenancy(t)
	e := guardedStubs(tn.s)
	for _, who := range []*domain.User{tn.alice, tn.vic, tn.bob, tn.eve} {
		if got := do(e, asUser(who), "GET", "/settings", nil).Code; got != 200 {
			t.Errorf("a list page answered %d for %s, want 200 (the queries filter it)", got, who.Email)
		}
		if got := do(e, asUser(who), "POST", "/settings/lang", nil).Code; got != 200 {
			t.Errorf("an own-account page answered %d for %s, want 200", got, who.Email)
		}
	}
	if got := do(e, importCtx(), "GET", "/settings", nil).Code; got != 401 {
		t.Errorf("a request with no principal answered %d, want 401", got)
	}
}

func TestGuardFailsClosedForAnUnclassifiedRoute(t *testing.T) {
	tn := newTenancy(t)
	e := guardedStubs(tn.s)
	if got := do(e, asUser(tn.alice), "GET", "/unclassified/route", nil).Code; got != 404 {
		t.Errorf("an unclassified route answered %d, want 404 (closed)", got)
	}
}

// A scoped access token is answered by its grants alone on the web as well, and
// never writes there.
func TestGuardAnswersAScopedTokenByItsGrants(t *testing.T) {
	tn := newTenancy(t)
	e := guardedStubs(tn.s)
	p := &web.Principal{
		User: &web.User{ID: tn.bob.ID}, TokenID: ptr(uuid.New()),
		Grants: []web.InstanceGrant{{InstanceID: tn.instA.ID, Permission: web.PermissionWrite}},
	}
	ctx := web.ContextWithPrincipal(importCtx(), p)
	if got := do(e, ctx, "GET", "/strategies/"+tn.instA.ID.String()+"/ready/north-star", nil).Code; got != 200 {
		t.Errorf("a granted instance answered %d, want 200", got)
	}
	if got := do(e, ctx, "GET", "/strategies/"+tn.instB.ID.String()+"/ready/north-star", nil).Code; got != 404 {
		t.Errorf("an instance without a grant answered %d, want 404 even for a member of its organisation", got)
	}
	if got := do(e, ctx, "POST", "/strategies/"+tn.instA.ID.String()+"/aim/publish", nil).Code; got != 404 {
		t.Errorf("a token write on the web answered %d, want 404: tokens do not administer", got)
	}
}

func ptr[T any](v T) *T { return &v }

// --- enforcement on every real route -------------------------------------------

// Every real instance route, GET and POST alike, answers a user of another
// organisation as a missing instance and changes nothing.
func TestEveryInstanceRouteRefusesAUserOfAnotherOrganisation(t *testing.T) {
	tn := newTenancy(t)
	e := echo.New()
	tn.s.RegisterRoutes(e)

	fill := strings.NewReplacer(
		":id", tn.instB.ID.String(), ":signalID", uuid.NewString(), ":runID", uuid.NewString(),
		":batchID", uuid.NewString(), ":proposalID", uuid.NewString(), ":versionID", uuid.NewString(),
		":key", "x")
	checked := 0
	for _, r := range e.Routes() {
		if !strings.HasPrefix(r.Path, "/strategies/:id") {
			continue
		}
		checked++
		target := fill.Replace(r.Path)
		rec := do(e, asUser(tn.alice), r.Method, target, url.Values{"workspace_id": {tn.wsA.ID.String()}})
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s %s answered %d to a user of another organisation, want 404", r.Method, r.Path, rec.Code)
		}
	}
	if checked < 50 {
		t.Fatalf("only %d instance routes checked", checked)
	}
	// None of the refused writes did anything: B's instance is where it was.
	inst, err := instancedom.NewService(tn.db).GetInstance(importCtx(), tn.instB.ID)
	if err != nil || inst.WorkspaceID != tn.wsB.ID {
		t.Errorf("the instance of B changed or vanished: %v %v", inst, err)
	}
}
