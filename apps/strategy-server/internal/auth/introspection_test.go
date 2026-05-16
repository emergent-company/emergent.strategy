package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHashToken(t *testing.T) {
	h1 := hashToken("token-a")
	h2 := hashToken("token-b")
	h3 := hashToken("token-a")

	if h1 == h2 {
		t.Error("different tokens should produce different hashes")
	}
	if h1 != h3 {
		t.Error("same token should produce same hash")
	}
	if len(h1) != 64 {
		t.Errorf("hash length = %d, want 64 (SHA-256 hex)", len(h1))
	}
}

func TestIntrospect_DebugToken(t *testing.T) {
	intr, err := NewIntrospector(Config{
		Issuer:     "https://auth.example.com",
		ClientID:   "test-client",
		DebugToken: "debug-secret",
		CacheTTL:   time.Minute,
	}, nil)
	if err != nil {
		t.Fatalf("new introspector: %v", err)
	}

	result, err := intr.Introspect(context.Background(), "debug-secret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Active {
		t.Error("debug token should be active")
	}
	if result.Sub != "debug-user" {
		t.Errorf("sub = %q, want debug-user", result.Sub)
	}
}

func TestIntrospect_DebugToken_WrongToken(t *testing.T) {
	// Mock Zitadel server that returns inactive for unknown tokens.
	zitadel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(map[string]any{"active": false})
	}))
	defer zitadel.Close()

	intr, err := NewIntrospector(Config{
		Issuer:     zitadel.URL,
		ClientID:   "test-client",
		DebugToken: "debug-secret",
		CacheTTL:   time.Minute,
	}, nil)
	if err != nil {
		t.Fatalf("new introspector: %v", err)
	}

	result, err := intr.Introspect(context.Background(), "wrong-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Active {
		t.Error("wrong token should not be active")
	}
}

func TestIntrospect_ValidToken(t *testing.T) {
	zitadel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"active": true,
			"sub":    "user-123",
			"email":  "user@example.com",
			"name":   "Test User",
			"exp":    time.Now().Add(time.Hour).Unix(),
		})
	}))
	defer zitadel.Close()

	intr, err := NewIntrospector(Config{
		Issuer:   zitadel.URL,
		ClientID: "test-client",
		CacheTTL: time.Minute,
	}, nil)
	if err != nil {
		t.Fatalf("new introspector: %v", err)
	}

	result, err := intr.Introspect(context.Background(), "valid-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Active {
		t.Error("expected active token")
	}
	if result.Sub != "user-123" {
		t.Errorf("sub = %q, want user-123", result.Sub)
	}
	if result.Email != "user@example.com" {
		t.Errorf("email = %q, want user@example.com", result.Email)
	}
}

func TestIntrospect_CircuitBreaker(t *testing.T) {
	callCount := 0
	zitadel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		callCount++
		w.WriteHeader(500) // Always fail.
	}))
	defer zitadel.Close()

	intr, err := NewIntrospector(Config{
		Issuer:   zitadel.URL,
		ClientID: "test-client",
		CacheTTL: time.Minute,
	}, nil)
	if err != nil {
		t.Fatalf("new introspector: %v", err)
	}
	intr.circuitCooldown = 100 * time.Millisecond

	// First 3 failures should trigger circuit breaker.
	for i := range 3 {
		_, err := intr.Introspect(context.Background(), "token")
		if err == nil {
			t.Fatalf("call %d: expected error", i+1)
		}
	}

	// 4th call should be blocked by circuit breaker without calling Zitadel.
	beforeCount := callCount
	_, err = intr.Introspect(context.Background(), "token")
	if err == nil {
		t.Fatal("expected circuit breaker error")
	}
	if callCount != beforeCount {
		t.Error("circuit breaker should prevent Zitadel calls")
	}

	// Wait for cooldown, then circuit should close.
	time.Sleep(150 * time.Millisecond)
	if intr.isCircuitOpen() {
		t.Error("circuit should be closed after cooldown")
	}
}
