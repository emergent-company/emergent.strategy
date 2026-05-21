package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChat_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("unexpected method: %s", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("unexpected auth header: %s", r.Header.Get("Authorization"))
		}

		// Verify request body.
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.Model != "test-model" {
			t.Errorf("model=%s, want test-model", req.Model)
		}
		if len(req.Messages) != 2 {
			t.Errorf("messages=%d, want 2", len(req.Messages))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatResponse{
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: `{"result": "test"}`}},
			},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			}{PromptTokens: 100, CompletionTokens: 50},
		})
	}))
	defer server.Close()

	client := New(Config{
		BaseURL: server.URL,
		APIKey:  "test-key",
		Model:   "test-model",
	})

	result, err := client.Chat(context.Background(), []ChatMessage{
		{Role: "system", Content: "You are a helper."},
		{Role: "user", Content: "Say hello."},
	}, 0.5)
	if err != nil {
		t.Fatalf("chat: %v", err)
	}
	if result.Content != `{"result": "test"}` {
		t.Errorf("content=%q, want {\"result\": \"test\"}", result.Content)
	}
	if result.InputTokens != 100 {
		t.Errorf("input_tokens=%d, want 100", result.InputTokens)
	}
	if result.OutputTokens != 50 {
		t.Errorf("output_tokens=%d, want 50", result.OutputTokens)
	}
}

func TestChat_NoAPIKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Error("expected no auth header for Ollama-style client")
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatResponse{
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: "hello"}},
			},
		})
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, Model: "llama3.2"})
	result, err := client.Chat(context.Background(), []ChatMessage{
		{Role: "user", Content: "hi"},
	}, 0.0)
	if err != nil {
		t.Fatalf("chat: %v", err)
	}
	if result.Content != "hello" {
		t.Errorf("content=%q, want hello", result.Content)
	}
}

func TestChat_APIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error": "rate limited"}`))
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, Model: "test"})
	_, err := client.Chat(context.Background(), []ChatMessage{
		{Role: "user", Content: "hi"},
	}, 0.0)
	if err == nil {
		t.Fatal("expected error for 429 response")
	}
}

func TestNew_NilForEmptyURL(t *testing.T) {
	client := New(Config{Model: "test"})
	if client != nil {
		t.Error("expected nil client for empty base URL")
	}
}

// TestChatWithFormat_JSONObjectMode verifies that ChatWithFormat sends
// response_format: {"type": "json_object"} in the request body.
func TestChatWithFormat_JSONObjectMode(t *testing.T) {
	var capturedFormat *ResponseFormat
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		capturedFormat = req.ResponseFormat

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatResponse{ //nolint:errcheck
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: `{"updated":false,"explanation":"already aligned"}`}},
			},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			}{PromptTokens: 80, CompletionTokens: 20},
		})
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, Model: "test"})
	result, err := client.ChatWithFormat(context.Background(), []ChatMessage{
		{Role: "system", Content: "You are a helper."},
		{Role: "user", Content: "Fix this."},
	}, 0.3, FormatJSON)
	if err != nil {
		t.Fatalf("ChatWithFormat: %v", err)
	}

	// Verify request had response_format set.
	if capturedFormat == nil {
		t.Fatal("expected response_format in request, got nil")
	}
	if capturedFormat.Type != "json_object" {
		t.Errorf("response_format.type=%q, want json_object", capturedFormat.Type)
	}

	// Verify token counts propagated.
	if result.InputTokens != 80 {
		t.Errorf("input_tokens=%d, want 80", result.InputTokens)
	}
	if result.OutputTokens != 20 {
		t.Errorf("output_tokens=%d, want 20", result.OutputTokens)
	}
}

// TestChatWithFormat_NilFormat verifies nil format omits response_format from request.
func TestChatWithFormat_NilFormat(t *testing.T) {
	var capturedFormat *ResponseFormat
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		capturedFormat = req.ResponseFormat
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatResponse{ //nolint:errcheck
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: "plain text"}},
			},
		})
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, Model: "test"})
	if _, err := client.ChatWithFormat(context.Background(), []ChatMessage{
		{Role: "user", Content: "hi"},
	}, 0.5, nil); err != nil {
		t.Fatalf("ChatWithFormat: %v", err)
	}

	if capturedFormat != nil {
		t.Errorf("expected nil response_format in request, got %+v", capturedFormat)
	}
}

// TestModelSelector_DefaultReturnsConfiguredModel verifies DefaultModelSelector
// returns the same config for all task types.
func TestModelSelector_DefaultReturnsConfiguredModel(t *testing.T) {
	cfg := Config{BaseURL: "http://example.com", Model: "gpt-4o"}
	sel := NewDefaultModelSelector(cfg)

	for _, task := range []TaskType{
		TaskSignalClassification,
		TaskAssessmentEnrichment,
		TaskCalibrationReasoning,
		TaskSignalResolution,
	} {
		got := sel.SelectModel(task)
		if got.Model != cfg.Model {
			t.Errorf("task %s: model=%q, want %q", task, got.Model, cfg.Model)
		}
		if got.BaseURL != cfg.BaseURL {
			t.Errorf("task %s: baseURL=%q, want %q", task, got.BaseURL, cfg.BaseURL)
		}
	}
}
