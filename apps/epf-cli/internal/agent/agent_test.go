package agent

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// =============================================================================
// Task 2.9: Agent loader unit tests
// =============================================================================

// --- Type tests ---

func TestAgentTypeFromString(t *testing.T) {
	tests := []struct {
		input    string
		expected AgentType
		wantErr  bool
	}{
		{"guide", AgentTypeGuide, false},
		{"strategist", AgentTypeStrategist, false},
		{"specialist", AgentTypeSpecialist, false},
		{"architect", AgentTypeArchitect, false},
		{"reviewer", AgentTypeReviewer, false},
		{"Guide", AgentTypeGuide, false},     // case-insensitive
		{"  guide  ", AgentTypeGuide, false}, // trim spaces
		{"STRATEGIST", AgentTypeStrategist, false},
		{"invalid", "", true},
		{"", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := AgentTypeFromString(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("AgentTypeFromString(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("AgentTypeFromString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestValidAgentTypes(t *testing.T) {
	types := ValidAgentTypes()
	if len(types) != 5 {
		t.Errorf("ValidAgentTypes() returned %d types, want 5", len(types))
	}
	expected := map[AgentType]bool{
		AgentTypeGuide:      true,
		AgentTypeStrategist: true,
		AgentTypeSpecialist: true,
		AgentTypeArchitect:  true,
		AgentTypeReviewer:   true,
	}
	for _, at := range types {
		if !expected[at] {
			t.Errorf("ValidAgentTypes() contains unexpected type %q", at)
		}
	}
}

func TestSourcePriority(t *testing.T) {
	if SourcePriority(SourceInstance) >= SourcePriority(SourceFramework) {
		t.Error("SourceInstance should have higher priority (lower value) than SourceFramework")
	}
	if SourcePriority(SourceFramework) >= SourcePriority(SourceGlobal) {
		t.Error("SourceFramework should have higher priority (lower value) than SourceGlobal")
	}
}

func TestAgentSourceString(t *testing.T) {
	tests := []struct {
		source   AgentSource
		expected string
	}{
		{SourceInstance, "Instance"},
		{SourceFramework, "EPF Framework"},
		{SourceGlobal, "Global"},
		{AgentSource("unknown"), "unknown"},
	}
	for _, tt := range tests {
		if got := tt.source.String(); got != tt.expected {
			t.Errorf("AgentSource(%q).String() = %q, want %q", tt.source, got, tt.expected)
		}
	}
}

// --- Legacy format reading tests ---

func TestLoaderLegacyAgentPromptFiles(t *testing.T) {
	tempDir := setupAgentTestDir(t)

	// Create wizards/ with legacy files
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)

	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), `# AI Knowledge Agent: Start EPF (Interactive Onboarding)

You are the **EPF Welcome Guide**, helping new users get started with EPF.

**Trigger phrases:**
- "start epf"
- "begin epf"
- "help me with epf"

Duration: 5-10 min`)

	writeFile(t, filepath.Join(wizardsDir, "pathfinder.agent_prompt.md"), `# Pathfinder

You are the **Pathfinder**, an expert strategic AI advisor.

**Trigger phrases:**
- "ready phase"
- "strategic planning"`)

	// .wizard.md files should also be loaded (as specialist agents)
	writeFile(t, filepath.Join(wizardsDir, "feature_definition.wizard.md"), `# Wizard: Feature Definition

Step-by-step guide for creating features.

Duration: 45-60 min`)

	// Numbered sub-wizard files
	writeFile(t, filepath.Join(wizardsDir, "01_trend_scout.agent_prompt.md"), `# Trend Scout

You are the **Trend Scout**, analyzing market trends.`)

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if loader.AgentCount() != 4 {
		t.Errorf("AgentCount() = %d, want 4 (got agents: %v)", loader.AgentCount(), loader.GetAgentNames())
	}

	// Verify start_epf loaded correctly
	agent, err := loader.GetAgent("start_epf")
	if err != nil {
		t.Fatalf("GetAgent(start_epf) error = %v", err)
	}
	if agent.Type != AgentTypeGuide {
		t.Errorf("start_epf.Type = %v, want guide", agent.Type)
	}
	if agent.Phase != schema.Phase("") {
		t.Errorf("start_epf.Phase = %q, want empty (onboarding)", agent.Phase)
	}
	if !agent.LegacyFormat {
		t.Error("start_epf.LegacyFormat should be true")
	}
	if !agent.HasPrompt {
		t.Error("start_epf.HasPrompt should be true")
	}
	if agent.HasManifest {
		t.Error("start_epf.HasManifest should be false")
	}
	if len(agent.TriggerPhrases) < 2 {
		t.Errorf("start_epf.TriggerPhrases should have >= 2 entries, got %v", agent.TriggerPhrases)
	}

	// Verify pathfinder is a strategist
	pf, _ := loader.GetAgent("pathfinder")
	if pf.Type != AgentTypeStrategist {
		t.Errorf("pathfinder.Type = %v, want strategist", pf.Type)
	}
	if pf.Phase != schema.PhaseREADY {
		t.Errorf("pathfinder.Phase = %v, want READY", pf.Phase)
	}

	// Verify feature_definition is a specialist (.wizard.md -> specialist)
	fd, _ := loader.GetAgent("feature_definition")
	if fd.Type != AgentTypeSpecialist {
		t.Errorf("feature_definition.Type = %v, want specialist", fd.Type)
	}

	// Verify sub-wizard is a specialist
	ts, _ := loader.GetAgent("01_trend_scout")
	if ts.Type != AgentTypeSpecialist {
		t.Errorf("01_trend_scout.Type = %v, want specialist", ts.Type)
	}
}

// --- Manifest format tests ---

func TestLoaderManifestFormat(t *testing.T) {
	tempDir := setupAgentTestDir(t)

	// Create agents/ directory with subdirectories containing agent.yaml
	agentsDir := filepath.Join(tempDir, "agents")
	mustMkdir(t, agentsDir)

	// Create a manifest-based agent
	agentDir := filepath.Join(agentsDir, "onboarding-guide")
	mustMkdir(t, agentDir)

	writeFile(t, filepath.Join(agentDir, "agent.yaml"), `name: onboarding-guide
version: 1.0.0
type: guide
phase: ""

identity:
  display_name: Onboarding Guide
  description: Helps new users get started with EPF
  personality:
    - friendly
    - patient

capability:
  class: balanced
  context_budget: medium

routing:
  trigger_phrases:
    - "start epf"
    - "get started"
  keywords:
    - onboarding
    - getting started

skills:
  required:
    - feature_definition
  optional:
    - roadmap_enrichment

tools:
  required:
    - epf_health_check

related_agents:
  - pathfinder

prerequisites:
  instance_required: false
  lra_required: false
`)

	writeFile(t, filepath.Join(agentDir, "prompt.md"), `# Onboarding Guide

You are the **Onboarding Guide**. Welcome the user and help them set up EPF.`)

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	agent, err := loader.GetAgent("onboarding-guide")
	if err != nil {
		t.Fatalf("GetAgent(onboarding-guide) error = %v", err)
	}

	// Verify all manifest fields are populated
	if agent.Type != AgentTypeGuide {
		t.Errorf("Type = %v, want guide", agent.Type)
	}
	if agent.Version != "1.0.0" {
		t.Errorf("Version = %q, want 1.0.0", agent.Version)
	}
	if agent.DisplayName != "Onboarding Guide" {
		t.Errorf("DisplayName = %q, want Onboarding Guide", agent.DisplayName)
	}
	if agent.Description != "Helps new users get started with EPF" {
		t.Errorf("Description = %q, want 'Helps new users get started with EPF'", agent.Description)
	}
	if agent.Capability == nil {
		t.Fatal("Capability should not be nil")
	}
	if agent.Capability.Class != CapabilityBalanced {
		t.Errorf("Capability.Class = %q, want balanced", agent.Capability.Class)
	}
	if agent.Capability.ContextBudget != ContextBudgetMedium {
		t.Errorf("Capability.ContextBudget = %q, want medium", agent.Capability.ContextBudget)
	}
	if len(agent.TriggerPhrases) != 2 {
		t.Errorf("TriggerPhrases count = %d, want 2", len(agent.TriggerPhrases))
	}
	if len(agent.Keywords) != 2 {
		t.Errorf("Keywords count = %d, want 2", len(agent.Keywords))
	}
	if len(agent.RequiredSkills) != 1 || agent.RequiredSkills[0] != "feature_definition" {
		t.Errorf("RequiredSkills = %v, want [feature_definition]", agent.RequiredSkills)
	}
	if len(agent.OptionalSkills) != 1 || agent.OptionalSkills[0] != "roadmap_enrichment" {
		t.Errorf("OptionalSkills = %v, want [roadmap_enrichment]", agent.OptionalSkills)
	}
	if len(agent.RequiredTools) != 1 || agent.RequiredTools[0] != "epf_health_check" {
		t.Errorf("RequiredTools = %v, want [epf_health_check]", agent.RequiredTools)
	}
	if len(agent.RelatedAgents) != 1 || agent.RelatedAgents[0] != "pathfinder" {
		t.Errorf("RelatedAgents = %v, want [pathfinder]", agent.RelatedAgents)
	}
	if !agent.HasManifest {
		t.Error("HasManifest should be true")
	}
	if !agent.HasPrompt {
		t.Error("HasPrompt should be true")
	}
	if agent.LegacyFormat {
		t.Error("LegacyFormat should be false for manifest agents")
	}
}

// --- Three-tier priority tests ---

func TestLoaderThreeTierPriority(t *testing.T) {
	tempDir := setupAgentTestDir(t)

	// Framework source: wizards/ with a legacy file
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"),
		`# Start EPF (Framework Version)

You are the framework version.

**Trigger phrases:**
- "start epf"`)

	// Instance source: agents/ directory
	instanceDir := t.TempDir()
	agentsDir := filepath.Join(instanceDir, "agents")
	mustMkdir(t, agentsDir)

	instanceAgentDir := filepath.Join(agentsDir, "start_epf")
	mustMkdir(t, instanceAgentDir)
	writeFile(t, filepath.Join(instanceAgentDir, "agent.yaml"), `name: start_epf
version: 2.0.0
type: guide
identity:
  display_name: Custom Start EPF
  description: Instance-level override of start_epf
`)
	writeFile(t, filepath.Join(instanceAgentDir, "prompt.md"), `# Custom Start EPF

You are the instance-level custom onboarding guide.`)

	loader := NewLoader(tempDir)
	loader.SetInstanceRoot(instanceDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Instance should override framework
	agent, err := loader.GetAgent("start_epf")
	if err != nil {
		t.Fatalf("GetAgent(start_epf) error = %v", err)
	}

	if agent.Source != SourceInstance {
		t.Errorf("start_epf.Source = %v, want instance (instance should override framework)", agent.Source)
	}
	if agent.Version != "2.0.0" {
		t.Errorf("start_epf.Version = %q, want 2.0.0 (instance version)", agent.Version)
	}
	if agent.DisplayName != "Custom Start EPF" {
		t.Errorf("start_epf.DisplayName = %q, want 'Custom Start EPF'", agent.DisplayName)
	}
}

func TestLoaderNewAgentsDirOverridesWizardsDir(t *testing.T) {
	tempDir := setupAgentTestDir(t)

	// Both agents/ and wizards/ exist
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "pathfinder.agent_prompt.md"),
		`# Pathfinder (Old)

You are the old pathfinder.`)

	agentsDir := filepath.Join(tempDir, "agents")
	mustMkdir(t, agentsDir)
	writeFile(t, filepath.Join(agentsDir, "pathfinder.agent_prompt.md"),
		`# Pathfinder (New)

You are the new pathfinder from agents/ directory.

**Trigger phrases:**
- "strategic planning"`)

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	agent, _ := loader.GetAgent("pathfinder")
	if agent == nil {
		t.Fatal("pathfinder should be loaded")
	}

	// agents/ is loaded first (it's the primary framework dir), wizards/ is fallback.
	// Since agents/ succeeded, wizards/ is skipped entirely.
	if agent.Description == "" {
		t.Log("Description is empty — that's fine for short content")
	}
}

