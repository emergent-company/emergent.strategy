package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// echoHandler is a minimal handler that writes 200 OK.
// Tests use it to verify the middleware delegates correctly.
var echoHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	// If a user is in context, write the username so tests can verify.
	if user := UserFromContext(r.Context()); user != nil {
		w.Header().Set("X-User", user.Username)
	}
	w.WriteHeader(http.StatusOK)
})

// validToken creates a session and returns the JWT token for use in tests.
func validToken(t *testing.T, sm *SessionManager) string {
	t.Helper()
	user := &GitHubUser{ID: 42, Login: "testuser"}
	token, err := sm.CreateSession(user, "gh-access-token")
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}
	return token
}

// --- Multi-tenant mode tests ---

func TestMiddleware_MultiTenant_ValidToken(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	token := validToken(t, sm)
	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("X-User"); got != "testuser" {
		t.Errorf("X-User = %q, want %q", got, "testuser")
	}
}

func TestMiddleware_MultiTenant_MissingAuthHeader(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestMiddleware_MultiTenant_MalformedHeader_NoBearer(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestMiddleware_MultiTenant_MalformedHeader_BearerNoToken(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.Header.Set("Authorization", "Bearer ")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestMiddleware_MultiTenant_InvalidToken(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.Header.Set("Authorization", "Bearer invalid.jwt.token")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestMiddleware_MultiTenant_ExpiredToken(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	// Create a valid token, then remove all sessions to simulate expiry.
	token := validToken(t, sm)
	sm.mu.Lock()
	for k := range sm.sessions {
		delete(sm.sessions, k)
	}
	sm.mu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestMiddleware_MultiTenant_CaseInsensitiveBearer(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	token := validToken(t, sm)

	// RFC 6750 allows case-insensitive "Bearer".
	for _, prefix := range []string{"Bearer", "bearer", "BEARER", "bEaReR"} {
		t.Run(prefix, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
			req.Header.Set("Authorization", prefix+" "+token)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Errorf("status = %d, want %d for prefix %q", rec.Code, http.StatusOK, prefix)
			}
		})
	}
}

// --- Single-tenant and local mode tests (passthrough) ---

func TestMiddleware_SingleTenant_Passthrough(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeSingleTenant, "")
	handler := mw.Wrap(echoHandler)

	// No Authorization header — should still pass through.
	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (single-tenant passthrough)", rec.Code, http.StatusOK)
	}
}

func TestMiddleware_Local_Passthrough(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeLocal, "")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (local passthrough)", rec.Code, http.StatusOK)
	}
}

// --- UserFromContext tests ---

func TestUserFromContext_NoUser(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	user := UserFromContext(req.Context())
	if user != nil {
		t.Error("expected nil user when no user set in context")
	}
}

func TestUserFromContext_WithUser(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")

	token := validToken(t, sm)

	var capturedUser *SessionUser
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUser = UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := mw.Wrap(inner)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if capturedUser == nil {
		t.Fatal("expected non-nil user in context")
	}
	if capturedUser.UserID != 42 {
		t.Errorf("UserID = %d, want %d", capturedUser.UserID, 42)
	}
	if capturedUser.Username != "testuser" {
		t.Errorf("Username = %q, want %q", capturedUser.Username, "testuser")
	}
}

// --- parseBearerToken tests ---

func TestParseBearerToken(t *testing.T) {
	tests := []struct {
		name      string
		header    string
		wantToken string
		wantOK    bool
	}{
		{"valid", "Bearer mytoken123", "mytoken123", true},
		{"lowercase", "bearer mytoken123", "mytoken123", true},
		{"uppercase", "BEARER mytoken123", "mytoken123", true},
		{"empty_header", "", "", false},
		{"no_prefix", "mytoken123", "", false},
		{"basic_auth", "Basic dXNlcjpwYXNz", "", false},
		{"bearer_no_token", "Bearer ", "", false},
		{"bearer_only", "Bearer", "", false},
		{"short", "Bear", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, ok := parseBearerToken(tt.header)
			if ok != tt.wantOK {
				t.Errorf("parseBearerToken(%q) ok = %v, want %v", tt.header, ok, tt.wantOK)
			}
			if token != tt.wantToken {
				t.Errorf("parseBearerToken(%q) token = %q, want %q", tt.header, token, tt.wantToken)
			}
		})
	}
}

// --- JSON error body test ---

func TestMiddleware_MultiTenant_ReturnsJSONError(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}

	body := rec.Body.String()
	if body == "" {
		t.Error("expected non-empty JSON error body")
	}
}
