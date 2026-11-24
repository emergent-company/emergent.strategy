package github

import (
	"context"
	"errors"
	"net/http"
	"testing"
)

// userReposMux serves /user/repos (pass 1), /user/orgs and /orgs/<org>/repos
// (pass 2). A handler left nil answers 200 with an empty list.
type userReposMux struct {
	userRepos http.HandlerFunc
	userOrgs  http.HandlerFunc
	orgRepos  map[string]http.HandlerFunc
}

func (m userReposMux) build() *http.ServeMux {
	mux := http.NewServeMux()
	empty := func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, []map[string]any{}) }
	pick := func(h http.HandlerFunc) http.HandlerFunc {
		if h == nil {
			return empty
		}
		return h
	}
	mux.HandleFunc("/user/repos", pick(m.userRepos))
	mux.HandleFunc("/user/orgs", pick(m.userOrgs))
	for org, h := range m.orgRepos {
		mux.HandleFunc("/orgs/"+org+"/repos", h)
	}
	return mux
}

func status(code int, msg string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_, _ = w.Write([]byte(`{"message":"` + msg + `"}`))
	}
}

func repoList(names ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		var out []map[string]any
		for _, n := range names {
			out = append(out, map[string]any{"name": n, "full_name": "acme/" + n, "owner": map[string]any{"login": "acme"}})
		}
		writeJSON(w, out)
	}
}

func orgList(logins ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		var out []map[string]any
		for _, l := range logins {
			out = append(out, map[string]any{"login": l})
		}
		writeJSON(w, out)
	}
}

func names(repos []UserRepo) []string {
	var out []string
	for _, r := range repos {
		out = append(out, r.Name)
	}
	return out
}

// A 401 from GitHub means the token is revoked, wherever in the listing it comes.
func TestListUserReposReportsARevokedToken(t *testing.T) {
	cases := map[string]userReposMux{
		"on the user's own repositories": {userRepos: status(401, "Bad credentials")},
		"on the organisation list":       {userRepos: repoList("a"), userOrgs: status(401, "Bad credentials")},
		"on an organisation's repositories": {
			userRepos: repoList("a"), userOrgs: orgList("acme-org"),
			orgRepos: map[string]http.HandlerFunc{"acme-org": status(401, "Bad credentials")},
		},
	}
	for name, m := range cases {
		t.Run(name, func(t *testing.T) {
			c, _ := newTestClient(t, m.build())
			repos, err := c.ListUserRepos(context.Background(), "gho_revoked")
			var revoked *TokenRevokedError
			if !errors.As(err, &revoked) {
				t.Fatalf("err = %v, want a TokenRevokedError", err)
			}
			if len(repos) != 0 {
				t.Errorf("a revoked token must not return a list, got %v", names(repos))
			}
		})
	}
}

// A 403 on an organisation means it does not allow this OAuth app; that is
// expected, the page explains how to ask for access, and the list is still complete
// for what the user can reach.
func TestListUserReposSkipsAnOrganisationThatRestrictsTheApp(t *testing.T) {
	m := userReposMux{
		userRepos: repoList("mine"), userOrgs: orgList("restricted", "open"),
		orgRepos: map[string]http.HandlerFunc{
			"restricted": status(403, "OAuth App access restrictions"),
			"open":       repoList("team"),
		},
	}
	c, _ := newTestClient(t, m.build())
	repos, err := c.ListUserRepos(context.Background(), "gho_ok")
	if err != nil {
		t.Fatalf("a restricted organisation must not fail the listing: %v", err)
	}
	if got := names(repos); len(got) != 2 {
		t.Errorf("repos = %v, want mine and team", got)
	}
}

// Anything else that goes wrong in the second pass leaves the list incomplete,
// and says so, instead of looking complete.
func TestListUserReposReportsAnIncompleteList(t *testing.T) {
	t.Run("one organisation fails", func(t *testing.T) {
		m := userReposMux{
			userRepos: repoList("mine"), userOrgs: orgList("broken", "open"),
			orgRepos: map[string]http.HandlerFunc{
				"broken": status(500, "boom"),
				"open":   repoList("team"),
			},
		}
		c, _ := newTestClient(t, m.build())
		repos, err := c.ListUserRepos(context.Background(), "gho_ok")
		var partial *PartialListError
		if !errors.As(err, &partial) {
			t.Fatalf("err = %v, want a PartialListError", err)
		}
		if len(partial.Orgs) != 1 || partial.Orgs[0] != "broken" || partial.OrgListFailed {
			t.Errorf("partial = %+v, want just the organisation \"broken\"", partial)
		}
		if got := names(repos); len(got) != 2 {
			t.Errorf("the repositories that could be listed must still be returned, got %v", got)
		}
	})
	t.Run("the organisation list fails", func(t *testing.T) {
		m := userReposMux{userRepos: repoList("mine"), userOrgs: status(500, "boom")}
		c, _ := newTestClient(t, m.build())
		repos, err := c.ListUserRepos(context.Background(), "gho_ok")
		var partial *PartialListError
		if !errors.As(err, &partial) || !partial.OrgListFailed {
			t.Fatalf("err = %v, want a PartialListError with OrgListFailed", err)
		}
		if got := names(repos); len(got) != 1 {
			t.Errorf("repos = %v, want the user's own", got)
		}
	})
}

func TestListUserReposCompleteListHasNoError(t *testing.T) {
	m := userReposMux{userRepos: repoList("mine"), userOrgs: orgList("open"),
		orgRepos: map[string]http.HandlerFunc{"open": repoList("team")}}
	c, _ := newTestClient(t, m.build())
	repos, err := c.ListUserRepos(context.Background(), "gho_ok")
	if err != nil || len(repos) != 2 {
		t.Errorf("repos=%v err=%v, want 2 repositories and no error", names(repos), err)
	}
}
