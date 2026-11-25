package mcpserver_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	userdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

const serverWideOwner = "server-wide-other-tenant"

// githubFake is a GitHub as the MCP tools see it. The App-wide installation list
// names an owner that belongs to nobody in the test, and must never be returned.
type githubFake struct {
	syncdom.RepoReader
	byToken map[string]githubAccount
	revoked map[string]bool
}

type githubAccount struct {
	installs []syncdom.InstallationInfo
	repos    []syncdom.UserRepoInfo
}

func (f *githubFake) ListInstallations(context.Context) ([]syncdom.InstallationInfo, error) {
	return []syncdom.InstallationInfo{{ID: 1, OwnerLogin: serverWideOwner, OwnerType: "Organization"}}, nil
}

func (f *githubFake) ListUserInstallations(_ context.Context, token string) ([]syncdom.InstallationInfo, error) {
	if f.revoked[token] {
		return nil, &syncdom.TokenRevokedError{}
	}
	return f.byToken[token].installs, nil
}

func (f *githubFake) ListUserRepos(_ context.Context, token string) ([]syncdom.UserRepoInfo, error) {
	if f.revoked[token] {
		return nil, &syncdom.TokenRevokedError{}
	}
	return f.byToken[token].repos, nil
}

func (f *githubFake) DetectEPFInRepo(context.Context, string, string, string, string) ([]syncdom.DetectedEPFInstance, []syncdom.SubmoduleRef, bool, syncdom.RepoCommitInfo, error) {
	return nil, nil, false, syncdom.RepoCommitInfo{}, nil
}

func repoOf(owner, name string) syncdom.UserRepoInfo {
	return syncdom.UserRepoInfo{Name: name, FullName: owner + "/" + name, Owner: owner}
}

const devToken = "gho_dev_user_token_for_mcp_tests"

// githubServices wires the sync tools to the fake, with the dev user as a member
// of one organisation and (when withToken) a stored GitHub token.
func githubServices(t *testing.T, fake *githubFake, withToken bool) (mcpserver.Services, uuid.UUID) {
	t.Helper()
	db := database.TestDB(t)
	ctx := audit.ContextWithAudit(audit.ContextWithSource(context.Background(), audit.SourceSystem), audit.NewSlogWriter())
	packSvc := pack.NewService(db)
	instSvc := instance.NewService(db)
	instSvc.WithPackEnsurer(packSvc)
	stratSvc := strategy.NewService(db)
	syncSvc := syncdom.NewService(db, stratSvc, versiondom.NewService(db), nil)
	syncSvc.WithReader(fake)
	orgID := seedOrg(t, db, ctx) // also creates the dev user and makes it org_admin
	users := userdom.NewService(db)
	if withToken {
		if err := users.StoreGithubToken(ctx, web.DevUser.ID, devToken); err != nil {
			t.Fatal(err)
		}
	}
	return mcpserver.Services{
		Workspace: workspace.NewService(db), Instance: instSvc, Strategy: stratSvc, Pack: packSvc,
		App: appdom.NewService(db), Semantic: semantic.NewService(semantic.Config{}),
		Org: orgdom.NewService(db), Sync: syncSvc, User: users,
	}, orgID
}

func ownersOf(t *testing.T, r toolResult, key string) []string {
	t.Helper()
	var out map[string]any
	r.decode(&out)
	var owners []string
	list, _ := out[key].([]any)
	for _, it := range list {
		m, _ := it.(map[string]any)
		for _, k := range []string{"owner_login", "owner"} {
			if v, ok := m[k].(string); ok {
				owners = append(owners, v)
			}
		}
	}
	return owners
}

// --- list_github_installations ----------------------------------------------

