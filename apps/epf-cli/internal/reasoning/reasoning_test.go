package reasoning

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// mockLLMServer creates a test server that returns predictable chat completion responses.
func mockLLMServer(t *testing.T, responseContent string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			http.Error(w, "not found", 404)
			return
		}

		resp := chatResponse{
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{Message: struct {
					Content string `json:"content"`
				}{Content: responseContent}},
			},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			}{PromptTokens: 150, CompletionTokens: 50},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
}

func TestEvaluateUnchanged(t *testing.T) {
	resp := `{"verdict": "unchanged", "confidence": 0.95, "reasoning": "The feature is still aligned with the updated belief.", "classification": "semantic", "proposed_changes": null}`
	srv := mockLLMServer(t, resp)
	defer srv.Close()

	reasoner := NewLocalReasoner(LLMConfig{BaseURL: srv.URL, Model: "test-model"})

	assessment, err := reasoner.Evaluate(EvaluationRequest{
		Signal: Signal{
			SourceNodeKey:  "Belief:north_star:purpose",
			SourceNodeType: "Belief",
			ChangeType:     "content_modified",
			Description:    "Purpose statement updated",
			Strength:       0.7,
			After:          "We exist to make product strategy semantic and alive.",
		},
		Target: Node{
			Key:         "Feature:feature:fd-020",
			Type:        "Feature",
			InertiaTier: 6,
			Properties:  map[string]any{"name": "Semantic Strategy Engine", "jtbd": "Parse EPF artifacts into a semantic graph"},
		},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	if assessment.Verdict != VerdictUnchanged {
		t.Errorf("Expected unchanged verdict, got %s", assessment.Verdict)
	}
	if assessment.Confidence < 0.9 {
		t.Errorf("Expected high confidence, got %.2f", assessment.Confidence)
	}
	if assessment.ModelUsed != "test-model" {
		t.Errorf("Expected model=test-model, got %s", assessment.ModelUsed)
	}
	if assessment.TokensUsed.Total() != 200 {
		t.Errorf("Expected 200 total tokens, got %d", assessment.TokensUsed.Total())
	}
}

func TestEvaluateModified(t *testing.T) {
	resp := `{"verdict": "modified", "confidence": 0.85, "reasoning": "The feature description should reflect the new positioning.", "classification": "semantic", "proposed_changes": {"description": "Updated description reflecting semantic strategy runtime"}}`
	srv := mockLLMServer(t, resp)
	defer srv.Close()

	reasoner := NewCloudReasoner(LLMConfig{BaseURL: srv.URL, APIKey: "test-key", Model: "test-cloud"})

	assessment, err := reasoner.Evaluate(EvaluationRequest{
		Signal: Signal{
			SourceNodeKey:  "Positioning:strategy_formula:positioning",
			SourceNodeType: "Positioning",
			ChangeType:     "content_modified",
			Description:    "Positioning statement rewritten",
			Strength:       0.8,
		},
		Target: Node{
			Key:         "Feature:feature:fd-020",
			Type:        "Feature",
			InertiaTier: 6,
			Properties:  map[string]any{"name": "Semantic Engine", "description": "Old description"},
		},
		Neighborhood: []Node{
			{Key: "Positioning:strategy_formula:positioning", Type: "Positioning", InertiaTier: 3,
				Properties: map[string]any{"name": "Market Positioning"}, EdgeTypes: []string{"contributes_to"}},
		},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	if assessment.Verdict != VerdictModified {
		t.Errorf("Expected modified verdict, got %s", assessment.Verdict)
	}
	if assessment.ProposedChanges == nil {
		t.Error("Expected proposed changes for modified verdict")
	}
	if assessment.ProposedChanges["description"] != "Updated description reflecting semantic strategy runtime" {
		t.Errorf("Unexpected proposed description: %v", assessment.ProposedChanges["description"])
	}
	if assessment.Classification != ClassSemantic {
		t.Errorf("Expected semantic classification, got %s", assessment.Classification)
	}
}

func TestEvaluateNeedsReview(t *testing.T) {
	resp := `{"verdict": "needs_review", "confidence": 0.4, "reasoning": "The belief change is significant enough that the vision statement should be reviewed by a human.", "classification": "structural", "proposed_changes": null}`
	srv := mockLLMServer(t, resp)
	defer srv.Close()

	reasoner := NewFrontierReasoner(LLMConfig{BaseURL: srv.URL, APIKey: "test-key", Model: "test-frontier"})

	assessment, err := reasoner.Evaluate(EvaluationRequest{
		Signal: Signal{
			SourceNodeKey:  "Belief:north_star:core_beliefs.about_our_market[0]",
			SourceNodeType: "Belief",
			ChangeType:     "content_modified",
			Description:    "Core market belief fundamentally changed",
			Strength:       1.0,
		},
		Target: Node{
			Key:         "Belief:north_star:vision",
			Type:        "Belief",
			InertiaTier: 1,
			Properties:  map[string]any{"name": "Vision", "statement": "Every product team operates from a unified semantic strategy."},
		},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	if assessment.Verdict != VerdictNeedsReview {
		t.Errorf("Expected needs_review verdict, got %s", assessment.Verdict)
	}
	if assessment.Classification != ClassStructural {
		t.Errorf("Expected structural classification, got %s", assessment.Classification)
	}
}

func TestEvaluateHandlesInvalidJSON(t *testing.T) {
	srv := mockLLMServer(t, "I'm sorry, I can't evaluate this in JSON format.")
	defer srv.Close()

	reasoner := NewLocalReasoner(LLMConfig{BaseURL: srv.URL, Model: "test-model"})

	assessment, err := reasoner.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "Belief:x", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "Feature:y", Type: "Feature", InertiaTier: 6},
	})
	if err != nil {
		t.Fatalf("Evaluate should not error on unparseable response: %v", err)
	}

	if assessment.Verdict != VerdictNeedsReview {
		t.Errorf("Expected needs_review for unparseable response, got %s", assessment.Verdict)
	}
	if assessment.Confidence >= 0.5 {
		t.Errorf("Expected low confidence for parse failure, got %.2f", assessment.Confidence)
	}
}

func TestEvaluateHandlesMarkdownWrappedJSON(t *testing.T) {
	resp := "```json\n{\"verdict\": \"unchanged\", \"confidence\": 0.9, \"reasoning\": \"Still aligned.\", \"classification\": \"mechanical\", \"proposed_changes\": null}\n```"
	srv := mockLLMServer(t, resp)
	defer srv.Close()

	reasoner := NewLocalReasoner(LLMConfig{BaseURL: srv.URL, Model: "test-model"})

	assessment, err := reasoner.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "Belief:x", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "Capability:y", Type: "Capability", InertiaTier: 7},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	if assessment.Verdict != VerdictUnchanged {
		t.Errorf("Expected unchanged from markdown-wrapped JSON, got %s", assessment.Verdict)
	}
}

func TestTierForInertia(t *testing.T) {
	tests := []struct {
		tier     int
		expected ModelTier
	}{
		{7, TierLocal}, {6, TierLocal}, {5, TierLocal},
		{4, TierCloud}, {3, TierCloud},
		{2, TierFrontier}, {1, TierFrontier},
	}
	for _, tc := range tests {
		got := TierForInertia(tc.tier)
		if got != tc.expected {
			t.Errorf("TierForInertia(%d) = %s, want %s", tc.tier, got, tc.expected)
		}
	}
}

func TestTieredReasonerRouting(t *testing.T) {
	// Create mock servers for each tier
	localResp := `{"verdict": "unchanged", "confidence": 0.95, "reasoning": "Local says OK", "classification": "mechanical"}`
	cloudResp := `{"verdict": "modified", "confidence": 0.8, "reasoning": "Cloud says modify", "classification": "semantic", "proposed_changes": {"x": "y"}}`
	frontierResp := `{"verdict": "needs_review", "confidence": 0.6, "reasoning": "Frontier says review", "classification": "structural"}`

	localSrv := mockLLMServer(t, localResp)
	defer localSrv.Close()
	cloudSrv := mockLLMServer(t, cloudResp)
	defer cloudSrv.Close()
	frontierSrv := mockLLMServer(t, frontierResp)
	defer frontierSrv.Close()

	tiered := NewTieredReasoner(TieredConfig{
		Local:    LLMConfig{BaseURL: localSrv.URL, Model: "local-model"},
		Cloud:    LLMConfig{BaseURL: cloudSrv.URL, APIKey: "test", Model: "cloud-model"},
		Frontier: LLMConfig{BaseURL: frontierSrv.URL, APIKey: "test", Model: "frontier-model"},
	})

	// Tier 7 → local
	a1, err := tiered.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "A", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "B", Type: "Capability", InertiaTier: 7},
	})
	if err != nil {
		t.Fatalf("Tier 7 evaluation failed: %v", err)
	}
	if a1.ModelUsed != "local-model" {
		t.Errorf("Tier 7 should use local, got %s", a1.ModelUsed)
	}

	// Tier 4 → cloud
	a2, err := tiered.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "A", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "C", Type: "OKR", InertiaTier: 4},
	})
	if err != nil {
		t.Fatalf("Tier 4 evaluation failed: %v", err)
	}
	if a2.ModelUsed != "cloud-model" {
		t.Errorf("Tier 4 should use cloud, got %s", a2.ModelUsed)
	}

	// Tier 1 → frontier
	a3, err := tiered.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "A", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "D", Type: "Belief", InertiaTier: 1},
	})
	if err != nil {
		t.Fatalf("Tier 1 evaluation failed: %v", err)
	}
	if a3.ModelUsed != "frontier-model" {
		t.Errorf("Tier 1 should use frontier, got %s", a3.ModelUsed)
	}
}

