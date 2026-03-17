// Package memory provides a typed Go client for the emergent.memory REST API.
//
// This client covers the graph operations needed by the EPF semantic strategy
// runtime: object CRUD, relationship CRUD, upsert, similarity search, graph
// traversal, branching, and hybrid search.
//
// The client communicates directly via HTTP — no CLI subprocess or MCP protocol.
// See design.md Decision 12 for rationale.
package memory

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is a typed HTTP client for the emergent.memory REST API.
type Client struct {
	baseURL    string
	projectID  string
	token      string
	httpClient *http.Client
}

// Config holds the configuration for creating a Memory client.
type Config struct {
	// BaseURL is the Memory server URL (e.g., "https://memory.emergent-company.ai").
	BaseURL string

	// ProjectID is the Memory project UUID.
	ProjectID string

	// Token is the Bearer token for authentication (project token or account token).
	Token string

	// Timeout is the HTTP client timeout. Defaults to 30 seconds.
	Timeout time.Duration
}

// NewClient creates a new Memory API client.
func NewClient(cfg Config) (*Client, error) {
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("memory: BaseURL is required")
	}
	if cfg.ProjectID == "" {
		return nil, fmt.Errorf("memory: ProjectID is required")
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("memory: Token is required")
	}

	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	return &Client{
		baseURL:   strings.TrimRight(cfg.BaseURL, "/"),
		projectID: cfg.ProjectID,
		token:     cfg.Token,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

// do executes an HTTP request with auth headers and project context.
func (c *Client) do(ctx context.Context, method, path string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("memory: marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("memory: create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("X-Project-ID", c.projectID)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("memory: request %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("memory: read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &APIError{
			StatusCode: resp.StatusCode,
			Method:     method,
			Path:       path,
			Body:       string(respBody),
		}
	}

	if result != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("memory: unmarshal response: %w", err)
		}
	}

	return nil
}

// doWithQuery executes a GET request with query parameters.
func (c *Client) doWithQuery(ctx context.Context, path string, params url.Values, result any) error {
	if len(params) > 0 {
		path = path + "?" + params.Encode()
	}
	return c.do(ctx, http.MethodGet, path, nil, result)
}

// APIError represents a non-2xx response from the Memory API.
type APIError struct {
	StatusCode int
	Method     string
	Path       string
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("memory API error: %s %s returned %d: %s", e.Method, e.Path, e.StatusCode, e.Body)
}
