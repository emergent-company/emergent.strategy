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
