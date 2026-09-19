package skillexec

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/activity"
)

// ---------------------------------------------------------------------------
// Tests for pure helper functions (no DB required)
// ---------------------------------------------------------------------------

func TestAssumptionIDToTrack(t *testing.T) {
	cases := []struct {
		id   string
		want string
	}{
		{"asm-p-001", "product"},
		{"asm-s-002", "strategy"},
		{"asm-o-003", "org_ops"},
		{"asm-c-004", "commercial"},
		{"asm-x-001", ""},
		{"", ""},
		{"random", ""},
	}
	for _, tc := range cases {
		got := assumptionIDToTrack(tc.id)
		if got != tc.want {
			t.Errorf("assumptionIDToTrack(%q) = %q; want %q", tc.id, got, tc.want)
		}
	}
}

func TestMergeNewAssumptions_ReplacesByTrack(t *testing.T) {
	roadmap := map[string]any{
		"roadmap": map[string]any{
			"product": map[string]any{
				"riskiest_assumptions": []any{
					map[string]any{"id": "asm-p-001", "description": "old"},
				},
			},
			"strategy": map[string]any{
				"riskiest_assumptions": []any{},
			},
		},
	}

	newAssumptions := []any{
		map[string]any{"id": "asm-p-001", "description": "We assume product users pay"},
		map[string]any{"id": "asm-p-002", "description": "We assume onboarding takes < 5 min"},
	}

	result := mergeNewAssumptions(roadmap, newAssumptions)
	r := result["roadmap"].(map[string]any)
	product := r["product"].(map[string]any)
	assumptions := product["riskiest_assumptions"].([]any)
	if len(assumptions) != 2 {
		t.Errorf("expected 2 product assumptions, got %d", len(assumptions))
	}
	// Strategy track should be unchanged.
	strategy := r["strategy"].(map[string]any)
	stratAssumptions := strategy["riskiest_assumptions"].([]any)
	if len(stratAssumptions) != 0 {
		t.Errorf("expected strategy assumptions untouched (0), got %d", len(stratAssumptions))
	}
}

func TestMergeNewAssumptions_EmptyClearsAll(t *testing.T) {
	roadmap := map[string]any{
		"roadmap": map[string]any{
			"product": map[string]any{
				"riskiest_assumptions": []any{
					map[string]any{"id": "asm-p-001"},
				},
			},
			"commercial": map[string]any{
				"riskiest_assumptions": []any{
					map[string]any{"id": "asm-c-001"},
				},
			},
		},
	}

	result := mergeNewAssumptions(roadmap, []any{})
	r := result["roadmap"].(map[string]any)

	product := r["product"].(map[string]any)
	if len(product["riskiest_assumptions"].([]any)) != 0 {
		t.Error("product assumptions should be cleared")
	}
	commercial := r["commercial"].(map[string]any)
	if len(commercial["riskiest_assumptions"].([]any)) != 0 {
		t.Error("commercial assumptions should be cleared")
	}
}

func TestAppendToEvolutionLog_PreservesExisting(t *testing.T) {
	lra := map[string]any{
		"evolution_log": []any{
			map[string]any{"cycle_reference": "C1", "summary": "first entry"},
		},
	}
	newEntry := map[string]any{
		"cycle_reference": "C2",
		"summary":         "second entry",
	}

	result := appendToEvolutionLog(lra, newEntry)
	log, ok := result["evolution_log"].([]any)
	if !ok {
		t.Fatal("evolution_log should be []any")
	}
	if len(log) != 2 {
		t.Errorf("expected 2 evolution_log entries, got %d", len(log))
	}
	second := log[1].(map[string]any)
	if second["cycle_reference"] != "C2" {
		t.Errorf("expected C2, got %v", second["cycle_reference"])
	}

	// Ensure original was not mutated.
	origLog, _ := lra["evolution_log"].([]any)
	if len(origLog) != 1 {
		t.Error("original lra should not be mutated")
	}
}

func TestAppendToEvolutionLog_InitialisesEmpty(t *testing.T) {
	lra := map[string]any{} // no evolution_log key
	newEntry := map[string]any{"cycle_reference": "C1"}
	result := appendToEvolutionLog(lra, newEntry)
	log, ok := result["evolution_log"].([]any)
	if !ok || len(log) != 1 {
		t.Errorf("expected 1 evolution_log entry, got %v", result["evolution_log"])
	}
}

func TestRenderPrompt_BasicSubstitution(t *testing.T) {
	prompt := "Instance: {{.InstanceID}}, Decision: {{.Decision}}"
	bundle := &ContextBundle{
		InstanceID: "test-uuid",
		Decision:   "pivot",
		Artifacts:  map[string]any{},
		Params:     map[string]any{},
	}
	rendered, dropped, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt error: %v", err)
	}
	if dropped != 0 {
		t.Errorf("expected 0 dropped features, got %d", dropped)
	}
	if rendered != "Instance: test-uuid, Decision: pivot" {
		t.Errorf("unexpected rendered output: %q", rendered)
	}
}

func TestRenderPrompt_ConditionalDecision(t *testing.T) {
	prompt := `{{if eq .Decision "pivot"}}PIVOT INSTRUCTIONS{{end}}{{if eq .Decision "persevere"}}PERSEVERE INSTRUCTIONS{{end}}`
	bundle := &ContextBundle{
		InstanceID: uuid.New().String(),
		Decision:   "pivot",
		Artifacts:  map[string]any{},
		Params:     map[string]any{},
	}
	rendered, _, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt error: %v", err)
	}
	if rendered != "PIVOT INSTRUCTIONS" {
		t.Errorf("unexpected rendered output: %q", rendered)
	}
}