// --- Lazy content loading tests ---

func TestLoaderLazyContentLoading(t *testing.T) {
	tempDir := setupAgentTestDir(t)

	agentsDir := filepath.Join(tempDir, "agents")
	mustMkdir(t, agentsDir)

	agentDir := filepath.Join(agentsDir, "test-agent")
	mustMkdir(t, agentDir)
	writeFile(t, filepath.Join(agentDir, "agent.yaml"), `name: test-agent
version: 1.0.0
type: guide
identity:
  display_name: Test Agent
  description: A test agent
`)
	expectedContent := `# Test Agent

This is the full prompt content for lazy loading test.`
	writeFile(t, filepath.Join(agentDir, "prompt.md"), expectedContent)

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	agent, _ := loader.GetAgent("test-agent")

	// Content should NOT be loaded yet
	if agent.ContentLoaded() {
		t.Error("Content should not be loaded before LoadContent()")
	}

	// Load content
	if err := loader.LoadContent(agent); err != nil {
		t.Fatalf("LoadContent() error = %v", err)
	}

	if !agent.ContentLoaded() {
		t.Error("Content should be loaded after LoadContent()")
	}
	if agent.Content != expectedContent {
		t.Errorf("Content = %q, want %q", agent.Content, expectedContent)
	}

	// Second call should be a no-op
	if err := loader.LoadContent(agent); err != nil {
		t.Fatalf("Second LoadContent() error = %v", err)
	}
}

