// Package llm provides an OpenAI-compatible chat completions client.
// Works with OpenAI, Anthropic (via proxy), Ollama, Google Vertex AI (via its
// OpenAI-compatible endpoint), and any provider exposing a chat/completions API.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// ErrorKind classifies an LLM API failure so humans and agents can act on it
// without parsing raw provider JSON.
type ErrorKind string

const (
	// KindAccessDenied — the provider rejected the credentials or the
	// project/account is suspended or not entitled (HTTP 401/403). NOT retryable.
	// Requires a human to fix billing, project access, or the API key.
	KindAccessDenied ErrorKind = "access_denied"
	// KindRateLimited — too many requests or quota exceeded (HTTP 429). Retryable
	// after a backoff.
	KindRateLimited ErrorKind = "rate_limited"
	// KindModelNotFound — the configured model name is invalid or unavailable
	// (HTTP 404, or a "model not found" message). Requires a config change.
	KindModelNotFound ErrorKind = "model_not_found"
	// KindBadRequest — the request was malformed (HTTP 400). A code/config bug.
	KindBadRequest ErrorKind = "bad_request"
	// KindServerError — the provider had an internal error (HTTP 5xx). Retryable.
	KindServerError ErrorKind = "server_error"
	// KindUnknown — an unclassified non-2xx response.
	KindUnknown ErrorKind = "unknown"
)

// APIError is a classified LLM provider error. It carries the HTTP status, a
// human/agent-readable summary, the actionable remediation, and the raw provider
// body for debugging. Use errors.As to inspect it; check Kind to branch.
type APIError struct {
	Kind       ErrorKind
	StatusCode int
	Provider   string // host of the provider endpoint, e.g. "generativelanguage.googleapis.com"
	Model      string
	Message    string // concise provider message, extracted when possible
	Action     string // what a human/agent should do about it
	Retryable  bool
	RawBody    string // raw response body (truncated) for debugging
}

// Error renders a single-line, immediately-recognizable message of the form:
//
//	LLM access denied (HTTP 403) from generativelanguage.googleapis.com [model=models/gemini-3.5-flash]: <message>. Action: <remediation>
func (e *APIError) Error() string {
	var b strings.Builder
	fmt.Fprintf(&b, "LLM %s (HTTP %d)", e.Kind.label(), e.StatusCode)
	if e.Provider != "" {
		fmt.Fprintf(&b, " from %s", e.Provider)
	}
	if e.Model != "" {
		fmt.Fprintf(&b, " [model=%s]", e.Model)
	}
	if e.Message != "" {
		fmt.Fprintf(&b, ": %s", e.Message)
	}
	if e.Action != "" {
		fmt.Fprintf(&b, ". Action: %s", e.Action)
	}
	return b.String()
}

// IsRetryable reports whether retrying the failed call could plausibly succeed.
// Implements the retry-classification interface used by callers (e.g. skillexec).
func (e *APIError) IsRetryable() bool { return e.Retryable }

func (k ErrorKind) label() string {
	switch k {
	case KindAccessDenied:
		return "access denied"
	case KindRateLimited:
		return "rate limited"
	case KindModelNotFound:
		return "model not found"
	case KindBadRequest:
		return "bad request"
	case KindServerError:
		return "provider error"
	default:
		return "API error"
	}
}

// IsAccessDenied reports whether err is (or wraps) an LLM access-denied error.
// This is the common case agents and the AIM workflow should special-case: the
// run cannot proceed until a human fixes provider credentials/billing.
func IsAccessDenied(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.Kind == KindAccessDenied
}

// IsRetryable reports whether err is (or wraps) a transient LLM error worth
// retrying (rate limit or provider 5xx).
func IsRetryable(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.Retryable
}

// providerMessage holds the common error envelope shapes returned by
// OpenAI-compatible and Google providers.
type providerMessage struct {
	Error struct {
		Message string `json:"message"`
		Status  string `json:"status"`
		Code    any    `json:"code"`
	} `json:"error"`
}