func TestCopyWithSkeletonFlag(t *testing.T) {
	payload := map[string]any{"name": "test", "value": 42}
	result := copyWithSkeletonFlag(payload)
	if result["_skeleton"] != true {
		t.Error("expected _skeleton: true")
	}
	if result["name"] != "test" {
		t.Error("expected name: test preserved")
	}
	// Original should not be mutated.
	if payload["_skeleton"] != nil {
		t.Error("original payload should not be mutated")
	}
}

func TestIsMutableArtifactType(t *testing.T) {
	mutable := []string{"strategy_formula", "roadmap_recipe", "north_star", "living_reality_assessment"}
	notMutable := []string{"feature", "evidence", "assessment_report", "aim_trigger_config"}

	for _, at := range mutable {
		if !isMutableArtifactType(at) {
			t.Errorf("expected %q to be mutable", at)
		}
	}
	for _, at := range notMutable {
		if isMutableArtifactType(at) {
			t.Errorf("expected %q to NOT be mutable", at)
		}
	}
}

func TestArtTypeToKey(t *testing.T) {
	cases := map[string]string{
		"strategy_formula":          "strategy-formula",
		"roadmap_recipe":            "roadmap-recipe",
		"living_reality_assessment": "living-reality-assessment",
		"north_star":                "north-star",
	}
	for input, want := range cases {
		if got := artTypeToKey(input); got != want {
			t.Errorf("artTypeToKey(%q) = %q; want %q", input, got, want)
		}
	}
}

func TestExtractDecisionFromCalibration(t *testing.T) {
	artifacts := map[string]any{
		"calibration_memo": map[string]any{
			"decision": "pivot",
			"other":    "field",
		},
	}
	got := extractDecisionFromCalibration(artifacts)
	if got != "pivot" {
		t.Errorf("expected pivot, got %q", got)
	}

	// No calibration.
	got2 := extractDecisionFromCalibration(map[string]any{})
	if got2 != "" {
		t.Errorf("expected empty, got %q", got2)
	}
}

func TestExtractAssessmentSummary(t *testing.T) {
	ar := map[string]any{"cycle": 1, "okr_count": 3}
	artifacts := map[string]any{"assessment_report": ar}
	summary := extractAssessmentSummary(artifacts)
	if summary == "" {
		t.Fatal("expected non-empty summary")
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(summary), &parsed); err != nil {
		t.Fatalf("summary is not valid JSON: %v", err)
	}
}

// ---------------------------------------------------------------------------
// stageMutationsFromOutput — unit test without DB (tests routing logic)
// ---------------------------------------------------------------------------

func TestKnownArtifactOutputKeys(t *testing.T) {
	// Verify the mapping table is consistent.
	expected := map[string]string{
		"strategy_formula":     "strategy_formula",
		"roadmap_recipe":       "roadmap_recipe",
		"north_star":           "north_star",
		"strategy_foundations": "strategy_foundations",
	}
	for key, wantType := range expected {
		got, ok := knownArtifactOutputKeys[key]
		if !ok {
			t.Errorf("missing output key %q in knownArtifactOutputKeys", key)
		}
		if got != wantType {
			t.Errorf("knownArtifactOutputKeys[%q] = %q; want %q", key, got, wantType)
		}
	}

	// lra_evolution_entry and new_assumptions must NOT be in the standard map
	// (they are handled specially).
	if _, ok := knownArtifactOutputKeys["lra_evolution_entry"]; ok {
		t.Error("lra_evolution_entry should not be in knownArtifactOutputKeys")
	}
	if _, ok := knownArtifactOutputKeys["new_assumptions"]; ok {
		t.Error("new_assumptions should not be in knownArtifactOutputKeys")
	}
}

// ---------------------------------------------------------------------------
// Validation helper tests
// ---------------------------------------------------------------------------

func TestValidateJSONSchema_ValidPayload(t *testing.T) {
	schema := []byte(`{
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"required": ["name"],
		"properties": {
			"name": {"type": "string"}
		}
	}`)
	payload := `{"name": "hello"}`
	errs := validateJSONSchema(payload, schema)
	if len(errs) != 0 {
		t.Errorf("expected no errors, got %v", errs)
	}
}

func TestValidateJSONSchema_InvalidPayload(t *testing.T) {
	schema := []byte(`{
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"required": ["name"],
		"properties": {
			"name": {"type": "string"}
		}
	}`)
	payload := `{"other": "field"}` // missing required "name"
	errs := validateJSONSchema(payload, schema)
	if len(errs) == 0 {
		t.Error("expected validation errors for missing required field")
	}
}

func TestValidateArtifactPayloads_ValidStrategyFormula(t *testing.T) {
	// A minimal valid strategy_formula payload (meets all required fields).
	sf := map[string]any{
		"strategy": map[string]any{
			"id":             "strategy-test-001",
			"opportunity_id": "opp-001",
			"title":          "Test Strategy",
			"status":         "draft",
			"positioning": map[string]any{
				"unique_value_proposition": "We offer something unique",
				"target_customer_profile":  "SMB SaaS companies",
			},
			"value_creation": map[string]any{
				"key_capabilities": []string{"core feature", "integration"},
			},
		},
	}
	output := map[string]any{"strategy_formula": sf}
	errs := validateArtifactPayloads(output)
	if len(errs) != 0 {
		t.Errorf("expected no errors for valid strategy_formula, got: %v", errs)
	}
}