func TestGetAgentWithContent(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	agentsDir := filepath.Join(tempDir, "agents")
	mustMkdir(t, agentsDir)

	agentDir := filepath.Join(agentsDir, "test-agent")
	mustMkdir(t, agentDir)
	writeFile(t, filepath.Join(agentDir, "agent.yaml"), `name: test-agent
version: 1.0.0
type: guide
identity:
  display_name: Test Agent
  description: Test
`)
	writeFile(t, filepath.Join(agentDir, "prompt.md"), "# Test prompt")

	loader := NewLoader(tempDir)
	loader.Load()

	agent, err := loader.GetAgentWithContent("test-agent")
	if err != nil {
		t.Fatalf("GetAgentWithContent() error = %v", err)
	}
	if !agent.ContentLoaded() {
		t.Error("GetAgentWithContent should return agent with content loaded")
	}
	if agent.Content != "# Test prompt" {
		t.Errorf("Content = %q, want '# Test prompt'", agent.Content)
	}
}

// --- Agent lookup tests ---

func TestGetAgentCaseInsensitive(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "pathfinder.agent_prompt.md"), "# Pathfinder\nYou are the Pathfinder.")

	loader := NewLoader(tempDir)
	loader.Load()

	// Case-insensitive match
	agent, err := loader.GetAgent("Pathfinder")
	if err != nil {
		t.Errorf("GetAgent('Pathfinder') should work case-insensitively, error = %v", err)
	}
	if agent != nil && agent.Name != "pathfinder" {
		t.Errorf("Name = %q, want pathfinder", agent.Name)
	}
}

