// HTTP client helpers for the Connect TUI.
//
// These functions make authenticated requests to the EPF server endpoints
// (/health, /workspaces, /auth/token) and return parsed responses.
package connect

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// httpClient is the shared HTTP client for server requests.
var httpClient = &http.Client{Timeout: 120 * time.Second}

// CheckHealth calls GET /health and returns server info.
func CheckHealth(ctx context.Context, serverURL string) (*ServerInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, serverURL+"/health", nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("server unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned HTTP %d", resp.StatusCode)
	}

	// The /health endpoint returns a HealthResponse with nested "server" object.
	var healthResp struct {
		Status string     `json:"status"`
		Uptime string     `json:"uptime"`
		Server ServerInfo `json:"server"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&healthResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	info := healthResp.Server
	info.Status = healthResp.Status
	info.Uptime = healthResp.Uptime

	return &info, nil
}

// FetchWorkspaces calls GET /workspaces with the given JWT token.
func FetchWorkspaces(ctx context.Context, serverURL, token string) ([]WorkspaceInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, serverURL+"/workspaces", nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("authentication expired — please re-authenticate")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned HTTP %d", resp.StatusCode)
	}

	var wsResp struct {
		Workspaces []WorkspaceInfo `json:"workspaces"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&wsResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	return wsResp.Workspaces, nil
}

// ExchangeGitHubToken sends a GitHub token to POST /auth/token and returns
// the server session JWT and user info.
func ExchangeGitHubToken(ctx context.Context, serverURL, githubToken string) (token, username string, userID int64, err error) {
	body, err := json.Marshal(map[string]string{
		"github_token": githubToken,
	})
	if err != nil {
		return "", "", 0, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, serverURL+"/auth/token", bytes.NewReader(body))
	if err != nil {
		return "", "", 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", "", 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp struct {
		Token    string `json:"token"`
		Username string `json:"username"`
		UserID   int64  `json:"user_id"`
		Error    string `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", "", 0, fmt.Errorf("parse response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		msg := tokenResp.Error
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return "", "", 0, fmt.Errorf("server rejected token: %s", msg)
	}

	if tokenResp.Token == "" {
		return "", "", 0, fmt.Errorf("server returned empty token")
	}

	return tokenResp.Token, tokenResp.Username, tokenResp.UserID, nil
}

// ValidateToken validates a JWT by calling GET /workspaces.
// Returns nil if the token is valid, an error otherwise.
func ValidateToken(ctx context.Context, serverURL, token string) error {
	_, err := FetchWorkspaces(ctx, serverURL, token)
	return err
}