func TestListGithubInstallationsReturnsTheCallersOwnInstallationsOnly(t *testing.T) {
	fake := &githubFake{byToken: map[string]githubAccount{devToken: {
		installs: []syncdom.InstallationInfo{{ID: 11, OwnerLogin: "my-org", OwnerType: "Organization"}},
	}}}
	svc, _ := githubServices(t, fake, true)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	res := c.call(1, "list_github_installations", nil).assertOK()
	owners := ownersOf(t, res, "installations")
	if len(owners) != 1 || owners[0] != "my-org" {
		t.Errorf("installations = %v, want only the caller's own (my-org)", owners)
	}
	if strings.Contains(res.text, serverWideOwner) {
		t.Error("the server-wide installation list leaked to the caller")
	}
}

func TestListGithubInstallationsWithoutAStoredTokenGivesNoData(t *testing.T) {
	svc, _ := githubServices(t, &githubFake{}, false)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	res := c.call(1, "list_github_installations", nil).assertOK()
	var out map[string]any
	res.decode(&out)
	if out["needs_github_connection"] != true {
		t.Errorf("response = %v, want needs_github_connection", out)
	}
	if strings.Contains(res.text, serverWideOwner) || out["installations"] != nil {
		t.Error("installation data was returned to a caller with no connected GitHub account")
	}
}

func TestARevokedTokenIsClearedByTheGithubTools(t *testing.T) {
	fake := &githubFake{revoked: map[string]bool{devToken: true}}
	svc, _ := githubServices(t, fake, true)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var out map[string]any
	c.call(1, "list_github_installations", nil).assertOK().decode(&out)
	if out["needs_github_connection"] != true {
		t.Errorf("response = %v, want needs_github_connection for a revoked token", out)
	}
	if tok, _ := svc.User.GetGithubToken(context.Background(), web.DevUser.ID); tok != "" {
		t.Error("the revoked token is still stored")
	}
}

// A stored value that cannot be read (here: encrypted, and no key configured) asks
// the caller to connect again. It is never sent to GitHub, nor destroyed.
func TestAnUnreadableTokenAsksTheCallerToConnectAgain(t *testing.T) {
	const stored = "enc:v1:k1:bm90LWEtcmVhbC12YWx1ZS1idXQtbG9uZy1lbm91Z2g="
	fake := &githubFake{byToken: map[string]githubAccount{stored: {
		installs: []syncdom.InstallationInfo{{ID: 11, OwnerLogin: "my-org"}},
	}}}
	svc, _ := githubServices(t, fake, false)
	if err := svc.User.StoreGithubToken(context.Background(), web.DevUser.ID, stored); err != nil {
		t.Fatal(err)
	}
	c := newMCPClient(t, svc)
	c.activateAllTools()

	res := c.call(1, "list_github_installations", nil).assertOK()
	var out map[string]any
	res.decode(&out)
	if out["needs_github_connection"] != true || out["installations"] != nil {
		t.Errorf("response = %v, want needs_github_connection only", out)
	}
	if _, err := svc.User.GetGithubToken(context.Background(), web.DevUser.ID); !errors.Is(err, userdom.ErrTokenUnreadable) {
		t.Errorf("the stored value was changed: err = %v", err)
	}
}

func TestAScopedAccessTokenCannotUseTheGithubTools(t *testing.T) {
	svc, orgID := githubServices(t, &githubFake{byToken: map[string]githubAccount{devToken: {
		installs: []syncdom.InstallationInfo{{ID: 11, OwnerLogin: "my-org"}},
	}}}, true)
	_ = orgID
	_, instID := seedInstance(t, svc, "tokens-"+uuid.New().String()[:8], nil)
	c := newMCPClientAs(t, svc, tokenPrincipal(instID, web.PermissionRead))
	c.activateAllTools()

	c.call(1, "list_github_installations", nil).assertError()
	c.call(2, "scan_github_repos", map[string]any{"github_owner": "my-org"}).assertError()
}

// --- scan_github_repos ------------------------------------------------------

