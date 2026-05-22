package skillexec

// LLMResult carries the LLM response content together with token usage metrics.
// It replaces the previous (string, error) return signature so callers can
// track costs and performance.
type LLMResult struct {
	Content      string `json:"content"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
}
