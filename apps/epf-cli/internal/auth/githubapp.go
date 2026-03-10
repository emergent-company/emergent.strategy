// Package auth provides GitHub App authentication for the EPF cloud server.
//
// A GitHub App authenticates in two steps:
//  1. Sign a JWT with the App's private key (RS256, 10-minute TTL)
//  2. Exchange the JWT for an installation token (1-hour TTL, scoped to repos)
//
// The TokenProvider handles both steps and automatically rotates the
// installation token before it expires.
package auth

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GitHubAppConfig holds the configuration for GitHub App authentication.
type GitHubAppConfig struct {
	// AppID is the GitHub App's numeric ID.
	AppID int64

	// InstallationID is the installation ID for the target org/repo.
	InstallationID int64

	// PrivateKey is the RSA private key in PEM format.
	// Loaded from a file path or directly from a secret.
	PrivateKey *rsa.PrivateKey

	// BaseURL is the GitHub API base URL. Defaults to "https://api.github.com".
	// Override for GitHub Enterprise or testing.
	BaseURL string

	// HTTPClient is an optional HTTP client. Defaults to http.DefaultClient.
	HTTPClient *http.Client

	// RefreshMargin is how early to refresh before token expiry.
	// Defaults to 5 minutes.
	RefreshMargin time.Duration
}

// installationToken represents a GitHub App installation access token.
type installationToken struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// TokenProvider manages GitHub App installation tokens with automatic
// rotation. It is safe for concurrent use.
//
// Use NewTokenProvider to create one, then call Token() to get a valid
// bearer token. The provider automatically refreshes the token before
// it expires.
type TokenProvider struct {
	cfg GitHubAppConfig

	mu    sync.Mutex
	token *installationToken

	// nowFunc is used for testing time-dependent behavior.
	nowFunc func() time.Time
}

// NewTokenProvider creates a TokenProvider from the given configuration.
func NewTokenProvider(cfg GitHubAppConfig) (*TokenProvider, error) {
	if cfg.AppID == 0 {
		return nil, fmt.Errorf("auth: AppID is required")
	}
	if cfg.InstallationID == 0 {
		return nil, fmt.Errorf("auth: InstallationID is required")
	}
	if cfg.PrivateKey == nil {
		return nil, fmt.Errorf("auth: PrivateKey is required")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.github.com"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
	if cfg.RefreshMargin == 0 {
		cfg.RefreshMargin = 5 * time.Minute
	}

	return &TokenProvider{
		cfg:     cfg,
		nowFunc: time.Now,
	}, nil
}

// Token returns a valid installation access token. If the current token
// is missing or within the refresh margin of expiry, a new one is obtained.
//
// This method is safe for concurrent use. Only one goroutine will perform
// the token exchange at a time; others wait for the result.
func (tp *TokenProvider) Token() (string, error) {
	tp.mu.Lock()
	defer tp.mu.Unlock()

	if tp.token != nil && tp.nowFunc().Before(tp.token.ExpiresAt.Add(-tp.cfg.RefreshMargin)) {
		return tp.token.Token, nil
	}

	// Token is missing or about to expire — refresh.
	tok, err := tp.refreshToken()
	if err != nil {
		return "", err
	}
	tp.token = tok
	return tok.Token, nil
}

// TokenFunc returns a source.TokenFunc suitable for passing to
// source.NewGitHubSource. It closes over the TokenProvider.
func (tp *TokenProvider) TokenFunc() func() (string, error) {
	return tp.Token
}

// refreshToken signs a JWT and exchanges it for an installation token.
func (tp *TokenProvider) refreshToken() (*installationToken, error) {
	now := tp.nowFunc()

	jwt, err := signJWT(tp.cfg.PrivateKey, tp.cfg.AppID, now)
	if err != nil {
		return nil, fmt.Errorf("auth: sign JWT: %w", err)
	}

	tok, err := exchangeToken(tp.cfg.HTTPClient, tp.cfg.BaseURL, tp.cfg.InstallationID, jwt)
	if err != nil {
		return nil, fmt.Errorf("auth: exchange token: %w", err)
	}

	return tok, nil
}

// exchangeToken calls the GitHub API to create an installation access token.
//
// POST /app/installations/{installation_id}/access_tokens
// Authorization: Bearer <JWT>
func exchangeToken(client *http.Client, baseURL string, installationID int64, jwt string) (*installationToken, error) {
	url := fmt.Sprintf("%s/app/installations/%d/access_tokens", baseURL, installationID)

	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "epf-cli")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("POST %s returned %d: %s", url, resp.StatusCode, string(body))
	}

	var tok installationToken
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if tok.Token == "" {
		return nil, fmt.Errorf("empty token in response")
	}

	return &tok, nil
}

// ParsePrivateKeyFile reads and parses an RSA private key from a PEM file.
func ParsePrivateKeyFile(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("auth: read private key file: %w", err)
	}
	return ParsePrivateKey(data)
}

