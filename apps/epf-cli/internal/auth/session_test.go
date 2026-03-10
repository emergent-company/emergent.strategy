package auth

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// --- SessionConfigFromEnv tests ---

func TestSessionConfigFromEnv_NoneSet(t *testing.T) {
	t.Setenv(EnvSessionSecret, "")
	t.Setenv(EnvSessionTTL, "")

	cfg, err := SessionConfigFromEnv()
	if err != nil {
		t.Fatalf("SessionConfigFromEnv() error = %v", err)
	}
	if cfg != nil {
		t.Error("expected nil config when no vars set")
	}
}

func TestSessionConfigFromEnv_ValidHex(t *testing.T) {
	// 32 bytes = 64 hex chars.
	secret := strings.Repeat("ab", 32)
	t.Setenv(EnvSessionSecret, secret)
	t.Setenv(EnvSessionTTL, "")

	cfg, err := SessionConfigFromEnv()
	if err != nil {
		t.Fatalf("SessionConfigFromEnv() error = %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if len(cfg.Secret) != 32 {
		t.Errorf("Secret length = %d, want 32", len(cfg.Secret))
	}
	if cfg.TTL != DefaultSessionTTL {
		t.Errorf("TTL = %v, want %v", cfg.TTL, DefaultSessionTTL)
	}
	if cfg.MaxSessions != DefaultMaxSessions {
		t.Errorf("MaxSessions = %d, want %d", cfg.MaxSessions, DefaultMaxSessions)
	}
}

func TestSessionConfigFromEnv_InvalidHex(t *testing.T) {
	t.Setenv(EnvSessionSecret, "not-hex-data-at-all!")
	t.Setenv(EnvSessionTTL, "")

	_, err := SessionConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for invalid hex")
	}
	if !strings.Contains(err.Error(), "hex-encoded") {
		t.Errorf("error should mention hex-encoded: %v", err)
	}
}

func TestSessionConfigFromEnv_TooShort(t *testing.T) {
	// 16 bytes = 32 hex chars, below the 32-byte minimum.
	secret := strings.Repeat("ab", 16)
	t.Setenv(EnvSessionSecret, secret)
	t.Setenv(EnvSessionTTL, "")

	_, err := SessionConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for short secret")
	}
	if !strings.Contains(err.Error(), "at least 32 bytes") {
		t.Errorf("error should mention minimum bytes: %v", err)
	}
}

func TestSessionConfigFromEnv_CustomTTL(t *testing.T) {
	secret := strings.Repeat("ab", 32)
	t.Setenv(EnvSessionSecret, secret)
	t.Setenv(EnvSessionTTL, "12h")

	cfg, err := SessionConfigFromEnv()
	if err != nil {
		t.Fatalf("SessionConfigFromEnv() error = %v", err)
	}
	if cfg.TTL != 12*time.Hour {
		t.Errorf("TTL = %v, want 12h", cfg.TTL)
	}
}

func TestSessionConfigFromEnv_InvalidTTL(t *testing.T) {
	secret := strings.Repeat("ab", 32)
	t.Setenv(EnvSessionSecret, secret)
	t.Setenv(EnvSessionTTL, "not-a-duration")

	_, err := SessionConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for invalid TTL")
	}
	if !strings.Contains(err.Error(), "valid duration") {
		t.Errorf("error should mention valid duration: %v", err)
	}
}

func TestSessionConfigFromEnv_TTLTooShort(t *testing.T) {
	secret := strings.Repeat("ab", 32)
	t.Setenv(EnvSessionSecret, secret)
	t.Setenv(EnvSessionTTL, "30s")

	_, err := SessionConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for TTL < 1 minute")
	}
	if !strings.Contains(err.Error(), "at least 1 minute") {
		t.Errorf("error should mention minimum duration: %v", err)
	}
}

// --- JWT roundtrip tests ---

func testSessionManager(t *testing.T) *SessionManager {
	t.Helper()
	secret, _ := hex.DecodeString(strings.Repeat("ab", 32))
	return NewSessionManager(SessionConfig{
		Secret:      secret,
		TTL:         1 * time.Hour,
		MaxSessions: 100,
	})
}

