package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// mockOAuthServer creates a mock GitHub OAuth server that handles both
// token exchange and user fetch endpoints.
func mockOAuthServer(t *testing.T, accessToken string, user *GitHubUser) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/login/oauth/access_token" && r.Method == http.MethodPost:
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(OAuthTokenResponse{
				AccessToken: accessToken,
				TokenType:   "bearer",
				Scope:       "read:user,repo",
			})

		case r.URL.Path == "/user" && r.Method == http.MethodGet:
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(user)

		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

// newTestSessionManager creates a SessionManager with a known secret for testing.
// Named differently from testSessionManager in session_test.go to avoid redeclaration.
func newTestSessionManager(t *testing.T) *SessionManager {
	t.Helper()
	secret := make([]byte, 32)
	for i := range secret {
		secret[i] = byte(i)
	}
	return NewSessionManager(SessionConfig{
		Secret:      secret,
		TTL:         1 * time.Hour,
		MaxSessions: 100,
	})
}

// testOAuthConfig creates an OAuthConfig pointing at a mock server.
func testOAuthConfig(server *httptest.Server) *OAuthConfig {
	return &OAuthConfig{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		BaseURL:      server.URL,
		APIBaseURL:   server.URL,
		Scopes:       DefaultOAuthScopes,
		HTTPClient:   server.Client(),
	}
}

// --- HandleLogin tests ---

func TestHandleLogin_RedirectsToGitHub(t *testing.T) {
	// Use a real server URL for the OAuth config (login doesn't call it).
	oauth := &OAuthConfig{
		ClientID: "test-client-id",
		BaseURL:  "https://github.com",
		Scopes:   DefaultOAuthScopes,
	}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	req := httptest.NewRequest(http.MethodGet, "/auth/github/login", nil)
	rec := httptest.NewRecorder()

	handler.HandleLogin(rec, req)

	// Should redirect (302).
	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
	}

	location := rec.Header().Get("Location")
	if location == "" {
		t.Fatal("missing Location header")
	}

	// Location should point to GitHub authorize endpoint.
	if !strings.HasPrefix(location, "https://github.com/login/oauth/authorize?") {
		t.Errorf("Location = %q, want GitHub authorize URL", location)
	}

	// Should contain client_id.
	if !strings.Contains(location, "client_id=test-client-id") {
		t.Errorf("Location should contain client_id, got: %s", location)
	}

	// Should contain a state parameter.
	if !strings.Contains(location, "state=") {
		t.Errorf("Location should contain state param, got: %s", location)
	}

	// State token should be stored.
	if handler.PendingStates() != 1 {
		t.Errorf("PendingStates() = %d, want 1", handler.PendingStates())
	}
}

func TestHandleLogin_StoresState(t *testing.T) {
	oauth := &OAuthConfig{
		ClientID: "test-id",
		BaseURL:  "https://github.com",
		Scopes:   DefaultOAuthScopes,
	}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// Make multiple login requests — each should store a new state.
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/auth/github/login", nil)
		rec := httptest.NewRecorder()
		handler.HandleLogin(rec, req)
	}

	if handler.PendingStates() != 3 {
		t.Errorf("PendingStates() = %d, want 3", handler.PendingStates())
	}
}

// --- HandleCallback tests ---

