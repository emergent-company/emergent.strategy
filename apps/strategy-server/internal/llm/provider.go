package llm

import "context"

// Provider makes a single LLM call. Implementations own the wire format and the
// authentication scheme; callers depend only on this interface and the shared
// value types (ChatMessage, ChatResult, ResponseFormat) plus the classified
// *APIError contract.
//
// This is the Ring 1 seam: inessential differences between providers (OpenAI
// chat/completions vs Anthropic Messages; static Bearer key vs Vertex ADC vs
// AWS SigV4) are hidden here so that no caller — and no ADK node — needs to
// know which provider is configured.
//
// Implementations:
//   - *Client       — OpenAI-compatible chat/completions (also serves Vertex AI
//     via its OpenAI-compatible endpoint and an oauth2.TokenSource).
//
// # Nil handling
//
// The LLM is optional: when unconfigured the server degrades to
// agent-orchestrated/formula mode. Callers therefore check `provider != nil`.
// Never assign a typed nil pointer (e.g. a nil *Client) to a Provider variable
// — that produces a non-nil interface holding a nil pointer and defeats every
// downstream nil check. Always nil-check the concrete type before converting:
//
//	c := llm.New(cfg) // *Client, may be nil
//	if c == nil {
//	    return nil // untyped nil → genuine nil interface
//	}
//	var p llm.Provider = c
type Provider interface {
	// Chat sends a chat completion request and returns the response.
	// Equivalent to ChatWithFormat with a nil format (plain text).
	Chat(ctx context.Context, messages []ChatMessage, temperature float64) (*ChatResult, error)

	// ChatWithFormat sends a chat completion request with an optional response
	// format. Pass FormatJSON to request structured JSON output; pass nil or
	// FormatText for plain text.
	ChatWithFormat(ctx context.Context, messages []ChatMessage, temperature float64, format *ResponseFormat) (*ChatResult, error)

	// Ping performs a minimal live generation call to verify the provider is
	// reachable, the credentials are accepted, and the configured model is
	// usable. Returns nil on success or a classified *APIError. This is the
	// authoritative connectivity check — a non-nil Provider does NOT imply the
	// provider will accept generation requests.
	Ping(ctx context.Context) error

	// Model returns the model name this provider is configured with.
	Model() string
}

// Compile-time assertion: the OpenAI-compatible client is a Provider.
var _ Provider = (*Client)(nil)
