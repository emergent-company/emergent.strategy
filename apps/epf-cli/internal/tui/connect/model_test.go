package connect

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
)

// --- Helper: mock server ---

func newMockServer(t *testing.T, mode string, workspaces []WorkspaceInfo) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status": "ok",
				"uptime": "1h0m0s",
				"server": map[string]string{
					"server_name": "epf-test",
					"version":     "0.1.0",
					"mode":        mode,
				},
			})
		case "/workspaces":
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "authentication required"})
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"workspaces": workspaces,
				"count":      len(workspaces),
			})
		case "/auth/token":
			var req struct {
				GitHubToken string `json:"github_token"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			if req.GitHubToken == "valid-token" {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"token":    "jwt-test-token",
					"username": "testuser",
					"user_id":  42,
				})
			} else {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid token"})
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func tempTokenStore(t *testing.T) *auth.TokenStore {
	t.Helper()
	dir := t.TempDir()
	return auth.NewTokenStoreAt(filepath.Join(dir, "auth.json"))
}

// --- Connect Screen Tests ---

func TestConnectScreen_HealthSuccess(t *testing.T) {
	srv := newMockServer(t, "multi-tenant", nil)
	defer srv.Close()

	screen := NewConnectScreen(srv.URL, DefaultStyles())

	// Should start loading.
	if !screen.IsLoading() {
		t.Fatal("expected loading")
	}

	// Run the init command synchronously.
	cmd := screen.Init()
	if cmd == nil {
		t.Fatal("expected init command")
	}

	msg := cmd()
	screen, _ = screen.Update(msg)

	if screen.IsLoading() {
		t.Fatal("still loading after health check")
	}
	if screen.HasError() {
		t.Fatalf("unexpected error: %v", screen.err)
	}
	if !screen.IsConnected() {
		t.Fatal("expected connected")
	}
	if screen.Info().ServerName != "epf-test" {
		t.Fatalf("expected server name 'epf-test', got %q", screen.Info().ServerName)
	}
	if screen.Info().Mode != "multi-tenant" {
		t.Fatalf("expected mode 'multi-tenant', got %q", screen.Info().Mode)
	}
}

func TestConnectScreen_HealthFailure(t *testing.T) {
	screen := NewConnectScreen("http://localhost:1", DefaultStyles())

	cmd := screen.Init()
	msg := cmd()
	screen, _ = screen.Update(msg)

	if screen.IsLoading() {
		t.Fatal("still loading after health check")
	}
	if !screen.HasError() {
		t.Fatal("expected error for unreachable server")
	}
	if screen.IsConnected() {
		t.Fatal("should not be connected")
	}
}

func TestConnectScreen_ViewContainsServerURL(t *testing.T) {
	screen := NewConnectScreen("https://example.com", DefaultStyles())
	view := screen.View()
	if !strings.Contains(view, "https://example.com") {
		t.Fatalf("view should contain server URL, got: %s", view)
	}
}

// --- Workspaces Screen Tests ---

func TestWorkspacesScreen_FetchSuccess(t *testing.T) {
	workspaces := []WorkspaceInfo{
		{Owner: "org", Repo: "repo1", InstancePath: "org/repo1", ProductName: "Product A"},
		{Owner: "org", Repo: "repo2", InstancePath: "org/repo2", ProductName: "Product B"},
	}
	srv := newMockServer(t, "multi-tenant", workspaces)
	defer srv.Close()

	screen := NewWorkspacesScreen(srv.URL, "valid-jwt", DefaultStyles())

	cmd := screen.Init()
	msg := cmd()
	screen, _ = screen.Update(msg)

	if screen.IsLoading() {
		t.Fatal("still loading")
	}
	if screen.HasError() {
		t.Fatalf("unexpected error: %v", screen.err)
	}
	if screen.WorkspaceCount() != 2 {
		t.Fatalf("expected 2 workspaces, got %d", screen.WorkspaceCount())
	}
}

func TestWorkspacesScreen_NoWorkspaces(t *testing.T) {
	srv := newMockServer(t, "multi-tenant", []WorkspaceInfo{})
	defer srv.Close()

	screen := NewWorkspacesScreen(srv.URL, "valid-jwt", DefaultStyles())

	cmd := screen.Init()
	msg := cmd()
	screen, _ = screen.Update(msg)

	if screen.WorkspaceCount() != 0 {
		t.Fatalf("expected 0 workspaces, got %d", screen.WorkspaceCount())
	}
	if screen.AutoSelected() != nil {
		t.Fatal("should not auto-select with 0 workspaces")
	}
}

func TestWorkspacesScreen_AutoSelect(t *testing.T) {
	workspaces := []WorkspaceInfo{
		{Owner: "org", Repo: "only-repo", InstancePath: "org/only-repo", ProductName: "Sole Product"},
	}
	srv := newMockServer(t, "multi-tenant", workspaces)
	defer srv.Close()

	screen := NewWorkspacesScreen(srv.URL, "valid-jwt", DefaultStyles())

	cmd := screen.Init()
	msg := cmd()
	screen, _ = screen.Update(msg)

	ws := screen.AutoSelected()
	if ws == nil {
		t.Fatal("expected auto-selection with single workspace")
	}
	if ws.InstancePath != "org/only-repo" {
		t.Fatalf("expected 'org/only-repo', got %q", ws.InstancePath)
	}
}

func TestWorkspacesScreen_CursorNavigation(t *testing.T) {
	workspaces := []WorkspaceInfo{
		{Owner: "org", Repo: "repo1", InstancePath: "org/repo1"},
		{Owner: "org", Repo: "repo2", InstancePath: "org/repo2"},
		{Owner: "org", Repo: "repo3", InstancePath: "org/repo3"},
	}
	srv := newMockServer(t, "multi-tenant", workspaces)
	defer srv.Close()

	screen := NewWorkspacesScreen(srv.URL, "valid-jwt", DefaultStyles())

	// Load workspaces.
	cmd := screen.Init()
	msg := cmd()
	screen, _ = screen.Update(msg)

	// Cursor starts at 0.
	ws := screen.SelectedWorkspace()
	if ws == nil || ws.Repo != "repo1" {
		t.Fatal("expected cursor at repo1")
	}

	// Move down.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	ws = screen.SelectedWorkspace()
	if ws == nil || ws.Repo != "repo2" {
		t.Fatal("expected cursor at repo2")
	}

	// Move down again.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	ws = screen.SelectedWorkspace()
	if ws == nil || ws.Repo != "repo3" {
		t.Fatal("expected cursor at repo3")
	}

	// Move down past end — should stay.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	ws = screen.SelectedWorkspace()
	if ws == nil || ws.Repo != "repo3" {
		t.Fatal("expected cursor to stay at repo3")
	}

	// Move up.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'k'}))
	ws = screen.SelectedWorkspace()
	if ws == nil || ws.Repo != "repo2" {
		t.Fatal("expected cursor at repo2")
	}
}

// --- Root Model Transition Tests ---

func TestModel_ConnectToAuthTransition(t *testing.T) {
	srv := newMockServer(t, "multi-tenant", nil)
	defer srv.Close()

	cfg := Config{
		ServerURL:  srv.URL,
		TokenStore: tempTokenStore(t),
	}
	m := New(cfg)

	if m.Screen() != ScreenConnect {
		t.Fatalf("expected ScreenConnect, got %d", m.Screen())
	}

	// Run health check.
	cmd := m.Init()
	msg := cmd()
	result, _ := m.Update(msg)
	m = result.(Model)

	// With no token, should transition to auth.
	if m.Screen() != ScreenAuth {
		t.Fatalf("expected ScreenAuth, got %d", m.Screen())
	}
}

func TestModel_ConnectToWorkspacesWithToken(t *testing.T) {
	workspaces := []WorkspaceInfo{
		{Owner: "org", Repo: "repo1", InstancePath: "org/repo1"},
	}
	srv := newMockServer(t, "multi-tenant", workspaces)
	defer srv.Close()

	cfg := Config{
		ServerURL:     srv.URL,
		ExistingToken: "existing-jwt",
		TokenStore:    tempTokenStore(t),
	}
	m := New(cfg)

	// Run health check.
	cmd := m.Init()
	msg := cmd()
	result, nextCmd := m.Update(msg)
	m = result.(Model)

	// With existing token, should skip auth and go to workspaces.
	if m.Screen() != ScreenWorkspaces {
		t.Fatalf("expected ScreenWorkspaces, got %d", m.Screen())
	}

	// Run workspace fetch.
	if nextCmd != nil {
		msg = nextCmd()
		result, _ = m.Update(msg)
		m = result.(Model)
	}

	// Single workspace — should auto-select to ScreenSelected.
	if m.Screen() != ScreenSelected {
		t.Fatalf("expected ScreenSelected (auto-select), got %d", m.Screen())
	}
}

func TestModel_AuthToWorkspacesTransition(t *testing.T) {
	workspaces := []WorkspaceInfo{
		{Owner: "org", Repo: "repo1", InstancePath: "org/repo1"},
		{Owner: "org", Repo: "repo2", InstancePath: "org/repo2"},
	}
	srv := newMockServer(t, "multi-tenant", workspaces)
	defer srv.Close()

	cfg := Config{
		ServerURL:  srv.URL,
		TokenStore: tempTokenStore(t),
	}
	m := New(cfg)

	// Run health check → goes to auth.
	cmd := m.Init()
	msg := cmd()
	result, _ := m.Update(msg)
	m = result.(Model)

	if m.Screen() != ScreenAuth {
		t.Fatalf("expected ScreenAuth, got %d", m.Screen())
	}

	// Simulate auth success message.
	result, nextCmd := m.Update(authSuccessMsg{
		token:    "new-jwt",
		username: "testuser",
		userID:   42,
	})
	m = result.(Model)

	// Should transition to workspaces.
	if m.Screen() != ScreenWorkspaces {
		t.Fatalf("expected ScreenWorkspaces, got %d", m.Screen())
	}

	// Run workspace fetch.
	if nextCmd != nil {
		msg = nextCmd()
		result, _ = m.Update(msg)
		m = result.(Model)
	}

	// Two workspaces — should NOT auto-select.
	if m.Screen() != ScreenWorkspaces {
		t.Fatalf("expected to stay on ScreenWorkspaces with 2 workspaces, got %d", m.Screen())
	}
}

func TestModel_WorkspacesManualSelect(t *testing.T) {
	workspaces := []WorkspaceInfo{
		{Owner: "org", Repo: "repo1", InstancePath: "org/repo1", ProductName: "Product A"},
		{Owner: "org", Repo: "repo2", InstancePath: "org/repo2", ProductName: "Product B"},
	}
	srv := newMockServer(t, "multi-tenant", workspaces)
	defer srv.Close()

	cfg := Config{
		ServerURL:     srv.URL,
		ExistingToken: "existing-jwt",
		TokenStore:    tempTokenStore(t),
	}
	m := New(cfg)

	// Health check → workspaces (skip auth, have token).
	cmd := m.Init()
	msg := cmd()
	result, nextCmd := m.Update(msg)
	m = result.(Model)

	// Fetch workspaces.
	if nextCmd != nil {
		msg = nextCmd()
		result, _ = m.Update(msg)
		m = result.(Model)
	}

	if m.Screen() != ScreenWorkspaces {
		t.Fatalf("expected ScreenWorkspaces, got %d", m.Screen())
	}

	// Navigate to second workspace.
	result, _ = m.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	m = result.(Model)

	// Press Enter to select.
	result, _ = m.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))
	m = result.(Model)

	if m.Screen() != ScreenSelected {
		t.Fatalf("expected ScreenSelected after Enter, got %d", m.Screen())
	}
}

func TestModel_CtrlCQuits(t *testing.T) {
	srv := newMockServer(t, "multi-tenant", nil)
	defer srv.Close()

	cfg := Config{
		ServerURL:  srv.URL,
		TokenStore: tempTokenStore(t),
	}
	m := New(cfg)

	_, cmd := m.Update(tea.KeyPressMsg(tea.Key{Code: 'c', Mod: tea.ModCtrl}))

	// Should return tea.Quit.
	if cmd == nil {
		t.Fatal("expected quit command")
	}
	msg := cmd()
	if _, ok := msg.(tea.QuitMsg); !ok {
		t.Fatalf("expected QuitMsg, got %T", msg)
	}
}

func TestModel_TokenStoredAfterAuth(t *testing.T) {
	srv := newMockServer(t, "multi-tenant", nil)
	defer srv.Close()

	store := tempTokenStore(t)
	cfg := Config{
		ServerURL:  srv.URL,
		TokenStore: store,
	}
	m := New(cfg)

	// Health check → auth.
	cmd := m.Init()
	msg := cmd()
	result, _ := m.Update(msg)
	m = result.(Model)

	// Simulate auth success.
	result, _ = m.Update(authSuccessMsg{
		token:    "new-jwt-123",
		username: "alice",
		userID:   99,
	})
	m = result.(Model)

	// Check the token store.
	entry, err := store.Get(srv.URL)
	if err != nil {
		t.Fatalf("token store error: %v", err)
	}
	if entry == nil {
		t.Fatal("expected stored token entry")
	}
	if entry.Token != "new-jwt-123" {
		t.Fatalf("expected token 'new-jwt-123', got %q", entry.Token)
	}
	if entry.Username != "alice" {
		t.Fatalf("expected username 'alice', got %q", entry.Username)
	}
}

func TestModel_InstancePathStoredAfterSelection(t *testing.T) {
	workspaces := []WorkspaceInfo{
		{Owner: "org", Repo: "repo1", InstancePath: "org/repo1"},
	}
	srv := newMockServer(t, "multi-tenant", workspaces)
	defer srv.Close()

	store := tempTokenStore(t)

	// Pre-store a token so we skip auth.
	_ = store.Set(srv.URL, &auth.TokenStoreEntry{
		Token:    "existing-jwt",
		Username: "bob",
		UserID:   77,
	})

	cfg := Config{
		ServerURL:        srv.URL,
		ExistingToken:    "existing-jwt",
		ExistingUsername: "bob",
		ExistingUserID:   77,
		TokenStore:       store,
	}
	m := New(cfg)

	// Health check → workspaces (skip auth).
	cmd := m.Init()
	msg := cmd()
	result, nextCmd := m.Update(msg)
	m = result.(Model)

	// Fetch workspaces → auto-select (single workspace).
	if nextCmd != nil {
		msg = nextCmd()
		result, _ = m.Update(msg)
		m = result.(Model)
	}

	if m.Screen() != ScreenSelected {
		t.Fatalf("expected ScreenSelected, got %d", m.Screen())
	}

	// Check the token store has the instance path.
	entry, err := store.Get(srv.URL)
	if err != nil {
		t.Fatalf("token store error: %v", err)
	}
	if entry.InstancePath != "org/repo1" {
		t.Fatalf("expected instance path 'org/repo1', got %q", entry.InstancePath)
	}
}

// --- Selected Screen Tests ---

func TestSelectedScreen_ConfigSnippet(t *testing.T) {
	ws := WorkspaceInfo{
		Owner:        "org",
		Repo:         "repo1",
		InstancePath: "org/repo1",
		ProductName:  "My Product",
	}
	screen := NewSelectedScreen("https://epf.example.com", ws, "testuser", "jwt-token-123", DefaultStyles())
	view := screen.View()

	if !strings.Contains(view, "My Product") {
		t.Fatal("view should contain product name")
	}
	if !strings.Contains(view, "org/repo1") {
		t.Fatal("view should contain instance path")
	}
	if !strings.Contains(view, "https://epf.example.com/mcp") {
		t.Fatal("view should contain MCP URL in config snippet")
	}
	if !strings.Contains(view, "jwt-token-123") {
		t.Fatal("view should contain token in config snippet")
	}
}

func TestSelectedScreen_ViewShowsUsername(t *testing.T) {
	ws := WorkspaceInfo{Owner: "org", Repo: "repo1", InstancePath: "org/repo1"}
	screen := NewSelectedScreen("https://example.com", ws, "alice", "tok", DefaultStyles())
	view := screen.View()

	if !strings.Contains(view, "alice") {
		t.Fatal("view should show username")
	}
}

func TestSelectedScreen_ViewHidesTokenUsername(t *testing.T) {
	ws := WorkspaceInfo{Owner: "org", Repo: "repo1", InstancePath: "org/repo1"}
	screen := NewSelectedScreen("https://example.com", ws, "(token)", "tok", DefaultStyles())
	view := screen.View()

	// Should NOT show "(token)" as a user label.
	if strings.Contains(view, "User:") {
		t.Fatal("view should not show User: line for token-based auth")
	}
}

// --- Auth Screen Tests ---

func TestAuthScreen_MethodSelection(t *testing.T) {
	screen := NewAuthScreen("https://example.com", DefaultStyles())

	// Should start in choose phase.
	view := screen.View()
	if !strings.Contains(view, "Login with GitHub") {
		t.Fatal("view should show Device Flow option")
	}
	if !strings.Contains(view, "Paste a GitHub PAT") {
		t.Fatal("view should show PAT option")
	}
	if !strings.Contains(view, "Paste a server token") {
		t.Fatal("view should show JWT option")
	}
}

func TestAuthScreen_NavigateDown(t *testing.T) {
	screen := NewAuthScreen("https://example.com", DefaultStyles())

	// Navigate down.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	if screen.cursor != 1 {
		t.Fatalf("expected cursor at 1, got %d", screen.cursor)
	}

	// Navigate down again.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	if screen.cursor != 2 {
		t.Fatalf("expected cursor at 2, got %d", screen.cursor)
	}

	// Can't go past end.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	if screen.cursor != 2 {
		t.Fatalf("expected cursor to stay at 2, got %d", screen.cursor)
	}
}

func TestAuthScreen_SelectPAT(t *testing.T) {
	screen := NewAuthScreen("https://example.com", DefaultStyles())

	// Navigate to PAT.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))

	// Press Enter.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))

	if screen.phase != authInput {
		t.Fatalf("expected authInput phase, got %d", screen.phase)
	}

	view := screen.View()
	if !strings.Contains(view, "GitHub PAT") {
		t.Fatal("view should show PAT input prompt")
	}
}

func TestAuthScreen_SelectJWT(t *testing.T) {
	screen := NewAuthScreen("https://example.com", DefaultStyles())

	// Navigate to JWT (index 2).
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))

	// Press Enter.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))

	if screen.phase != authInput {
		t.Fatalf("expected authInput phase, got %d", screen.phase)
	}

	view := screen.View()
	if !strings.Contains(view, "Server JWT") {
		t.Fatal("view should show JWT input prompt")
	}
}

func TestAuthScreen_EscapeFromInput(t *testing.T) {
	screen := NewAuthScreen("https://example.com", DefaultStyles())

	// Go to PAT input.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))

	if screen.phase != authInput {
		t.Fatal("expected authInput")
	}

	// Press Escape.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape}))

	if screen.phase != authChoose {
		t.Fatalf("expected authChoose after Escape, got %d", screen.phase)
	}
}

func TestAuthScreen_EmptyInputError(t *testing.T) {
	screen := NewAuthScreen("https://example.com", DefaultStyles())

	// Go to PAT input.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: 'j'}))
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))

	// Press Enter with empty input.
	screen, _ = screen.Update(tea.KeyPressMsg(tea.Key{Code: tea.KeyEnter}))

	if screen.inputErr == "" {
		t.Fatal("expected error for empty input")
	}
}

// Ensure unused import is not flagged
var _ = os.DevNull
