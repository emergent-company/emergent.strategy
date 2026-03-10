package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func resolverTestSessionManager(t *testing.T) *SessionManager {
	t.Helper()
	return NewSessionManager(SessionConfig{
		Secret: []byte("0123456789abcdef0123456789abcdef"),
		TTL:    24 * time.Hour,
	})
}

func createTestSession(t *testing.T, sm *SessionManager, method, token string) string {
	t.Helper()
	user := &GitHubUser{ID: 42, Login: "testuser"}
	jwt, err := sm.CreateSessionWithOptions(user, token, SessionOptions{
		AuthMethod: method,
	})
	if err != nil {
		t.Fatalf("CreateSessionWithOptions: %v", err)
	}
	su, err := sm.ValidateToken(jwt)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	return su.SessionID
}

func TestTokenResolver_PATSession_ReturnsUserToken(t *testing.T) {
	sm := resolverTestSessionManager(t)
	sessionID := createTestSession(t, sm, AuthMethodPAT, "ghp_mypat123")

	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
		// No InstallationTokenManager — PAT doesn't need it.
	})

	tok, err := resolver.ResolveRepoToken(sessionID, "myorg", "myrepo")
	if err != nil {
		t.Fatalf("ResolveRepoToken: %v", err)
	}
	if tok != "ghp_mypat123" {
		t.Errorf("got %q, want ghp_mypat123", tok)
	}
}

func TestTokenResolver_OAuthSession_ReturnsUserToken(t *testing.T) {
	sm := resolverTestSessionManager(t)
	sessionID := createTestSession(t, sm, AuthMethodOAuth, "gho_oauth_token")

	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
	})

	tok, err := resolver.ResolveRepoToken(sessionID, "myorg", "myrepo")
	if err != nil {
		t.Fatalf("ResolveRepoToken: %v", err)
	}
	if tok != "gho_oauth_token" {
		t.Errorf("got %q, want gho_oauth_token", tok)
	}
}

func TestTokenResolver_ExpiredSession_ReturnsError(t *testing.T) {
	sm := resolverTestSessionManager(t)

	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
	})

	_, err := resolver.ResolveRepoToken("nonexistent-session", "org", "repo")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestTokenResolver_GitHubApp_NoInstallationManager_FallsBack(t *testing.T) {
	sm := resolverTestSessionManager(t)
	sessionID := createTestSession(t, sm, AuthMethodGitHubApp, "ghu_apptoken")

	// No InstallationTokenManager configured — should fall back to user token.
	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
	})

	tok, err := resolver.ResolveRepoToken(sessionID, "org", "repo")
	if err != nil {
		t.Fatalf("ResolveRepoToken: %v", err)
	}
	if tok != "ghu_apptoken" {
		t.Errorf("got %q, want ghu_apptoken (fallback)", tok)
	}
}

func TestTokenResolver_InvalidateCache(t *testing.T) {
	sm := resolverTestSessionManager(t)

	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
	})

	// Manually populate cache.
	resolver.mu.Lock()
	resolver.cache[repoCacheKey{Owner: "org", Repo: "repo"}] = &repoCacheEntry{
		InstallationID: 100,
		CachedAt:       time.Now(),
	}
	resolver.cache[repoCacheKey{Owner: "org", Repo: "other"}] = &repoCacheEntry{
		InstallationID: 200,
		CachedAt:       time.Now(),
	}
	resolver.mu.Unlock()

	resolver.InvalidateCache("org", "repo")

	resolver.mu.Lock()
	_, exists := resolver.cache[repoCacheKey{Owner: "org", Repo: "repo"}]
	_, otherExists := resolver.cache[repoCacheKey{Owner: "org", Repo: "other"}]
	resolver.mu.Unlock()

	if exists {
		t.Error("expected cache entry for org/repo to be invalidated")
	}
	if !otherExists {
		t.Error("expected cache entry for org/other to be preserved")
	}
}

// --- findInstallationForRepo tests ---

// resolverMockServer simulates GitHub API endpoints for the resolver.
type resolverMockServer struct {
	server        *httptest.Server
	installations []resolverInstallation
	// installationRepos maps installationID -> list of repo full names.
	installationRepos map[int64][]string
}

func newResolverMockServer(installations []resolverInstallation, repos map[int64][]string) *resolverMockServer {
	m := &resolverMockServer{
		installations:     installations,
		installationRepos: repos,
	}
	m.server = httptest.NewServer(http.HandlerFunc(m.handler))
	return m
}

