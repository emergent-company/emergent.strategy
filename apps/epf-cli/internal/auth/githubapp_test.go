package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// testKey generates a fresh RSA key pair for testing.
func testKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	return key
}

// encodePKCS1PEM encodes an RSA key as PKCS#1 PEM ("RSA PRIVATE KEY").
func encodePKCS1PEM(key *rsa.PrivateKey) []byte {
	return pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
}

// encodePKCS8PEM encodes an RSA key as PKCS#8 PEM ("PRIVATE KEY").
func encodePKCS8PEM(t *testing.T, key *rsa.PrivateKey) []byte {
	t.Helper()
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal PKCS#8: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: der,
	})
}

// --- ParsePrivateKey tests ---

func TestParsePrivateKey_PKCS1(t *testing.T) {
	key := testKey(t)
	pemData := encodePKCS1PEM(key)

	parsed, err := ParsePrivateKey(pemData)
	if err != nil {
		t.Fatalf("ParsePrivateKey(PKCS1) = error %v", err)
	}
	if parsed.N.Cmp(key.N) != 0 {
		t.Error("parsed key does not match original")
	}
}

func TestParsePrivateKey_PKCS8(t *testing.T) {
	key := testKey(t)
	pemData := encodePKCS8PEM(t, key)

	parsed, err := ParsePrivateKey(pemData)
	if err != nil {
		t.Fatalf("ParsePrivateKey(PKCS8) = error %v", err)
	}
	if parsed.N.Cmp(key.N) != 0 {
		t.Error("parsed key does not match original")
	}
}

func TestParsePrivateKey_NoPEM(t *testing.T) {
	_, err := ParsePrivateKey([]byte("not PEM data"))
	if err == nil {
		t.Fatal("expected error for non-PEM data")
	}
	if !strings.Contains(err.Error(), "no PEM block") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestParsePrivateKeyFile(t *testing.T) {
	key := testKey(t)
	pemData := encodePKCS1PEM(key)

	tmpFile := t.TempDir() + "/test.pem"
	if err := os.WriteFile(tmpFile, pemData, 0600); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	parsed, err := ParsePrivateKeyFile(tmpFile)
	if err != nil {
		t.Fatalf("ParsePrivateKeyFile = error %v", err)
	}
	if parsed.N.Cmp(key.N) != 0 {
		t.Error("parsed key does not match original")
	}
}

func TestParsePrivateKeyFile_NotFound(t *testing.T) {
	_, err := ParsePrivateKeyFile("/nonexistent/path.pem")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

// --- signJWT tests ---

func TestSignJWT_Structure(t *testing.T) {
	key := testKey(t)
	now := time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC)

	jwt, err := signJWT(key, 12345, now)
	if err != nil {
		t.Fatalf("signJWT = error %v", err)
	}

	parts := strings.Split(jwt, ".")
	if len(parts) != 3 {
		t.Fatalf("JWT should have 3 parts, got %d", len(parts))
	}

	// Decode and verify header.
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatalf("decode header: %v", err)
	}
	var header map[string]string
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		t.Fatalf("parse header: %v", err)
	}
	if header["alg"] != "RS256" {
		t.Errorf("header.alg = %q, want RS256", header["alg"])
	}
	if header["typ"] != "JWT" {
		t.Errorf("header.typ = %q, want JWT", header["typ"])
	}

	// Decode and verify payload.
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		t.Fatalf("parse payload: %v", err)
	}

	// iss should be the App ID (as a number).
	if iss, ok := payload["iss"].(float64); !ok || int64(iss) != 12345 {
		t.Errorf("payload.iss = %v, want 12345", payload["iss"])
	}

	// iat should be now - 60s.
	expectedIAT := now.Add(-60 * time.Second).Unix()
	if iat, ok := payload["iat"].(float64); !ok || int64(iat) != expectedIAT {
		t.Errorf("payload.iat = %v, want %d", payload["iat"], expectedIAT)
	}

	// exp should be now + 10m.
	expectedEXP := now.Add(10 * time.Minute).Unix()
	if exp, ok := payload["exp"].(float64); !ok || int64(exp) != expectedEXP {
		t.Errorf("payload.exp = %v, want %d", payload["exp"], expectedEXP)
	}

	// Signature part should be non-empty.
	if parts[2] == "" {
		t.Error("signature part is empty")
	}
}