func TestJWT_Roundtrip(t *testing.T) {
	sm := testSessionManager(t)

	user := &GitHubUser{ID: 42, Login: "octocat"}
	token, err := sm.CreateSession(user, "gho_access_token")
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// Validate the token.
	su, err := sm.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}
	if su.UserID != 42 {
		t.Errorf("UserID = %d, want 42", su.UserID)
	}
	if su.Username != "octocat" {
		t.Errorf("Username = %q, want octocat", su.Username)
	}
	if su.SessionID == "" {
		t.Error("SessionID should be non-empty")
	}
}

func TestJWT_Expired(t *testing.T) {
	sm := testSessionManager(t)

	user := &GitHubUser{ID: 1, Login: "expired-user"}
	token, err := sm.CreateSession(user, "gho_token")
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	// Advance time past the TTL.
	sm.nowFunc = func() time.Time {
		return time.Now().Add(2 * time.Hour)
	}

	_, err = sm.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error for expired JWT")
	}
	if !strings.Contains(err.Error(), "expired") {
		t.Errorf("error should mention expired: %v", err)
	}
}

func TestJWT_WrongSecret(t *testing.T) {
	sm1 := testSessionManager(t)

	user := &GitHubUser{ID: 1, Login: "user1"}
	token, err := sm1.CreateSession(user, "gho_token")
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	// Create a different session manager with a different secret.
	differentSecret, _ := hex.DecodeString(strings.Repeat("cd", 32))
	sm2 := NewSessionManager(SessionConfig{
		Secret:      differentSecret,
		TTL:         1 * time.Hour,
		MaxSessions: 100,
	})

	_, err = sm2.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
	if !strings.Contains(err.Error(), "signature") {
		t.Errorf("error should mention signature: %v", err)
	}
}

func TestJWT_MalformedToken(t *testing.T) {
	sm := testSessionManager(t)

	tests := []struct {
		name  string
		token string
	}{
		{"empty", ""},
		{"no dots", "nodots"},
		{"one dot", "one.dot"},
		{"three dots", "a.b.c.d"},
		{"bad base64 payload", "eyJhbGciOiJIUzI1NiJ9.!!!invalid!!!.sig"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := sm.ValidateToken(tt.token)
			if err == nil {
				t.Errorf("expected error for malformed token %q", tt.token)
			}
		})
	}
}

// --- Session lifecycle tests ---

func TestSession_CreateAndGetAccessToken(t *testing.T) {
	sm := testSessionManager(t)

	user := &GitHubUser{ID: 42, Login: "octocat"}
	token, err := sm.CreateSession(user, "gho_my_access_token")
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	// Validate to get the session ID.
	su, err := sm.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}

	// Get the access token.
	accessToken, ok := sm.GetAccessToken(su.SessionID)
	if !ok {
		t.Fatal("expected GetAccessToken to return true")
	}
	if accessToken != "gho_my_access_token" {
		t.Errorf("AccessToken = %q, want gho_my_access_token", accessToken)
	}
}

func TestSession_GetAccessToken_NotFound(t *testing.T) {
	sm := testSessionManager(t)

	_, ok := sm.GetAccessToken("nonexistent-session-id")
	if ok {
		t.Error("expected GetAccessToken to return false for nonexistent session")
	}
}

func TestSession_RevokeSession(t *testing.T) {
	sm := testSessionManager(t)

	user := &GitHubUser{ID: 1, Login: "user1"}
	token, err := sm.CreateSession(user, "gho_token")
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	su, err := sm.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}

	// Revoke the session.
	sm.RevokeSession(su.SessionID)

	// Access token should be gone.
	_, ok := sm.GetAccessToken(su.SessionID)
	if ok {
		t.Error("expected GetAccessToken to return false after revoke")
	}

	// Validating the JWT should fail because the session was evicted.
	_, err = sm.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error after session revoke")
	}
	if !strings.Contains(err.Error(), "expired or evicted") {
		t.Errorf("error should mention evicted: %v", err)
	}
}

func TestSession_SessionCount(t *testing.T) {
	sm := testSessionManager(t)

	if sm.SessionCount() != 0 {
		t.Errorf("SessionCount() = %d, want 0", sm.SessionCount())
	}

	for i := 0; i < 5; i++ {
		user := &GitHubUser{ID: int64(i), Login: "user"}
		_, err := sm.CreateSession(user, "token")
		if err != nil {
			t.Fatalf("CreateSession() error = %v", err)
		}
	}

	if sm.SessionCount() != 5 {
		t.Errorf("SessionCount() = %d, want 5", sm.SessionCount())
	}
}