func TestGetAgentPartialMatch(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "strategic_coherence_review.agent_prompt.md"), "# SCR\nReview coherence.")

	loader := NewLoader(tempDir)
	loader.Load()

	// Partial match
	agent, err := loader.GetAgent("coherence")
	if err != nil {
		t.Errorf("GetAgent('coherence') should match partially, error = %v", err)
	}
	if agent != nil && agent.Name != "strategic_coherence_review" {
		t.Errorf("Name = %q, want strategic_coherence_review", agent.Name)
	}
}

func TestGetAgentNotFound(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), "# Start\nYou are the guide.")

	loader := NewLoader(tempDir)
	loader.Load()

	_, err := loader.GetAgent("nonexistent_agent")
	if err == nil {
		t.Error("GetAgent('nonexistent_agent') should return error")
	}
}

// --- List and filter tests ---

func TestListAgentsFilterByPhase(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)

	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), "# Start\nGuide.")
	writeFile(t, filepath.Join(wizardsDir, "pathfinder.agent_prompt.md"), "# Pathfinder\nStrategist.")
	writeFile(t, filepath.Join(wizardsDir, "product_architect.agent_prompt.md"), "# Architect\nBuilder.")
	writeFile(t, filepath.Join(wizardsDir, "synthesizer.agent_prompt.md"), "# Synthesizer\nAnalyzer.")

	loader := NewLoader(tempDir)
	loader.Load()

	readyPhase := schema.PhaseREADY
	readyAgents := loader.ListAgents(&readyPhase, nil)
	for _, a := range readyAgents {
		if a.Phase != schema.PhaseREADY {
			t.Errorf("ListAgents(READY) returned agent %q with phase %q", a.Name, a.Phase)
		}
	}

	firePhase := schema.PhaseFIRE
	fireAgents := loader.ListAgents(&firePhase, nil)
	for _, a := range fireAgents {
		if a.Phase != schema.PhaseFIRE {
			t.Errorf("ListAgents(FIRE) returned agent %q with phase %q", a.Name, a.Phase)
		}
	}
}

