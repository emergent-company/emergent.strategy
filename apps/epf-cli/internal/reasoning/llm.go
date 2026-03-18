package reasoning

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// LLMClient calls an OpenAI-compatible chat completions API.
// Both Ollama and cloud providers (OpenAI, Anthropic via proxy, Google via proxy)
// expose this same interface.
type LLMClient struct {
	baseURL    string
	apiKey     string
	model      string
	httpClient *http.Client
}

// LLMConfig configures an LLM client.
type LLMConfig struct {
	// BaseURL is the API base (e.g., "http://localhost:11434" for Ollama,
	// "https://api.openai.com" for OpenAI).
	BaseURL string

	// APIKey is the Bearer token (empty for Ollama local).
	APIKey string

	// Model is the model name (e.g., "llama3.2:8b", "gpt-4o-mini", "claude-sonnet-4-20250514").
	Model string

	// Timeout for HTTP requests. Defaults to 60s.
	Timeout time.Duration
}

// NewLLMClient creates a new LLM client.
func NewLLMClient(cfg LLMConfig) *LLMClient {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 60 * time.Second
	}
	return &LLMClient{
		baseURL: cfg.BaseURL,
		apiKey:  cfg.APIKey,
		model:   cfg.Model,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// chatRequest is the OpenAI chat completions request format.
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatMessage struct {
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
	Content    string
	TokenUsage TokenUsage
}

// Chat sends a chat completion request and returns the response.
func (c *LLMClient) Chat(ctx context.Context, systemPrompt, userPrompt string, temperature float64) (*ChatResult, error) {
	req := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: temperature,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal chat request: %w", err)
	}

	// Ollama uses /api/chat, OpenAI uses /v1/chat/completions
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
		return nil, fmt.Errorf("LLM request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read LLM response: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("LLM API error %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("unmarshal LLM response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("LLM returned no choices")
	}

	return &ChatResult{
		Content: chatResp.Choices[0].Message.Content,
		TokenUsage: TokenUsage{
			InputTokens:  chatResp.Usage.PromptTokens,
			OutputTokens: chatResp.Usage.CompletionTokens,
		},
	}, nil
}

// Model returns the model name this client is configured with.
func (c *LLMClient) Model() string {
	return c.model
}
