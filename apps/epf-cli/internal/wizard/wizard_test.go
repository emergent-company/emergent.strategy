package wizard

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// TestWizardTypeFromString tests wizard type string conversion
func TestWizardTypeFromString(t *testing.T) {
	tests := []struct {
		input    string
		expected WizardType
		wantErr  bool
	}{
		{"agent_prompt", WizardTypeAgentPrompt, false},
		{"agentprompt", WizardTypeAgentPrompt, false},
		{"wizard", WizardTypeWizard, false},
		{"ready_sub_wizard", WizardTypeReadySubWizard, false},
		{"sub_wizard", WizardTypeReadySubWizard, false},
		{"invalid", "", true},
		{"", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := WizardTypeFromString(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("WizardTypeFromString(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("WizardTypeFromString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

// TestParserParsePurpose tests purpose extraction from wizard content
func TestParserParsePurpose(t *testing.T) {
	parser := NewParser()

	tests := []struct {
		name     string
		content  string
		expected string
	}{
		{
			name: "purpose from parenthetical",
			content: `# AI Knowledge Agent: Start EPF (Interactive Onboarding)

Some intro text here.`,
			expected: "Interactive Onboarding",
		},
		{
			name: "purpose from you are statement",
			content: `# Pathfinder

You are the **Pathfinder**, an expert strategic AI.

More content here.`,
			expected: "Pathfinder an expert strategic AI.",
		},
		{
			name: "purpose from heading after colon",
			content: `# Wizard: Feature Definition

This wizard helps you create features.`,
			expected: "Feature Definition",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parser.ParsePurpose(tt.content)
			if got != tt.expected {
				t.Errorf("ParsePurpose() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// TestParserParseTriggerPhrases tests trigger phrase extraction
func TestParserParseTriggerPhrases(t *testing.T) {
	parser := NewParser()

	tests := []struct {
		name     string
		content  string
		expected []string
	}{
		{
			name: "trigger phrases from list",
			content: `**Trigger phrases:**
- "start epf"
- "begin epf"
- "help me with epf"`,
			expected: []string{"start epf", "begin epf", "help me with epf"},
		},
		{
			name:     "user says patterns",
			content:  `User says: "create a feature"`,
			expected: []string{"create a feature"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parser.ParseTriggerPhrases(tt.content)
			if len(got) != len(tt.expected) {
				t.Errorf("ParseTriggerPhrases() returned %d items, want %d", len(got), len(tt.expected))
				t.Errorf("Got: %v", got)
				return
			}
			for i, trigger := range tt.expected {
				if got[i] != trigger {
					t.Errorf("ParseTriggerPhrases()[%d] = %q, want %q", i, got[i], trigger)
				}
			}
		})
	}
}

// TestParserParseDuration tests duration extraction
func TestParserParseDuration(t *testing.T) {
	parser := NewParser()

	tests := []struct {
		name     string
		content  string
		expected string
	}{
		{
			name:     "duration from inline",
			content:  "This wizard takes 2-3 hours to complete.",
			expected: "2-3 hours",
		},
		{
			name:     "duration from parenthetical",
			content:  "Quick start wizard (30-45 min)",
			expected: "30-45 min",
		},
		{
			name:     "duration with minutes keyword",
			content:  "Duration: 15-20 min",
			expected: "15-20 min",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parser.ParseDuration(tt.content)
			if got != tt.expected {
				t.Errorf("ParseDuration() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// TestLoaderWithTempDir tests the loader with a temporary directory
func TestLoaderWithTempDir(t *testing.T) {
	// Create temp directory structure
	tempDir, err := os.MkdirTemp("", "epf-wizard-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create wizards directory
	wizardsDir := filepath.Join(tempDir, "wizards")
	if err := os.MkdirAll(wizardsDir, 0755); err != nil {
		t.Fatalf("Failed to create wizards dir: %v", err)
	}

	// Create test wizard files
	testWizards := map[string]string{
		"start_epf.agent_prompt.md": `# Start EPF (Interactive Onboarding)

You are the **EPF Welcome Guide**.

**Trigger phrases:**
- "start epf"
- "begin epf"

Duration: 5-10 min`,
		"feature_definition.wizard.md": `# Feature Definition Wizard

Step-by-step guide for creating features.

Duration: 45-60 min`,
		"01_trend_scout.agent_prompt.md": `# Trend Scout

You are the **Trend Scout**, analyzing market trends.`,
	}

	for filename, content := range testWizards {
		if err := os.WriteFile(filepath.Join(wizardsDir, filename), []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write %s: %v", filename, err)
		}
	}

	// Test loader
	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Test wizard count
	if count := loader.WizardCount(); count != 3 {
		t.Errorf("WizardCount() = %d, want 3", count)
	}

	// Test ListWizards
	wizards := loader.ListWizards(nil, nil)
	if len(wizards) != 3 {
		t.Errorf("ListWizards(nil, nil) returned %d wizards, want 3", len(wizards))
	}

	// Test GetWizard
	wizard, err := loader.GetWizard("start_epf")
	if err != nil {
		t.Errorf("GetWizard(start_epf) error = %v", err)
	}
	if wizard == nil {
		t.Fatal("GetWizard(start_epf) returned nil")
	}
	if wizard.Type != WizardTypeAgentPrompt {
		t.Errorf("start_epf type = %v, want agent_prompt", wizard.Type)
	}

	// Test wizard type detection
	featureWizard, _ := loader.GetWizard("feature_definition")
	if featureWizard.Type != WizardTypeWizard {
		t.Errorf("feature_definition type = %v, want wizard", featureWizard.Type)
	}

	trendWizard, _ := loader.GetWizard("01_trend_scout")
	if trendWizard.Type != WizardTypeReadySubWizard {
		t.Errorf("01_trend_scout type = %v, want ready_sub_wizard", trendWizard.Type)
	}

	// Test filter by type
	agentPromptType := WizardTypeAgentPrompt
	agentPrompts := loader.ListWizards(nil, &agentPromptType)
	// Only start_epf is a pure agent_prompt; 01_trend_scout is a ready_sub_wizard
	if len(agentPrompts) != 1 {
		t.Errorf("ListWizards with agent_prompt filter returned %d, want 1", len(agentPrompts))
	}
}

// TestRecommender tests the wizard recommender
func TestRecommender(t *testing.T) {
	// Create temp directory with test wizards
	tempDir, err := os.MkdirTemp("", "epf-wizard-recommend-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	wizardsDir := filepath.Join(tempDir, "wizards")
	if err := os.MkdirAll(wizardsDir, 0755); err != nil {
		t.Fatalf("Failed to create wizards dir: %v", err)
	}

	// Create test wizards
	testWizards := map[string]string{
		"start_epf.agent_prompt.md": `# Start EPF
**Trigger phrases:**
- "start epf"
- "help me with epf"
- "what is epf"`,
		"feature_definition.wizard.md": `# Feature Definition
**Trigger phrases:**
- "create feature"
- "define feature"`,
		"pathfinder.agent_prompt.md": `# Pathfinder
**Trigger phrases:**
- "ready phase"
- "strategic planning"`,
	}

	for filename, content := range testWizards {
		if err := os.WriteFile(filepath.Join(wizardsDir, filename), []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write %s: %v", filename, err)
		}
	}

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	recommender := NewRecommender(loader)

	tests := []struct {
		task           string
		expectedWizard string
		minConfidence  string
	}{
		{"start epf", "start_epf", "high"},
		{"help me with epf", "start_epf", "high"},
		{"create feature", "feature_definition", "high"},
		{"ready phase planning", "pathfinder", "high"},
	}

	for _, tt := range tests {
		t.Run(tt.task, func(t *testing.T) {
			rec, err := recommender.RecommendForTask(tt.task)
			if err != nil {
				t.Errorf("RecommendForTask(%q) error = %v", tt.task, err)
				return
			}
			if rec == nil || rec.Wizard == nil {
				t.Errorf("RecommendForTask(%q) returned nil recommendation", tt.task)
				return
			}
			if rec.Wizard.Name != tt.expectedWizard {
				t.Errorf("RecommendForTask(%q).Wizard.Name = %q, want %q", tt.task, rec.Wizard.Name, tt.expectedWizard)
			}
		})
	}
}

// TestPhaseForWizard tests the phase mapping
func TestPhaseForWizard(t *testing.T) {
	tests := []struct {
		wizardName string
		expected   schema.Phase
	}{
		{"start_epf", ""},
		{"lean_start", schema.PhaseREADY},
		{"pathfinder", schema.PhaseREADY},
		{"product_architect", schema.PhaseFIRE},
		{"synthesizer", schema.PhaseAIM},
		{"unknown_wizard", ""},
	}

	for _, tt := range tests {
		t.Run(tt.wizardName, func(t *testing.T) {
			got, ok := PhaseForWizard[tt.wizardName]
			if !ok && tt.expected != "" {
				t.Errorf("PhaseForWizard[%q] not found, expected %q", tt.wizardName, tt.expected)
				return
			}
			if got != tt.expected {
				t.Errorf("PhaseForWizard[%q] = %q, want %q", tt.wizardName, got, tt.expected)
			}
		})
	}
}

// TestKeywordMappings tests that keyword mappings return valid wizard names
func TestKeywordMappings(t *testing.T) {
	expectedWizards := map[string]bool{
		"start_epf":                  true,
		"lean_start":                 true,
		"pathfinder":                 true,
		"feature_definition":         true,
		"product_architect":          true,
		"synthesizer":                true,
		"balance_checker":            true,
		"01_trend_scout":             true,
		"02_market_mapper":           true,
		"03_internal_mirror":         true,
		"04_problem_detective":       true,
		"aim_trigger_assessment":     true,
		"context_sheet_generator":    true,
		"feature_enrichment":         true,
		"roadmap_enrichment":         true,
		"value_model_review":         true,
		"strategic_reality_check":    true,
		"feature_quality_review":     true,
		"strategic_coherence_review": true,
	}

	for keyword, wizards := range KeywordMappings {
		t.Run(keyword, func(t *testing.T) {
			if len(wizards) == 0 {
				t.Errorf("KeywordMappings[%q] has no wizards", keyword)
				return
			}
			for _, wizard := range wizards {
				if !expectedWizards[wizard] {
					t.Errorf("KeywordMappings[%q] contains unknown wizard %q", keyword, wizard)
				}
			}
		})
	}
}

// =============================================================================
// Task 6.3: Test strategic_reality_check wizard discoverability
// Task 9.4: Test new wizards are registered in PhaseForWizard and discoverable
// =============================================================================

// TestPhaseForWizard_NewWizards verifies the new wizards are registered in PhaseForWizard
func TestPhaseForWizard_NewWizards(t *testing.T) {
	tests := []struct {
		wizardName    string
		expectedPhase schema.Phase
	}{
		{"strategic_reality_check", schema.PhaseAIM},
		{"feature_quality_review", schema.PhaseFIRE},
		{"strategic_coherence_review", schema.PhaseREADY},
	}

	for _, tt := range tests {
		t.Run(tt.wizardName, func(t *testing.T) {
			phase, ok := PhaseForWizard[tt.wizardName]
			if !ok {
				t.Errorf("PhaseForWizard missing entry for %q", tt.wizardName)
				return
			}
			if phase != tt.expectedPhase {
				t.Errorf("PhaseForWizard[%q] = %q, want %q", tt.wizardName, phase, tt.expectedPhase)
			}
		})
	}
}

// TestKeywordMappings_StrategicRealityCheck verifies keyword mappings for strategic_reality_check
func TestKeywordMappings_StrategicRealityCheck(t *testing.T) {
	keywords := []string{
		"reality check",
		"strategic reality",
		"src",
		"artifact freshness",
		"strategy validation",
		"cross-reference",
	}

	for _, keyword := range keywords {
		t.Run(keyword, func(t *testing.T) {
			wizards, ok := KeywordMappings[keyword]
			if !ok {
				t.Errorf("KeywordMappings missing keyword %q", keyword)
				return
			}
			found := false
			for _, w := range wizards {
				if w == "strategic_reality_check" {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("KeywordMappings[%q] = %v, expected to contain \"strategic_reality_check\"", keyword, wizards)
			}
		})
	}
}

// TestKeywordMappings_FeatureQualityReview verifies keyword mappings for feature_quality_review
func TestKeywordMappings_FeatureQualityReview(t *testing.T) {
	keywords := []string{
		"feature quality",
		"feature quality review",
		"review features",
		"feature review",
		"persona quality",
		"jtbd quality",
		"scenario completeness",
	}

	for _, keyword := range keywords {
		t.Run(keyword, func(t *testing.T) {
			wizards, ok := KeywordMappings[keyword]
			if !ok {
				t.Errorf("KeywordMappings missing keyword %q", keyword)
				return
			}
			found := false
			for _, w := range wizards {
				if w == "feature_quality_review" {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("KeywordMappings[%q] = %v, expected to contain \"feature_quality_review\"", keyword, wizards)
			}
		})
	}
}

// TestKeywordMappings_StrategicCoherenceReview verifies keyword mappings for strategic_coherence_review
func TestKeywordMappings_StrategicCoherenceReview(t *testing.T) {
	keywords := []string{
		"strategic coherence",
		"coherence review",
		"strategy alignment",
		"strategic alignment",
		"broken cross-references",
		"orphaned features",
		"strategy chain",
	}

	for _, keyword := range keywords {
		t.Run(keyword, func(t *testing.T) {
			wizards, ok := KeywordMappings[keyword]
			if !ok {
				t.Errorf("KeywordMappings missing keyword %q", keyword)
				return
			}
			found := false
			for _, w := range wizards {
				if w == "strategic_coherence_review" {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("KeywordMappings[%q] = %v, expected to contain \"strategic_coherence_review\"", keyword, wizards)
			}
		})
	}
}

// TestKeywordMappings_AllNewWizardsIncluded verifies the expectedWizards set used by
// TestKeywordMappings includes the new wizards
func TestKeywordMappings_AllNewWizardsIncluded(t *testing.T) {
	// Collect all wizard names referenced in KeywordMappings
	allWizards := make(map[string]bool)
	for _, wizards := range KeywordMappings {
		for _, w := range wizards {
			allWizards[w] = true
		}
	}

	newWizards := []string{
		"strategic_reality_check",
		"feature_quality_review",
		"strategic_coherence_review",
	}

	for _, w := range newWizards {
		if !allWizards[w] {
			t.Errorf("Wizard %q is not referenced by any keyword in KeywordMappings", w)
		}
	}
}

// TestRecommenderWithNewWizards tests that the recommender returns new wizards
// for appropriate task descriptions using real embedded wizards
func TestRecommenderWithNewWizards(t *testing.T) {
	// Create temp directory with test wizards including the new ones
	tempDir, err := os.MkdirTemp("", "epf-wizard-newwiz-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	wizardsDir := filepath.Join(tempDir, "wizards")
	if err := os.MkdirAll(wizardsDir, 0755); err != nil {
		t.Fatalf("Failed to create wizards dir: %v", err)
	}

	testWizards := map[string]string{
		"strategic_reality_check.agent_prompt.md": `# Strategic Reality Check
**Trigger phrases:**
- "reality check"
- "strategic reality"
- "SRC"`,
		"feature_quality_review.agent_prompt.md": `# Feature Quality Review
**Trigger phrases:**
- "feature quality"
- "review features"`,
		"strategic_coherence_review.agent_prompt.md": `# Strategic Coherence Review
**Trigger phrases:**
- "strategic coherence"
- "coherence review"`,
	}

	for filename, content := range testWizards {
		if err := os.WriteFile(filepath.Join(wizardsDir, filename), []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write %s: %v", filename, err)
		}
	}

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	recommender := NewRecommender(loader)

	tests := []struct {
		task           string
		expectedWizard string
	}{
		{"reality check", "strategic_reality_check"},
		{"SRC", "strategic_reality_check"},
		{"feature quality", "feature_quality_review"},
		{"review features", "feature_quality_review"},
		{"strategic coherence", "strategic_coherence_review"},
		{"coherence review", "strategic_coherence_review"},
	}

	for _, tt := range tests {
		t.Run(tt.task, func(t *testing.T) {
			rec, err := recommender.RecommendForTask(tt.task)
			if err != nil {
				t.Errorf("RecommendForTask(%q) error = %v", tt.task, err)
				return
			}
			if rec == nil || rec.Wizard == nil {
				t.Errorf("RecommendForTask(%q) returned nil recommendation", tt.task)
				return
			}
			if rec.Wizard.Name != tt.expectedWizard {
				t.Errorf("RecommendForTask(%q).Wizard.Name = %q, want %q", tt.task, rec.Wizard.Name, tt.expectedWizard)
			}
		})
	}
}

// TestLoaderMissingDirectory tests loader behavior with missing directory (falls back to embedded)
func TestLoaderMissingDirectory(t *testing.T) {
	loader := NewLoader("/nonexistent/path")
	err := loader.Load()
	// With embedded fallback, this should now succeed if embedded artifacts are available
	if err != nil {
		// If error, it means embedded is not available (acceptable in CI)
		t.Logf("Load() returned error (expected if embedded not available): %v", err)
		return
	}
	// If it succeeded, it should have loaded from embedded
	if loader.HasWizards() {
		// Verify it's using embedded
		if !loader.IsEmbedded() {
			t.Error("Load() should have used embedded fallback for nonexistent path")
		}
	}
}

// TestGetWizardNotFound tests GetWizard with nonexistent wizard
func TestGetWizardNotFound(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "epf-wizard-notfound-test")
	defer os.RemoveAll(tempDir)

	wizardsDir := filepath.Join(tempDir, "wizards")
	os.MkdirAll(wizardsDir, 0755)
	os.WriteFile(filepath.Join(wizardsDir, "test.agent_prompt.md"), []byte("# Test"), 0644)

	loader := NewLoader(tempDir)
	loader.Load()

	_, err := loader.GetWizard("nonexistent")
	if err == nil {
		t.Error("GetWizard(nonexistent) should return error")
	}
}

// TestKeywordMappings_EvaluationKeywords tests that evaluation-focused keywords
// route to the correct review wizards
func TestKeywordMappings_EvaluationKeywords(t *testing.T) {
	tests := []struct {
		keyword         string
		expectedWizards []string
	}{
		{"evaluate", []string{"strategic_coherence_review", "feature_quality_review", "value_model_review"}},
		{"evaluate quality", []string{"strategic_coherence_review", "feature_quality_review", "value_model_review"}},
		{"evaluate strategy", []string{"strategic_coherence_review"}},
		{"evaluate features", []string{"feature_quality_review"}},
		{"evaluate value model", []string{"value_model_review"}},
		{"assess quality", []string{"strategic_coherence_review", "feature_quality_review"}},
		{"check quality", []string{"feature_quality_review", "value_model_review"}},
		{"review quality", []string{"strategic_coherence_review", "feature_quality_review", "value_model_review"}},
		{"quality review", []string{"strategic_coherence_review", "feature_quality_review", "value_model_review"}},
		{"semantic review", []string{"strategic_coherence_review", "feature_quality_review", "value_model_review"}},
		{"review instance", []string{"strategic_coherence_review", "feature_quality_review", "value_model_review"}},
	}

	for _, tt := range tests {
		t.Run(tt.keyword, func(t *testing.T) {
			wizards, ok := KeywordMappings[tt.keyword]
			if !ok {
				t.Errorf("KeywordMappings[%q] not found", tt.keyword)
				return
			}
			if len(wizards) != len(tt.expectedWizards) {
				t.Errorf("KeywordMappings[%q] has %d wizards, want %d: got %v",
					tt.keyword, len(wizards), len(tt.expectedWizards), wizards)
				return
			}
			for i, expected := range tt.expectedWizards {
				if wizards[i] != expected {
					t.Errorf("KeywordMappings[%q][%d] = %q, want %q",
						tt.keyword, i, wizards[i], expected)
				}
			}
		})
	}
}

// TestRecommenderEvaluationRouting tests that the recommender correctly routes
// evaluation tasks to review wizards
func TestRecommenderEvaluationRouting(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "epf-wizard-eval-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	wizardsDir := filepath.Join(tempDir, "wizards")
	if err := os.MkdirAll(wizardsDir, 0755); err != nil {
		t.Fatalf("Failed to create wizards dir: %v", err)
	}

	testWizards := map[string]string{
		"strategic_coherence_review.agent_prompt.md": `# Strategic Coherence Review
**Trigger phrases:**
- "evaluate strategy"
- "strategic coherence"`,
		"feature_quality_review.agent_prompt.md": `# Feature Quality Review
**Trigger phrases:**
- "evaluate features"
- "feature quality"
- "review feature definitions"`,
		"value_model_review.agent_prompt.md": `# Value Model Review
**Trigger phrases:**
- "evaluate value model"
- "value model quality"`,
	}

	for filename, content := range testWizards {
		if err := os.WriteFile(filepath.Join(wizardsDir, filename), []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write %s: %v", filename, err)
		}
	}

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	recommender := NewRecommender(loader)

	tests := []struct {
		task           string
		expectedWizard string
	}{
		{"evaluate our strategy quality", "strategic_coherence_review"},
		{"review feature definitions", "feature_quality_review"},
		{"evaluate value model", "value_model_review"},
		{"evaluate features", "feature_quality_review"},
		{"feature quality", "feature_quality_review"},
	}

	for _, tt := range tests {
		t.Run(tt.task, func(t *testing.T) {
			rec, err := recommender.RecommendForTask(tt.task)
			if err != nil {
				t.Errorf("RecommendForTask(%q) error = %v", tt.task, err)
				return
			}
			if rec == nil || rec.Wizard == nil {
				t.Errorf("RecommendForTask(%q) returned nil recommendation", tt.task)
				return
			}
			if rec.Wizard.Name != tt.expectedWizard {
				t.Errorf("RecommendForTask(%q).Wizard.Name = %q, want %q", tt.task, rec.Wizard.Name, tt.expectedWizard)
			}
		})
	}
}