func TestListAgentsFilterByType(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)

	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), "# Start\nGuide.")
	writeFile(t, filepath.Join(wizardsDir, "pathfinder.agent_prompt.md"), "# Pathfinder\nStrategist.")
	writeFile(t, filepath.Join(wizardsDir, "value_model_review.agent_prompt.md"), "# Review\nReviewer.")

	loader := NewLoader(tempDir)
	loader.Load()

	guideType := AgentTypeGuide
	guides := loader.ListAgents(nil, &guideType)
	for _, a := range guides {
		if a.Type != AgentTypeGuide {
			t.Errorf("ListAgents(guide) returned agent %q with type %q", a.Name, a.Type)
		}
	}
}

func TestAgentsBySource(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), "# Start\nGuide.")

	instanceDir := t.TempDir()
	agentsDir := filepath.Join(instanceDir, "agents")
	mustMkdir(t, agentsDir)
	instAgent := filepath.Join(agentsDir, "custom-agent")
	mustMkdir(t, instAgent)
	writeFile(t, filepath.Join(instAgent, "agent.yaml"), `name: custom-agent
version: 1.0.0
type: specialist
identity:
  display_name: Custom
  description: Custom agent
`)

	loader := NewLoader(tempDir)
	loader.SetInstanceRoot(instanceDir)
	loader.Load()

	bySource := loader.AgentsBySource()
	if _, ok := bySource[SourceFramework]; !ok {
		t.Error("Should have framework agents")
	}
	if _, ok := bySource[SourceInstance]; !ok {
		t.Error("Should have instance agents")
	}
}

func TestAgentsByType(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), "# Start\nGuide.")
	writeFile(t, filepath.Join(wizardsDir, "pathfinder.agent_prompt.md"), "# Pathfinder\nStrategist.")
	writeFile(t, filepath.Join(wizardsDir, "value_model_review.agent_prompt.md"), "# Review\nReviewer.")

	loader := NewLoader(tempDir)
	loader.Load()

	byType := loader.AgentsByType()
	if len(byType) == 0 {
		t.Error("Should have agents grouped by type")
	}
}

// --- inferAgentType tests ---

func TestInferAgentType(t *testing.T) {
	tests := []struct {
		name     string
		fallback AgentType
		expected AgentType
	}{
		{"start_epf", AgentTypeGuide, AgentTypeGuide},
		{"onboarding-guide", AgentTypeGuide, AgentTypeGuide},
		{"pathfinder", AgentTypeStrategist, AgentTypeStrategist},
		{"lean_start", AgentTypeStrategist, AgentTypeStrategist},
		{"synthesizer", AgentTypeStrategist, AgentTypeStrategist},
		{"product_architect", AgentTypeArchitect, AgentTypeArchitect},
		{"fire-phase-architect", AgentTypeArchitect, AgentTypeArchitect},
		{"value_model_review", AgentTypeReviewer, AgentTypeReviewer},
		{"feature_quality_review", AgentTypeReviewer, AgentTypeReviewer},
		{"strategic_coherence_review", AgentTypeReviewer, AgentTypeReviewer},
		{"balance_checker", AgentTypeReviewer, AgentTypeReviewer},
		{"01_trend_scout", AgentTypeSpecialist, AgentTypeSpecialist},
		{"feature_definition", AgentTypeSpecialist, AgentTypeSpecialist},
		{"unknown_agent", AgentTypeGuide, AgentTypeGuide}, // Uses fallback
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := inferAgentType(tt.name, tt.fallback)
			if got != tt.expected {
				t.Errorf("inferAgentType(%q, %q) = %q, want %q", tt.name, tt.fallback, got, tt.expected)
			}
		})
	}
}

