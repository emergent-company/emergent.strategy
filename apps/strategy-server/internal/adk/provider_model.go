// Package adk adapts strategy-server's own abstractions onto the Google ADK Go
// v2 runtime: the LLM provider seam becomes an ADK model, and (in later steps)
// the AIM cycle becomes an ADK workflow graph backed by ADK session
// persistence.
//
// Keeping every ADK-facing translation in this one package means the rest of
// the codebase continues to depend only on domain types, so an ADK upgrade has
// a single blast radius.
package adk

import (
	"context"
	"fmt"
	"iter"
	"strings"

	adkmodel "google.golang.org/adk/v2/model"
	"google.golang.org/genai"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/llm"
)

// genai role values. ADK speaks the genai content vocabulary, where the
// assistant turn is "model" rather than OpenAI's "assistant".
const (
	genaiRoleUser  = "user"
	genaiRoleModel = "model"
)

// jsonMIMEType is how ADK/genai request structured JSON output. It maps onto
// our provider-neutral llm.FormatJSON.
const jsonMIMEType = "application/json"

// ProviderModel adapts an llm.Provider to the ADK model.LLM interface, so ADK
// agent nodes generate through the same configured provider — and the same
// classified *llm.APIError contract — as direct domain callers.
//
// The provider seam is non-streaming by design (see llm.Provider). ADK's
// interface is streaming-shaped, so GenerateContent yields exactly one
// response. That is legitimate: ADK treats a single non-partial response as a
// complete turn.
type ProviderModel struct {
	provider llm.Provider
}

// Compile-time assertion: the adapter satisfies ADK's model interface.
var _ adkmodel.LLM = (*ProviderModel)(nil)

// NewProviderModel wraps an llm.Provider as an ADK model.
//
// Returns a genuinely nil *ProviderModel when provider is nil, preserving the
// nil-handling contract described on llm.Provider: the LLM is optional, and a
// typed nil hiding inside a non-nil interface would panic at generation time
// instead of letting callers degrade.
func NewProviderModel(provider llm.Provider) *ProviderModel {
	if provider == nil {
		return nil
	}
	return &ProviderModel{provider: provider}
}

// Name returns the underlying model identifier.
func (m *ProviderModel) Name() string {
	return m.provider.Model()
}

// GenerateContent runs one generation through the wrapped provider.
//
// The stream argument is accepted for interface conformance but does not change
// behaviour: the provider seam has no streaming path, so the result is always
// delivered as a single complete (non-partial) response.
func (m *ProviderModel) GenerateContent(ctx context.Context, req *adkmodel.LLMRequest, _ bool) iter.Seq2[*adkmodel.LLMResponse, error] {
	return func(yield func(*adkmodel.LLMResponse, error) bool) {
		if req == nil {
			yield(nil, fmt.Errorf("adk: nil LLMRequest"))
			return
		}

		messages, err := requestToMessages(req)
		if err != nil {
			yield(nil, err)
			return
		}

		result, err := m.provider.ChatWithFormat(ctx, messages, temperatureOf(req), formatOf(req))
		if err != nil {
			// Surface the classified *llm.APIError unwrapped so ADK callers can
			// use errors.As / llm.IsRetryable exactly as domain callers do.
			yield(nil, err)
			return
		}

		yield(resultToResponse(result, m.provider.Model()), nil)
	}
}

// requestToMessages flattens an ADK request into the provider's message slice.
// The system instruction is carried separately by genai, so it is prepended as
// a "system" message — the shape every llm.Provider expects.
func requestToMessages(req *adkmodel.LLMRequest) ([]llm.ChatMessage, error) {
	var messages []llm.ChatMessage

	if req.Config != nil && req.Config.SystemInstruction != nil {
		if sys := contentText(req.Config.SystemInstruction); sys != "" {
			messages = append(messages, llm.ChatMessage{Role: "system", Content: sys})
		}
	}

	for _, c := range req.Contents {
		if c == nil {
			continue
		}
		text := contentText(c)
		if text == "" {
			continue // Nothing to say (e.g. a tool-only turn); skip.
		}
		messages = append(messages, llm.ChatMessage{Role: providerRole(c.Role), Content: text})
	}

	if len(messages) == 0 {
		return nil, fmt.Errorf("adk: request contains no text content to send")
	}
	return messages, nil
}

// contentText concatenates the text parts of a genai Content. Non-text parts
// (inline data, function calls) carry no prose and are skipped — the provider
// seam is text-only.
func contentText(c *genai.Content) string {
	if c == nil {
		return ""
	}
	var b strings.Builder
	for _, p := range c.Parts {
		if p != nil && p.Text != "" {
			b.WriteString(p.Text)
		}
	}
	return b.String()
}

// providerRole maps a genai role onto the provider vocabulary. genai names the
// assistant turn "model"; OpenAI and Anthropic both call it "assistant". An
// empty role defaults to "user", matching the genai documented default.
func providerRole(role string) string {
	switch role {
	case genaiRoleModel:
		return "assistant"
	case "":
		return "user"
	default:
		return role
	}
}

// temperatureOf extracts the requested temperature, defaulting to 0 when the
// caller did not specify one.
func temperatureOf(req *adkmodel.LLMRequest) float64 {
	if req.Config == nil || req.Config.Temperature == nil {
		return 0
	}
	return float64(*req.Config.Temperature)
}

// formatOf maps a genai response MIME type onto the provider's response format.
// Returns nil (plain text) for anything other than JSON.
func formatOf(req *adkmodel.LLMRequest) *llm.ResponseFormat {
	if req.Config != nil && req.Config.ResponseMIMEType == jsonMIMEType {
		return llm.FormatJSON
	}
	return nil
}

// resultToResponse converts a provider result into a complete ADK response.
func resultToResponse(result *llm.ChatResult, modelName string) *adkmodel.LLMResponse {
	return &adkmodel.LLMResponse{
		Content: &genai.Content{
			Role:  genaiRoleModel,
			Parts: []*genai.Part{{Text: result.Content}},
		},
		UsageMetadata: &genai.GenerateContentResponseUsageMetadata{
			PromptTokenCount:     int32(result.InputTokens),                       //nolint:gosec // token counts are small non-negative values
			CandidatesTokenCount: int32(result.OutputTokens),                      //nolint:gosec // token counts are small non-negative values
			TotalTokenCount:      int32(result.InputTokens + result.OutputTokens), //nolint:gosec // token counts are small non-negative values
		},
		ModelVersion: modelName,
		Partial:      false,
		TurnComplete: true,
	}
}
