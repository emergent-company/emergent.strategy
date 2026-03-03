package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- OAuthConfigFromEnv tests ---

func TestOAuthConfigFromEnv_NoneSet(t *testing.T) {
	t.Setenv(EnvOAuthClientID, "")
	t.Setenv(EnvOAuthClientSecret, "")

	cfg, err := OAuthConfigFromEnv()
	if err != nil {
		t.Fatalf("OAuthConfigFromEnv() error = %v", err)
	}
	if cfg != nil {
		t.Error("expected nil config when no vars set")
	}
}

func TestOAuthConfigFromEnv_BothSet(t *testing.T) {
	t.Setenv(EnvOAuthClientID, "test-client-id")
	t.Setenv(EnvOAuthClientSecret, "test-client-secret")

	cfg, err := OAuthConfigFromEnv()
	if err != nil {
		t.Fatalf("OAuthConfigFromEnv() error = %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if cfg.ClientID != "test-client-id" {
		t.Errorf("ClientID = %q, want test-client-id", cfg.ClientID)
	}
	if cfg.ClientSecret != "test-client-secret" {
		t.Errorf("ClientSecret = %q, want test-client-secret", cfg.ClientSecret)
	}
	if cfg.BaseURL != "https://github.com" {
		t.Errorf("BaseURL = %q, want default", cfg.BaseURL)
	}
	if cfg.APIBaseURL != "https://api.github.com" {
		t.Errorf("APIBaseURL = %q, want default", cfg.APIBaseURL)
	}
	if len(cfg.Scopes) != 2 {
		t.Errorf("Scopes = %v, want 2 default scopes", cfg.Scopes)
	}
	if cfg.HTTPClient == nil {
		t.Error("HTTPClient should default to non-nil")
	}
}

func TestOAuthConfigFromEnv_MissingClientID(t *testing.T) {
	t.Setenv(EnvOAuthClientID, "")
	t.Setenv(EnvOAuthClientSecret, "some-secret")

	_, err := OAuthConfigFromEnv()
	if err == nil {
		t.Fatal("expected error when client_id missing but secret set")
	}
	if !strings.Contains(err.Error(), EnvOAuthClientID) {
		t.Errorf("error should mention %s: %v", EnvOAuthClientID, err)
	}
}

func TestOAuthConfigFromEnv_MissingClientSecret(t *testing.T) {
	t.Setenv(EnvOAuthClientID, "some-id")
	t.Setenv(EnvOAuthClientSecret, "")

	_, err := OAuthConfigFromEnv()
	if err == nil {
		t.Fatal("expected error when secret missing but client_id set")
	}
	if !strings.Contains(err.Error(), EnvOAuthClientSecret) {
		t.Errorf("error should mention %s: %v", EnvOAuthClientSecret, err)
	}
}

// --- AuthorizeURL tests ---

func TestAuthorizeURL(t *testing.T) {
	cfg := &OAuthConfig{
		ClientID: "test-id",
		BaseURL:  "https://github.com",
		Scopes:   []string{"read:user", "repo"},
	}

	url := cfg.AuthorizeURL("abc123")

	if !strings.HasPrefix(url, "https://github.com/login/oauth/authorize?") {
		t.Errorf("URL should start with GitHub authorize endpoint, got: %s", url)
	}
	if !strings.Contains(url, "client_id=test-id") {
		t.Errorf("URL should contain client_id, got: %s", url)
	}
	if !strings.Contains(url, "state=abc123") {
		t.Errorf("URL should contain state, got: %s", url)
	}
	if !strings.Contains(url, "scope=read") {
		t.Errorf("URL should contain scope, got: %s", url)
	}
	if !strings.Contains(url, "allow_signup=false") {
		t.Errorf("URL should contain allow_signup=false, got: %s", url)
	}
}

func TestAuthorizeURL_CustomBaseURL(t *testing.T) {
	cfg := &OAuthConfig{
		ClientID: "test-id",
		BaseURL:  "https://github.example.com",
		Scopes:   []string{"read:user"},
	}

	url := cfg.AuthorizeURL("state123")

	if !strings.HasPrefix(url, "https://github.example.com/login/oauth/authorize?") {
		t.Errorf("URL should use custom base URL, got: %s", url)
	}
}

// --- ExchangeCode tests ---

func TestExchangeCode_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/login/oauth/access_token" {
			t.Errorf("path = %s, want /login/oauth/access_token", r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/x-www-form-urlencoded" {
			t.Errorf("Content-Type = %q, want application/x-www-form-urlencoded", ct)
		}
		if accept := r.Header.Get("Accept"); accept != "application/json" {
			t.Errorf("Accept = %q, want application/json", accept)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(OAuthTokenResponse{
			AccessToken: "gho_test_token_123",
			TokenType:   "bearer",
			Scope:       "read:user,repo",
		})
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		ClientID:     "test-id",
		ClientSecret: "test-secret",
		BaseURL:      server.URL,
		HTTPClient:   server.Client(),
	}

	resp, err := cfg.ExchangeCode("auth-code-123")
	if err != nil {
		t.Fatalf("ExchangeCode() error = %v", err)
	}
	if resp.AccessToken != "gho_test_token_123" {
		t.Errorf("AccessToken = %q, want gho_test_token_123", resp.AccessToken)
	}
	if resp.TokenType != "bearer" {
		t.Errorf("TokenType = %q, want bearer", resp.TokenType)
	}
}