func TestTieredReasonerEscalation(t *testing.T) {
	// Local returns low confidence → should escalate to cloud
	localResp := `{"verdict": "modified", "confidence": 0.4, "reasoning": "Not sure about this", "classification": "semantic", "proposed_changes": {"x": "maybe"}}`
	cloudResp := `{"verdict": "modified", "confidence": 0.9, "reasoning": "Cloud is confident", "classification": "semantic", "proposed_changes": {"x": "definitely"}}`

	localSrv := mockLLMServer(t, localResp)
	defer localSrv.Close()
	cloudSrv := mockLLMServer(t, cloudResp)
	defer cloudSrv.Close()

	tiered := NewTieredReasoner(TieredConfig{
		Local:               LLMConfig{BaseURL: localSrv.URL, Model: "local-model"},
		Cloud:               LLMConfig{BaseURL: cloudSrv.URL, APIKey: "test", Model: "cloud-model"},
		EscalationThreshold: 0.6,
	})

	assessment, err := tiered.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "A", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "B", Type: "Feature", InertiaTier: 6}, // tier 6 → local first
	})
	if err != nil {
		t.Fatalf("Evaluation failed: %v", err)
	}

	// Should have escalated to cloud
	if assessment.ModelUsed != "cloud-model" {
		t.Errorf("Expected escalation to cloud, got %s", assessment.ModelUsed)
	}
	if assessment.Confidence < 0.8 {
		t.Errorf("Expected high confidence from cloud, got %.2f", assessment.Confidence)
	}
	if assessment.ProposedChanges["x"] != "definitely" {
		t.Errorf("Expected cloud's proposed change, got %v", assessment.ProposedChanges["x"])
	}
}

