package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// llmReasoner is the base implementation shared by Local, Cloud, and Frontier reasoners.
// It builds prompts, calls the LLM, and parses structured responses.
type llmReasoner struct {
	client *LLMClient
	tier   ModelTier
}

// Evaluate implements the Reasoner interface using an LLM.
func (r *llmReasoner) Evaluate(req EvaluationRequest) (*Assessment, error) {
	systemPrompt := buildSystemPrompt(req)
	userPrompt := buildUserPrompt(req)

	// Lower temperature for mechanical evaluations, higher for strategic
	temperature := 0.2
	if req.Target.InertiaTier <= 3 {
		temperature = 0.4 // Strategic reasoning benefits from slightly more creativity
	}

	result, err := r.client.Chat(context.Background(), systemPrompt, userPrompt, temperature)
	if err != nil {
		return nil, fmt.Errorf("LLM evaluation failed: %w", err)
	}

	assessment, err := parseAssessment(result.Content)
	if err != nil {
		// If parsing fails, return a needs_review verdict
		return &Assessment{
			Verdict:    VerdictNeedsReview,
			Confidence: 0.3,
			Reasoning:  fmt.Sprintf("Failed to parse LLM response: %v. Raw response: %s", err, truncateStr(result.Content, 200)),
			ModelUsed:  r.client.Model(),
			TokensUsed: result.TokenUsage,
		}, nil
	}

	assessment.ModelUsed = r.client.Model()
	assessment.TokensUsed = result.TokenUsage
	return assessment, nil
}

// --- Prompt construction ---

func buildSystemPrompt(req EvaluationRequest) string {
	var b strings.Builder

	b.WriteString(`You are a strategy coherence evaluator for the Emergent Product Framework (EPF).

Your job: determine whether a target node in a strategy graph needs to change because a connected node changed.

You must respond with valid JSON in this exact format:
{
  "verdict": "unchanged" | "modified" | "needs_review",
  "confidence": 0.0-1.0,
  "reasoning": "why this verdict",
  "classification": "mechanical" | "semantic" | "structural" | "creative",
  "proposed_changes": {"property_name": "new_value"} | null
}

Rules:
- "unchanged": The target is still coherent with the change. No update needed.
- "modified": The target should be updated. Provide proposed_changes.
- "needs_review": You're unsure or the change is significant enough to need human review.

Classification rules:
- "mechanical": Deterministic fix (path rename, status update). Auto-applicable.
- "semantic": Meaning-level change (rewording, realignment). Needs review.
- "structural": Structural change (new dependencies, reorganization). Needs approval.
- "creative": Requires generating new content or artifacts. Always needs review.

Confidence guidance:
- 0.9+: Very clear evaluation, high certainty.
- 0.7-0.9: Reasonably confident.
- 0.5-0.7: Uncertain, might benefit from higher-tier reasoning.
- <0.5: Very uncertain, should escalate or flag for review.
`)

	// Add constraints if any
	if len(req.Constraints) > 0 {
		b.WriteString("\nSchema constraints for proposed changes:\n")
		for _, c := range req.Constraints {
			b.WriteString(fmt.Sprintf("- %s: %s = %s\n", c.Field, c.Type, c.Value))
		}
	}

	return b.String()
}