func (m *resolverMockServer) handler(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") == "" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	path := r.URL.Path

	// GET /user/installations
	if path == "/user/installations" {
		resp := struct {
			Installations []resolverInstallation `json:"installations"`
		}{
			Installations: m.installations,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	// GET /user/installations/{id}/repositories
	if strings.HasPrefix(path, "/user/installations/") && strings.HasSuffix(path, "/repositories") {
		// Extract installation ID from path.
		idStr := strings.TrimPrefix(path, "/user/installations/")
		idStr = strings.TrimSuffix(idStr, "/repositories")

		var installID int64
		fmt.Sscanf(idStr, "%d", &installID)

		repoNames := m.installationRepos[installID]
		type repoEntry struct {
			FullName string `json:"full_name"`
		}
		var repos []repoEntry
		for _, name := range repoNames {
			repos = append(repos, repoEntry{FullName: name})
		}

		resp := struct {
			Repositories []repoEntry `json:"repositories"`
		}{
			Repositories: repos,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	w.WriteHeader(http.StatusNotFound)
}

func (m *resolverMockServer) close() { m.server.Close() }

func TestFindInstallationForRepo_Found(t *testing.T) {
	installations := []resolverInstallation{
		{ID: 101, AppID: 99, Account: struct {
			Login string `json:"login"`
		}{Login: "org-a"}},
	}
	repos := map[int64][]string{
		101: {"org-a/product", "org-a/infra"},
	}

	mock := newResolverMockServer(installations, repos)
	defer mock.close()

	sm := resolverTestSessionManager(t)
	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
		AppID:          99,
		BaseURL:        mock.server.URL,
		HTTPClient:     mock.server.Client(),
	})

	instID, err := resolver.findInstallationForRepo("test-token", "org-a", "product")
	if err != nil {
		t.Fatalf("expected to find installation, got: %v", err)
	}
	if instID != 101 {
		t.Errorf("expected installation ID 101, got %d", instID)
	}
}

func TestFindInstallationForRepo_NotFound(t *testing.T) {
	installations := []resolverInstallation{
		{ID: 201, AppID: 99, Account: struct {
			Login string `json:"login"`
		}{Login: "org-a"}},
	}
	repos := map[int64][]string{
		201: {"org-a/other-repo"},
	}

	mock := newResolverMockServer(installations, repos)
	defer mock.close()

	sm := resolverTestSessionManager(t)
	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
		AppID:          99,
		BaseURL:        mock.server.URL,
		HTTPClient:     mock.server.Client(),
	})

	_, err := resolver.findInstallationForRepo("test-token", "org-a", "missing-repo")
	if err == nil {
		t.Fatal("expected error for repo not covered by any installation")
	}
	if !strings.Contains(err.Error(), "no installation") {
		t.Errorf("expected 'no installation' error, got: %v", err)
	}
}

func TestFindInstallationForRepo_MultipleInstallations(t *testing.T) {
	installations := []resolverInstallation{
		{ID: 301, AppID: 99, Account: struct {
			Login string `json:"login"`
		}{Login: "org-a"}},
		{ID: 302, AppID: 99, Account: struct {
			Login string `json:"login"`
		}{Login: "org-b"}},
	}
	repos := map[int64][]string{
		301: {"org-a/product-1"},
		302: {"org-b/product-2"},
	}

	mock := newResolverMockServer(installations, repos)
	defer mock.close()

	sm := resolverTestSessionManager(t)
	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
		AppID:          99,
		BaseURL:        mock.server.URL,
		HTTPClient:     mock.server.Client(),
	})

	// Find repo in org-b.
	instID, err := resolver.findInstallationForRepo("test-token", "org-b", "product-2")
	if err != nil {
		t.Fatalf("expected to find installation for org-b, got: %v", err)
	}
	if instID != 302 {
		t.Errorf("expected installation ID 302, got %d", instID)
	}
}

func TestFindInstallationForRepo_FiltersAppID(t *testing.T) {
	installations := []resolverInstallation{
		{ID: 401, AppID: 99, Account: struct {
			Login string `json:"login"`
		}{Login: "org"}},
		{ID: 402, AppID: 42, Account: struct {
			Login string `json:"login"`
		}{Login: "org"}}, // Different app.
	}
	repos := map[int64][]string{
		401: {"org/our-repo"},
		402: {"org/their-repo"},
	}

	mock := newResolverMockServer(installations, repos)
	defer mock.close()

	sm := resolverTestSessionManager(t)
	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
		AppID:          99,
		BaseURL:        mock.server.URL,
		HTTPClient:     mock.server.Client(),
	})

	// Should NOT find org/their-repo because it's in app 42, not 99.
	_, err := resolver.findInstallationForRepo("test-token", "org", "their-repo")
	if err == nil {
		t.Fatal("expected error — repo is in a different app's installation")
	}

	// Should find org/our-repo.
	instID, err := resolver.findInstallationForRepo("test-token", "org", "our-repo")
	if err != nil {
		t.Fatalf("expected to find installation, got: %v", err)
	}
	if instID != 401 {
		t.Errorf("expected installation ID 401, got %d", instID)
	}
}

func TestFindInstallationForRepo_SkipsDifferentOwner(t *testing.T) {
	installations := []resolverInstallation{
		{ID: 501, AppID: 99, Account: struct {
			Login string `json:"login"`
		}{Login: "org-a"}},
		{ID: 502, AppID: 99, Account: struct {
			Login string `json:"login"`
		}{Login: "org-b"}},
	}
	repos := map[int64][]string{
		501: {"org-a/repo"},
		502: {"org-b/repo"},
	}

	mock := newResolverMockServer(installations, repos)
	defer mock.close()

	sm := resolverTestSessionManager(t)
	resolver := NewTokenResolver(TokenResolverConfig{
		SessionManager: sm,
		AppID:          99,
		BaseURL:        mock.server.URL,
		HTTPClient:     mock.server.Client(),
	})

	// Looking for org-b/repo should skip org-a's installation.
	instID, err := resolver.findInstallationForRepo("test-token", "org-b", "repo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if instID != 502 {
		t.Errorf("expected installation ID 502 (org-b), got %d", instID)
	}
}