func TestValidateArtifactPayloads_InvalidStrategyFormula(t *testing.T) {
	// Missing required fields: positioning, value_creation.
	sf := map[string]any{
		"strategy": map[string]any{
			"id":             "strategy-test-001",
			"opportunity_id": "opp-001",
			"title":          "Test Strategy",
			"status":         "draft",
			// positioning and value_creation are required but missing
		},
	}
	output := map[string]any{"strategy_formula": sf}
	errs := validateArtifactPayloads(output)
	if len(errs) == 0 {
		t.Error("expected validation errors for invalid strategy_formula")
	}
	// Errors should be prefixed with the artifact type.
	for _, e := range errs {
		if !strings.HasPrefix(e, "strategy_formula:") {
			t.Errorf("expected error to be prefixed with 'strategy_formula:', got: %q", e)
		}
	}
}

func TestValidateArtifactPayloads_SkipsUnknownKeys(t *testing.T) {
	// lra_evolution_entry and new_assumptions are not in knownArtifactOutputKeys
	// and should not be validated by validateArtifactPayloads.
	output := map[string]any{
		"lra_evolution_entry": map[string]any{"invalid": true},
		"new_assumptions":     []any{},
	}
	errs := validateArtifactPayloads(output)
	if len(errs) != 0 {
		t.Errorf("expected no errors for unknown keys, got: %v", errs)
	}
}

func TestCorrectionPrompt_ContainsErrors(t *testing.T) {
	original := "ORIGINAL PROMPT CONTENT"
	errors := []string{"error one", "error two"}
	result := correctionPrompt(original, errors, "")

	if !strings.Contains(result, original) {
		t.Error("correction prompt should contain original prompt")
	}
	if !strings.Contains(result, "error one") {
		t.Error("correction prompt should contain first error")
	}
	if !strings.Contains(result, "error two") {
		t.Error("correction prompt should contain second error")
	}
	if !strings.Contains(result, "CORRECTION REQUIRED") {
		t.Error("correction prompt should contain CORRECTION REQUIRED header")
	}
}

func TestCorrectionPrompt_IncludesPreviousOutput(t *testing.T) {
	original := "ORIGINAL"
	errors := []string{"bad JSON"}
	prevOutput := `{"broken": true,}`

	result := correctionPrompt(original, errors, prevOutput)
	if !strings.Contains(result, "Your Previous (Invalid) Response") {
		t.Error("should include previous output header")
	}
	if !strings.Contains(result, prevOutput) {
		t.Error("should include the previous output content")
	}
}

func TestCorrectionPrompt_TruncatesLongOutput(t *testing.T) {
	original := "ORIGINAL"
	errors := []string{"bad JSON"}
	prevOutput := strings.Repeat("x", 5000)

	result := correctionPrompt(original, errors, prevOutput)
	if !strings.Contains(result, "... (truncated)") {
		t.Error("should truncate output > 4000 chars")
	}
	if strings.Contains(result, prevOutput) {
		t.Error("should NOT contain the full 5000-char output")
	}
}

func TestCorrectionPrompt_NoPreviousOutput(t *testing.T) {
	result := correctionPrompt("ORIGINAL", []string{"err"}, "")
	if strings.Contains(result, "Previous") {
		t.Error("should not include previous output section when empty")
	}
}

func TestLoadSkillOutputSchema_AdaptStrategy(t *testing.T) {
	// The adapt-strategy skill has an output_schema.json — verify it loads.
	data, err := loadSkillOutputSchema("adapt-strategy", "")
	if err != nil {
		t.Fatalf("unexpected error loading adapt-strategy output schema: %v", err)
	}
	if data == nil {
		t.Fatal("expected non-nil schema bytes for adapt-strategy")
	}
	// Should be valid JSON.
	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatalf("output schema is not valid JSON: %v", err)
	}
}

func TestLoadSkillOutputSchema_NoSchema(t *testing.T) {
	// A non-existent skill should return nil, nil.
	data, err := loadSkillOutputSchema("nonexistent-skill-xyz", "")
	if err != nil {
		t.Fatalf("expected nil error for missing skill, got: %v", err)
	}
	if data != nil {
		t.Error("expected nil data for missing skill output schema")
	}
}

// ---------------------------------------------------------------------------
// callWithValidation — retry loop test using a mock LLM
// ---------------------------------------------------------------------------

// mockLLM is a test LLM that returns pre-canned responses in order.
type mockLLM struct {
	responses []string
	calls     int
}

func (m *mockLLM) CompleteJSON(_ context.Context, _, _ string) (LLMResult, error) {
	if m.calls >= len(m.responses) {
		return LLMResult{}, fmt.Errorf("mock LLM: no more responses configured (call %d)", m.calls+1)
	}
	resp := m.responses[m.calls]
	m.calls++
	return LLMResult{Content: resp, InputTokens: 100, OutputTokens: 50}, nil
}

