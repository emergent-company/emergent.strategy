package github

import (
	"context"
	"errors"
	"net/http"
	"testing"

	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
)

// The adapter hands the sync layer its own error types, so the sync package never
// depends on this one.
func TestAdapterMapsARevokedTokenToTheSyncError(t *testing.T) {
	c, _ := newTestClient(t, userReposMux{userRepos: status(401, "Bad credentials")}.build())
	a := NewRepoReaderAdapter(c)
	repos, err := a.ListUserRepos(context.Background(), "gho_revoked")
	var revoked *syncdom.TokenRevokedError
	if !errors.As(err, &revoked) {
		t.Fatalf("err = %v, want a sync.TokenRevokedError", err)
	}
	if len(repos) != 0 {
		t.Errorf("a revoked token must not return a list, got %d", len(repos))
	}
}

func TestAdapterMapsAnIncompleteListToTheSyncErrorAndKeepsTheRepos(t *testing.T) {
	m := userReposMux{
		userRepos: repoList("mine"), userOrgs: orgList("broken"),
		orgRepos: map[string]http.HandlerFunc{"broken": status(500, "boom")},
	}
	c, _ := newTestClient(t, m.build())
	a := NewRepoReaderAdapter(c)
	repos, err := a.ListUserRepos(context.Background(), "gho_ok")
	var partial *syncdom.PartialResultError
	if !errors.As(err, &partial) {
		t.Fatalf("err = %v, want a sync.PartialResultError", err)
	}
	if len(partial.Orgs) != 1 || partial.Orgs[0] != "broken" {
		t.Errorf("partial = %+v, want the organisation \"broken\"", partial)
	}
	if len(repos) != 1 || repos[0].Name != "mine" {
		t.Errorf("repos = %+v, want the one that could be listed", repos)
	}
}

func TestAdapterMapsARevokedTokenOnTheInstallationListToo(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/user/installations", status(401, "Bad credentials"))
	c, _ := newTestClient(t, mux)
	a := NewRepoReaderAdapter(c)
	_, err := a.ListUserInstallations(context.Background(), "gho_revoked")
	var revoked *syncdom.TokenRevokedError
	if !errors.As(err, &revoked) {
		t.Fatalf("err = %v, want a sync.TokenRevokedError", err)
	}
}
