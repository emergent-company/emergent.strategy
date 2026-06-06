// Package memory provides an HTTP client for the emergent.memory REST API.
// This is a focused client for strategy-server's needs: object/relationship CRUD,
// search, branch operations, and schema management.
package memory

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"time"
)

// AuthMode controls how the client authenticates with the Memory server.
type AuthMode string

const (
	// AuthModeBearer uses Authorization: Bearer (production Zitadel tokens).
	AuthModeBearer AuthMode = "bearer"
	// AuthModeAPIKey uses X-API-Key header (standalone/dev mode).
	AuthModeAPIKey AuthMode = "api-key"
)

// Config holds the connection settings for the Memory server.
type Config struct {
	BaseURL   string
	ProjectID string
	Token     string
	AuthMode  AuthMode      // defaults to AuthModeBearer if empty
	Timeout   time.Duration // defaults to 30s if zero
}

// IsConfigured returns true when all required fields are set.
func (c Config) IsConfigured() bool {
	return c.BaseURL != "" && c.ProjectID != "" && c.Token != ""
}

// Client is an HTTP client for the emergent.memory REST API.
type Client struct {
	cfg      Config
	http     *http.Client
	branchID string // optional, set via WithBranch
}

// New creates a new Memory client. Returns an error if the config is incomplete.
func New(cfg Config) (*Client, error) {
	if !cfg.IsConfigured() {
		return nil, fmt.Errorf("memory: incomplete config (BaseURL=%q, ProjectID=%q, Token set=%t)",
			cfg.BaseURL, cfg.ProjectID, cfg.Token != "")
	}
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	// Custom transport: raise MaxIdleConnsPerHost from default 2 to 20.
	// All Memory API calls go to a single host; the default bottlenecks
	// concurrent operations like BulkUpsertObjects (concurrency=8).
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: timeout, Transport: transport},
	}, nil
}

// WithBranch returns a copy of the client that scopes all operations to the
// given branch ID. Pass "" to clear the branch scope.
func (c *Client) WithBranch(branchID string) *Client {
	return &Client{
		cfg:      c.cfg,
		http:     c.http,
		branchID: branchID,
	}
}

// APIError is returned when the Memory API responds with a non-2xx status.
type APIError struct {
	StatusCode int
	Method     string
	Path       string
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("memory API %s %s: status %d: %s", e.Method, e.Path, e.StatusCode, e.Body)
}

// maxRetries is the number of automatic retries for transient failures.
const maxRetries = 3

// isTransient returns true for errors that may resolve on retry.
func isTransient(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		switch apiErr.StatusCode {
		case http.StatusTooManyRequests, // 429
			http.StatusBadGateway,        // 502
			http.StatusServiceUnavailable, // 503
			http.StatusGatewayTimeout:     // 504
			return true
		}
		return false
	}
	// Network errors (connection refused, timeout, DNS) are transient.
	var netErr net.Error
	return errors.As(err, &netErr)
}

// retryBackoff returns the delay before the nth retry (0-indexed).
func retryBackoff(attempt int) time.Duration {
	// 200ms, 600ms, 1800ms (exponential with factor 3)
	d := 200 * time.Millisecond
	for range attempt {
		d *= 3
	}
	return d
}

// do executes an HTTP request with standard headers, error handling, and
// automatic retry with exponential backoff for transient failures.
func (c *Client) do(ctx context.Context, method, path string, body any) ([]byte, error) {
	// Parse base URL and append path, preserving any query string in path.
	base, err := url.Parse(c.cfg.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("memory: parse base URL: %w", err)
	}
	ref, err := url.Parse(path)
	if err != nil {
		return nil, fmt.Errorf("memory: parse path %s: %w", path, err)
	}
	u := base.ResolveReference(ref).String()

	// Marshal body once; reuse for retries.
	var bodyBytes []byte
	if body != nil {
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("memory: marshal request body: %w", err)
		}
	}

	var lastErr error
	for attempt := range maxRetries {
		var reqBody io.Reader
		if bodyBytes != nil {
			reqBody = bytes.NewReader(bodyBytes)
		}

		req, err := http.NewRequestWithContext(ctx, method, u, reqBody)
		if err != nil {
			return nil, fmt.Errorf("memory: create request: %w", err)
		}

		// Auth header — standalone mode uses X-API-Key, production uses Bearer token.
		if c.cfg.AuthMode == AuthModeAPIKey {
			req.Header.Set("X-API-Key", c.cfg.Token)
		} else {
			req.Header.Set("Authorization", "Bearer "+c.cfg.Token)
		}
		req.Header.Set("X-Project-ID", c.cfg.ProjectID)
		if c.branchID != "" {
			req.Header.Set("X-Branch-ID", c.branchID)
		}
		if bodyBytes != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("memory: %s %s: %w", method, path, err)
			if !isTransient(lastErr) || attempt == maxRetries-1 {
				return nil, lastErr
			}
			slog.Warn("memory: transient error, retrying",
				"method", method, "path", path,
				"attempt", attempt+1, "err", err)
			if !sleepCtx(ctx, retryBackoff(attempt)) {
				return nil, lastErr // context cancelled
			}
			continue
		}

		respBody, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("memory: read response body: %w", err)
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return respBody, nil
		}

		lastErr = &APIError{
			StatusCode: resp.StatusCode,
			Method:     method,
			Path:       path,
			Body:       string(respBody),
		}
		if !isTransient(lastErr) || attempt == maxRetries-1 {
			return nil, lastErr
		}
		slog.Warn("memory: transient HTTP error, retrying",
			"method", method, "path", path, "status", resp.StatusCode,
			"attempt", attempt+1)
		if !sleepCtx(ctx, retryBackoff(attempt)) {
			return nil, lastErr
		}
	}
	return nil, lastErr
}