func TestCallWithValidation_SuccessOnFirstAttempt(t *testing.T) {
	// Valid strategy_formula and roadmap_recipe — should pass on first call.
	sf := validStrategyFormulaJSON()
	output := fmt.Sprintf(`{"strategy_formula": %s}`, sf)

	llm := &mockLLM{responses: []string{output}}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidation(context.Background(), "test-skill", "prompt", nil)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if cr.Output == nil {
		t.Fatal("expected non-nil output")
	}
	if !cr.Validated {
		// No output schema provided → validationPassed = false is expected.
		t.Log("validated=false because no output schema provided (expected)")
	}
	if llm.calls != 1 {
		t.Errorf("expected 1 LLM call, got %d", llm.calls)
	}
	// Token counts should be accumulated (1 call × 100 input + 50 output).
	if cr.InputTokens != 100 {
		t.Errorf("expected 100 input tokens, got %d", cr.InputTokens)
	}
	if cr.OutputTokens != 50 {
		t.Errorf("expected 50 output tokens, got %d", cr.OutputTokens)
	}
}

// fatalLLM always returns a non-retryable error (implements nonRetryableLLMError).
type fatalLLM struct{ calls int }

type fakeFatalErr struct{}

func (fakeFatalErr) Error() string     { return "LLM access denied (HTTP 403): denied" }
func (fakeFatalErr) IsRetryable() bool { return false }

func (m *fatalLLM) CompleteJSON(_ context.Context, _, _ string) (LLMResult, error) {
	m.calls++
	return LLMResult{}, fakeFatalErr{}
}

// TestCallWithValidation_FailsFastOnNonRetryable ensures a non-retryable LLM
// error (e.g. access denied / invalid model) aborts on the first attempt rather
// than burning the validation retries. This is the AIM-cycle crash scenario.
func TestCallWithValidation_FailsFastOnNonRetryable(t *testing.T) {
	llm := &fatalLLM{}
	e := &Executor{llm: llm}

	_, err := e.callWithValidation(context.Background(), "test-skill", "prompt", nil)
	if err == nil {
		t.Fatal("expected error from non-retryable LLM failure")
	}
	if llm.calls != 1 {
		t.Errorf("expected exactly 1 LLM call (fail-fast), got %d", llm.calls)
	}
	if !strings.Contains(err.Error(), "non-retryable") {
		t.Errorf("expected error to mention non-retryable, got: %v", err)
	}
}

func TestCallWithValidation_RetriesOnInvalidJSON(t *testing.T) {
	// First response: invalid JSON. Second: valid.
	sf := validStrategyFormulaJSON()
	validOutput := fmt.Sprintf(`{"strategy_formula": %s}`, sf)

	llm := &mockLLM{responses: []string{"not json at all", validOutput}}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidation(context.Background(), "test-skill", "prompt", nil)
	if err != nil {
		t.Fatalf("expected success after retry, got error: %v", err)
	}
	if llm.calls != 2 {
		t.Errorf("expected 2 LLM calls, got %d", llm.calls)
	}
	// 2 calls × (100 input + 50 output) = 200 input, 100 output.
	if cr.InputTokens != 200 {
		t.Errorf("expected 200 input tokens (2 calls), got %d", cr.InputTokens)
	}
}

func TestCallWithValidation_FailsAfterMaxRetries(t *testing.T) {
	// All responses are invalid JSON — should exhaust retries and return error.
	responses := make([]string, maxValidationRetries+1)
	for i := range responses {
		responses[i] = "not json"
	}

	llm := &mockLLM{responses: responses}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidation(context.Background(), "test-skill", "prompt", nil)
	if err == nil {
		t.Fatal("expected error after max retries exhausted")
	}
	if llm.calls != maxValidationRetries+1 {
		t.Errorf("expected %d LLM calls, got %d", maxValidationRetries+1, llm.calls)
	}
	// Tokens should still be accumulated even on failure.
	expectedIn := (maxValidationRetries + 1) * 100
	if cr.InputTokens != expectedIn {
		t.Errorf("expected %d input tokens on failure, got %d", expectedIn, cr.InputTokens)
	}
}

func TestCallWithValidation_RetriesOnArtifactSchemaFailure(t *testing.T) {
	// First response: strategy_formula is missing required fields.
	// Second response: valid strategy_formula.
	invalidSF := `{"strategy": {"id": "s-1"}}` // missing required positioning, value_creation, etc.
	validSF := validStrategyFormulaJSON()

	responses := []string{
		fmt.Sprintf(`{"strategy_formula": %s}`, invalidSF),
		fmt.Sprintf(`{"strategy_formula": %s}`, validSF),
	}

	llm := &mockLLM{responses: responses}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidation(context.Background(), "test-skill", "prompt", nil)
	if err != nil {
		t.Fatalf("expected success after retry, got: %v", err)
	}
	if cr.Output == nil {
		t.Fatal("expected non-nil output")
	}
	if llm.calls != 2 {
		t.Errorf("expected 2 LLM calls (1 retry), got %d", llm.calls)
	}
	// 2 calls × (100 input + 50 output) = 200 input, 100 output.
	if cr.InputTokens != 200 {
		t.Errorf("expected 200 input tokens (2 calls), got %d", cr.InputTokens)
	}
}

// ---------------------------------------------------------------------------
// callWithValidationChunk tests
// ---------------------------------------------------------------------------