// --- NewTokenProvider tests ---

func TestNewTokenProvider_Defaults(t *testing.T) {
	key := testKey(t)
	tp, err := NewTokenProvider(GitHubAppConfig{
		AppID:          1,
		InstallationID: 2,
		PrivateKey:     key,
	})
	if err != nil {
		t.Fatalf("NewTokenProvider = error %v", err)
	}
	if tp.cfg.BaseURL != "https://api.github.com" {
		t.Errorf("BaseURL = %q, want default", tp.cfg.BaseURL)
	}
	if tp.cfg.HTTPClient == nil {
		t.Error("HTTPClient should default to non-nil")
	}
	if tp.cfg.RefreshMargin != 5*time.Minute {
		t.Errorf("RefreshMargin = %v, want 5m", tp.cfg.RefreshMargin)
	}
}

func TestNewTokenProvider_MissingAppID(t *testing.T) {
	_, err := NewTokenProvider(GitHubAppConfig{
		InstallationID: 2,
		PrivateKey:     testKey(t),
	})
	if err == nil || !strings.Contains(err.Error(), "AppID") {
		t.Errorf("expected AppID error, got: %v", err)
	}
}

func TestNewTokenProvider_MissingInstallationID(t *testing.T) {
	_, err := NewTokenProvider(GitHubAppConfig{
		AppID:      1,
		PrivateKey: testKey(t),
	})
	if err == nil || !strings.Contains(err.Error(), "InstallationID") {
		t.Errorf("expected InstallationID error, got: %v", err)
	}
}

func TestNewTokenProvider_MissingPrivateKey(t *testing.T) {
	_, err := NewTokenProvider(GitHubAppConfig{
		AppID:          1,
		InstallationID: 2,
	})
	if err == nil || !strings.Contains(err.Error(), "PrivateKey") {
		t.Errorf("expected PrivateKey error, got: %v", err)
	}
}

// --- Token exchange with mock GitHub API ---

func mockGitHubAPI(t *testing.T, wantJWT bool, token string, expiresAt time.Time) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request method and path.
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if !strings.Contains(r.URL.Path, "/app/installations/") || !strings.HasSuffix(r.URL.Path, "/access_tokens") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		// Verify authorization header contains a JWT.
		authHeader := r.Header.Get("Authorization")
		if wantJWT {
			if !strings.HasPrefix(authHeader, "Bearer ") {
				t.Errorf("Authorization = %q, want Bearer prefix", authHeader)
			}
			jwt := strings.TrimPrefix(authHeader, "Bearer ")
			parts := strings.Split(jwt, ".")
			if len(parts) != 3 {
				t.Errorf("JWT should have 3 parts, got %d", len(parts))
			}
		}

		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      token,
			"expires_at": expiresAt.Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
}

func TestTokenProvider_Token_FetchesAndCaches(t *testing.T) {
	key := testKey(t)
	expiresAt := time.Now().Add(1 * time.Hour)

	server := mockGitHubAPI(t, true, "ghs_testtoken123", expiresAt)
	defer server.Close()

	tp, err := NewTokenProvider(GitHubAppConfig{
		AppID:          42,
		InstallationID: 100,
		PrivateKey:     key,
		BaseURL:        server.URL,
		HTTPClient:     server.Client(),
	})
	if err != nil {
		t.Fatalf("NewTokenProvider: %v", err)
	}

	// First call should fetch a token.
	tok, err := tp.Token()
	if err != nil {
		t.Fatalf("Token() = error %v", err)
	}
	if tok != "ghs_testtoken123" {
		t.Errorf("Token() = %q, want ghs_testtoken123", tok)
	}

	// Second call should return cached token (no additional request).
	tok2, err := tp.Token()
	if err != nil {
		t.Fatalf("Token() second call = error %v", err)
	}
	if tok2 != tok {
		t.Errorf("second Token() = %q, want cached %q", tok2, tok)
	}
}