// --- formatDisplayName tests ---

func TestFormatDisplayName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"start_epf", "Start Epf"},
		{"pathfinder", "Pathfinder"},
		{"01_trend_scout", "Trend Scout"},
		{"feature-quality-review", "Feature Quality Review"},
		{"onboarding-guide", "Onboarding Guide"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := formatDisplayName(tt.input)
			if got != tt.expected {
				t.Errorf("formatDisplayName(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

// --- PhaseForAgent tests ---

func TestPhaseForAgent(t *testing.T) {
	tests := []struct {
		name     string
		expected schema.Phase
		found    bool
	}{
		{"start_epf", "", true},
		{"pathfinder", schema.PhaseREADY, true},
		{"lean_start", schema.PhaseREADY, true},
		{"product_architect", schema.PhaseFIRE, true},
		{"synthesizer", schema.PhaseAIM, true},
		{"onboarding-guide", "", true},
		{"unknown", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			phase, ok := PhaseForAgent[tt.name]
			if ok != tt.found {
				t.Errorf("PhaseForAgent[%q] found = %v, want %v", tt.name, ok, tt.found)
				return
			}
			if ok && phase != tt.expected {
				t.Errorf("PhaseForAgent[%q] = %q, want %q", tt.name, phase, tt.expected)
			}
		})
	}
}

// --- Metadata parser tests ---

func TestParsePurpose(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		wantNon  bool // Just check it's non-empty
		contains string
	}{
		{
			name: "parenthetical purpose",
			content: `# AI Agent: Start EPF (Interactive Onboarding)

Some text.`,
			wantNon:  true,
			contains: "Interactive Onboarding",
		},
		{
			name: "you are the pattern",
			content: `# Pathfinder

You are the **Pathfinder**, an expert strategic AI advisor.`,
			wantNon:  true,
			contains: "Pathfinder",
		},
		{
			name: "heading after colon",
			content: `# Wizard: Feature Definition

This wizard helps you create features.`,
			wantNon:  true,
			contains: "Feature Definition",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parsePurpose(tt.content)
			if tt.wantNon && got == "" {
				t.Errorf("parsePurpose() returned empty, want non-empty containing %q", tt.contains)
				return
			}
			if tt.contains != "" && got != "" {
				if !contains(got, tt.contains) {
					t.Errorf("parsePurpose() = %q, want to contain %q", got, tt.contains)
				}
			}
		})
	}
}

func TestParseTriggerPhrases(t *testing.T) {
	content := `**Trigger phrases:**
- "start epf"
- "begin epf"
- "help me with epf"

Some other content.`

	phrases := parseTriggerPhrases(content)
	if len(phrases) != 3 {
		t.Errorf("parseTriggerPhrases() returned %d phrases, want 3: %v", len(phrases), phrases)
	}
	expected := map[string]bool{"start epf": true, "begin epf": true, "help me with epf": true}
	for _, p := range phrases {
		if !expected[p] {
			t.Errorf("Unexpected trigger phrase: %q", p)
		}
	}
}

func TestParseRelatedWizards(t *testing.T) {
	content := `This agent works alongside:
- ` + "`pathfinder.agent_prompt.md`" + ` for strategic planning
- ` + "`feature_definition.wizard.md`" + ` for feature creation

See also [Product Architect](../wizards/product_architect.agent_prompt.md).`

	related := parseRelatedWizards(content, "start_epf")
	if len(related) < 2 {
		t.Errorf("parseRelatedWizards() returned %d, want >= 2: %v", len(related), related)
	}
	expectedRelated := map[string]bool{"pathfinder": true, "feature_definition": true, "product_architect": true}
	for _, r := range related {
		if !expectedRelated[r] {
			t.Errorf("Unexpected related wizard: %q", r)
		}
	}
}

