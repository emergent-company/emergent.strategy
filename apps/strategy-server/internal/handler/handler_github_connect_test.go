package handler

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	strategydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	userdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func workspaceIDs(items []ui.WorkspaceScanItem) map[string]bool {
	out := map[string]bool{}
	for _, it := range items {
		out[it.ID] = true
	}
	return out
}

// The assignment dropdown offers only workspaces of organisations the caller
// administers: a viewer of A, a member of nothing and another tenant get none of
// A's workspaces, and an admin gets no workspace of anyone else's organisation.
func TestAssignmentDropdownHoldsOnlyWorkspacesTheCallerAdministers(t *testing.T) {
	tn := newTenancy(t)

	alice := workspaceIDs(tn.s.loadWorkspacesForAssignment(asUser(tn.alice)))
	if !alice[tn.wsA.ID.String()] || !alice[tn.wsA2.ID.String()] {
		t.Errorf("admin of A is missing a workspace of A: %v", alice)
	}
	if alice[tn.wsB.ID.String()] {
		t.Error("the dropdown of an admin of A lists a workspace of B")
	}
	if got := workspaceIDs(tn.s.loadWorkspacesForAssignment(asUser(tn.vic))); len(got) != 0 {
		t.Errorf("a viewer administers nothing but sees %v", got)
	}
	if got := workspaceIDs(tn.s.loadWorkspacesForAssignment(asUser(tn.eve))); len(got) != 0 {
		t.Errorf("a user in no organisation sees %v", got)
	}
	if got := workspaceIDs(tn.s.loadWorkspacesForAssignment(context.Background())); len(got) != 0 {
		t.Errorf("with no user in context the dropdown must be empty, got %v", got)
	}
}

func scanOf(repo string) []ui.GithubRepoScanItem {
	return []ui.GithubRepoScanItem{{
		FullName:          repo,
		HasEPF:            true,
		DetectedInstances: []ui.GithubDetectedInstance{{BasePath: ""}},
	}}
}

// A repository connected to an instance the caller can reach shows that
// instance; one connected in an organisation the caller is not in shows only that
// it is connected elsewhere.
func TestConnectedInstanceDetailsAreShownOnlyToTheirOrganisation(t *testing.T) {
	tn := newTenancy(t)

	own := scanOf("owner-a/repo-a")
	tn.s.annotateConnectedInstances(asUser(tn.alice), own)
	d := own[0].DetectedInstances[0]
	if d.ConnectedInstanceID != tn.instA.ID.String() || d.ConnectedInstanceName != "Instance Of Org A" || d.ConnectedElsewhere {
		t.Errorf("a member must see their own instance: %+v", d)
	}

	foreign := scanOf("owner-b/repo-b")
	tn.s.annotateConnectedInstances(asUser(tn.alice), foreign)
	d = foreign[0].DetectedInstances[0]
	if !d.ConnectedElsewhere {
		t.Error("a repository connected in another organisation must be marked as connected elsewhere")
	}
	if d.ConnectedInstanceID != "" || d.ConnectedInstanceName != "" || d.ConnectedWorkspaceName != "" ||
		d.ConnectedCommitSHA != "" || d.ConnectedMemorySyncStatus != "" || !d.ConnectedLastSyncedAt.IsZero() {
		t.Errorf("details of another tenant's instance leaked: %+v", d)
	}

	none := scanOf("owner-z/unlinked")
	tn.s.annotateConnectedInstances(asUser(tn.alice), none)
	if n := none[0].DetectedInstances[0]; n.ConnectedElsewhere || n.ConnectedInstanceID != "" {
		t.Errorf("an unlinked repository must carry no marker: %+v", n)
	}
}