// ParsePrivateKey parses an RSA private key from PEM-encoded data.
// Supports both PKCS#1 and PKCS#8 formats.
func ParsePrivateKey(pemData []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("auth: no PEM block found in private key data")
	}

	// Try PKCS#1 first (RSA PRIVATE KEY).
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	// Try PKCS#8 (PRIVATE KEY).
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to parse private key (tried PKCS#1 and PKCS#8): %w", err)
	}

	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("auth: private key is not RSA (got %T)", parsed)
	}

	return key, nil
}

// signJWT creates a JWT signed with RS256 for GitHub App authentication.
//
// The JWT has:
//   - iss: App ID
//   - iat: now - 60s (clock drift allowance)
//   - exp: now + 10 minutes (GitHub maximum)
//
// This is a minimal implementation that avoids external JWT dependencies.
func signJWT(key *rsa.PrivateKey, appID int64, now time.Time) (string, error) {
	header := map[string]string{
		"alg": "RS256",
		"typ": "JWT",
	}
	payload := map[string]interface{}{
		"iss": appID,
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(10 * time.Minute).Unix(),
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("marshal header: %w", err)
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal payload: %w", err)
	}

	signingInput := base64URLEncode(headerJSON) + "." + base64URLEncode(payloadJSON)

	// SHA-256 hash the signing input, then sign with RSA PKCS#1 v1.5.
	h := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, h[:])
	if err != nil {
		return "", fmt.Errorf("RSA sign: %w", err)
	}

	return signingInput + "." + base64URLEncode(signature), nil
}

// InstallationTokenManager manages GitHub App installation tokens for
// multiple installations. Unlike TokenProvider (which manages a single
// installation for single-tenant mode), this type supports multi-tenant
// mode where the App is installed across many orgs and user accounts.
//
// Tokens are cached by installation ID and shared across all user sessions.
// This is correct because installation tokens represent the App's access
// to repos under a given installation, not a specific user's access.
type InstallationTokenManager struct {
	appID         int64
	privateKey    *rsa.PrivateKey
	baseURL       string
	httpClient    *http.Client
	refreshMargin time.Duration

	mu     sync.Mutex
	tokens map[int64]*installationToken // installationID -> cached token

	// nowFunc is used for testing time-dependent behavior.
	nowFunc func() time.Time
}

// MultiTenantAppConfig holds the configuration for a GitHub App in
// multi-tenant mode. Unlike GitHubAppConfig, it does not require a
// specific InstallationID — installations are discovered per-user.
type MultiTenantAppConfig struct {
	// AppID is the GitHub App's numeric ID.
	AppID int64

	// PrivateKey is the RSA private key for signing App JWTs.
	PrivateKey *rsa.PrivateKey

	// BaseURL is the GitHub API base URL. Defaults to "https://api.github.com".
	BaseURL string

	// HTTPClient is an optional HTTP client. Defaults to http.DefaultClient.
	HTTPClient *http.Client

	// RefreshMargin is how early to refresh before token expiry.
	// Defaults to 5 minutes.
	RefreshMargin time.Duration
}

// NewInstallationTokenManager creates a manager for multi-installation
// token caching and rotation.
func NewInstallationTokenManager(cfg MultiTenantAppConfig) (*InstallationTokenManager, error) {
	if cfg.AppID == 0 {
		return nil, fmt.Errorf("auth: AppID is required")
	}
	if cfg.PrivateKey == nil {
		return nil, fmt.Errorf("auth: PrivateKey is required")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.github.com"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
	if cfg.RefreshMargin == 0 {
		cfg.RefreshMargin = 5 * time.Minute
	}

	return &InstallationTokenManager{
		appID:         cfg.AppID,
		privateKey:    cfg.PrivateKey,
		baseURL:       cfg.BaseURL,
		httpClient:    cfg.HTTPClient,
		refreshMargin: cfg.RefreshMargin,
		tokens:        make(map[int64]*installationToken),
		nowFunc:       time.Now,
	}, nil
}

// Token returns a valid installation access token for the given
// installation ID. If the cached token is missing or about to expire,
// a new one is obtained from GitHub.
//
// This method is safe for concurrent use.
func (m *InstallationTokenManager) Token(installationID int64) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if tok, ok := m.tokens[installationID]; ok {
		if m.nowFunc().Before(tok.ExpiresAt.Add(-m.refreshMargin)) {
			return tok.Token, nil
		}
	}

	// Token is missing or about to expire — refresh.
	now := m.nowFunc()
	jwt, err := signJWT(m.privateKey, m.appID, now)
	if err != nil {
		return "", fmt.Errorf("auth: sign JWT for installation %d: %w", installationID, err)
	}

	tok, err := exchangeToken(m.httpClient, m.baseURL, installationID, jwt)
	if err != nil {
		return "", fmt.Errorf("auth: exchange token for installation %d: %w", installationID, err)
	}

	m.tokens[installationID] = tok
	return tok.Token, nil
}

// TokenFunc returns a function that provides a token for a specific
// installation ID. Suitable for passing to source.NewGitHubSource.
func (m *InstallationTokenManager) TokenFunc(installationID int64) func() (string, error) {
	return func() (string, error) {
		return m.Token(installationID)
	}
}