func TestScanGithubReposShowsOnlyWhatTheCallersTokenCanSee(t *testing.T) {
	fake := &githubFake{byToken: map[string]githubAccount{devToken: {
		repos: []syncdom.UserRepoInfo{repoOf("my-org", "alpha"), repoOf("my-org", "beta"), repoOf("elsewhere", "gamma")},
	}}}
	svc, _ := githubServices(t, fake, true)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	res := c.call(1, "scan_github_repos", map[string]any{"github_owner": "my-org"}).assertOK()
	var out struct {
		Repos []struct {
			FullName string `json:"full_name"`
		} `json:"repos"`
		Total int `json:"total"`
	}
	res.decode(&out)
	if out.Total != 2 || len(out.Repos) != 2 {
		t.Fatalf("repos = %+v, want my-org/alpha and my-org/beta", out)
	}
	for _, r := range out.Repos {
		if !strings.HasPrefix(r.FullName, "my-org/") {
			t.Errorf("a repository of another owner was returned: %s", r.FullName)
		}
	}
}

func TestScanGithubReposOfAnOwnerTheCallerCannotSeeIsEmpty(t *testing.T) {
	fake := &githubFake{byToken: map[string]githubAccount{devToken: {repos: []syncdom.UserRepoInfo{repoOf("my-org", "alpha")}}}}
	svc, _ := githubServices(t, fake, true)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var out struct {
		Total int `json:"total"`
	}
	c.call(1, "scan_github_repos", map[string]any{"github_owner": serverWideOwner}).assertOK().decode(&out)
	if out.Total != 0 {
		t.Errorf("total = %d, want 0 for an owner the caller's account cannot see", out.Total)
	}
}

func TestScanGithubReposWithoutAStoredTokenGivesNoData(t *testing.T) {
	svc, _ := githubServices(t, &githubFake{byToken: map[string]githubAccount{"x": {repos: []syncdom.UserRepoInfo{repoOf("my-org", "alpha")}}}}, false)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	res := c.call(1, "scan_github_repos", map[string]any{"github_owner": "my-org"}).assertOK()
	var out map[string]any
	res.decode(&out)
	if out["needs_github_connection"] != true || out["repos"] != nil {
		t.Errorf("response = %v, want needs_github_connection and no repositories", out)
	}
}

func TestScanGithubReposDescriptionSaysThirtyMinutes(t *testing.T) {
	svc, _ := githubServices(t, &githubFake{}, true)
	c := newMCPClient(t, svc)
	c.activateAllTools()
	d := toolDescription(t, c, "scan_github_repos")
	if strings.Contains(d, "5 minutes") || !strings.Contains(d, "30 minutes") {
		t.Errorf("the cache lifetime in the description is wrong: %q", d)
	}
}

// --- import_from_github -----------------------------------------------------

// A token with write on one instance and read on another passes the global write
// gate (it is not read-only) and the instance-access check for both; only the
// per-instance write check stops it on the read-only one.
func TestImportFromGithubNeedsWriteAccessToTheInstance(t *testing.T) {
	svc, _ := githubServices(t, &githubFake{}, true)
	_, writable := seedInstance(t, svc, "w-"+uuid.New().String()[:8], nil)
	_, readOnly := seedInstance(t, svc, "r-"+uuid.New().String()[:8], nil)
	p := &web.Principal{
		User:    &web.User{ID: web.DevUser.ID},
		TokenID: ptr(uuid.New()),
		Grants: []web.InstanceGrant{
			{InstanceID: writable, Permission: web.PermissionWrite},
			{InstanceID: readOnly, Permission: web.PermissionRead},
		},
	}
	c := newMCPClientAs(t, svc, p)
	c.activateAllTools()

	res := c.call(1, "import_from_github", map[string]any{"instance_id": readOnly.String()}).assertError()
	if !strings.Contains(res.text, "read-only") {
		t.Errorf("a read grant must be refused as read-only: %s", res.text)
	}
}