func TestTieredReasonerNoEscalationForUnchanged(t *testing.T) {
	// Low confidence + unchanged verdict should NOT escalate
	// (if the model thinks nothing needs to change, low confidence just means
	// "I'm not very sure but probably fine" — not worth escalating)
	localResp := `{"verdict": "unchanged", "confidence": 0.5, "reasoning": "Probably fine", "classification": "mechanical"}`

	localSrv := mockLLMServer(t, localResp)
	defer localSrv.Close()

	callCount := 0
	cloudSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		t.Error("Cloud should not have been called for unchanged verdict")
		w.WriteHeader(500)
	}))
	defer cloudSrv.Close()

	tiered := NewTieredReasoner(TieredConfig{
		Local:               LLMConfig{BaseURL: localSrv.URL, Model: "local-model"},
		Cloud:               LLMConfig{BaseURL: cloudSrv.URL, APIKey: "test", Model: "cloud-model"},
		EscalationThreshold: 0.6,
	})

	assessment, err := tiered.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "A", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "B", Type: "Feature", InertiaTier: 6},
	})
	if err != nil {
		t.Fatalf("Evaluation failed: %v", err)
	}

	if assessment.Verdict != VerdictUnchanged {
		t.Errorf("Expected unchanged, got %s", assessment.Verdict)
	}
	if callCount > 0 {
		t.Error("Cloud was called despite unchanged verdict")
	}
}

