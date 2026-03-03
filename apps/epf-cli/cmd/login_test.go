package cmd

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExchangeTokenWithServer_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/token" || r.Method != http.MethodPost {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}

		// Verify Content-Type.
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}

		// Parse the request body.
		var req map[string]string
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}

		if req["github_token"] != "gho_test_token" {
			t.Errorf("github_token = %q, want gho_test_token", req["github_token"])
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tokenExchangeResponse{
			Token:    "jwt-session-token",
			Username: "testuser",
			UserID:   42,
		})
	}))
	defer server.Close()

	resp, err := exchangeTokenWithServer(context.Background(), server.URL, "gho_test_token")
	if err != nil {
		t.Fatalf("exchangeTokenWithServer() error = %v", err)
	}

	if resp.Token != "jwt-session-token" {
		t.Errorf("Token = %q, want jwt-session-token", resp.Token)
	}
	if resp.Username != "testuser" {
		t.Errorf("Username = %q, want testuser", resp.Username)
	}
	if resp.UserID != 42 {
		t.Errorf("UserID = %d, want 42", resp.UserID)
	}
}

func TestExchangeTokenWithServer_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid or expired GitHub token",
		})
	}))
	defer server.Close()

	_, err := exchangeTokenWithServer(context.Background(), server.URL, "gho_invalid")
	if err == nil {
		t.Fatal("expected error for unauthorized")
	}
}

func TestExchangeTokenWithServer_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "internal server error",
		})
	}))
	defer server.Close()

	_, err := exchangeTokenWithServer(context.Background(), server.URL, "gho_token")
	if err == nil {
		t.Fatal("expected error for server error")
	}
}

func TestExchangeTokenWithServer_EmptyToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tokenExchangeResponse{
			Token:    "",
			Username: "testuser",
			UserID:   42,
		})
	}))
	defer server.Close()

	_, err := exchangeTokenWithServer(context.Background(), server.URL, "gho_token")
	if err == nil {
		t.Fatal("expected error for empty token")
	}
}

func TestExchangeTokenWithServer_ContextCanceled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate a slow server.
		select {}
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately.

	_, err := exchangeTokenWithServer(ctx, server.URL, "gho_token")
	if err == nil {
		t.Fatal("expected error for canceled context")
	}
}

func TestLoginCmd_MissingServer(t *testing.T) {
	// The login command should fail without --server flag.
	cmd := loginCmd
	cmd.SetArgs([]string{})

	err := cmd.RunE(cmd, []string{})
	if err == nil {
		t.Fatal("expected error for missing --server")
	}
}