func TestHandleCallback_FullSuccessFlow(t *testing.T) {
	mockUser := &GitHubUser{
		ID:        42,
		Login:     "octocat",
		Name:      "The Octocat",
		AvatarURL: "https://avatars.githubusercontent.com/u/42",
		Email:     "octocat@github.com",
	}

	server := mockOAuthServer(t, "gho_test_token", mockUser)
	defer server.Close()

	oauth := testOAuthConfig(server)
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// Step 1: Initiate login to get a valid state token.
	loginReq := httptest.NewRequest(http.MethodGet, "/auth/github/login", nil)
	loginRec := httptest.NewRecorder()
	handler.HandleLogin(loginRec, loginReq)

	// Extract state from the redirect URL.
	location := loginRec.Header().Get("Location")
	state := extractQueryParam(t, location, "state")

	// Step 2: Simulate callback with the state and a code.
	callbackReq := httptest.NewRequest(http.MethodGet,
		"/auth/github/callback?code=auth-code-123&state="+state, nil)
	callbackRec := httptest.NewRecorder()
	handler.HandleCallback(callbackRec, callbackReq)

	// Should return 200 with JSON.
	if callbackRec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", callbackRec.Code, http.StatusOK, callbackRec.Body.String())
	}

	ct := callbackRec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var resp CallbackResponse
	if err := json.NewDecoder(callbackRec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Token == "" {
		t.Error("token should not be empty")
	}
	if resp.Username != "octocat" {
		t.Errorf("username = %q, want octocat", resp.Username)
	}
	if resp.UserID != 42 {
		t.Errorf("user_id = %d, want 42", resp.UserID)
	}

	// The JWT should be valid.
	user, err := sm.ValidateToken(resp.Token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}
	if user.UserID != 42 {
		t.Errorf("session user ID = %d, want 42", user.UserID)
	}
	if user.Username != "octocat" {
		t.Errorf("session username = %q, want octocat", user.Username)
	}

	// State should have been consumed.
	if handler.PendingStates() != 0 {
		t.Errorf("PendingStates() = %d, want 0 (state consumed)", handler.PendingStates())
	}

	// Session should have the OAuth access token stored.
	accessToken, ok := sm.GetAccessToken(user.SessionID)
	if !ok {
		t.Fatal("session access token not found")
	}
	if accessToken != "gho_test_token" {
		t.Errorf("access token = %q, want gho_test_token", accessToken)
	}
}

func TestHandleCallback_MissingCode(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	req := httptest.NewRequest(http.MethodGet, "/auth/github/callback?state=abc", nil)
	rec := httptest.NewRecorder()
	handler.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "missing code or state") {
		t.Errorf("body should mention missing params: %s", body)
	}
}

func TestHandleCallback_MissingState(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	req := httptest.NewRequest(http.MethodGet, "/auth/github/callback?code=abc", nil)
	rec := httptest.NewRecorder()
	handler.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleCallback_MissingBothParams(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	req := httptest.NewRequest(http.MethodGet, "/auth/github/callback", nil)
	rec := httptest.NewRecorder()
	handler.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleCallback_InvalidState(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// Call callback with a state that was never issued.
	req := httptest.NewRequest(http.MethodGet,
		"/auth/github/callback?code=abc&state=bogus-state", nil)
	rec := httptest.NewRecorder()
	handler.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "invalid or expired state") {
		t.Errorf("body should mention invalid state: %s", body)
	}
}

func TestHandleCallback_TokenExchangeFailure(t *testing.T) {
	// Mock server that returns 500 on token exchange.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/login/oauth/access_token" {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("internal error"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	oauth := testOAuthConfig(server)
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// First login to get a valid state.
	loginReq := httptest.NewRequest(http.MethodGet, "/auth/github/login", nil)
	loginRec := httptest.NewRecorder()
	handler.HandleLogin(loginRec, loginReq)
	state := extractQueryParam(t, loginRec.Header().Get("Location"), "state")

	// Callback with valid state but exchange will fail.
	callbackReq := httptest.NewRequest(http.MethodGet,
		"/auth/github/callback?code=bad-code&state="+state, nil)
	callbackRec := httptest.NewRecorder()
	handler.HandleCallback(callbackRec, callbackReq)

	if callbackRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", callbackRec.Code, http.StatusBadRequest)
	}

	body := callbackRec.Body.String()
	if !strings.Contains(body, "token exchange failed") {
		t.Errorf("body should mention token exchange failure: %s", body)
	}
}