func TestTieredReasonerMissingTier(t *testing.T) {
	// Only cloud configured — tier 7 should still route to cloud (skip-up)
	cloudResp := `{"verdict": "unchanged", "confidence": 0.9, "reasoning": "Cloud handling local tier", "classification": "mechanical"}`
	cloudSrv := mockLLMServer(t, cloudResp)
	defer cloudSrv.Close()

	tiered := NewTieredReasoner(TieredConfig{
		Cloud: LLMConfig{BaseURL: cloudSrv.URL, APIKey: "test", Model: "cloud-model"},
	})

	// Local not configured → should fail at local, then escalate to cloud
	assessment, err := tiered.Evaluate(EvaluationRequest{
		Signal: Signal{SourceNodeKey: "A", ChangeType: "content_modified", Strength: 0.5},
		Target: Node{Key: "B", Type: "Capability", InertiaTier: 7},
	})
	if err != nil {
		t.Fatalf("Evaluation failed: %v", err)
	}

	if assessment.ModelUsed != "cloud-model" {
		t.Errorf("Expected cloud model (escalated from missing local), got %s", assessment.ModelUsed)
	}
}

func TestExtractJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"direct", `{"verdict": "unchanged"}`, `{"verdict": "unchanged"}`},
		{"markdown_json", "```json\n{\"verdict\": \"unchanged\"}\n```", `{"verdict": "unchanged"}`},
		{"markdown_plain", "```\n{\"verdict\": \"unchanged\"}\n```", `{"verdict": "unchanged"}`},
		{"with_preamble", "Here is my analysis:\n{\"verdict\": \"modified\"}", `{"verdict": "modified"}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractJSON(tc.input)
			if got != tc.expected {
				t.Errorf("extractJSON(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestBuildPrompts(t *testing.T) {
	req := EvaluationRequest{
		Signal: Signal{
			SourceNodeKey:  "Belief:north_star:purpose",
			SourceNodeType: "Belief",
			ChangeType:     "content_modified",
			Description:    "Purpose statement updated",
			Strength:       0.7,
			After:          "We exist to make strategy semantic.",
		},
		Target: Node{
			Key:         "Feature:feature:fd-020",
			Type:        "Feature",
			InertiaTier: 6,
			Properties:  map[string]any{"name": "Semantic Engine", "jtbd": "Parse artifacts"},
		},
		Neighborhood: []Node{
			{Key: "Belief:north_star:purpose", Type: "Belief", InertiaTier: 1,
				Properties: map[string]any{"name": "Purpose"}, EdgeTypes: []string{"contributes_to"}},
		},
		Constraints: []Constraint{
			{Field: "description", Type: "maxLength", Value: "500"},
		},
	}

	system := buildSystemPrompt(req)
	user := buildUserPrompt(req)

	// System prompt should contain key instructions
	if len(system) < 100 {
		t.Errorf("System prompt too short: %d chars", len(system))
	}
	if !contains(system, "verdict") {
		t.Error("System prompt should mention verdict format")
	}
	if !contains(system, "maxLength") {
		t.Error("System prompt should include constraints")
	}

	// User prompt should contain the signal and target
	if !contains(user, "Belief:north_star:purpose") {
		t.Error("User prompt should contain signal source key")
	}
	if !contains(user, "Feature:feature:fd-020") {
		t.Error("User prompt should contain target key")
	}
	if !contains(user, "Neighborhood") {
		t.Error("User prompt should contain neighborhood section")
	}
	if !contains(user, "0.70") {
		t.Error("User prompt should contain signal strength")
	}

	t.Logf("System prompt: %d chars", len(system))
	t.Logf("User prompt: %d chars", len(user))
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && fmt.Sprintf("%s", s) != "" && len(s) >= len(substr) &&
		(s == substr || len(s) > len(substr) && findSubstring(s, substr))
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