// base64URLEncode encodes data using base64url encoding without padding
// (RFC 4648 Section 5).
func base64URLEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

// Environment variable names for GitHub App configuration.
const (
	EnvGitHubAppID          = "EPF_GITHUB_APP_ID"
	EnvGitHubPrivateKey     = "EPF_GITHUB_APP_PRIVATE_KEY"
	EnvGitHubInstallationID = "EPF_GITHUB_APP_INSTALLATION_ID"

	// EnvGitHubAppClientID and EnvGitHubAppClientSecret are the OAuth credentials
	// for the GitHub App's user authorization flow. These are used to exchange
	// authorization codes for user access tokens (ghu_) and to refresh tokens (ghr_).
	// They are DIFFERENT from EPF_OAUTH_CLIENT_ID/SECRET (which are for the legacy
	// OAuth App). Both can be set simultaneously during the transition period.
	EnvGitHubAppClientID     = "EPF_GITHUB_APP_CLIENT_ID"
	EnvGitHubAppClientSecret = "EPF_GITHUB_APP_CLIENT_SECRET"
)

// ConfigFromEnv reads GitHub App configuration from environment variables.
//
// Required variables:
//   - EPF_GITHUB_APP_ID: numeric App ID
//   - EPF_GITHUB_APP_PRIVATE_KEY: path to PEM file, or inline PEM data
//   - EPF_GITHUB_APP_INSTALLATION_ID: numeric installation ID
//
// Returns (nil, nil) if none of the variables are set — this means GitHub
// App auth is not configured (which is fine for local/filesystem mode).
// Returns an error if some but not all variables are set.
func ConfigFromEnv() (*GitHubAppConfig, error) {
	appIDStr := os.Getenv(EnvGitHubAppID)
	keyRef := os.Getenv(EnvGitHubPrivateKey)
	installIDStr := os.Getenv(EnvGitHubInstallationID)

	// If none are set, auth is not configured.
	if appIDStr == "" && keyRef == "" && installIDStr == "" {
		return nil, nil
	}

	// If some but not all are set, that's an error.
	var missing []string
	if appIDStr == "" {
		missing = append(missing, EnvGitHubAppID)
	}
	if keyRef == "" {
		missing = append(missing, EnvGitHubPrivateKey)
	}
	if installIDStr == "" {
		missing = append(missing, EnvGitHubInstallationID)
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("auth: incomplete GitHub App config — missing: %s", strings.Join(missing, ", "))
	}

	appID, err := strconv.ParseInt(appIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("auth: %s must be a number: %w", EnvGitHubAppID, err)
	}

	installID, err := strconv.ParseInt(installIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("auth: %s must be a number: %w", EnvGitHubInstallationID, err)
	}

	// keyRef is either a file path or inline PEM data.
	var key *rsa.PrivateKey
	if strings.HasPrefix(keyRef, "-----BEGIN") {
		// Inline PEM data.
		key, err = ParsePrivateKey([]byte(keyRef))
	} else {
		// File path.
		key, err = ParsePrivateKeyFile(keyRef)
	}
	if err != nil {
		return nil, fmt.Errorf("auth: load private key from %s: %w", EnvGitHubPrivateKey, err)
	}

	return &GitHubAppConfig{
		AppID:          appID,
		InstallationID: installID,
		PrivateKey:     key,
	}, nil
}

// MultiTenantConfigFromEnv reads GitHub App configuration for multi-tenant
// mode from environment variables.
//
// Required variables:
//   - EPF_GITHUB_APP_ID: numeric App ID
//   - EPF_GITHUB_APP_PRIVATE_KEY: path to PEM file, or inline PEM data
//
// Note: EPF_GITHUB_APP_INSTALLATION_ID is NOT required for multi-tenant
// mode (installations are discovered per-user via GET /user/installations).
//
// Returns (nil, nil) if EPF_GITHUB_APP_ID is not set — this means GitHub
// App multi-tenant auth is not configured.
func MultiTenantConfigFromEnv() (*MultiTenantAppConfig, error) {
	appIDStr := os.Getenv(EnvGitHubAppID)
	keyRef := os.Getenv(EnvGitHubPrivateKey)

	// If App ID is not set, multi-tenant GitHub App is not configured.
	if appIDStr == "" {
		return nil, nil
	}

	// App ID is set but key is missing.
	if keyRef == "" {
		return nil, fmt.Errorf("auth: %s is set but %s is missing — both are required for GitHub App multi-tenant mode", EnvGitHubAppID, EnvGitHubPrivateKey)
	}

	appID, err := strconv.ParseInt(appIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("auth: %s must be a number: %w", EnvGitHubAppID, err)
	}

	var key *rsa.PrivateKey
	if strings.HasPrefix(keyRef, "-----BEGIN") {
		key, err = ParsePrivateKey([]byte(keyRef))
	} else {
		key, err = ParsePrivateKeyFile(keyRef)
	}
	if err != nil {
		return nil, fmt.Errorf("auth: load private key from %s: %w", EnvGitHubPrivateKey, err)
	}

	return &MultiTenantAppConfig{
		AppID:      appID,
		PrivateKey: key,
	}, nil
}
