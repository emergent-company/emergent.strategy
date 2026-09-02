package llm

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestProvider_ClientSatisfiesInterface documents that the OpenAI-compatible
// client is usable wherever a Provider is expected, and that the interface
// surface is reachable through the interface (not just the concrete type).
func TestProvider_ClientSatisfiesInterface(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":1,"completion_tokens":2}}`))
	}))
	defer server.Close()

	var p Provider = New(Config{BaseURL: server.URL, APIKey: "k", Model: "test-model"})

	if got := p.Model(); got != "test-model" {
		t.Errorf("Model()=%q, want test-model", got)
	}

	res, err := p.Chat(t.Context(), []ChatMessage{{Role: "user", Content: "hello"}}, 0)
	if err != nil {
		t.Fatalf("Chat via Provider: %v", err)
	}
	if res.Content != "hi" {
		t.Errorf("Content=%q, want hi", res.Content)
	}
	if res.InputTokens != 1 || res.OutputTokens != 2 {
		t.Errorf("tokens=(%d,%d), want (1,2)", res.InputTokens, res.OutputTokens)
	}

	if err := p.Ping(t.Context()); err != nil {
		t.Errorf("Ping via Provider: %v", err)
	}
}

// TestProvider_NilGuardYieldsGenuineNilInterface pins the nil-handling contract
// the whole codebase depends on.
//
// The LLM is optional: every caller branches on `provider != nil` to choose
// between autonomous and skeleton/formula mode. The hazard is that assigning a
// typed nil *Client straight into a Provider variable produces a NON-nil
// interface holding a nil pointer — silently defeating those checks and
// panicking later at the call site instead of degrading gracefully.
//
// The rule: nil-check the concrete type BEFORE converting, and return untyped
// nil. providerOrNil below mirrors the guard used in cmd_serve.go's setupLLM
// and the skill-executor wiring.
func TestProvider_NilGuardYieldsGenuineNilInterface(t *testing.T) {
	// New returns a nil *Client when BaseURL is empty (LLM unconfigured).
	unconfigured := New(Config{})
	if unconfigured != nil {
		t.Fatalf("New with empty BaseURL should return nil *Client, got %v", unconfigured)
	}

	if got := providerOrNil(unconfigured); got != nil {
		t.Errorf("providerOrNil(nil *Client) = %v, want a genuinely nil interface", got)
	}

	// A real client must still round-trip to a non-nil interface.
	if got := providerOrNil(New(Config{BaseURL: "http://example.invalid", Model: "m"})); got == nil {
		t.Error("providerOrNil(non-nil *Client) returned nil interface")
	}
}

// providerOrNil mirrors the guard pattern used in cmd_serve.go's setupLLM:
// convert to the interface only when the concrete pointer is non-nil.
func providerOrNil(c *Client) Provider {
	if c == nil {
		return nil
	}
	return c
}
