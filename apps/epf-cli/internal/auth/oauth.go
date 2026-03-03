// OAuth provides GitHub OAuth 2.0 authentication for multi-tenant mode.
//
// The OAuth flow:
//  1. Server redirects user to GitHub's authorize URL with client_id + state
//  2. User grants access, GitHub redirects back with an authorization code
//  3. Server exchanges the code for an access token (POST /login/oauth/access_token)
//  4. Server fetches the user's profile (GET /user) using the access token
//
// The access token is stored server-side in the session map — never sent to the client.
// The client receives a signed JWT containing only user identity (ID, username, expiry).
package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// OAuthConfig holds the GitHub OAuth 2.0 application credentials.
type OAuthConfig struct {
	// ClientID is the GitHub OAuth App's client ID.
	ClientID string

	// ClientSecret is the GitHub OAuth App's client secret.
	ClientSecret string

	// BaseURL is the GitHub base URL. Defaults to "https://github.com".
	// Override for GitHub Enterprise.
	BaseURL string

	// APIBaseURL is the GitHub API base URL. Defaults to "https://api.github.com".
	// Override for GitHub Enterprise.
	APIBaseURL string

	// Scopes requested during OAuth authorization.
	// Default: ["read:user", "repo"] — user identity + repo listing.
	Scopes []string

	// HTTPClient is an optional HTTP client for making requests.
	// Defaults to a client with 30s timeout.
	HTTPClient *http.Client
}

// Environment variable names for OAuth configuration.
const (
	EnvOAuthClientID     = "EPF_OAUTH_CLIENT_ID"
	EnvOAuthClientSecret = "EPF_OAUTH_CLIENT_SECRET"
)

// DefaultOAuthScopes are the GitHub OAuth scopes we request.
// - read:user: access to user profile (ID, username, avatar)
// - repo: access to public and private repositories (needed for workspace discovery)
var DefaultOAuthScopes = []string{"read:user", "repo"}

// OAuthConfigFromEnv reads OAuth configuration from environment variables.
//
// Returns (nil, nil) if no OAuth variables are set — this means OAuth is not
// configured (single-tenant or local mode). Returns an error if some but not
// all required variables are set.
func OAuthConfigFromEnv() (*OAuthConfig, error) {
	clientID := os.Getenv(EnvOAuthClientID)
	clientSecret := os.Getenv(EnvOAuthClientSecret)

	// If neither is set, OAuth is not configured.
	if clientID == "" && clientSecret == "" {
		return nil, nil
	}

	// If one is set but not the other, that's an error.
	if clientID == "" {
		return nil, fmt.Errorf("auth: %s is required when %s is set", EnvOAuthClientID, EnvOAuthClientSecret)
	}
	if clientSecret == "" {
		return nil, fmt.Errorf("auth: %s is required when %s is set", EnvOAuthClientSecret, EnvOAuthClientID)
	}

	cfg := &OAuthConfig{
		ClientID:     clientID,
		ClientSecret: clientSecret,
	}
	cfg.setDefaults()
	return cfg, nil
}

// setDefaults fills in default values for unset fields.
func (c *OAuthConfig) setDefaults() {
	if c.BaseURL == "" {
		c.BaseURL = "https://github.com"
	}
	if c.APIBaseURL == "" {
		c.APIBaseURL = "https://api.github.com"
	}
	if len(c.Scopes) == 0 {
		c.Scopes = DefaultOAuthScopes
	}
	if c.HTTPClient == nil {
		c.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
}

// AuthorizeURL builds the GitHub OAuth authorization URL.
//
// The state parameter should be a random, unguessable string tied to the
// user's session. It prevents CSRF attacks by ensuring the callback was
// initiated by this server.
func (c *OAuthConfig) AuthorizeURL(state string) string {
	params := url.Values{
		"client_id":    {c.ClientID},
		"state":        {state},
		"scope":        {strings.Join(c.Scopes, " ")},
		"allow_signup": {"false"},
	}
	return c.BaseURL + "/login/oauth/authorize?" + params.Encode()
}

// OAuthTokenResponse is the response from GitHub's token exchange endpoint.
type OAuthTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
}

// ExchangeCode exchanges an authorization code for an access token.
//
// POST https://github.com/login/oauth/access_token
func (c *OAuthConfig) ExchangeCode(code string) (*OAuthTokenResponse, error) {
	data := url.Values{
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"code":          {code},
	}

	tokenURL := c.BaseURL + "/login/oauth/access_token"
	req, err := http.NewRequest(http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("auth: create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth: token exchange request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("auth: read token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth: token exchange returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp OAuthTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("auth: parse token response: %w", err)
	}

	if tokenResp.AccessToken == "" {
		// GitHub returns 200 with an error in the body for invalid codes.
		var errResp struct {
			Error            string `json:"error"`
			ErrorDescription string `json:"error_description"`
		}
		if err := json.Unmarshal(body, &errResp); err == nil && errResp.Error != "" {
			return nil, fmt.Errorf("auth: token exchange failed: %s — %s", errResp.Error, errResp.ErrorDescription)
		}
		return nil, fmt.Errorf("auth: empty access token in response")
	}

	return &tokenResp, nil
}

// GitHubUser represents a GitHub user profile.
type GitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
}

// FetchUser fetches the authenticated user's GitHub profile.
//
// GET https://api.github.com/user
func (c *OAuthConfig) FetchUser(accessToken string) (*GitHubUser, error) {
	req, err := http.NewRequest(http.MethodGet, c.APIBaseURL+"/user", nil)
	if err != nil {
		return nil, fmt.Errorf("auth: create user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "epf-cli")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth: user request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("auth: read user response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth: GET /user returned %d: %s", resp.StatusCode, string(body))
	}

	var user GitHubUser
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, fmt.Errorf("auth: parse user response: %w", err)
	}

	if user.ID == 0 || user.Login == "" {
		return nil, fmt.Errorf("auth: invalid user response (missing id or login)")
	}

	return &user, nil
}