// classifyAPIError builds a classified APIError from a non-2xx response.
func classifyAPIError(statusCode int, body, provider, model string) *APIError {
	msg := extractProviderMessage(body)

	e := &APIError{
		StatusCode: statusCode,
		Provider:   provider,
		Model:      model,
		Message:    msg,
		RawBody:    truncate(body, 800),
	}

	switch {
	case statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden:
		e.Kind = KindAccessDenied
		e.Retryable = false
		e.Action = "Verify the LLM API key and that the provider project/account is active and entitled (check billing, project access, and that the key is not revoked). This is not retryable and requires a human to fix the provider account."
	case statusCode == http.StatusTooManyRequests:
		e.Kind = KindRateLimited
		e.Retryable = true
		e.Action = "Back off and retry; if persistent, raise the provider quota."
	case statusCode == http.StatusNotFound || strings.Contains(strings.ToLower(msg), "model"):
		e.Kind = KindModelNotFound
		e.Retryable = false
		e.Action = fmt.Sprintf("Check that LLM_MODEL (%q) is a valid, available model for this provider.", model)
	case statusCode == http.StatusBadRequest:
		e.Kind = KindBadRequest
		e.Retryable = false
		e.Action = "The request was rejected as malformed; this is likely a configuration or code issue."
	case statusCode >= 500:
		e.Kind = KindServerError
		e.Retryable = true
		e.Action = "Transient provider error; retry after a short delay."
	default:
		e.Kind = KindUnknown
		e.Retryable = false
		e.Action = "Inspect the raw provider response for details."
	}
	return e
}

// extractProviderMessage pulls the human message out of common provider error
// envelopes, falling back to a truncated raw body.
func extractProviderMessage(body string) string {
	trimmed := strings.TrimSpace(body)
	// Google AI Studio returns a JSON array wrapping the error envelope.
	candidate := trimmed
	if strings.HasPrefix(trimmed, "[") {
		var arr []providerMessage
		if err := json.Unmarshal([]byte(trimmed), &arr); err == nil && len(arr) > 0 && arr[0].Error.Message != "" {
			return arr[0].Error.Message
		}
	}
	var pm providerMessage
	if err := json.Unmarshal([]byte(candidate), &pm); err == nil && pm.Error.Message != "" {
		return pm.Error.Message
	}
	return truncate(trimmed, 300)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…(truncated)"
}

// Config configures an LLM client.
type Config struct {
	// BaseURL is the API base (e.g., "http://localhost:11434" for Ollama,
	// "https://api.openai.com" for OpenAI). For Vertex AI's OpenAI-compatible
	// endpoint this is e.g.
	// "https://aiplatform.googleapis.com/v1/projects/<p>/locations/<l>/endpoints/openapi".
	BaseURL string

	// APIKey is the static Bearer token (empty for Ollama local). Ignored when
	// TokenSource is set.
	APIKey string

	// TokenSource, when set, supplies a (refreshing) OAuth2 bearer token for
	// every request and takes precedence over APIKey. Use this for Google Vertex
	// AI via Application Default Credentials, where tokens expire hourly.
	TokenSource oauth2.TokenSource

	// CompletionsPath overrides the path appended to BaseURL for chat
	// completions. Defaults to "/v1/chat/completions". Vertex's OpenAI endpoint
	// uses "/chat/completions" (the "/v1/..." is already in BaseURL).
	CompletionsPath string

	// Model is the model name (e.g., "llama3.2:8b", "gpt-4o-mini",
	// "google/gemini-3.5-flash" for Vertex).
	Model string

	// Timeout for HTTP requests. Defaults to 60s.
	Timeout time.Duration
}

// defaultCompletionsPath is the standard OpenAI chat completions path.
const defaultCompletionsPath = "/v1/chat/completions"

// Client calls an OpenAI-compatible chat completions API.
type Client struct {
	baseURL         string
	apiKey          string
	tokenSource     oauth2.TokenSource
	completionsPath string
	model           string
	httpClient      *http.Client
}