// --- LRU eviction tests ---

func TestSession_LRUEviction(t *testing.T) {
	// Create a manager with max 3 sessions.
	secret, _ := hex.DecodeString(strings.Repeat("ab", 32))
	sm := NewSessionManager(SessionConfig{
		Secret:      secret,
		TTL:         1 * time.Hour,
		MaxSessions: 3,
	})

	// Create 4 sessions. The first one should be evicted.
	var tokens []string
	for i := 0; i < 4; i++ {
		user := &GitHubUser{ID: int64(i + 1), Login: "user"}
		token, err := sm.CreateSession(user, "token")
		if err != nil {
			t.Fatalf("CreateSession(%d) error = %v", i, err)
		}
		tokens = append(tokens, token)
	}

	if sm.SessionCount() != 3 {
		t.Errorf("SessionCount() = %d, want 3 (oldest evicted)", sm.SessionCount())
	}

	// The first session should be evicted.
	_, err := sm.ValidateToken(tokens[0])
	if err == nil {
		t.Error("expected error for evicted first session")
	}

	// Sessions 2, 3, 4 should still be valid.
	for i := 1; i < 4; i++ {
		su, err := sm.ValidateToken(tokens[i])
		if err != nil {
			t.Errorf("ValidateToken(session %d) error = %v", i+1, err)
		}
		if su.UserID != int64(i+1) {
			t.Errorf("session %d UserID = %d, want %d", i+1, su.UserID, i+1)
		}
	}
}

func TestSession_LRUTouchPromotes(t *testing.T) {
	// Max 3 sessions. Create 3, then access the first to promote it,
	// then add a 4th. The second session (now oldest) should be evicted.
	secret, _ := hex.DecodeString(strings.Repeat("ab", 32))
	sm := NewSessionManager(SessionConfig{
		Secret:      secret,
		TTL:         1 * time.Hour,
		MaxSessions: 3,
	})

	var tokens []string
	for i := 0; i < 3; i++ {
		user := &GitHubUser{ID: int64(i + 1), Login: "user"}
		token, err := sm.CreateSession(user, "token")
		if err != nil {
			t.Fatalf("CreateSession(%d) error = %v", i, err)
		}
		tokens = append(tokens, token)
	}

	// Touch (validate) the first session to promote it in LRU.
	_, err := sm.ValidateToken(tokens[0])
	if err != nil {
		t.Fatalf("ValidateToken(first) error = %v", err)
	}

	// Add a 4th session — should evict the second (now oldest untouched).
	user4 := &GitHubUser{ID: 4, Login: "user4"}
	token4, err := sm.CreateSession(user4, "token4")
	if err != nil {
		t.Fatalf("CreateSession(4) error = %v", err)
	}

	// Second session should be evicted (it's the oldest untouched).
	_, err = sm.ValidateToken(tokens[1])
	if err == nil {
		t.Error("expected error for evicted second session")
	}

	// First session (touched) should survive.
	su, err := sm.ValidateToken(tokens[0])
	if err != nil {
		t.Errorf("first session should survive LRU touch: %v", err)
	}
	if su.UserID != 1 {
		t.Errorf("first session UserID = %d, want 1", su.UserID)
	}

	// Third and fourth sessions should be valid.
	_, err = sm.ValidateToken(tokens[2])
	if err != nil {
		t.Errorf("third session should be valid: %v", err)
	}
	_, err = sm.ValidateToken(token4)
	if err != nil {
		t.Errorf("fourth session should be valid: %v", err)
	}
}

// --- GenerateStateToken tests ---

func TestGenerateStateToken(t *testing.T) {
	token1, err := GenerateStateToken()
	if err != nil {
		t.Fatalf("GenerateStateToken() error = %v", err)
	}
	if token1 == "" {
		t.Fatal("expected non-empty token")
	}
	// Should be 32 hex chars (16 bytes).
	if len(token1) != 32 {
		t.Errorf("token length = %d, want 32 hex chars", len(token1))
	}
	// Should be valid hex.
	if _, err := hex.DecodeString(token1); err != nil {
		t.Errorf("token is not valid hex: %v", err)
	}

	// Two tokens should be unique.
	token2, err := GenerateStateToken()
	if err != nil {
		t.Fatalf("GenerateStateToken() #2 error = %v", err)
	}
	if token1 == token2 {
		t.Error("two generated tokens should be unique")
	}
}

