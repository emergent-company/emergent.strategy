// Package github — OAuth App helpers for the GitHub user authorization flow.
//
// This file handles the OAuth 2.0 dance needed to get a user-scoped GitHub
// token. That token is then used to call GET /user/installations, which returns
// only the installations the user has access to — proper multi-tenant scoping.
//
// This is separate from the GitHub App (used for repo read/write). The OAuth App
// grants read:user scope to identify the user and discover their installations.
package github

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// OAuthConfig holds GitHub OAuth App credentials for the user authorization flow.
type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	// StateSecret is the HMAC-SHA256 key used to sign the CSRF state parameter.
	StateSecret string
	// RedirectURL is the callback URL registered with the OAuth App.
	RedirectURL string
	// HTTPClient overrides the default HTTP client (used in tests).
	HTTPClient *http.Client
}

// httpClient returns the configured HTTP client or a default one.
func (c *OAuthConfig) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 15 * time.Second}
}

// AuthorizeURL returns the GitHub OAuth authorization URL with CSRF state embedded.
func (c *OAuthConfig) AuthorizeURL(state string) string {
	params := url.Values{
		"client_id":    {c.ClientID},
		"state":        {state},
		"scope":        {"repo,read:user,read:org"},
		"allow_signup": {"false"},
	}
	if c.RedirectURL != "" {
		params.Set("redirect_uri", c.RedirectURL)
	}
	return "https://github.com/login/oauth/authorize?" + params.Encode()
}

// GenerateState returns a cryptographically random 32-byte hex string.
func GenerateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate oauth state: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// SignState returns HMAC-SHA256(state, secret) as a hex string.
// The cookie stores "state.HMAC" so we can verify without a server-side store.
func SignState(state, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(state))
	return state + "." + hex.EncodeToString(mac.Sum(nil))
}

// VerifyState checks that signed == SignState(state, secret).
func VerifyState(signed, secret string) (state string, ok bool) {
	parts := strings.SplitN(signed, ".", 2)
	if len(parts) != 2 {
		return "", false
	}
	rawState := parts[0]
	expected := SignState(rawState, secret)
	if !hmac.Equal([]byte(signed), []byte(expected)) {
		return "", false
	}
	return rawState, true
}

// OAuthTokenResponse is the response from GitHub's token endpoint.
type OAuthTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
	Error       string `json:"error"`
	ErrorDesc   string `json:"error_description"`
}

// ExchangeCode exchanges an OAuth authorization code for an access token.
func (c *OAuthConfig) ExchangeCode(ctx context.Context, code string) (string, error) {
	params := url.Values{
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"code":          {code},
	}
	if c.RedirectURL != "" {
		params.Set("redirect_uri", c.RedirectURL)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token",
		strings.NewReader(params.Encode()))
	if err != nil {
		return "", fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("exchange code: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read token response: %w", err)
	}

	var tok OAuthTokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", fmt.Errorf("parse token response: %w", err)
	}
	if tok.Error != "" {
		return "", fmt.Errorf("github oauth error: %s — %s", tok.Error, tok.ErrorDesc)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("github oauth: empty access token in response")
	}
	return tok.AccessToken, nil
}

// GitHubUser holds the minimal user info we need from GET /user.
type GitHubUser struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

// FetchUser calls GET /user with the access token to retrieve the GitHub user ID and login.
func (c *OAuthConfig) FetchUser(ctx context.Context, accessToken string) (*GitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, fmt.Errorf("build user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch github user: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("fetch github user: status %d: %s", resp.StatusCode, truncateOAuth(string(body), 200))
	}

	var user GitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("parse github user: %w", err)
	}
	return &user, nil
}

func truncateOAuth(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
