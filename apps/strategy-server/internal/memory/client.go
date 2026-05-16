// Package memory provides an HTTP client for the emergent.memory REST API.
// This is a focused client for strategy-server's needs: object/relationship CRUD,
// search, branch operations, and schema management.
package memory

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Config holds the connection settings for the Memory server.
type Config struct {
	BaseURL   string
	ProjectID string
	Token     string
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
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: timeout},
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

// do executes an HTTP request with standard headers and error handling.
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

	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("memory: marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, reqBody)
	if err != nil {
		return nil, fmt.Errorf("memory: create request: %w", err)
	}

	// Standard headers.
	req.Header.Set("Authorization", "Bearer "+c.cfg.Token)
	req.Header.Set("X-Project-ID", c.cfg.ProjectID)
	if c.branchID != "" {
		req.Header.Set("X-Branch-ID", c.branchID)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("memory: %s %s: %w", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("memory: read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &APIError{
			StatusCode: resp.StatusCode,
			Method:     method,
			Path:       path,
			Body:       string(respBody),
		}
	}

	return respBody, nil
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