// --- splitJWT tests ---

func TestSplitJWT(t *testing.T) {
	tests := []struct {
		name   string
		token  string
		expect []string
	}{
		{"valid", "a.b.c", []string{"a", "b", "c"}},
		{"empty parts", "...", nil},     // 3 dots = 4 parts
		{"one dot", "a.b", nil},         // only 2 parts
		{"no dots", "abc", nil},         // 1 part
		{"empty string", "", nil},       // 0 parts
		{"four dots", "a.b.c.d.e", nil}, // 5 parts
		{"three dots", "a.b.c.d", nil},  // 4 parts
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitJWT(tt.token)
			if tt.expect == nil {
				if got != nil {
					t.Errorf("splitJWT(%q) = %v, want nil", tt.token, got)
				}
				return
			}
			if got == nil {
				t.Fatalf("splitJWT(%q) = nil, want %v", tt.token, tt.expect)
			}
			if len(got) != len(tt.expect) {
				t.Fatalf("splitJWT(%q) len = %d, want %d", tt.token, len(got), len(tt.expect))
			}
			for i := range got {
				if got[i] != tt.expect[i] {
					t.Errorf("splitJWT(%q)[%d] = %q, want %q", tt.token, i, got[i], tt.expect[i])
				}
			}
		})
	}
}

// --- NewSessionManager defaults ---

func TestNewSessionManager_Defaults(t *testing.T) {
	secret, _ := hex.DecodeString(strings.Repeat("ab", 32))
	sm := NewSessionManager(SessionConfig{
		Secret: secret,
	})

	if sm.ttl != DefaultSessionTTL {
		t.Errorf("TTL = %v, want %v", sm.ttl, DefaultSessionTTL)
	}
	if sm.maxSessions != DefaultMaxSessions {
		t.Errorf("MaxSessions = %d, want %d", sm.maxSessions, DefaultMaxSessions)
	}
}

// --- Token refresh tests (Section 5) ---

// mockRefreshServer creates a test server that simulates GitHub's token refresh endpoint.
func mockRefreshServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *RefreshConfig) {
	t.Helper()
	server := httptest.NewServer(handler)
	cfg := &RefreshConfig{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		BaseURL:      server.URL,
		HTTPClient:   server.Client(),
	}
	return server, cfg
}

func TestGetUserToken_AutoRefresh_Success(t *testing.T) {
	var refreshCount atomic.Int32

	handler := func(w http.ResponseWriter, r *http.Request) {
		refreshCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token":  fmt.Sprintf("ghu_refreshed_%d", refreshCount.Load()),
			"refresh_token": fmt.Sprintf("ghr_new_%d", refreshCount.Load()),
			"expires_in":    28800, // 8 hours
			"token_type":    "bearer",
			"scope":         "",
		})
	}

	server, refreshCfg := mockRefreshServer(t, handler)
	defer server.Close()

	sm := testSessionManager(t)
	sm.SetRefreshConfig(refreshCfg)

	now := time.Now()
	sm.nowFunc = func() time.Time { return now }

	// Create a GitHub App session with token expiring in 3 minutes (within RefreshMargin).
	user := &GitHubUser{ID: 42, Login: "octocat"}
	jwt, err := sm.CreateSessionWithOptions(user, "ghu_original", SessionOptions{
		AuthMethod:   AuthMethodGitHubApp,
		RefreshToken: "ghr_original",
		TokenExpiry:  now.Add(3 * time.Minute), // Expires in 3 min, within the 5-min margin
	})
	if err != nil {
		t.Fatalf("CreateSessionWithOptions() error = %v", err)
	}

	su, err := sm.ValidateToken(jwt)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}

	// GetUserToken should trigger auto-refresh since token expires within margin.
	token, ok := sm.GetUserToken(su.SessionID)
	if !ok {
		t.Fatal("expected GetUserToken to return true")
	}
	if token != "ghu_refreshed_1" {
		t.Errorf("token = %q, want ghu_refreshed_1", token)
	}
	if refreshCount.Load() != 1 {
		t.Errorf("refresh count = %d, want 1", refreshCount.Load())
	}
}

