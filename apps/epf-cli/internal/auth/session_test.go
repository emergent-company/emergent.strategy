package auth

import (
	"encoding/hex"
	"strings"
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
