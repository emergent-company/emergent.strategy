// Package llm provides an OpenAI-compatible chat completions client.
// Works with OpenAI, Anthropic (via proxy), Ollama, and any provider
// exposing the /v1/chat/completions endpoint.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Config configures an LLM client.
type Config struct {
	// BaseURL is the API base (e.g., "http://localhost:11434" for Ollama,
	// "https://api.openai.com" for OpenAI).
	BaseURL string

	// APIKey is the Bearer token (empty for Ollama local).
	APIKey string

	// Model is the model name (e.g., "llama3.2:8b", "gpt-4o-mini").
	Model string

	// Timeout for HTTP requests. Defaults to 60s.
	Timeout time.Duration
}

// Client calls an OpenAI-compatible chat completions API.
type Client struct {
	baseURL    string
	apiKey     string
	model      string
	httpClient *http.Client
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
	return &Client{
		baseURL: cfg.BaseURL,
		apiKey:  cfg.APIKey,
		model:   cfg.Model,
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

func (c *Client) do(ctx context.Context, req chatRequest) (*ChatResult, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal chat request: %w", err)
	}

	endpoint := c.baseURL + "/v1/chat/completions"

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
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
		return nil, fmt.Errorf("llm API error %d: %s", resp.StatusCode, string(respBody))
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