func TestHandleCallback_UserFetchFailure(t *testing.T) {
	// Mock server: token exchange succeeds, user fetch fails.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/login/oauth/access_token":
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(OAuthTokenResponse{
				AccessToken: "gho_valid_token",
				TokenType:   "bearer",
			})
		case r.URL.Path == "/user":
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message":"Bad credentials"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	oauth := testOAuthConfig(server)
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// Login to get state.
	loginReq := httptest.NewRequest(http.MethodGet, "/auth/github/login", nil)
	loginRec := httptest.NewRecorder()
	handler.HandleLogin(loginRec, loginReq)
	state := extractQueryParam(t, loginRec.Header().Get("Location"), "state")

	// Callback.
	callbackReq := httptest.NewRequest(http.MethodGet,
		"/auth/github/callback?code=valid-code&state="+state, nil)
	callbackRec := httptest.NewRecorder()
	handler.HandleCallback(callbackRec, callbackReq)

	if callbackRec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", callbackRec.Code, http.StatusInternalServerError)
	}

	body := callbackRec.Body.String()
	if !strings.Contains(body, "failed to fetch user profile") {
		t.Errorf("body should mention user fetch failure: %s", body)
	}
}

// --- consumeState tests ---

func TestConsumeState_OneTimeUse(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// Manually add a state token.
	handler.mu.Lock()
	handler.states["test-state"] = time.Now().Add(10 * time.Minute)
	handler.mu.Unlock()

	// First consume should succeed.
	if !handler.consumeState("test-state") {
		t.Error("first consumeState should return true")
	}

	// Second consume should fail (already consumed).
	if handler.consumeState("test-state") {
		t.Error("second consumeState should return false (already consumed)")
	}
}

func TestConsumeState_NonexistentState(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	if handler.consumeState("never-issued") {
		t.Error("consumeState should return false for non-existent state")
	}
}

func TestConsumeState_ExpiredState(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// Add an already-expired state token.
	handler.mu.Lock()
	handler.states["expired-state"] = time.Now().Add(-1 * time.Minute)
	handler.mu.Unlock()

	if handler.consumeState("expired-state") {
		t.Error("consumeState should return false for expired state")
	}

	// Expired state should be removed from the map.
	handler.mu.Lock()
	_, exists := handler.states["expired-state"]
	handler.mu.Unlock()
	if exists {
		t.Error("expired state should be removed after consume attempt")
	}
}

// --- cleanExpiredStates tests ---

func TestCleanExpiredStates(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	// Add a mix of valid and expired states.
	handler.mu.Lock()
	handler.states["valid-1"] = time.Now().Add(10 * time.Minute)
	handler.states["valid-2"] = time.Now().Add(5 * time.Minute)
	handler.states["expired-1"] = time.Now().Add(-1 * time.Minute)
	handler.states["expired-2"] = time.Now().Add(-5 * time.Minute)
	handler.states["expired-3"] = time.Now().Add(-10 * time.Minute)
	handler.cleanExpiredStates()
	remaining := len(handler.states)
	handler.mu.Unlock()

	if remaining != 2 {
		t.Errorf("after cleanup: %d states remaining, want 2", remaining)
	}

	// Valid ones should still be there.
	handler.mu.Lock()
	_, hasValid1 := handler.states["valid-1"]
	_, hasValid2 := handler.states["valid-2"]
	handler.mu.Unlock()

	if !hasValid1 || !hasValid2 {
		t.Error("valid states should survive cleanup")
	}
}

// --- PendingStates tests ---

func TestPendingStates_Accuracy(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	if handler.PendingStates() != 0 {
		t.Errorf("initial PendingStates() = %d, want 0", handler.PendingStates())
	}

	handler.mu.Lock()
	handler.states["s1"] = time.Now().Add(10 * time.Minute)
	handler.states["s2"] = time.Now().Add(10 * time.Minute)
	handler.mu.Unlock()

	if handler.PendingStates() != 2 {
		t.Errorf("PendingStates() = %d, want 2", handler.PendingStates())
	}

	// Consume one.
	handler.consumeState("s1")

	if handler.PendingStates() != 1 {
		t.Errorf("PendingStates() after consume = %d, want 1", handler.PendingStates())
	}
}