func TestCallWithValidationChunk_SuccessFirstAttempt(t *testing.T) {
	sf := validStrategyFormulaJSON()
	response := fmt.Sprintf(`{"strategy_formula": %s}`, sf)

	llm := &mockLLM{responses: []string{response}}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidationChunk(
		context.Background(), "adapt-strategy", 1,
		"strategy_formula", "strategy_formula", "prompt", uuid.Nil, nil)
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	if cr == nil {
		t.Fatal("expected non-nil result")
	}
	if _, ok := cr.Output["strategy_formula"]; !ok {
		t.Error("expected strategy_formula key in output")
	}
	if cr.InputTokens == 0 {
		t.Error("expected non-zero InputTokens")
	}
	if llm.calls != 1 {
		t.Errorf("expected 1 LLM call, got %d", llm.calls)
	}
}

func TestCallWithValidationChunk_RetriesOnInvalidJSON(t *testing.T) {
	sf := validStrategyFormulaJSON()
	valid := fmt.Sprintf(`{"strategy_formula": %s}`, sf)

	llm := &mockLLM{responses: []string{"not json", valid}}
	e := &Executor{llm: llm}

	_, err := e.callWithValidationChunk(
		context.Background(), "adapt-strategy", 1,
		"strategy_formula", "strategy_formula", "prompt", uuid.Nil, nil)
	if err != nil {
		t.Fatalf("expected success after retry, got: %v", err)
	}
	if llm.calls != 2 {
		t.Errorf("expected 2 LLM calls, got %d", llm.calls)
	}
}

func TestCallWithValidationChunk_ExhaustsRetriesAndFails(t *testing.T) {
	responses := make([]string, maxValidationRetries+1)
	for i := range responses {
		responses[i] = "not json"
	}

	llm := &mockLLM{responses: responses}
	e := &Executor{llm: llm}

	_, err := e.callWithValidationChunk(
		context.Background(), "adapt-strategy", 2,
		"roadmap_recipe", "roadmap_recipe", "prompt", uuid.Nil, nil)
	if err == nil {
		t.Fatal("expected error after retries exhausted")
	}
	if llm.calls != maxValidationRetries+1 {
		t.Errorf("expected %d LLM calls, got %d", maxValidationRetries+1, llm.calls)
	}
}

func TestCallWithValidationChunk_EmitsRetryActivityEvent(t *testing.T) {
	// First response invalid, second valid — recorder should receive skill.retrying.
	sf := validStrategyFormulaJSON()
	valid := fmt.Sprintf(`{"strategy_formula": %s}`, sf)

	rec := &mockActivityRecorder{}
	llm := &mockLLM{responses: []string{"not json", valid}}
	e := &Executor{llm: llm, activitySvc: rec}

	_, err := e.callWithValidationChunk(
		context.Background(), "adapt-strategy", 1,
		"strategy_formula", "strategy_formula", "prompt", uuid.New(), nil)
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}

	found := false
	for _, req := range rec.events {
		if req.EventType == "skill.retrying" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected skill.retrying event to be recorded")
	}
}