func TestExchangeCode_NonOKStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("server error"))
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		ClientID:     "test-id",
		ClientSecret: "test-secret",
		BaseURL:      server.URL,
		HTTPClient:   server.Client(),
	}

	_, err := cfg.ExchangeCode("bad-code")
	if err == nil {
		t.Fatal("expected error for non-200 status")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("error should mention status code: %v", err)
	}
}

func TestExchangeCode_EmptyAccessToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"error":             "bad_verification_code",
			"error_description": "The code passed is incorrect or expired.",
		})
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		ClientID:     "test-id",
		ClientSecret: "test-secret",
		BaseURL:      server.URL,
		HTTPClient:   server.Client(),
	}

	_, err := cfg.ExchangeCode("expired-code")
	if err == nil {
		t.Fatal("expected error for empty access token")
	}
	if !strings.Contains(err.Error(), "bad_verification_code") {
		t.Errorf("error should contain GitHub error: %v", err)
	}
}

func TestExchangeCode_BadJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		ClientID:     "test-id",
		ClientSecret: "test-secret",
		BaseURL:      server.URL,
		HTTPClient:   server.Client(),
	}

	_, err := cfg.ExchangeCode("code")
	if err == nil {
		t.Fatal("expected error for bad JSON")
	}
}

// --- FetchUser tests ---

func TestFetchUser_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %s, want GET", r.Method)
		}
		if r.URL.Path != "/user" {
			t.Errorf("path = %s, want /user", r.URL.Path)
		}
		authHeader := r.Header.Get("Authorization")
		if authHeader != "Bearer test-token" {
			t.Errorf("Authorization = %q, want 'Bearer test-token'", authHeader)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GitHubUser{
			ID:        42,
			Login:     "octocat",
			Name:      "The Octocat",
			AvatarURL: "https://avatars.githubusercontent.com/u/42",
			Email:     "octocat@github.com",
		})
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		APIBaseURL: server.URL,
		HTTPClient: server.Client(),
	}

	user, err := cfg.FetchUser("test-token")
	if err != nil {
		t.Fatalf("FetchUser() error = %v", err)
	}
	if user.ID != 42 {
		t.Errorf("ID = %d, want 42", user.ID)
	}
	if user.Login != "octocat" {
		t.Errorf("Login = %q, want octocat", user.Login)
	}
	if user.Name != "The Octocat" {
		t.Errorf("Name = %q, want The Octocat", user.Name)
	}
}

func TestFetchUser_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		APIBaseURL: server.URL,
		HTTPClient: server.Client(),
	}

	_, err := cfg.FetchUser("bad-token")
	if err == nil {
		t.Fatal("expected error for 401")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Errorf("error should mention 401: %v", err)
	}
}

func TestFetchUser_InvalidResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		// Return user with missing required fields.
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":    0,
			"login": "",
		})
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		APIBaseURL: server.URL,
		HTTPClient: server.Client(),
	}

	_, err := cfg.FetchUser("token")
	if err == nil {
		t.Fatal("expected error for invalid user (missing id/login)")
	}
	if !strings.Contains(err.Error(), "invalid user") {
		t.Errorf("error should mention invalid user: %v", err)
	}
}

func TestFetchUser_BadJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	cfg := &OAuthConfig{
		APIBaseURL: server.URL,
		HTTPClient: server.Client(),
	}

	_, err := cfg.FetchUser("token")
	if err == nil {
		t.Fatal("expected error for bad JSON")
	}
}