// --- RegisterRoutes test ---

func TestRegisterRoutes(t *testing.T) {
	oauth := &OAuthConfig{
		ClientID: "test-id",
		BaseURL:  "https://github.com",
		Scopes:   DefaultOAuthScopes,
	}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Test that both routes are registered by making requests.
	// Login should redirect.
	loginReq := httptest.NewRequest(http.MethodGet, "/auth/github/login", nil)
	loginRec := httptest.NewRecorder()
	mux.ServeHTTP(loginRec, loginReq)

	if loginRec.Code != http.StatusFound {
		t.Errorf("GET /auth/github/login: status = %d, want %d", loginRec.Code, http.StatusFound)
	}

	// Callback without params should return 400.
	callbackReq := httptest.NewRequest(http.MethodGet, "/auth/github/callback", nil)
	callbackRec := httptest.NewRecorder()
	mux.ServeHTTP(callbackRec, callbackReq)

	if callbackRec.Code != http.StatusBadRequest {
		t.Errorf("GET /auth/github/callback: status = %d, want %d", callbackRec.Code, http.StatusBadRequest)
	}
}

// --- writeJSONError test ---

func TestWriteJSONError(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSONError(rec, http.StatusBadRequest, "test error message")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["error"] != "test error message" {
		t.Errorf("error = %q, want 'test error message'", body["error"])
	}
}

// --- HandleTokenExchange tests ---

func TestHandleTokenExchange_ValidToken(t *testing.T) {
	mockUser := &GitHubUser{
		ID:        99,
		Login:     "testuser",
		Name:      "Test User",
		AvatarURL: "https://avatars.githubusercontent.com/u/99",
		Email:     "test@example.com",
	}

	server := mockOAuthServer(t, "", mockUser)
	defer server.Close()

	oauth := testOAuthConfig(server)
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	body := `{"github_token": "gho_valid_token"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var resp TokenExchangeResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Token == "" {
		t.Error("token should not be empty")
	}
	if resp.Username != "testuser" {
		t.Errorf("username = %q, want testuser", resp.Username)
	}
	if resp.UserID != 99 {
		t.Errorf("user_id = %d, want 99", resp.UserID)
	}

	// The JWT should be valid and contain the correct user info.
	user, err := sm.ValidateToken(resp.Token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}
	if user.UserID != 99 {
		t.Errorf("session user ID = %d, want 99", user.UserID)
	}
	if user.Username != "testuser" {
		t.Errorf("session username = %q, want testuser", user.Username)
	}

	// Session should have the GitHub access token stored.
	accessToken, ok := sm.GetAccessToken(user.SessionID)
	if !ok {
		t.Fatal("session access token not found")
	}
	if accessToken != "gho_valid_token" {
		t.Errorf("access token = %q, want gho_valid_token", accessToken)
	}
}

func TestHandleTokenExchange_InvalidToken(t *testing.T) {
	// Mock server that returns 401 on /user (invalid token).
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/user" && r.Method == http.MethodGet {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message":"Bad credentials"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	oauth := testOAuthConfig(server)
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	body := `{"github_token": "gho_invalid_token"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}

	var errResp map[string]string
	json.NewDecoder(rec.Body).Decode(&errResp)
	if errResp["error"] != "invalid or expired GitHub token" {
		t.Errorf("error = %q, want 'invalid or expired GitHub token'", errResp["error"])
	}
}

func TestHandleTokenExchange_MissingToken(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com", APIBaseURL: "https://api.github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	body := `{"github_token": ""}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var errResp map[string]string
	json.NewDecoder(rec.Body).Decode(&errResp)
	if errResp["error"] != "github_token is required" {
		t.Errorf("error = %q, want 'github_token is required'", errResp["error"])
	}
}