func buildUserPrompt(req EvaluationRequest) string {
	var b strings.Builder

	// Signal (what changed)
	b.WriteString("## Signal (what changed)\n")
	b.WriteString(fmt.Sprintf("Source: %s (%s)\n", req.Signal.SourceNodeKey, req.Signal.SourceNodeType))
	b.WriteString(fmt.Sprintf("Change type: %s\n", req.Signal.ChangeType))
	b.WriteString(fmt.Sprintf("Signal strength: %.2f\n", req.Signal.Strength))
	b.WriteString(fmt.Sprintf("Description: %s\n", req.Signal.Description))
	if req.Signal.Before != "" {
		b.WriteString(fmt.Sprintf("\nBefore:\n%s\n", truncateStr(req.Signal.Before, 500)))
	}
	if req.Signal.After != "" {
		b.WriteString(fmt.Sprintf("\nAfter:\n%s\n", truncateStr(req.Signal.After, 500)))
	}

	// Target (what to evaluate)
	b.WriteString("\n## Target (evaluate this node)\n")
	b.WriteString(fmt.Sprintf("Key: %s\n", req.Target.Key))
	b.WriteString(fmt.Sprintf("Type: %s (inertia tier %d)\n", req.Target.Type, req.Target.InertiaTier))
	b.WriteString("Properties:\n")
	for k, v := range req.Target.Properties {
		vs := fmt.Sprintf("%v", v)
		b.WriteString(fmt.Sprintf("  %s: %s\n", k, truncateStr(vs, 300)))
	}

	// Neighborhood (context)
	if len(req.Neighborhood) > 0 {
		b.WriteString(fmt.Sprintf("\n## Neighborhood (%d connected nodes)\n", len(req.Neighborhood)))
		for _, n := range req.Neighborhood {
			edges := strings.Join(n.EdgeTypes, ", ")
			b.WriteString(fmt.Sprintf("- %s (%s, tier %d) [edges: %s]\n", n.Key, n.Type, n.InertiaTier, edges))
			if name, ok := n.Properties["name"]; ok {
				b.WriteString(fmt.Sprintf("  name: %v\n", name))
			}
			if desc, ok := n.Properties["description"]; ok {
				b.WriteString(fmt.Sprintf("  description: %s\n", truncateStr(fmt.Sprintf("%v", desc), 150)))
			}
		}
	}

	b.WriteString("\n## Question\n")
	b.WriteString("Does the target node need to change given the signal? Respond with JSON only.\n")

	return b.String()
}

// --- Response parsing ---

type llmResponse struct {
	Verdict         string         `json:"verdict"`
	Confidence      float64        `json:"confidence"`
	Reasoning       string         `json:"reasoning"`
	Classification  string         `json:"classification"`
	ProposedChanges map[string]any `json:"proposed_changes"`
}

func parseAssessment(content string) (*Assessment, error) {
	// Extract JSON from the response (LLMs sometimes wrap in markdown code blocks)
	jsonStr := extractJSON(content)

	var resp llmResponse
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		return nil, fmt.Errorf("parse JSON: %w (content: %s)", err, truncateStr(content, 200))
	}

	verdict := VerdictNeedsReview
	switch resp.Verdict {
	case "unchanged":
		verdict = VerdictUnchanged
	case "modified":
		verdict = VerdictModified
	case "needs_review":
		verdict = VerdictNeedsReview
	case "needs_creation":
		verdict = VerdictNeedsCreation
	}

	classification := ClassSemantic
	switch resp.Classification {
	case "mechanical":
		classification = ClassMechanical
	case "semantic":
		classification = ClassSemantic
	case "structural":
		classification = ClassStructural
	case "creative":
		classification = ClassCreative
	}

	return &Assessment{
		Verdict:         verdict,
		Confidence:      resp.Confidence,
		Reasoning:       resp.Reasoning,
		ProposedChanges: resp.ProposedChanges,
		Classification:  classification,
	}, nil
}

// extractJSON pulls a JSON object from a string that might contain markdown code blocks.
func extractJSON(s string) string {
	// Try direct parse first
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "{") {
		return s
	}

	// Extract from ```json ... ``` blocks
	if idx := strings.Index(s, "```json"); idx >= 0 {
		start := idx + 7
		if end := strings.Index(s[start:], "```"); end >= 0 {
			return strings.TrimSpace(s[start : start+end])
		}
	}

	// Extract from ``` ... ``` blocks
	if idx := strings.Index(s, "```"); idx >= 0 {
		start := idx + 3
		// Skip optional language identifier on same line
		if nl := strings.Index(s[start:], "\n"); nl >= 0 {
			start = start + nl + 1
		}
		if end := strings.Index(s[start:], "```"); end >= 0 {
			return strings.TrimSpace(s[start : start+end])
		}
	}

	// Find first { and last }
	if first := strings.Index(s, "{"); first >= 0 {
		if last := strings.LastIndex(s, "}"); last > first {
			return s[first : last+1]
		}
	}

	return s
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
