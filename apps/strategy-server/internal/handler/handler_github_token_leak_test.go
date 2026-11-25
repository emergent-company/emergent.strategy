package handler

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	strategydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	userdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	ghclient "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/github"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/seal"
)

const (
	leakToken   = "gho_Zq8LwN3rT6yUb1XcV4mK7pJ2hG5dF9sA0eRi"
	leakDataKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// githubOAuthFake issues leakToken for any code.
func githubOAuthFake() *ghclient.OAuthConfig {
	reply := func(status int, body string) (*http.Response, error) {
		return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	}
	return &ghclient.OAuthConfig{
		ClientID: "id", ClientSecret: "secret", StateSecret: "state-secret",
		HTTPClient: &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			if r.URL.Host == "github.com" {
				return reply(http.StatusOK, `{"access_token":"`+leakToken+`","token_type":"bearer"}`)
			}
			return reply(http.StatusOK, `{"id":1,"login":"alice-gh"}`)
		})},
	}
}

type importingReader struct {
	scanReaderFake
	headErr error
	used    *[]string
}

func (r importingReader) GetHeadCommitInfo(_ context.Context, token, _, _, _ string) (string, time.Time, error) {
	*r.used = append(*r.used, token)
	return "abc123", time.Now(), r.headErr
}

func (r importingReader) GetAllFileContents(_ context.Context, token, _, _, _, _ string) (map[string][]byte, error) {
	*r.used = append(*r.used, token)
	return map[string][]byte{"READY/00_north_star.yaml": []byte("north_star:\n  organization: Acme\n")}, nil
}

// Connecting, scanning and importing, including an import that fails and a token
// GitHub revokes, must leave the token in no log line, response or database value.
func TestTheGithubTokenAppearsInNoLogResponseOrColumn(t *testing.T) {
	tn := newTenancy(t)

	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	prev := slog.Default()
	slog.SetDefault(logger)
	t.Cleanup(func() { slog.SetDefault(prev) })

	keys, err := seal.ParseKeyring("k1:" + leakDataKey)
	if err != nil {
		t.Fatal(err)
	}
	var used []string
	reader := &importingReader{used: &used, scanReaderFake: scanReaderFake{
		repos: []syncdom.UserRepoInfo{{Name: "new-repo", FullName: "owner-a/new-repo", Owner: "owner-a"}},
	}}
	tn.s.log = logger
	tn.s.userSvc = userdom.NewService(tn.db).WithTokenKeys(keys, true)
	tn.s.githubOAuth = githubOAuthFake()

	var responses strings.Builder
	serve := func(req *http.Request, h func(echo.Context) error) *httptest.ResponseRecorder {
		t.Helper()
		rec := httptest.NewRecorder()
		if err := h(echo.New().NewContext(req.WithContext(asUser(tn.alice)), rec)); err != nil {
			responses.WriteString(err.Error())
		}
		responses.WriteString(rec.Body.String())
		for name, values := range rec.Header() {
			responses.WriteString(name + strings.Join(values, " "))
		}
		return rec
	}
	useReader := func(r syncdom.RepoReader) {
		svc := syncdom.NewService(tn.db, strategydom.NewService(tn.db), versiondom.NewService(tn.db), nil)
		svc.WithInstanceReimporter(tn.instSvc)
		svc.WithReader(r)
		tn.s.syncSvc = svc
	}
	column := func() string {
		t.Helper()
		var v *string
		if err := tn.db.QueryRow("SELECT github_access_token FROM users WHERE id = ?", tn.alice.ID).Scan(&v); err != nil {
			t.Fatal(err)
		}
		if v == nil {
			return ""
		}
		return *v
	}

	// Connect.
	useReader(reader)
	callback := httptest.NewRequest(http.MethodGet, "/github/connect/callback?code=c&state=s1", nil)
	callback.AddCookie(&http.Cookie{Name: "github_oauth_state", Value: ghclient.SignState("s1", "state-secret")})
	if rec := serve(callback, tn.s.handleGithubConnectCallback); rec.Code != http.StatusFound {
		t.Fatalf("callback answered %d: %s", rec.Code, rec.Body.String())
	}
	if raw := column(); !strings.HasPrefix(raw, "enc:v1:k1:") || strings.Contains(raw, leakToken) {
		t.Fatalf("after connecting the column holds %q", raw)
	}

	// Scan.
	serve(httptest.NewRequest(http.MethodGet, "/github/connect/repos", nil), tn.s.handleGithubConnectRepos)

	// Import, then an import GitHub fails.
	importRequest := func(repo string) *http.Request {
		form := url.Values{"github_repo": {repo}, "workspace_id": {tn.wsA.ID.String()}, "action": {"import"}}
		req := httptest.NewRequest(http.MethodPost, "/github/connect/import", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return req
	}
	serve(importRequest("owner-a/new-repo"), tn.s.handleGithubImportNew)
	reader.headErr = context.DeadlineExceeded
	serve(importRequest("owner-a/other-repo"), tn.s.handleGithubImportNew)
	if len(used) == 0 {
		t.Fatal("the import never reached GitHub, so this test proves nothing about it")
	}
	for _, got := range used {
		if got != leakToken {
			t.Fatalf("the import called GitHub with %q, not the user's token", got)
		}
	}

	// GitHub revokes the token.
	useReader(scanReaderFake{err: &syncdom.TokenRevokedError{}})
	serve(httptest.NewRequest(http.MethodGet, "/github/connect/repos", nil), tn.s.handleGithubConnectRepos)
	if column() != "" {
		t.Error("the revoked token is still stored")
	}

	for _, want := range []string{"github oauth complete", "import from github", "github token rejected"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("the log lacks %q: the capture does not cover the flow", want)
		}
	}
	for name, text := range map[string]string{"log": logs.String(), "response": responses.String()} {
		for _, fragment := range []string{leakToken, leakToken[4:20], leakDataKey} {
			if strings.Contains(text, fragment) {
				t.Errorf("the %s contains %q", name, fragment)
			}
		}
	}
}