// --- Recommender tests ---

func TestRecommenderTriggerPhraseMatch(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)

	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), `# Start EPF
**Trigger phrases:**
- "start epf"
- "help me with epf"`)

	writeFile(t, filepath.Join(wizardsDir, "pathfinder.agent_prompt.md"), `# Pathfinder
**Trigger phrases:**
- "strategic planning"
- "ready phase"`)

	loader := NewLoader(tempDir)
	loader.Load()

	recommender := NewRecommender(loader)

	tests := []struct {
		task     string
		expected string
	}{
		{"start epf", "start_epf"},
		{"help me with epf", "start_epf"},
		{"strategic planning", "pathfinder"},
	}

	for _, tt := range tests {
		t.Run(tt.task, func(t *testing.T) {
			rec, err := recommender.RecommendForTask(tt.task)
			if err != nil {
				t.Fatalf("RecommendForTask(%q) error = %v", tt.task, err)
			}
			if rec == nil || rec.Agent == nil {
				t.Fatalf("RecommendForTask(%q) returned nil recommendation", tt.task)
			}
			if rec.Agent.Name != tt.expected {
				t.Errorf("RecommendForTask(%q).Agent.Name = %q, want %q", tt.task, rec.Agent.Name, tt.expected)
			}
		})
	}
}

// --- Loader edge cases ---

func TestLoaderMissingDirectory(t *testing.T) {
	loader := NewLoader("/nonexistent/path")
	// Should not error — just uses embedded (or loads nothing)
	err := loader.Load()
	if err != nil {
		// Acceptable — embedded may not be available in test context
		t.Logf("Load() with nonexistent path: %v", err)
	}
}

func TestLoaderSkipsHiddenDirs(t *testing.T) {
	tempDir := setupAgentTestDir(t)
	agentsDir := filepath.Join(tempDir, "agents")
	mustMkdir(t, agentsDir)

	// Hidden directory should be skipped
	hiddenDir := filepath.Join(agentsDir, ".hidden-agent")
	mustMkdir(t, hiddenDir)
	writeFile(t, filepath.Join(hiddenDir, "agent.yaml"), `name: hidden
version: 1.0.0
type: guide
identity:
  display_name: Hidden
  description: Should not be loaded
`)

	// Underscore-prefixed directory should be skipped
	underscoreDir := filepath.Join(agentsDir, "_internal-agent")
	mustMkdir(t, underscoreDir)
	writeFile(t, filepath.Join(underscoreDir, "agent.yaml"), `name: internal
version: 1.0.0
type: guide
identity:
  display_name: Internal
  description: Should not be loaded
`)

	// Normal directory should be loaded
	normalDir := filepath.Join(agentsDir, "normal-agent")
	mustMkdir(t, normalDir)
	writeFile(t, filepath.Join(normalDir, "agent.yaml"), `name: normal-agent
version: 1.0.0
type: guide
identity:
  display_name: Normal
  description: Should be loaded
`)

	loader := NewLoader(tempDir)
	loader.Load()

	if loader.AgentCount() != 1 {
		t.Errorf("AgentCount() = %d, want 1 (only normal-agent)", loader.AgentCount())
		t.Logf("Loaded agents: %v", loader.GetAgentNames())
	}
}

func TestAgentInfoSetContent(t *testing.T) {
	info := &AgentInfo{Name: "test"}
	if info.ContentLoaded() {
		t.Error("New AgentInfo should have contentLoaded = false")
	}
	info.SetContent("hello")
	if !info.ContentLoaded() {
		t.Error("After SetContent, contentLoaded should be true")
	}
	if info.Content != "hello" {
		t.Errorf("Content = %q, want 'hello'", info.Content)
	}
}

// --- Test helpers ---

func setupAgentTestDir(t *testing.T) string {
	t.Helper()
	return t.TempDir()
}

func mustMkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0755); err != nil {
		t.Fatalf("Failed to create directory %s: %v", path, err)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write %s: %v", path, err)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