// New creates a new LLM client. Returns nil if baseURL is empty.
func New(cfg Config) *Client {
	if cfg.BaseURL == "" {
		return nil
	}
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 60 * time.Second
	}
	path := cfg.CompletionsPath
	if path == "" {
		path = defaultCompletionsPath
	}
	return &Client{
		baseURL:         strings.TrimRight(cfg.BaseURL, "/"),
		apiKey:          cfg.APIKey,
		tokenSource:     cfg.TokenSource,
		completionsPath: path,
		model:           cfg.Model,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// ResponseFormat controls the output format for structured output.
// Use FormatJSON for json_object mode (any JSON object).
// Use FormatText for plain text (default behaviour, same as omitting the field).
type ResponseFormat struct {
	Type string `json:"type"` // "text" | "json_object"
}

// FormatJSON is a convenience value for json_object structured output.
var FormatJSON = &ResponseFormat{Type: "json_object"}

// FormatText is a convenience value for plain text output (default).
var FormatText = &ResponseFormat{Type: "text"}

// chatRequest is the OpenAI chat completions request format.
type chatRequest struct {
	Model          string          `json:"model"`
	Messages       []ChatMessage   `json:"messages"`
	Temperature    float64         `json:"temperature,omitempty"`
	MaxTokens      int             `json:"max_tokens,omitempty"`
	ResponseFormat *ResponseFormat `json:"response_format,omitempty"`
}

// ChatMessage represents a single message in a chat conversation.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatResponse is the OpenAI chat completions response format.
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

// ChatResult holds the response from an LLM call.
type ChatResult struct {
	Content      string `json:"content"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
}

// ChatWithFormat sends a chat completion request with an optional response format.
// Pass FormatJSON to request json_object structured output.
// Pass nil or FormatText for plain text (same as Chat).
func (c *Client) ChatWithFormat(ctx context.Context, messages []ChatMessage, temperature float64, format *ResponseFormat) (*ChatResult, error) {
	req := chatRequest{
		Model:          c.model,
		Messages:       messages,
		Temperature:    temperature,
		ResponseFormat: format,
	}
	return c.do(ctx, req)
}

// Chat sends a chat completion request and returns the response.
// Equivalent to ChatWithFormat with a nil format (plain text).
func (c *Client) Chat(ctx context.Context, messages []ChatMessage, temperature float64) (*ChatResult, error) {
	return c.ChatWithFormat(ctx, messages, temperature, nil)
}

// Ping performs a minimal live generation call to verify the provider is
// reachable, the credentials are accepted, and the configured model is usable.
// It returns nil on success, or a classified *APIError (use IsAccessDenied /
// IsRetryable) describing exactly why the provider is unavailable. This is the
// authoritative connectivity check — a non-nil client does NOT imply the
// provider will accept generation requests (the project may be denied or
// suspended). Callers should pass a context with a short timeout.
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.do(ctx, chatRequest{
		Model:     c.model,
		Messages:  []ChatMessage{{Role: "user", Content: "ping"}},
		MaxTokens: 1,
	})
	return err
}

// setAuthHeader sets the Authorization header. When a TokenSource is configured
// (e.g. Vertex via ADC) it fetches a fresh token, which auto-refreshes when
// expired. Falls back to the static API key. A token-fetch failure is returned
// as a classified access-denied error.
func (c *Client) setAuthHeader(req *http.Request) error {
	if c.tokenSource != nil {
		tok, err := c.tokenSource.Token()
		if err != nil {
			return &APIError{
				Kind:      KindAccessDenied,
				Provider:  providerHost(c.baseURL),
				Model:     c.model,
				Message:   fmt.Sprintf("failed to obtain OAuth token: %v", err),
				Action:    "Verify Application Default Credentials are present and valid (run `gcloud auth application-default login`) and that the service account/user can access the Vertex AI project.",
				Retryable: false,
			}
		}
		tok.SetAuthHeader(req)
		return nil
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	return nil
}

func (c *Client) do(ctx context.Context, req chatRequest) (*ChatResult, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal chat request: %w", err)
	}

	endpoint := c.baseURL + c.completionsPath

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if authErr := c.setAuthHeader(httpReq); authErr != nil {
		return nil, authErr
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("llm request failed: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read llm response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, classifyAPIError(resp.StatusCode, string(respBody), providerHost(c.baseURL), c.model)
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("unmarshal llm response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices")
	}

	return &ChatResult{
		Content:      chatResp.Choices[0].Message.Content,
		InputTokens:  chatResp.Usage.PromptTokens,
		OutputTokens: chatResp.Usage.CompletionTokens,
	}, nil
}

// Model returns the model name this client is configured with.
func (c *Client) Model() string {
	return c.model
}

// providerHost extracts the host from a base URL for use in error messages.
// Falls back to the raw base URL if it can't be parsed.
func providerHost(baseURL string) string {
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" {
		return baseURL
	}
	return u.Host
}