func TestCallWithValidationChunk_NoArtifactTypeSkipsSchemaValidation(t *testing.T) {
	// lra_evolution_entry has no canonical EPF schema to validate against —
	// empty artifactType means only JSON validity is checked.
	response := `{"lra_evolution_entry": {"cycle_reference": "C2", "summary": "test"}}`

	llm := &mockLLM{responses: []string{response}}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidationChunk(
		context.Background(), "adapt-strategy", 3,
		"lra_evolution_entry", "", "prompt", uuid.Nil, nil)
	if err != nil {
		t.Fatalf("expected success for empty artifactType, got: %v", err)
	}
	if cr == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestCallWithValidationChunk_AutoWrapsFlat(t *testing.T) {
	// Simulate the LLM producing a flat object without the wrapper keys.
	// The auto-wrap logic should detect this and double-wrap:
	//   flat fields → {"my_artifact": {"my_artifact": { ...fields... }}}
	// We use an empty artifactType to skip schema validation (testing the
	// wrapping logic, not schema compliance).
	flat := `{
		"field_a": "value_a",
		"field_b": {"nested": true},
		"change_summary": "- Updated field_a"
	}`

	llm := &mockLLM{responses: []string{flat}}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidationChunk(
		context.Background(), "adapt-foundations", 1,
		"my_artifact", "", "prompt", uuid.Nil, nil)
	if err != nil {
		t.Fatalf("expected auto-wrap to succeed, got: %v", err)
	}
	if cr == nil {
		t.Fatal("expected non-nil result")
	}
	// The output should have the artifact wrapper key.
	outer, ok := cr.Output["my_artifact"]
	if !ok {
		t.Fatal("expected my_artifact key in output after auto-wrap")
	}
	// The inner value should also be a map with a "my_artifact" key (double-envelope).
	outerMap, ok := outer.(map[string]any)
	if !ok {
		t.Fatalf("expected my_artifact value to be a map, got %T", outer)
	}
	inner, ok := outerMap["my_artifact"]
	if !ok {
		t.Fatal("expected inner my_artifact key (double-envelope) after auto-wrap")
	}
	innerMap, ok := inner.(map[string]any)
	if !ok {
		t.Fatalf("expected inner my_artifact to be a map, got %T", inner)
	}
	if innerMap["field_a"] != "value_a" {
		t.Errorf("expected field_a='value_a' in inner payload, got %v", innerMap["field_a"])
	}
	// change_summary should be preserved as a sibling (not inside the double-envelope).
	if _, ok := cr.Output["change_summary"]; !ok {
		t.Error("expected change_summary to be preserved as sibling after auto-wrap")
	}
	// change_summary should NOT be inside the inner payload.
	if _, ok := innerMap["change_summary"]; ok {
		t.Error("change_summary should not be inside the inner artifact payload")
	}
}

func TestCallWithValidationChunk_NoAutoWrapWhenKeyPresent(t *testing.T) {
	// When the LLM correctly produces the wrapper key, no auto-wrap should happen.
	sf := validStrategyFormulaJSON()
	response := fmt.Sprintf(`{"strategy_formula": %s, "change_summary": "- updated positioning"}`, sf)

	llm := &mockLLM{responses: []string{response}}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidationChunk(
		context.Background(), "adapt-strategy", 1,
		"strategy_formula", "strategy_formula", "prompt", uuid.Nil, nil)
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	// strategy_formula should be present directly (not double-wrapped).
	sf2, ok := cr.Output["strategy_formula"]
	if !ok {
		t.Fatal("expected strategy_formula key in output")
	}
	// It should be a map (the artifact payload), not another wrapper.
	if _, ok := sf2.(map[string]any); !ok {
		t.Errorf("expected strategy_formula to be a map, got %T", sf2)
	}
}

func TestInnerKeyFor_Overrides(t *testing.T) {
	cases := []struct {
		outputKey string
		want      string
	}{
		{"strategy_formula", "strategy"},
		{"roadmap_recipe", "roadmap"},
		{"insight_opportunity", "opportunity"},
		{"north_star", "north_star"},                     // same
		{"strategy_foundations", "strategy_foundations"}, // same
		{"assessment_report", "assessment_report"},       // flat schema, no override
	}
	for _, tc := range cases {
		got := innerKeyFor(tc.outputKey)
		if got != tc.want {
			t.Errorf("innerKeyFor(%q) = %q, want %q", tc.outputKey, got, tc.want)
		}
	}
}

func TestCallWithValidationChunk_SingleWrapFix(t *testing.T) {
	// LLM produces single-wrapped output:
	//   {"strategy_formula": {"id": "s1", "title": "T", ...}}
	// The schema requires strategy_formula → strategy → { ... }.
	// The single-wrap fix should detect that "strategy" is missing inside
	// strategy_formula and re-wrap.
	sf := validStrategyFormulaJSON()
	// Parse the valid strategy_formula to get the "strategy" inner content.
	var sfMap map[string]any
	if err := json.Unmarshal([]byte(sf), &sfMap); err != nil {
		t.Fatalf("invalid test fixture: %v", err)
	}
	// Extract the inner "strategy" content — that's what the LLM might
	// produce directly under "strategy_formula" (single-wrapped).
	strategyContent, ok := sfMap["strategy"]
	if !ok {
		t.Fatal("validStrategyFormulaJSON must have 'strategy' key")
	}
	singleWrapped, _ := json.Marshal(map[string]any{
		"strategy_formula": strategyContent,
	})

	llm := &mockLLM{responses: []string{string(singleWrapped)}}
	e := &Executor{llm: llm}

	cr, err := e.callWithValidationChunk(
		context.Background(), "adapt-strategy", 1,
		"strategy_formula", "strategy_formula", "prompt", uuid.Nil, nil)
	if err != nil {
		t.Fatalf("expected single-wrap fix to produce valid output, got: %v", err)
	}
	// The output should now have strategy_formula → strategy → {...}.
	outer, ok := cr.Output["strategy_formula"].(map[string]any)
	if !ok {
		t.Fatal("expected strategy_formula key in output")
	}
	if _, ok := outer["strategy"]; !ok {
		t.Fatal("expected 'strategy' inner key after single-wrap fix")
	}
}

// ---------------------------------------------------------------------------
// Activity recorder mock
// ---------------------------------------------------------------------------

type mockActivityRecorder struct {
	events []activity.RecordRequest
}

func (m *mockActivityRecorder) Record(_ context.Context, req activity.RecordRequest) {
	m.events = append(m.events, req)
}

// ---------------------------------------------------------------------------
// adapt-foundations: chunkPlanFor dispatch
// ---------------------------------------------------------------------------

func TestChunkPlanFor_AdaptStrategy(t *testing.T) {
	plan := chunkPlanFor("adapt-strategy")
	if len(plan) != 4 {
		t.Fatalf("adapt-strategy: expected 4 chunks, got %d", len(plan))
	}
	if plan[0].outputKey != "strategy_formula" {
		t.Errorf("chunk 1 outputKey: want strategy_formula, got %s", plan[0].outputKey)
	}
}

func TestChunkPlanFor_AdaptFoundations(t *testing.T) {
	plan := chunkPlanFor("adapt-foundations")
	if len(plan) != 4 {
		t.Fatalf("adapt-foundations: expected 4 chunks, got %d", len(plan))
	}
	wantKeys := []string{"north_star", "strategy_foundations", "insight_analyses", "insight_opportunity"}
	for i, want := range wantKeys {
		if plan[i].outputKey != want {
			t.Errorf("chunk %d outputKey: want %s, got %s", i+1, want, plan[i].outputKey)
		}
	}
	// north_star and strategy_foundations have schema validation; insight_opportunity does not.
	if plan[0].artifactType == "" {
		t.Error("north_star chunk should have non-empty artifactType for schema validation")
	}
	if plan[1].artifactType == "" {
		t.Error("strategy_foundations chunk should have non-empty artifactType for schema validation")
	}
}

func TestChunkPlanFor_Unknown_FallsBackToAdaptStrategy(t *testing.T) {
	plan := chunkPlanFor("some-other-skill")
	if len(plan) != 4 {
		t.Fatalf("unknown skill: expected 4 chunks (fallback), got %d", len(plan))
	}
	if plan[0].outputKey != "strategy_formula" {
		t.Error("unknown skill should fall back to adapt-strategy plan")
	}
}

// ---------------------------------------------------------------------------
// TriggeringSignals template functions
// ---------------------------------------------------------------------------

func TestTriggeringSignals_TemplateFunction_EmptyWhenNone(t *testing.T) {
	bundle := &ContextBundle{}
	prompt := "{{triggeringSignals .}}"
	rendered, _, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt: %v", err)
	}
	if rendered != "" {
		t.Errorf("expected empty string when no signals, got: %q", rendered)
	}
}

