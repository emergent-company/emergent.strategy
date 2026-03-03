// Device Flow client for GitHub OAuth.
//
// GitHub Device Flow (RFC 8628) allows CLI tools to authenticate users without
// requiring the tool to host an HTTP callback. The user authorizes in their
// browser while the CLI polls for completion.
//
// Flow:
//  1. CLI requests a device code (POST /login/device/code)
//  2. GitHub returns a user code and verification URL
//  3. CLI displays the code and URL to the user
//  4. User opens the URL in their browser and enters the code
//  5. CLI polls GitHub (POST /login/oauth/access_token) until the user authorizes
//  6. GitHub returns an access token
//
// The client ID is public by design — Device Flow does not require a client secret.
// Same pattern as gh auth login, gcloud auth login.
package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultDeviceClientID is the built-in GitHub OAuth App client ID shipped in
// the binary. Device Flow does not require a client secret.
//
// This is the same OAuth App used for the server-side web flow. Users can
// override it with the --device-client-id flag.
const DefaultDeviceClientID = "Ov23liGuUe5TRbq8pnja"

// DeviceFlowConfig configures the Device Flow client.
type DeviceFlowConfig struct {
	// ClientID is the GitHub OAuth App client ID.
	ClientID string

	// Scopes requested during authorization.
	// Default: ["read:user", "repo"]
	Scopes []string

	// BaseURL is the GitHub base URL. Default: "https://github.com".
	BaseURL string

	// HTTPClient is an optional HTTP client. Default: 30s timeout.
	HTTPClient *http.Client
}

// setDefaults fills in default values for unset fields.
func (c *DeviceFlowConfig) setDefaults() {
	if c.ClientID == "" {
		c.ClientID = DefaultDeviceClientID
	}
	if len(c.Scopes) == 0 {
		c.Scopes = DefaultOAuthScopes
	}
	if c.BaseURL == "" {
		c.BaseURL = "https://github.com"
	}
	if c.HTTPClient == nil {
		c.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
}

// DeviceCodeResponse is the response from GitHub's device code endpoint.
type DeviceCodeResponse struct {
	// DeviceCode is the code the CLI uses when polling for authorization.
	DeviceCode string `json:"device_code"`

	// UserCode is the code the user enters in their browser.
	UserCode string `json:"user_code"`

	// VerificationURI is the URL the user opens to enter the code.
	VerificationURI string `json:"verification_uri"`

	// ExpiresIn is the number of seconds until the device code expires.
	ExpiresIn int `json:"expires_in"`

	// Interval is the minimum number of seconds between polling requests.
	Interval int `json:"interval"`
}

// DeviceFlowResult is the result of a successful Device Flow authorization.
type DeviceFlowResult struct {
	// AccessToken is the GitHub OAuth access token.
	AccessToken string

	// TokenType is the token type (typically "bearer").
	TokenType string
}

// DeviceFlowClient handles GitHub Device Flow authentication.
type DeviceFlowClient struct {
	config DeviceFlowConfig
}

// NewDeviceFlowClient creates a new Device Flow client.
func NewDeviceFlowClient(config DeviceFlowConfig) *DeviceFlowClient {
	config.setDefaults()
	return &DeviceFlowClient{config: config}
}

// RequestDeviceCode initiates the Device Flow by requesting a device code
// from GitHub.
//
// POST https://github.com/login/device/code
func (d *DeviceFlowClient) RequestDeviceCode(ctx context.Context) (*DeviceCodeResponse, error) {
	data := url.Values{
		"client_id": {d.config.ClientID},
		"scope":     {strings.Join(d.config.Scopes, " ")},
	}

	codeURL := d.config.BaseURL + "/login/device/code"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, codeURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("device flow: create code request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := d.config.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("device flow: code request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("device flow: read code response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("device flow: code request returned %d: %s", resp.StatusCode, string(body))
	}

	var codeResp DeviceCodeResponse
	if err := json.Unmarshal(body, &codeResp); err != nil {
		return nil, fmt.Errorf("device flow: parse code response: %w", err)
	}

	if codeResp.DeviceCode == "" || codeResp.UserCode == "" {
		return nil, fmt.Errorf("device flow: empty device_code or user_code in response")
	}

	// Default interval to 5 seconds if not set.
	if codeResp.Interval == 0 {
		codeResp.Interval = 5
	}

	return &codeResp, nil
}

// Device Flow polling error types returned by GitHub.
const (
	deviceFlowAuthPending = "authorization_pending"
	deviceFlowSlowDown    = "slow_down"
	deviceFlowExpired     = "expired_token"
	deviceFlowAccessDeny  = "access_denied"
)

// PollForToken polls GitHub until the user authorizes the device or the code
// expires. It respects the polling interval and handles slow_down responses.
//
// POST https://github.com/login/oauth/access_token
//
// The context can be used to cancel polling (e.g., on Ctrl+C).
func (d *DeviceFlowClient) PollForToken(ctx context.Context, deviceCode string, interval int) (*DeviceFlowResult, error) {
	if interval < 0 {
		interval = 5
	}

	tokenURL := d.config.BaseURL + "/login/oauth/access_token"

	for {
		// Wait for the polling interval before each request.
		// An interval of 0 means poll immediately (useful for testing).
		if interval > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(interval) * time.Second):
			}
		} else {
			// Even with 0 interval, check context cancellation.
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			default:
			}
		}

		data := url.Values{
			"client_id":   {d.config.ClientID},
			"device_code": {deviceCode},
			"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
		if err != nil {
			return nil, fmt.Errorf("device flow: create poll request: %w", err)
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Accept", "application/json")

		resp, err := d.config.HTTPClient.Do(req)
		if err != nil {
			// Network error — could be transient, keep polling.
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		// GitHub returns 200 for both success and pending states.
		var tokenResp struct {
			AccessToken string `json:"access_token"`
			TokenType   string `json:"token_type"`
			Error       string `json:"error"`
		}
		if err := json.Unmarshal(body, &tokenResp); err != nil {
			return nil, fmt.Errorf("device flow: parse poll response: %w", err)
		}

		// Check for success.
		if tokenResp.AccessToken != "" {
			return &DeviceFlowResult{
				AccessToken: tokenResp.AccessToken,
				TokenType:   tokenResp.TokenType,
			}, nil
		}

		// Handle error states.
		switch tokenResp.Error {
		case deviceFlowAuthPending:
			// User hasn't authorized yet — keep polling.
			continue

		case deviceFlowSlowDown:
			// GitHub wants us to slow down — increase interval by 5 seconds.
			interval += 5
			continue

		case deviceFlowExpired:
			return nil, fmt.Errorf("device flow: authorization code expired — please try again")

		case deviceFlowAccessDeny:
			return nil, fmt.Errorf("device flow: user denied authorization")

		default:
			if tokenResp.Error != "" {
				return nil, fmt.Errorf("device flow: %s", tokenResp.Error)
			}
			// Unknown response — keep polling.
			continue
		}
	}
}
