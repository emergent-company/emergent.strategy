package ripple

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/llm"
)

// LLMResolver implements SignalResolver using an OpenAI-compatible LLM provider.
// It generates alignment fixes for autonomous-tier signals by:
// 1. Building a prompt from the signal context, current artifact, and upstream artifact
// 2. Calling the LLM to produce an updated payload
// 3. Parsing the JSON payload from the response
type LLMResolver struct {
	client *llm.Client
	db     *bun.DB // optional — used to load upstream artifact for context enrichment
}

// NewLLMResolver creates a new LLM-backed resolver. Returns nil if client is nil.
func NewLLMResolver(client *llm.Client, db *bun.DB) *LLMResolver {
	if client == nil {
		return nil
	}
	return &LLMResolver{client: client, db: db}
}

// Resolve generates a fix for a signal by calling the LLM.
// Returns nil (not error) if the LLM decides no fix is needed.
func (r *LLMResolver) Resolve(ctx context.Context, signal *domain.RippleSignal, currentPayload json.RawMessage) (*ResolveResult, error) {
	systemPrompt := buildSystemPrompt()
	userPrompt := buildUserPrompt(signal, currentPayload)

	// If we have a DB connection, enrich the prompt with the upstream
	// artifact's content so the LLM can see both sides of the misalignment.
	if r.db != nil {
		var upstream domain.StrategyArtifact
		err := r.db.NewSelect().Model(&upstream).
			Where("sa.artifact_key = ?", signal.SourceKey).
			Where("sa.status = ?", domain.ArtifactStatusActive).
			Limit(1).
			Scan(ctx)
		if err == nil {
			userPrompt = buildUserPromptWithContext(signal, currentPayload, upstream.Payload)
		}
	}

	// Use json_object structured output — the API guarantees valid JSON back,
	// so we avoid brittle markdown-stripping parsing.
	result, err := r.client.ChatWithFormat(ctx, []llm.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}, 0.3, llm.FormatJSON) // low temperature for consistent, conservative fixes
	if err != nil {
		return nil, fmt.Errorf("llm resolve: %w", err)
	}

	// Parse the structured response.
	parsed, parseErr := parseResolveResponse(result.Content)
	if parseErr != nil {
		slog.WarnContext(ctx, "llm_resolver: failed to parse LLM response",
			"signal", signal.ID,
			"input_tokens", result.InputTokens,
			"output_tokens", result.OutputTokens,
			"error", parseErr)
		return nil, nil // graceful: can't parse → skip this signal
	}

	// Propagate token usage into the result.
	parsed.InputTokens = result.InputTokens
	parsed.OutputTokens = result.OutputTokens

	slog.Debug("llm_resolver: resolved signal",
		"signal", signal.ID,
		"updated", parsed.Updated,
		"distance", parsed.Distance,
		"input_tokens", result.InputTokens,
		"output_tokens", result.OutputTokens)

	return parsed, nil
}

func buildSystemPrompt() string {
	return `You are a strategy coherence engine. Your role is to make minimal,
conservative adjustments to strategy artifacts to restore alignment after
upstream changes.

Rules:
1. PRESERVE the strategic direction. Never change the meaning, intent, or
   scope of the artifact. Only tighten alignment with the referenced upstream
   artifact.
2. Make the SMALLEST change that resolves the misalignment. Prefer word-level
   edits over paragraph rewrites.
3. Never add new capabilities, personas, or strategic directions.
4. Never remove existing content unless it directly contradicts the upstream change.
5. Keep the same JSON structure — same keys, same nesting. Only modify values.

You MUST respond with a single JSON object (no markdown, no code fences):

When a fix is applied:
{"updated":true,"new_payload":{...the updated artifact JSON...},"explanation":"Brief description of what changed and why","distance":0.05}

When no fix is needed:
{"updated":false,"explanation":"Artifact is already aligned — no changes needed"}

The "distance" field is your self-assessed semantic distance (0.0-1.0).
Typo-level: ~0.02. Wording tightening: ~0.05-0.10.
Anything above 0.15 means you are changing too much — scale back.`
}