// What the page renders for a user of A contains nothing of B's instance.
func TestConnectPageForAUserOfAContainsNothingOfB(t *testing.T) {
	tn := newTenancy(t)
	repos := append(scanOf("owner-a/repo-a"), scanOf("owner-b/repo-b")...)
	repos = append(repos, scanOf("owner-z/unlinked")...) // its import form holds the dropdown
	tn.s.annotateConnectedInstances(asUser(tn.alice), repos)
	data := ui.GithubConnectData{
		ReposLoaded: true,
		Repos:       repos,
		Workspaces:  tn.s.loadWorkspacesForAssignment(asUser(tn.alice)),
	}
	var buf bytes.Buffer
	if err := ui.GithubConnectRepoListFragment(data).Render(asUser(tn.alice), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	page := buf.String()

	for _, secret := range []string{tn.instB.ID.String(), "Instance Of Org B", "Org B", tn.wsB.ID.String()} {
		if strings.Contains(page, secret) {
			t.Errorf("the page of a user of A contains %q, which belongs to B", secret)
		}
	}
	for _, want := range []string{"Instance Of Org A", tn.wsA.ID.String()} {
		if !strings.Contains(page, want) {
			t.Errorf("the page of a user of A is missing their own %q", want)
		}
	}
	if !strings.Contains(page, "connected in another organisation") {
		t.Error("the repository connected elsewhere must say so")
	}
}

// A repository connected elsewhere offers no import: it could only fail.
func TestRepositoryConnectedElsewhereOffersNoImportButton(t *testing.T) {
	tn := newTenancy(t)
	repos := scanOf("owner-b/repo-b")
	tn.s.annotateConnectedInstances(asUser(tn.alice), repos)
	data := ui.GithubConnectData{ReposLoaded: true, Repos: repos,
		Workspaces: tn.s.loadWorkspacesForAssignment(asUser(tn.alice))}
	var buf bytes.Buffer
	if err := ui.GithubConnectRepoListFragment(data).Render(asUser(tn.alice), &buf); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(buf.String(), "/github/connect/import") {
		t.Error("an import form is offered for a repository connected in another organisation")
	}
}

// --- the repository scan endpoint: revoked and incomplete -------------------------

// reader answers ListUserRepos as configured; every other method would panic, and
// none is reached before a failed listing.
type scanReaderFake struct {
	syncdom.RepoReader
	repos []syncdom.UserRepoInfo
	err   error
}

func (f scanReaderFake) ListUserRepos(context.Context, string) ([]syncdom.UserRepoInfo, error) {
	return f.repos, f.err
}
func (f scanReaderFake) ListInstallations(context.Context) ([]syncdom.InstallationInfo, error) {
	return nil, nil
}
func (f scanReaderFake) DetectEPFInRepo(context.Context, string, string, string, string) ([]syncdom.DetectedEPFInstance, []syncdom.SubmoduleRef, bool, syncdom.RepoCommitInfo, error) {
	return nil, nil, false, syncdom.RepoCommitInfo{}, nil
}

// connected gives alice a stored GitHub token and a server whose GitHub reader is r.
func connected(t *testing.T, tn *tenancy, r scanReaderFake) (token string) {
	t.Helper()
	token = "gho_alice_token_for_the_scan_tests"
	tn.s.userSvc = userdom.NewService(tn.db)
	if err := tn.s.userSvc.StoreGithubToken(importCtx(), tn.alice.ID, token); err != nil {
		t.Fatal(err)
	}
	svc := syncdom.NewService(tn.db, strategydom.NewService(tn.db), versiondom.NewService(tn.db), nil)
	svc.WithReader(r)
	tn.s.syncSvc = svc
	return token
}

func scanRequest(t *testing.T, tn *tenancy, htmx bool) (echo.Context, *httptest.ResponseRecorder) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/github/connect/repos", nil).WithContext(asUser(tn.alice))
	if htmx {
		req.Header.Set("HX-Request", "true")
	}
	rec := httptest.NewRecorder()
	return echo.New().NewContext(req, rec), rec
}