func TestTriggeringSignals_TemplateFunction_RendersSignals(t *testing.T) {
	bundle := &ContextBundle{
		TriggeringSignals: []map[string]any{
			{
				"target_key":     "north-star",
				"authority_tier": "gated",
				"severity":       "warning",
				"description":    "North star is stale after formula update",
			},
		},
	}
	prompt := "{{triggeringSignals .}}"
	rendered, _, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt: %v", err)
	}
	if !strings.Contains(rendered, "north-star") {
		t.Error("expected rendered signals to contain target_key")
	}
	if !strings.Contains(rendered, "gated") {
		t.Error("expected rendered signals to contain authority_tier")
	}
}

func TestTriggeringSignalsSeverity_ReturnsHighest(t *testing.T) {
	bundle := &ContextBundle{
		TriggeringSignals: []map[string]any{
			{"severity": "warning"},
			{"severity": "critical"},
			{"severity": "info"},
		},
	}
	prompt := "{{triggeringSignalsSeverity .}}"
	rendered, _, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt: %v", err)
	}
	if !strings.Contains(rendered, "critical") {
		t.Errorf("expected highest severity 'critical', got: %q", rendered)
	}
}

func TestTriggeringSignalsSeverity_EmptyWhenNoSignals(t *testing.T) {
	bundle := &ContextBundle{}
	prompt := "{{triggeringSignalsSeverity .}}"
	rendered, _, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt: %v", err)
	}
	if !strings.Contains(rendered, "No severity") {
		t.Errorf("expected 'No severity' message, got: %q", rendered)
	}
}

// ---------------------------------------------------------------------------
// knownArtifactOutputKeys coverage
// ---------------------------------------------------------------------------

func TestKnownArtifactOutputKeys_CoversFoundationTypes(t *testing.T) {
	required := []string{
		"north_star", "strategy_foundations",
		"insight_analyses", "insight_opportunity",
		"strategy_formula", "roadmap_recipe",
	}
	for _, key := range required {
		if _, ok := knownArtifactOutputKeys[key]; !ok {
			t.Errorf("knownArtifactOutputKeys missing: %s", key)
		}
	}
}

// ---------------------------------------------------------------------------
// validStrategyFormulaJSON
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cleanJSON tests
// ---------------------------------------------------------------------------

func TestCleanJSON(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "already valid",
			input: `{"key": "value"}`,
			want:  `{"key": "value"}`,
		},
		{
			name:  "markdown json fence",
			input: "```json\n{\"key\": \"value\"}\n```",
			want:  `{"key": "value"}`,
		},
		{
			name:  "markdown bare fence",
			input: "```\n{\"key\": \"value\"}\n```",
			want:  `{"key": "value"}`,
		},
		{
			name:  "surrounding text",
			input: "Here is the JSON:\n{\"key\": \"value\"}\nDone!",
			want:  `{"key": "value"}`,
		},
		{
			name:  "trailing comma before brace",
			input: `{"items": ["a", "b",], "x": 1,}`,
			want:  `{"items": ["a", "b"], "x": 1}`,
		},
		{
			name:  "trailing comma with whitespace",
			input: "{\"a\": 1 ,\n  }",
			want:  "{\"a\": 1 \n  }",
		},
		{
			name:  "comma inside string preserved",
			input: `{"msg": "hello, world", "x": 1}`,
			want:  `{"msg": "hello, world", "x": 1}`,
		},
		{
			name:  "trailing comma inside string preserved",
			input: `{"msg": "trailing,}", "x": 1}`,
			want:  `{"msg": "trailing,}", "x": 1}`,
		},
		{
			name:  "fence plus trailing commas",
			input: "```json\n{\"items\": [1, 2, 3,],}\n```",
			want:  `{"items": [1, 2, 3]}`,
		},
		{
			name:  "empty input",
			input: "",
			want:  "",
		},
		{
			name:  "whitespace only",
			input: "   \n\t  ",
			want:  "",
		},
		{
			name:  "reasoning block before json",
			input: "<reasoning>The user wants JSON. Let me produce it.</reasoning>{\"key\": \"value\"}",
			want:  `{"key": "value"}`,
		},
		{
			name:  "reasoning block containing braces",
			input: "<reasoning>Maybe {\"draft\": 1} first... no.</reasoning>{\"key\": \"value\"}. Done.",
			want:  `{"key": "value"}`,
		},
		{
			name:  "think block (qwen style)",
			input: "<think>hmm {1,2,}</think>\n```json\n{\"key\": \"value\"}\n```",
			want:  `{"key": "value"}`,
		},
		{
			name:  "orphan closing reasoning tag",
			input: "the plan is {\"a\": 1}...</reasoning>{\"key\": \"value\"}",
			want:  `{"key": "value"}`,
		},
		{
			name:  "unterminated reasoning tag keeps text",
			input: "<reasoning>{\"key\": \"value\"}",
			want:  `{"key": "value"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := cleanJSON(tt.input)
			if got != tt.want {
				t.Errorf("cleanJSON() =\n  %q\nwant:\n  %q", got, tt.want)
			}
			// If we expect valid JSON, verify it parses.
			if tt.want != "" {
				var m map[string]any
				if err := json.Unmarshal([]byte(got), &m); err != nil {
					t.Errorf("cleaned output is not valid JSON: %v", err)
				}
			}
		})
	}
}

func TestRemoveTrailingCommas(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "no commas",
			input: `{"a": 1}`,
			want:  `{"a": 1}`,
		},
		{
			name:  "normal comma",
			input: `{"a": 1, "b": 2}`,
			want:  `{"a": 1, "b": 2}`,
		},
		{
			name:  "trailing in object",
			input: `{"a": 1,}`,
			want:  `{"a": 1}`,
		},
		{
			name:  "trailing in array",
			input: `[1, 2, 3,]`,
			want:  `[1, 2, 3]`,
		},
		{
			name:  "nested trailing",
			input: `{"a": [1,], "b": {"c": 2,},}`,
			want:  `{"a": [1], "b": {"c": 2}}`,
		},
		{
			name:  "comma in string not removed",
			input: `{"s": "a,}"}`,
			want:  `{"s": "a,}"}`,
		},
		{
			name:  "escaped quote in string",
			input: `{"s": "he said \"hi,\"", "x": 1,}`,
			want:  `{"s": "he said \"hi,\"", "x": 1}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := removeTrailingCommas(tt.input)
			if got != tt.want {
				t.Errorf("removeTrailingCommas() = %q, want %q", got, tt.want)
			}
		})
	}
}

