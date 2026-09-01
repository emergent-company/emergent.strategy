package llm

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/oauth2"
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
		w.Write([]byte(`{"error": {"message": "rate limited"}}`)) //nolint:errcheck
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, Model: "test"})
	_, err := client.Chat(context.Background(), []ChatMessage{
		{Role: "user", Content: "hi"},
	}, 0.0)
	if err == nil {
		t.Fatal("expected error for 429 response")
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.Kind != KindRateLimited {
		t.Errorf("kind=%q, want %q", apiErr.Kind, KindRateLimited)
	}
	if !IsRetryable(err) {
		t.Error("429 should be retryable")
	}
}

// TestChat_AccessDenied reproduces the real Google AI Studio 403 that crashed
// the AIM cycle and asserts the error is classified, non-retryable, and carries
// an actionable message.
func TestChat_AccessDenied(t *testing.T) {
	// Verbatim Google AI Studio body (JSON array envelope).
	googleBody := `[{
  "error": {
    "code": 403,
    "message": "Your project has been denied access. Please contact support.",
    "status": "PERMISSION_DENIED"
  }
}
]`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(googleBody)) //nolint:errcheck
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, APIKey: "k", Model: "models/gemini-3.5-flash"})
	_, err := client.Chat(context.Background(), []ChatMessage{{Role: "user", Content: "hi"}}, 0.0)
	if err == nil {
		t.Fatal("expected error for 403 response")
	}

	if !IsAccessDenied(err) {
		t.Errorf("expected IsAccessDenied=true for 403, err=%v", err)
	}
	if IsRetryable(err) {
		t.Error("access-denied must not be retryable")
	}

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.Message != "Your project has been denied access. Please contact support." {
		t.Errorf("message=%q, did not extract provider message", apiErr.Message)
	}
	// The rendered error must be human/agent readable and mention model + action.
	msg := apiErr.Error()
	for _, want := range []string{"access denied", "HTTP 403", "models/gemini-3.5-flash", "Action:"} {
		if !strings.Contains(msg, want) {
			t.Errorf("error message missing %q:\n%s", want, msg)
		}
	}
}

func TestClassifyAPIError_Kinds(t *testing.T) {
	cases := []struct {
		name      string
		status    int
		body      string
		wantKind  ErrorKind
		retryable bool
	}{
		{"401 unauthorized", 401, `{"error":{"message":"invalid key"}}`, KindAccessDenied, false},
		{"403 forbidden", 403, `{"error":{"message":"denied"}}`, KindAccessDenied, false},
		{"429 rate limit", 429, `{"error":{"message":"slow down"}}`, KindRateLimited, true},
		{"404 model", 404, `{"error":{"message":"not found"}}`, KindModelNotFound, false},
		{"400 bad request", 400, `{"error":{"message":"bad"}}`, KindBadRequest, false},
		{"500 server", 500, `oops`, KindServerError, true},
		{"418 unknown", 418, `teapot`, KindUnknown, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := classifyAPIError(tc.status, tc.body, "example.com", "m")
			if e.Kind != tc.wantKind {
				t.Errorf("kind=%q, want %q", e.Kind, tc.wantKind)
			}
			if e.Retryable != tc.retryable {
				t.Errorf("retryable=%v, want %v", e.Retryable, tc.retryable)
			}
		})
	}
}

func TestPing_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatResponse{ //nolint:errcheck
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{{Message: struct {
				Content string `json:"content"`
			}{Content: "pong"}}},
		})
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, APIKey: "k", Model: "m"})
	if err := client.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: unexpected error: %v", err)
	}
}