// GitHub rejects the stored token: the token is forgotten, the cached scan is
// dropped, and the browser goes back to the page that offers "Connect GitHub".
func TestARevokedTokenSendsTheUserBackToAuthorization(t *testing.T) {
	tn := newTenancy(t)
	token := connected(t, tn, scanReaderFake{err: &syncdom.TokenRevokedError{}})

	c, rec := scanRequest(t, tn, true)
	if err := tn.s.handleGithubConnectRepos(c); err != nil {
		t.Fatal(err)
	}
	if got := rec.Header().Get("HX-Redirect"); got != "/github/connect" {
		t.Errorf("HX-Redirect = %q, want /github/connect (a fragment endpoint must not swap a page into the list)", got)
	}
	if got := tn.s.loadUserGithubToken(importCtx(), tn.alice.ID); got != "" {
		t.Error("the revoked token is still stored")
	}
	if tn.s.syncSvc.GetCachedScanState(token).Ready {
		t.Error("the scan of the revoked token is still cached")
	}
}

func TestARevokedTokenRedirectsAPlainRequest(t *testing.T) {
	tn := newTenancy(t)
	connected(t, tn, scanReaderFake{err: &syncdom.TokenRevokedError{}})
	c, rec := scanRequest(t, tn, false)
	if err := tn.s.handleGithubConnectRepos(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/github/connect" {
		t.Errorf("got %d %q, want a 302 to /github/connect", rec.Code, rec.Header().Get("Location"))
	}
}

// Any other failure keeps the token: it says nothing about the token itself.
func TestAnOrdinaryScanFailureKeepsTheToken(t *testing.T) {
	tn := newTenancy(t)
	connected(t, tn, scanReaderFake{err: errors.New("github is down")})
	c, rec := scanRequest(t, tn, true)
	if err := tn.s.handleGithubConnectRepos(c); err != nil {
		t.Fatal(err)
	}
	if rec.Header().Get("HX-Redirect") != "" {
		t.Error("an ordinary failure sent the user back to authorization")
	}
	if tn.s.loadUserGithubToken(importCtx(), tn.alice.ID) == "" {
		t.Error("an ordinary failure removed the token")
	}
	if !strings.Contains(rec.Body.String(), "Scan failed") {
		t.Errorf("the generic scan-failed message is missing: %q", rec.Body.String())
	}
}

// A list that could not read every organisation says so.
func TestAnIncompleteListSaysSo(t *testing.T) {
	tn := newTenancy(t)
	connected(t, tn, scanReaderFake{
		repos: []syncdom.UserRepoInfo{{Name: "mine", FullName: "owner-a/mine", Owner: "owner-a"}},
		err:   &syncdom.PartialResultError{Orgs: []string{"broken-org"}},
	})
	c, rec := scanRequest(t, tn, true)
	if err := tn.s.handleGithubConnectRepos(c); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(rec.Body.String(), "may be incomplete") {
		t.Errorf("the list does not say it may be incomplete: %q", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "owner-a/mine") {
		t.Error("the repositories that could be read are missing")
	}
}

func TestACompleteListDoesNotSayIncomplete(t *testing.T) {
	tn := newTenancy(t)
	connected(t, tn, scanReaderFake{
		repos: []syncdom.UserRepoInfo{{Name: "mine", FullName: "owner-a/mine", Owner: "owner-a"}},
	})
	c, rec := scanRequest(t, tn, true)
	if err := tn.s.handleGithubConnectRepos(c); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(rec.Body.String(), "may be incomplete") {
		t.Error("a complete list says it may be incomplete")
	}
}

// The second poll is served from the scan cache; it must say the same.
func TestAnIncompleteListSaysSoWhenServedFromTheCache(t *testing.T) {
	tn := newTenancy(t)
	connected(t, tn, scanReaderFake{
		repos: []syncdom.UserRepoInfo{{Name: "mine", FullName: "owner-a/mine", Owner: "owner-a"}},
		err:   &syncdom.PartialResultError{Orgs: []string{"broken-org"}},
	})
	first, _ := scanRequest(t, tn, true)
	if err := tn.s.handleGithubConnectRepos(first); err != nil {
		t.Fatal(err)
	}
	second, rec := scanRequest(t, tn, true)
	if err := tn.s.handleGithubConnectRepos(second); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(rec.Body.String(), "may be incomplete") {
		t.Errorf("the cached list does not say it may be incomplete: %q", rec.Body.String())
	}
}