// sleepCtx sleeps for d or until ctx is cancelled. Returns true if the sleep completed.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

// decodeJSON is a helper that unmarshals JSON response bytes into the target type.
func decodeJSON[T any](data []byte) (T, error) {
	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return result, fmt.Errorf("memory: decode response: %w", err)
	}
	return result, nil
}

// Healthy checks if the Memory server is reachable.
func (c *Client) Healthy(ctx context.Context) error {
	_, err := c.do(ctx, http.MethodGet, "/health", nil)
	return err
}

// HealthStatus holds parsed fields from the Memory server's /health response.
type HealthStatus struct {
	// StartedAt is the approximate time the Memory server last started.
	// Computed as: response timestamp - uptime duration.
	// Used to detect restarts that may have wiped the graph.
	StartedAt time.Time
}

// Health fetches the /health endpoint and returns a parsed HealthStatus.
// Returns an error if the server is unreachable or unhealthy.
func (c *Client) Health(ctx context.Context) (HealthStatus, error) {
	body, err := c.do(ctx, http.MethodGet, "/health", nil)
	if err != nil {
		return HealthStatus{}, err
	}

	var resp struct {
		Timestamp string `json:"timestamp"` // RFC3339 — server's current time
		Uptime    string `json:"uptime"`    // Go duration string, e.g. "27m45.7s"
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return HealthStatus{}, fmt.Errorf("memory: parse health response: %w", err)
	}

	ts, err := time.Parse(time.RFC3339, resp.Timestamp)
	if err != nil {
		return HealthStatus{}, fmt.Errorf("memory: parse health timestamp: %w", err)
	}

	uptime, err := time.ParseDuration(resp.Uptime)
	if err != nil {
		// Uptime field may have sub-second precision that Go can't parse directly.
		// Trim to the first 'ms' or 's' suffix as fallback.
		uptime = 0
	}

	return HealthStatus{StartedAt: ts.Add(-uptime)}, nil
}

// HealthDetail holds the full parsed /health response including version,
// subsystem checks, and startup time. Used by the settings page.
type HealthDetail struct {
	Version   string
	Healthy   bool
	StartedAt time.Time
	Checks    map[string]string // subsystem → status ("healthy", "degraded", etc.)
}

// HealthDetailed fetches /health and returns version, subsystem statuses,
// and computed startup time.
func (c *Client) HealthDetailed(ctx context.Context) (HealthDetail, error) {
	body, err := c.do(ctx, http.MethodGet, "/health", nil)
	if err != nil {
		return HealthDetail{}, err
	}

	var resp struct {
		Version   string `json:"version"`
		Timestamp string `json:"timestamp"`
		Uptime    string `json:"uptime"`
		Checks    map[string]struct {
			Status string `json:"status"`
		} `json:"checks"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return HealthDetail{}, fmt.Errorf("memory: parse health response: %w", err)
	}

	detail := HealthDetail{
		Version: resp.Version,
		Checks:  make(map[string]string, len(resp.Checks)),
	}

	// Parse startup time from timestamp - uptime.
	if ts, err := time.Parse(time.RFC3339, resp.Timestamp); err == nil {
		if uptime, err := time.ParseDuration(resp.Uptime); err == nil {
			detail.StartedAt = ts.Add(-uptime)
		}
	}

	// Evaluate health: server responded 200, so check subsystems.
	detail.Healthy = true
	for name, check := range resp.Checks {
		detail.Checks[name] = check.Status
		if name == "database" && check.Status != "healthy" {
			detail.Healthy = false
		}
	}

	return detail, nil
}