func TestPing_AccessDenied(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"error":{"message":"denied"}}`)) //nolint:errcheck
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, APIKey: "k", Model: "m"})
	err := client.Ping(context.Background())
	if err == nil {
		t.Fatal("expected Ping to fail on 403")
	}
	if !IsAccessDenied(err) {
		t.Errorf("expected access-denied classification, got: %v", err)
	}
}

// staticTokenSource is a test oauth2.TokenSource returning a fixed token.
type staticTokenSource struct {
	tok   string
	calls int
}

func (s *staticTokenSource) Token() (*oauth2.Token, error) {
	s.calls++
	return &oauth2.Token{AccessToken: s.tok, TokenType: "Bearer"}, nil
}

// TestVertexStyle_TokenSourceAndPath verifies that when a TokenSource and a
// custom CompletionsPath are configured (the Vertex AI case), the client uses
// the OAuth token for Authorization and posts to BaseURL+CompletionsPath.
func TestVertexStyle_TokenSourceAndPath(t *testing.T) {
	ts := &staticTokenSource{tok: "vertex-token-abc"}
	var gotPath, gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatResponse{ //nolint:errcheck
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{{Message: struct {
				Content string `json:"content"`
			}{Content: "ok"}}},
		})
	}))
	defer server.Close()

	client := New(Config{
		BaseURL:         server.URL + "/v1/projects/p/locations/global/endpoints/openapi",
		TokenSource:     ts,
		CompletionsPath: "/chat/completions",
		Model:           "google/gemini-3.5-flash",
	})
	if _, err := client.Chat(context.Background(), []ChatMessage{{Role: "user", Content: "hi"}}, 0.0); err != nil {
		t.Fatalf("Chat: %v", err)
	}

	wantPath := "/v1/projects/p/locations/global/endpoints/openapi/chat/completions"
	if gotPath != wantPath {
		t.Errorf("path=%q, want %q", gotPath, wantPath)
	}
	if gotAuth != "Bearer vertex-token-abc" {
		t.Errorf("auth header=%q, want Bearer vertex-token-abc", gotAuth)
	}
	if ts.calls == 0 {
		t.Error("expected TokenSource to be consulted")
	}
}

// failingTokenSource always fails to mint a token (e.g. ADC missing).
type failingTokenSource struct{}

func (failingTokenSource) Token() (*oauth2.Token, error) {
	return nil, errors.New("no credentials")
}

func TestTokenSource_FailureClassifiedAsAccessDenied(t *testing.T) {
	client := New(Config{
		BaseURL:     "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi",
		TokenSource: failingTokenSource{},
		Model:       "google/gemini-3.5-flash",
	})
	err := client.Ping(context.Background())
	if err == nil {
		t.Fatal("expected error when token source fails")
	}
	if !IsAccessDenied(err) {
		t.Errorf("token-fetch failure should classify as access-denied, got: %v", err)
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

// TestReasoningModelAdaptation verifies the client self-heals against
// reasoning-family models (gpt-5.x, o-series) that reject the legacy
// max_tokens parameter and non-default temperature values, and that the
// adaptation is sticky (subsequent calls send the adapted shape immediately).
func TestReasoningModelAdaptation(t *testing.T) {
	okBody := `{"choices":[{"message":{"content":"pong"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`

	var calls int
	var requests []chatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		requests = append(requests, req)

		w.Header().Set("Content-Type", "application/json")
		if req.MaxTokens > 0 {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":{"message":"Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."}}`))
			return
		}
		if req.Temperature != 0 {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":{"message":"Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported."}}`))
			return
		}
		w.Write([]byte(okBody))
	}))
	defer server.Close()

	client := New(Config{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-5.5"})

	// Ping sets MaxTokens: first call is rejected, retry must carry
	// max_completion_tokens instead.
	if err := client.Ping(context.Background()); err != nil {
		t.Fatalf("ping should succeed after adaptation: %v", err)
	}
	if calls != 2 {
		t.Fatalf("calls=%d after Ping, want 2 (reject + adapted retry)", calls)
	}
	if requests[1].MaxTokens != 0 || requests[1].MaxCompletionTokens != requests[0].MaxTokens {
		t.Errorf("retry request: max_tokens=%d max_completion_tokens=%d, want 0/%d",
			requests[1].MaxTokens, requests[1].MaxCompletionTokens, requests[0].MaxTokens)
	}

	// Chat with a custom temperature: rejected once, then retried without it.
	result, err := client.Chat(context.Background(), []ChatMessage{{Role: "user", Content: "ping"}}, 0.2)
	if err != nil {
		t.Fatalf("chat should succeed after temperature adaptation: %v", err)
	}
	if result.Content != "pong" {
		t.Errorf("content=%q, want pong", result.Content)
	}
	if calls != 4 {
		t.Fatalf("calls=%d after Chat, want 4 (temp reject + adapted retry)", calls)
	}
	if requests[3].Temperature != 0 {
		t.Errorf("retry request still carries temperature=%v", requests[3].Temperature)
	}

	// Stickiness: both adaptations remembered — next Ping succeeds first try.
	if err := client.Ping(context.Background()); err != nil {
		t.Fatalf("second ping: %v", err)
	}
	if calls != 5 {
		t.Fatalf("calls=%d after second Ping, want 5 (no extra rejection roundtrip)", calls)
	}
	if requests[4].MaxCompletionTokens == 0 || requests[4].MaxTokens != 0 {
		t.Errorf("sticky request: max_tokens=%d max_completion_tokens=%d, want 0/nonzero",
			requests[4].MaxTokens, requests[4].MaxCompletionTokens)
	}
}