func TestTokenProvider_Token_AutoRefreshesOnExpiry(t *testing.T) {
	key := testKey(t)
	callCount := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		// Each call returns a different token so we can tell them apart.
		resp := map[string]interface{}{
			"token":      fmt.Sprintf("ghs_token_%d", callCount),
			"expires_at": time.Now().Add(1 * time.Hour).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	tp, err := NewTokenProvider(GitHubAppConfig{
		AppID:          42,
		InstallationID: 100,
		PrivateKey:     key,
		BaseURL:        server.URL,
		HTTPClient:     server.Client(),
		RefreshMargin:  5 * time.Minute,
	})
	if err != nil {
		t.Fatalf("NewTokenProvider: %v", err)
	}

	// First call: fetches token.
	tok1, err := tp.Token()
	if err != nil {
		t.Fatalf("Token() #1: %v", err)
	}
	if tok1 != "ghs_token_1" {
		t.Errorf("Token() #1 = %q, want ghs_token_1", tok1)
	}

	// Simulate time advancing past the refresh margin.
	// The token expires in 1h, refresh margin is 5m, so advancing 56m
	// puts us within the refresh window.
	tp.nowFunc = func() time.Time {
		return time.Now().Add(56 * time.Minute)
	}

	tok2, err := tp.Token()
	if err != nil {
		t.Fatalf("Token() #2: %v", err)
	}
	if tok2 != "ghs_token_2" {
		t.Errorf("Token() #2 = %q, want ghs_token_2", tok2)
	}

	if callCount != 2 {
		t.Errorf("API called %d times, want 2", callCount)
	}
}

func TestTokenProvider_Token_APIErrorReturnsError(t *testing.T) {
	key := testKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer server.Close()

	tp, err := NewTokenProvider(GitHubAppConfig{
		AppID:          42,
		InstallationID: 100,
		PrivateKey:     key,
		BaseURL:        server.URL,
		HTTPClient:     server.Client(),
	})
	if err != nil {
		t.Fatalf("NewTokenProvider: %v", err)
	}

	_, err = tp.Token()
	if err == nil {
		t.Fatal("expected error for 401 response")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Errorf("error should mention status code: %v", err)
	}
}

func TestTokenProvider_TokenFunc(t *testing.T) {
	key := testKey(t)
	expiresAt := time.Now().Add(1 * time.Hour)

	server := mockGitHubAPI(t, false, "ghs_functoken", expiresAt)
	defer server.Close()

	tp, err := NewTokenProvider(GitHubAppConfig{
		AppID:          42,
		InstallationID: 100,
		PrivateKey:     key,
		BaseURL:        server.URL,
		HTTPClient:     server.Client(),
	})
	if err != nil {
		t.Fatalf("NewTokenProvider: %v", err)
	}

	fn := tp.TokenFunc()
	tok, err := fn()
	if err != nil {
		t.Fatalf("TokenFunc()() = error %v", err)
	}
	if tok != "ghs_functoken" {
		t.Errorf("TokenFunc()() = %q, want ghs_functoken", tok)
	}
}

// --- exchangeToken tests ---

func TestExchangeToken_Success(t *testing.T) {
	expiresAt := time.Now().Add(1 * time.Hour)
	server := mockGitHubAPI(t, false, "ghs_exchange", expiresAt)
	defer server.Close()

	tok, err := exchangeToken(server.Client(), server.URL, 100, "fake-jwt")
	if err != nil {
		t.Fatalf("exchangeToken = error %v", err)
	}
	if tok.Token != "ghs_exchange" {
		t.Errorf("token = %q, want ghs_exchange", tok.Token)
	}
}

func TestExchangeToken_EmptyToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      "",
			"expires_at": time.Now().Add(1 * time.Hour).Format(time.RFC3339),
		})
	}))
	defer server.Close()

	_, err := exchangeToken(server.Client(), server.URL, 100, "fake-jwt")
	if err == nil {
		t.Fatal("expected error for empty token")
	}
	if !strings.Contains(err.Error(), "empty token") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestExchangeToken_BadJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	_, err := exchangeToken(server.Client(), server.URL, 100, "fake-jwt")
	if err == nil {
		t.Fatal("expected error for bad JSON")
	}
}

// --- ConfigFromEnv tests ---

func TestConfigFromEnv_NoneSet(t *testing.T) {
	// Clear all vars.
	t.Setenv(EnvGitHubAppID, "")
	t.Setenv(EnvGitHubPrivateKey, "")
	t.Setenv(EnvGitHubInstallationID, "")

	cfg, err := ConfigFromEnv()
	if err != nil {
		t.Fatalf("ConfigFromEnv() = error %v", err)
	}
	if cfg != nil {
		t.Error("expected nil config when no vars set")
	}
}