func TestGetUserToken_NoRefreshNeeded(t *testing.T) {
	var refreshCount atomic.Int32

	handler := func(w http.ResponseWriter, r *http.Request) {
		refreshCount.Add(1)
		t.Fatal("refresh should not be called")
	}

	server, refreshCfg := mockRefreshServer(t, handler)
	defer server.Close()

	sm := testSessionManager(t)
	sm.SetRefreshConfig(refreshCfg)

	now := time.Now()
	sm.nowFunc = func() time.Time { return now }

	// Token expires in 30 minutes — well outside the 5-minute refresh margin.
	user := &GitHubUser{ID: 42, Login: "octocat"}
	jwt, err := sm.CreateSessionWithOptions(user, "ghu_valid", SessionOptions{
		AuthMethod:   AuthMethodGitHubApp,
		RefreshToken: "ghr_valid",
		TokenExpiry:  now.Add(30 * time.Minute),
	})
	if err != nil {
		t.Fatalf("CreateSessionWithOptions() error = %v", err)
	}

	su, _ := sm.ValidateToken(jwt)
	token, ok := sm.GetUserToken(su.SessionID)
	if !ok {
		t.Fatal("expected GetUserToken to return true")
	}
	if token != "ghu_valid" {
		t.Errorf("token = %q, want ghu_valid (no refresh)", token)
	}
	if refreshCount.Load() != 0 {
		t.Errorf("refresh count = %d, want 0", refreshCount.Load())
	}
}

func TestGetUserToken_SkipsRefreshForOAuth(t *testing.T) {
	sm := testSessionManager(t)
	// No RefreshConfig set — legacy OAuth mode.

	now := time.Now()
	sm.nowFunc = func() time.Time { return now }

	// Create an OAuth session (no refresh token, no expiry).
	user := &GitHubUser{ID: 42, Login: "octocat"}
	jwt, err := sm.CreateSession(user, "gho_oauth_token")
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	su, _ := sm.ValidateToken(jwt)
	token, ok := sm.GetUserToken(su.SessionID)
	if !ok {
		t.Fatal("expected GetUserToken to return true")
	}
	if token != "gho_oauth_token" {
		t.Errorf("token = %q, want gho_oauth_token", token)
	}
}

func TestGetUserToken_SkipsRefreshForPAT(t *testing.T) {
	sm := testSessionManager(t)

	now := time.Now()
	sm.nowFunc = func() time.Time { return now }

	user := &GitHubUser{ID: 42, Login: "octocat"}
	jwt, err := sm.CreateSessionWithOptions(user, "ghp_pat_token", SessionOptions{
		AuthMethod: AuthMethodPAT,
	})
	if err != nil {
		t.Fatalf("CreateSessionWithOptions() error = %v", err)
	}

	su, _ := sm.ValidateToken(jwt)
	token, ok := sm.GetUserToken(su.SessionID)
	if !ok {
		t.Fatal("expected GetUserToken to return true")
	}
	if token != "ghp_pat_token" {
		t.Errorf("token = %q, want ghp_pat_token", token)
	}
}

func TestGetUserToken_RefreshFailure_ReturnsCurrent(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		// Simulate expired refresh token.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"error":             "bad_refresh_token",
			"error_description": "The refresh token has expired",
		})
	}

	server, refreshCfg := mockRefreshServer(t, handler)
	defer server.Close()

	sm := testSessionManager(t)
	sm.SetRefreshConfig(refreshCfg)

	now := time.Now()
	sm.nowFunc = func() time.Time { return now }

	user := &GitHubUser{ID: 42, Login: "octocat"}
	jwt, err := sm.CreateSessionWithOptions(user, "ghu_expiring", SessionOptions{
		AuthMethod:   AuthMethodGitHubApp,
		RefreshToken: "ghr_expired",
		TokenExpiry:  now.Add(2 * time.Minute), // Needs refresh
	})
	if err != nil {
		t.Fatalf("CreateSessionWithOptions() error = %v", err)
	}

	su, _ := sm.ValidateToken(jwt)

	// Should return the current (expiring) token since refresh failed.
	token, ok := sm.GetUserToken(su.SessionID)
	if !ok {
		t.Fatal("expected GetUserToken to return true even on refresh failure")
	}
	if token != "ghu_expiring" {
		t.Errorf("token = %q, want ghu_expiring (fallback on refresh failure)", token)
	}
}