// validStrategyFormulaJSON returns a minimal valid strategy_formula as a JSON string.
func validStrategyFormulaJSON() string {
	return `{
		"strategy": {
			"id": "strategy-test-001",
			"opportunity_id": "opp-001",
			"title": "Test Strategy Title",
			"status": "draft",
			"positioning": {
				"unique_value_proposition": "We offer something genuinely unique to our customers",
				"target_customer_profile": "Mid-market SaaS companies with data integration needs"
			},
			"value_creation": {
				"key_capabilities": ["automated data sync", "no-code connectors"]
			}
		}
	}`
}

// ---------------------------------------------------------------------------
// fixMaxLengthViolations tests
// ---------------------------------------------------------------------------

func TestFixMaxLengthViolations(t *testing.T) {
	t.Run("string inside array element", func(t *testing.T) {
		long := strings.Repeat("x", 561)
		artifact := map[string]any{
			"strategic_insights": []any{long, "short"},
		}
		errs := []string{"assessment_report: at '/strategic_insights/0': maxLength: got 561, want 500"}
		if n := fixMaxLengthViolations(artifact, errs); n != 1 {
			t.Fatalf("fixed = %d, want 1", n)
		}
		got := artifact["strategic_insights"].([]any)[0].(string)
		if len([]rune(got)) > 500 {
			t.Errorf("string still %d runes after fix", len([]rune(got)))
		}
		if artifact["strategic_insights"].([]any)[1].(string) != "short" {
			t.Errorf("untouched sibling was modified")
		}
	})

	t.Run("string field nested under array of objects", func(t *testing.T) {
		artifact := map[string]any{
			"items": []any{map[string]any{"summary": strings.Repeat("y", 60)}},
		}
		errs := []string{"x: at '/items/0/summary': maxLength: got 60, want 40"}
		if n := fixMaxLengthViolations(artifact, errs); n != 1 {
			t.Fatalf("fixed = %d, want 1", n)
		}
		got := artifact["items"].([]any)[0].(map[string]any)["summary"].(string)
		if len([]rune(got)) > 40 {
			t.Errorf("string still %d runes after fix", len([]rune(got)))
		}
	})

	t.Run("multibyte runes counted as code points", func(t *testing.T) {
		artifact := map[string]any{"name": strings.Repeat("ø", 30)}
		errs := []string{"x: at '/name': maxLength: got 30, want 20"}
		if n := fixMaxLengthViolations(artifact, errs); n != 1 {
			t.Fatalf("fixed = %d, want 1", n)
		}
		if got := artifact["name"].(string); len([]rune(got)) > 20 {
			t.Errorf("string still %d runes after fix", len([]rune(got)))
		}
	})

	t.Run("non-maxLength errors ignored", func(t *testing.T) {
		artifact := map[string]any{"a": strings.Repeat("z", 100)}
		errs := []string{"x: at '/a': maxItems: got 5, want 3"}
		if n := fixMaxLengthViolations(artifact, errs); n != 0 {
			t.Fatalf("fixed = %d, want 0", n)
		}
	})

	t.Run("out of bounds index is a no-op", func(t *testing.T) {
		artifact := map[string]any{"list": []any{"a"}}
		errs := []string{"x: at '/list/5': maxLength: got 10, want 2"}
		if n := fixMaxLengthViolations(artifact, errs); n != 0 {
			t.Fatalf("fixed = %d, want 0", n)
		}
	})
}