func TestConfigFromEnv_PartialConfig(t *testing.T) {
	t.Setenv(EnvGitHubAppID, "123")
	t.Setenv(EnvGitHubPrivateKey, "")
	t.Setenv(EnvGitHubInstallationID, "456")

	_, err := ConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for partial config")
	}
	if !strings.Contains(err.Error(), "incomplete") {
		t.Errorf("error should mention 'incomplete': %v", err)
	}
	if !strings.Contains(err.Error(), EnvGitHubPrivateKey) {
		t.Errorf("error should mention missing var: %v", err)
	}
}

func TestConfigFromEnv_InvalidAppID(t *testing.T) {
	key := testKey(t)
	pemFile := t.TempDir() + "/key.pem"
	os.WriteFile(pemFile, encodePKCS1PEM(key), 0600)

	t.Setenv(EnvGitHubAppID, "not-a-number")
	t.Setenv(EnvGitHubPrivateKey, pemFile)
	t.Setenv(EnvGitHubInstallationID, "456")

	_, err := ConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for non-numeric app ID")
	}
	if !strings.Contains(err.Error(), "must be a number") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestConfigFromEnv_InvalidInstallationID(t *testing.T) {
	key := testKey(t)
	pemFile := t.TempDir() + "/key.pem"
	os.WriteFile(pemFile, encodePKCS1PEM(key), 0600)

	t.Setenv(EnvGitHubAppID, "123")
	t.Setenv(EnvGitHubPrivateKey, pemFile)
	t.Setenv(EnvGitHubInstallationID, "abc")

	_, err := ConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for non-numeric installation ID")
	}
	if !strings.Contains(err.Error(), "must be a number") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestConfigFromEnv_FileKey(t *testing.T) {
	key := testKey(t)
	pemFile := t.TempDir() + "/key.pem"
	os.WriteFile(pemFile, encodePKCS1PEM(key), 0600)

	t.Setenv(EnvGitHubAppID, "123")
	t.Setenv(EnvGitHubPrivateKey, pemFile)
	t.Setenv(EnvGitHubInstallationID, "456")

	cfg, err := ConfigFromEnv()
	if err != nil {
		t.Fatalf("ConfigFromEnv() = error %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if cfg.AppID != 123 {
		t.Errorf("AppID = %d, want 123", cfg.AppID)
	}
	if cfg.InstallationID != 456 {
		t.Errorf("InstallationID = %d, want 456", cfg.InstallationID)
	}
	if cfg.PrivateKey == nil {
		t.Error("PrivateKey should not be nil")
	}
}

func TestConfigFromEnv_InlinePEM(t *testing.T) {
	key := testKey(t)
	pemData := string(encodePKCS1PEM(key))

	t.Setenv(EnvGitHubAppID, "789")
	t.Setenv(EnvGitHubPrivateKey, pemData)
	t.Setenv(EnvGitHubInstallationID, "101")

	cfg, err := ConfigFromEnv()
	if err != nil {
		t.Fatalf("ConfigFromEnv() = error %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if cfg.AppID != 789 {
		t.Errorf("AppID = %d, want 789", cfg.AppID)
	}
	if cfg.PrivateKey.N.Cmp(key.N) != 0 {
		t.Error("parsed key does not match original")
	}
}

func TestConfigFromEnv_BadKeyFile(t *testing.T) {
	t.Setenv(EnvGitHubAppID, "123")
	t.Setenv(EnvGitHubPrivateKey, "/nonexistent/key.pem")
	t.Setenv(EnvGitHubInstallationID, "456")

	_, err := ConfigFromEnv()
	if err == nil {
		t.Fatal("expected error for nonexistent key file")
	}
}

// --- base64URLEncode test ---

func TestBase64URLEncode(t *testing.T) {
	// base64url should not have padding or use + and /.
	input := []byte{0xff, 0xfe, 0xfd}
	result := base64URLEncode(input)

	if strings.ContainsAny(result, "+/=") {
		t.Errorf("base64URLEncode should not contain +, /, or = padding: %q", result)
	}

	// Verify it can be decoded.
	decoded, err := base64.RawURLEncoding.DecodeString(result)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(decoded) != string(input) {
		t.Error("decoded does not match input")
	}
}