func TestGetUserToken_RefreshRotatesToken(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token":  "ghu_new_access",
			"refresh_token": "ghr_new_refresh",
			"expires_in":    28800,
			"token_type":    "bearer",
		})
	}

	server, refreshCfg := mockRefreshServer(t, handler)
	defer server.Close()

	sm := testSessionManager(t)
	sm.SetRefreshConfig(refreshCfg)

	now := time.Now()
	sm.nowFunc = func() time.Time { return now }

	user := &GitHubUser{ID: 42, Login: "octocat"}
	jwt, err := sm.CreateSessionWithOptions(user, "ghu_old", SessionOptions{
		AuthMethod:   AuthMethodGitHubApp,
		RefreshToken: "ghr_old",
		TokenExpiry:  now.Add(1 * time.Minute), // Needs refresh
	})
	if err != nil {
		t.Fatalf("CreateSessionWithOptions() error = %v", err)
	}

	su, _ := sm.ValidateToken(jwt)

	// First call refreshes.
	token, ok := sm.GetUserToken(su.SessionID)
	if !ok {
		t.Fatal("expected true")
	}
	if token != "ghu_new_access" {
		t.Errorf("token = %q, want ghu_new_access", token)
	}

	// Verify the session was updated with new refresh token.
	sm.mu.Lock()
	entry := sm.sessions[su.SessionID]
	if entry.RefreshToken != "ghr_new_refresh" {
		t.Errorf("RefreshToken = %q, want ghr_new_refresh", entry.RefreshToken)
	}
	if entry.TokenExpiry.Before(now.Add(7 * time.Hour)) {
		t.Errorf("TokenExpiry = %v, expected ~8 hours from now", entry.TokenExpiry)
	}
	sm.mu.Unlock()
}

func TestRefreshUserToken_DirectCall(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		// Verify the request body.
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse form: %v", err)
		}
		if r.FormValue("grant_type") != "refresh_token" {
			t.Errorf("grant_type = %q, want refresh_token", r.FormValue("grant_type"))
		}
		if r.FormValue("client_id") != "test-client-id" {
			t.Errorf("client_id = %q, want test-client-id", r.FormValue("client_id"))
		}
		if r.FormValue("refresh_token") != "ghr_test" {
			t.Errorf("refresh_token = %q, want ghr_test", r.FormValue("refresh_token"))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token":             "ghu_refreshed",
			"refresh_token":            "ghr_rotated",
			"expires_in":               28800,
			"refresh_token_expires_in": 15897600,
			"token_type":               "bearer",
			"scope":                    "",
		})
	}

	server, refreshCfg := mockRefreshServer(t, handler)
	defer server.Close()

	sm := testSessionManager(t)
	sm.SetRefreshConfig(refreshCfg)

	newAccess, newRefresh, newExpiry, err := sm.refreshUserToken("ghr_test")
	if err != nil {
		t.Fatalf("refreshUserToken() error = %v", err)
	}
	if newAccess != "ghu_refreshed" {
		t.Errorf("access_token = %q, want ghu_refreshed", newAccess)
	}
	if newRefresh != "ghr_rotated" {
		t.Errorf("refresh_token = %q, want ghr_rotated", newRefresh)
	}
	if newExpiry.IsZero() {
		t.Error("expected non-zero expiry")
	}
}

func TestGetUserToken_NoRefreshConfig_ReturnsCurrentToken(t *testing.T) {
	sm := testSessionManager(t)
	// Deliberately NOT setting RefreshConfig.

	now := time.Now()
	sm.nowFunc = func() time.Time { return now }

	user := &GitHubUser{ID: 42, Login: "octocat"}
	jwt, err := sm.CreateSessionWithOptions(user, "ghu_token", SessionOptions{
		AuthMethod:   AuthMethodGitHubApp,
		RefreshToken: "ghr_token",
		TokenExpiry:  now.Add(2 * time.Minute), // Needs refresh but no config
	})
	if err != nil {
		t.Fatalf("CreateSessionWithOptions() error = %v", err)
	}

	su, _ := sm.ValidateToken(jwt)

	// Should return current token since refresh is not configured.
	token, ok := sm.GetUserToken(su.SessionID)
	if !ok {
		t.Fatal("expected true")
	}
	if token != "ghu_token" {
		t.Errorf("token = %q, want ghu_token", token)
	}
}