// buildUserPromptWithContext adds the upstream artifact's content to the prompt
// so the LLM can see both the source of truth and the artifact to fix.
func buildUserPromptWithContext(signal *domain.RippleSignal, currentPayload, upstreamPayload json.RawMessage) string {
	var b strings.Builder

	b.WriteString("## Signal\n\n")
	fmt.Fprintf(&b, "Type: %s\n", signal.SignalType)
	fmt.Fprintf(&b, "Severity: %s\n", signal.Severity)
	fmt.Fprintf(&b, "Source artifact (upstream, the reference): %s\n", signal.SourceKey)
	fmt.Fprintf(&b, "Target artifact (to fix): %s\n", signal.TargetKey)
	fmt.Fprintf(&b, "Description: %s\n", signal.Description)

	if signal.Suggestion != nil && *signal.Suggestion != "" {
		fmt.Fprintf(&b, "Suggested action: %s\n", *signal.Suggestion)
	}

	b.WriteString("\n## Upstream Artifact (the source of truth — align the target to this)\n\n")
	b.WriteString("```json\n")
	writeFormattedJSON(&b, upstreamPayload)
	b.WriteString("\n```\n\n")

	b.WriteString("## Target Artifact (this needs fixing)\n\n")
	b.WriteString("```json\n")
	writeFormattedJSON(&b, currentPayload)
	b.WriteString("\n```\n\n")

	b.WriteString("Align the target artifact's content with the upstream artifact's direction. ")
	b.WriteString("Make the SMALLEST change that resolves the misalignment. ")
	b.WriteString("Return ONLY the JSON response object as specified in the system prompt.")

	return b.String()
}

func writeFormattedJSON(b *strings.Builder, payload json.RawMessage) {
	var pretty json.RawMessage
	if err := json.Unmarshal(payload, &pretty); err == nil {
		if formatted, fmtErr := json.MarshalIndent(pretty, "", "  "); fmtErr == nil {
			b.Write(formatted)
			return
		}
	}
	b.Write(payload)
}

func buildUserPrompt(signal *domain.RippleSignal, currentPayload json.RawMessage) string {
	var b strings.Builder

	b.WriteString("## Signal\n\n")
	fmt.Fprintf(&b, "Type: %s\n", signal.SignalType)
	fmt.Fprintf(&b, "Severity: %s\n", signal.Severity)
	fmt.Fprintf(&b, "Source artifact: %s\n", signal.SourceKey)
	fmt.Fprintf(&b, "Target artifact (to fix): %s\n", signal.TargetKey)
	fmt.Fprintf(&b, "Description: %s\n", signal.Description)

	if signal.Suggestion != nil && *signal.Suggestion != "" {
		fmt.Fprintf(&b, "Suggested action: %s\n", *signal.Suggestion)
	}

	b.WriteString("\n## Current Artifact Payload\n\n")
	b.WriteString("```json\n")

	// Pretty-print the payload for readability.
	var pretty json.RawMessage
	if err := json.Unmarshal(currentPayload, &pretty); err == nil {
		formatted, fmtErr := json.MarshalIndent(pretty, "", "  ")
		if fmtErr == nil {
			b.Write(formatted)
		} else {
			b.Write(currentPayload)
		}
	} else {
		b.Write(currentPayload)
	}
	b.WriteString("\n```\n\n")

	b.WriteString("Generate the minimal fix to resolve this signal. ")
	b.WriteString("Return ONLY the JSON response object as specified in the system prompt.")

	return b.String()
}

// parseResolveResponse extracts a ResolveResult from the LLM's text response.
// Handles both raw JSON and JSON wrapped in markdown code blocks.
func parseResolveResponse(content string) (*ResolveResult, error) {
	// Try to extract JSON from markdown code blocks first.
	cleaned := extractJSON(content)

	var raw struct {
		Updated     bool            `json:"updated"`
		NewPayload  json.RawMessage `json:"new_payload"`
		Explanation string          `json:"explanation"`
		Distance    float64         `json:"distance"`
	}

	if err := json.Unmarshal([]byte(cleaned), &raw); err != nil {
		return nil, fmt.Errorf("parse resolve response: %w", err)
	}

	if !raw.Updated {
		return &ResolveResult{
			Updated:     false,
			Explanation: raw.Explanation,
		}, nil
	}

	// Validate that new_payload is valid JSON.
	if !json.Valid(raw.NewPayload) {
		return nil, fmt.Errorf("new_payload is not valid JSON")
	}

	// Clamp distance to reasonable bounds.
	distance := raw.Distance
	if distance < 0 {
		distance = 0
	}
	if distance > 1.0 {
		distance = 1.0
	}

	return &ResolveResult{
		Updated:     true,
		NewPayload:  raw.NewPayload,
		Explanation: raw.Explanation,
		Distance:    distance,
	}, nil
}

// extractJSON tries to pull a JSON object from text that may contain markdown
// code fences or other wrapping.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)

	// Strip markdown code fences.
	if strings.HasPrefix(s, "```json") {
		s = strings.TrimPrefix(s, "```json")
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	} else if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	}

	// Find the first { and last } and extract.
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}

	return s
}