func TestHandleTokenExchange_EmptyBody(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com", APIBaseURL: "https://api.github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	body := `{}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleTokenExchange_InvalidJSON(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com", APIBaseURL: "https://api.github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	body := `not json at all`
	req := httptest.NewRequest(http.MethodPost, "/auth/token",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var errResp map[string]string
	json.NewDecoder(rec.Body).Decode(&errResp)
	if errResp["error"] != "invalid JSON body" {
		t.Errorf("error = %q, want 'invalid JSON body'", errResp["error"])
	}
}

func TestHandleTokenExchange_WrongContentType(t *testing.T) {
	oauth := &OAuthConfig{ClientID: "id", BaseURL: "https://github.com", APIBaseURL: "https://api.github.com"}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	body := `github_token=gho_xxx`
	req := httptest.NewRequest(http.MethodPost, "/auth/token",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()

	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var errResp map[string]string
	json.NewDecoder(rec.Body).Decode(&errResp)
	if errResp["error"] != "Content-Type must be application/json" {
		t.Errorf("error = %q, want 'Content-Type must be application/json'", errResp["error"])
	}
}

func TestHandleTokenExchange_NoContentType(t *testing.T) {
	// When Content-Type is not set, the handler should still accept valid JSON.
	mockUser := &GitHubUser{
		ID:    55,
		Login: "noct-user",
		Name:  "No CT User",
	}

	server := mockOAuthServer(t, "", mockUser)
	defer server.Close()

	oauth := testOAuthConfig(server)
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	body := `{"github_token": "gho_valid"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token",
		strings.NewReader(body))
	// No Content-Type header.
	rec := httptest.NewRecorder()

	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestRegisterRoutes_IncludesTokenExchange(t *testing.T) {
	oauth := &OAuthConfig{
		ClientID:   "test-id",
		BaseURL:    "https://github.com",
		APIBaseURL: "https://api.github.com",
		Scopes:     DefaultOAuthScopes,
	}
	sm := newTestSessionManager(t)
	handler := NewAuthHandler(oauth, sm)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// POST /auth/token without body should return 400 (invalid JSON).
	req := httptest.NewRequest(http.MethodPost, "/auth/token", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Any 4xx response means the route is registered and the handler ran.
	if rec.Code != http.StatusBadRequest {
		t.Errorf("POST /auth/token: status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

// --- GitHub App auth method detection tests ---

func TestHandleCallback_GitHubAppToken(t *testing.T) {
	// Mock GitHub that returns a ghu_ token with refresh token (GitHub App behavior).
	mockGH := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/login/oauth/access_token":
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"access_token":             "ghu_app_token_abc",
				"token_type":               "bearer",
				"scope":                    "",
				"refresh_token":            "ghr_refresh_abc",
				"expires_in":               28800,
				"refresh_token_expires_in": 15897600,
			})
		case r.URL.Path == "/user":
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(GitHubUser{ID: 99, Login: "appuser"})
		}
	}))
	defer mockGH.Close()

	sm := newTestSessionManager(t)
	oauthCfg := &OAuthConfig{
		ClientID:     "test-app-client-id",
		ClientSecret: "test-secret",
		BaseURL:      mockGH.URL,
		APIBaseURL:   mockGH.URL,
		HTTPClient:   mockGH.Client(),
	}
	oauthCfg.setDefaults()

	handler := NewAuthHandler(oauthCfg, sm)

	// Inject a valid state token.
	handler.mu.Lock()
	handler.states["test-state"] = time.Now().Add(10 * time.Minute)
	handler.mu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/auth/github/callback?code=test-code&state=test-state", nil)
	rec := httptest.NewRecorder()
	handler.HandleCallback(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	var resp CallbackResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	// Validate the session was created with GitHub App auth method.
	su, err := sm.ValidateToken(resp.Token)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}

	authMethod, ok := sm.GetAuthMethod(su.SessionID)
	if !ok {
		t.Fatal("expected GetAuthMethod to return true")
	}
	if authMethod != AuthMethodGitHubApp {
		t.Errorf("auth method = %q, want %q", authMethod, AuthMethodGitHubApp)
	}
}

func TestHandleTokenExchange_DetectsPAT(t *testing.T) {
	// Mock GitHub user endpoint.
	mockGH := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GitHubUser{ID: 77, Login: "patuser"})
	}))
	defer mockGH.Close()

	sm := newTestSessionManager(t)
	oauthCfg := &OAuthConfig{
		ClientID:     "test",
		ClientSecret: "test",
		BaseURL:      mockGH.URL,
		APIBaseURL:   mockGH.URL,
		HTTPClient:   mockGH.Client(),
	}
	oauthCfg.setDefaults()

	handler := NewAuthHandler(oauthCfg, sm)

	body := `{"github_token": "ghp_personalAccessToken123"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	var resp TokenExchangeResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	su, _ := sm.ValidateToken(resp.Token)
	authMethod, _ := sm.GetAuthMethod(su.SessionID)
	if authMethod != AuthMethodPAT {
		t.Errorf("auth method = %q, want %q", authMethod, AuthMethodPAT)
	}
}

func TestHandleTokenExchange_DetectsGitHubAppToken(t *testing.T) {
	mockGH := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GitHubUser{ID: 88, Login: "ghuuser"})
	}))
	defer mockGH.Close()

	sm := newTestSessionManager(t)
	oauthCfg := &OAuthConfig{
		ClientID:     "test",
		ClientSecret: "test",
		BaseURL:      mockGH.URL,
		APIBaseURL:   mockGH.URL,
		HTTPClient:   mockGH.Client(),
	}
	oauthCfg.setDefaults()

	handler := NewAuthHandler(oauthCfg, sm)

	body := `{"github_token": "ghu_userAccessToken456"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp TokenExchangeResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	su, _ := sm.ValidateToken(resp.Token)
	authMethod, _ := sm.GetAuthMethod(su.SessionID)
	if authMethod != AuthMethodGitHubApp {
		t.Errorf("auth method = %q, want %q", authMethod, AuthMethodGitHubApp)
	}
}

func TestHandleTokenExchange_DetectsOAuthToken(t *testing.T) {
	mockGH := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GitHubUser{ID: 55, Login: "oauthuser"})
	}))
	defer mockGH.Close()

	sm := newTestSessionManager(t)
	oauthCfg := &OAuthConfig{
		ClientID:     "test",
		ClientSecret: "test",
		BaseURL:      mockGH.URL,
		APIBaseURL:   mockGH.URL,
		HTTPClient:   mockGH.Client(),
	}
	oauthCfg.setDefaults()

	handler := NewAuthHandler(oauthCfg, sm)

	body := `{"github_token": "gho_oauthToken789"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.HandleTokenExchange(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp TokenExchangeResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	su, _ := sm.ValidateToken(resp.Token)
	authMethod, _ := sm.GetAuthMethod(su.SessionID)
	if authMethod != AuthMethodOAuth {
		t.Errorf("auth method = %q, want %q", authMethod, AuthMethodOAuth)
	}
}

// --- helper ---

// extractQueryParam extracts a query parameter from a URL string.
func extractQueryParam(t *testing.T, rawURL, param string) string {
	t.Helper()
	// Find the param in the URL.
	idx := strings.Index(rawURL, param+"=")
	if idx == -1 {
		t.Fatalf("query parameter %q not found in URL: %s", param, rawURL)
	}
	value := rawURL[idx+len(param)+1:]
	// Trim at next & or end.
	if ampIdx := strings.Index(value, "&"); ampIdx != -1 {
		value = value[:ampIdx]
	}
	return value
}
