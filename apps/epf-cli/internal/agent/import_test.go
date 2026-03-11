package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestDetectAgentFormat(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		path     string
		expected ImportFormat
	}{
		{
			name:     "raw markdown",
			content:  "# My Agent\n\nYou are a helpful assistant.",
			path:     "agent.md",
			expected: ImportFormatRaw,
		},
		{
			name:     "crewai yaml",
			content:  "role: Strategist\ngoal: Analyze market\nbackstory: You are an expert.",
			path:     "agent.yaml",
			expected: ImportFormatCrewAI,
		},
		{
			name:     "openai json",
			content:  `{"name": "Test", "instructions": "Be helpful", "model": "gpt-4"}`,
			path:     "assistant.json",
			expected: ImportFormatOpenAI,
		},
		{
			name:     "yaml without crewai fields",
			content:  "name: test\ntype: guide",
			path:     "agent.yaml",
			expected: ImportFormatRaw,
		},
		{
			name:     "json without openai fields",
			content:  `{"name": "test", "type": "guide"}`,
			path:     "data.json",
			expected: ImportFormatRaw,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := detectAgentFormat(tt.content, tt.path)
			if got != tt.expected {
				t.Errorf("detectAgentFormat() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestImportFormatFromString(t *testing.T) {
	tests := []struct {
		input    string
		expected ImportFormat
		wantErr  bool
	}{
		{"auto", ImportFormatAuto, false},
		{"", ImportFormatAuto, false},
		{"raw", ImportFormatRaw, false},
		{"crewai", ImportFormatCrewAI, false},
		{"openai", ImportFormatOpenAI, false},
		{"CrewAI", ImportFormatCrewAI, false},
		{"invalid", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := ImportFormatFromString(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ImportFormatFromString(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if got != tt.expected {
				t.Errorf("ImportFormatFromString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestImportCrewAIAgent(t *testing.T) {
	content := `role: Market Strategist
goal: Analyze market trends and provide strategic recommendations
backstory: |
  You are an experienced market strategist with deep knowledge
  of technology markets and competitive dynamics.
tools:
  - web_search
  - document_reader`

	manifest, prompt, todos, err := importCrewAIAgent(content)
	if err != nil {
		t.Fatalf("importCrewAIAgent() error = %v", err)
	}

	if manifest.Name != "market-strategist" {
		t.Errorf("Name = %q, want %q", manifest.Name, "market-strategist")
	}
	if manifest.Type != AgentTypeStrategist {
		t.Errorf("Type = %v, want %v", manifest.Type, AgentTypeStrategist)
	}
	if manifest.Identity.DisplayName != "Market Strategist" {
		t.Errorf("DisplayName = %q, want %q", manifest.Identity.DisplayName, "Market Strategist")
	}
	if manifest.Tools == nil || len(manifest.Tools.Required) != 2 {
		t.Errorf("Expected 2 tools, got %v", manifest.Tools)
	}
	if prompt == "" {
		t.Error("Expected non-empty prompt content")
	}
	if len(todos) == 0 {
		t.Error("Expected TODO fields")
	}
}

func TestImportOpenAIAgent(t *testing.T) {
	assistant := openAIAssistant{
		Name:         "Code Reviewer",
		Description:  "Reviews code for quality and best practices",
		Instructions: "You are a senior code reviewer. Provide detailed feedback.",
		Model:        "gpt-4o",
		Tools: []openAITool{
			{Type: "code_interpreter"},
			{Type: "file_search"},
		},
	}
	data, _ := json.Marshal(assistant)

	manifest, prompt, todos, err := importOpenAIAgent(string(data))
	if err != nil {
		t.Fatalf("importOpenAIAgent() error = %v", err)
	}

	if manifest.Name != "code-reviewer" {
		t.Errorf("Name = %q, want %q", manifest.Name, "code-reviewer")
	}
	if manifest.Type != AgentTypeReviewer {
		t.Errorf("Type = %v, want %v", manifest.Type, AgentTypeReviewer)
	}
	if manifest.Capability.Class != CapabilityHighReasoning {
		t.Errorf("Capability.Class = %v, want %v", manifest.Capability.Class, CapabilityHighReasoning)
	}
	if prompt != "You are a senior code reviewer. Provide detailed feedback." {
		t.Errorf("Unexpected prompt content: %q", prompt)
	}
	if len(todos) == 0 {
		t.Error("Expected TODO fields")
	}
}

func TestImportRawAgent(t *testing.T) {
	content := "# My Custom Agent\n\nYou help with product planning."

	manifest, prompt, todos, err := importRawAgent(content, "/path/to/my-custom-agent.md")
	if err != nil {
		t.Fatalf("importRawAgent() error = %v", err)
	}

	// "-agent" suffix is stripped by deriveNameFromPath
	if manifest.Name != "my-custom" {
		t.Errorf("Name = %q, want %q", manifest.Name, "my-custom")
	}
	if manifest.Type != AgentTypeSpecialist {
		t.Errorf("Type = %v, want %v", manifest.Type, AgentTypeSpecialist)
	}
	if prompt != content {
		t.Error("Expected prompt to match input content")
	}
	if len(todos) == 0 {
		t.Error("Expected TODO fields")
	}
}

func TestImportAgentEndToEnd(t *testing.T) {
	// Create temp directory structure
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "instance")
	os.MkdirAll(instanceDir, 0o755)

	// Create a source file
	sourceContent := "role: Test Guide\ngoal: Help users\nbackstory: You are a helpful guide."
	sourceFile := filepath.Join(tmpDir, "agent.yaml")
	os.WriteFile(sourceFile, []byte(sourceContent), 0o644)

	// Import
	result, err := ImportAgent(sourceFile, instanceDir, ImportFormatAuto, false)
	if err != nil {
		t.Fatalf("ImportAgent() error = %v", err)
	}

	if result.AgentName != "test-guide" {
		t.Errorf("AgentName = %q, want %q", result.AgentName, "test-guide")
	}
	if result.Format != "crewai" {
		t.Errorf("Format = %q, want %q", result.Format, "crewai")
	}

	// Verify files exist
	if _, err := os.Stat(result.ManifestPath); err != nil {
		t.Errorf("Manifest file not created: %v", err)
	}
	if _, err := os.Stat(result.PromptPath); err != nil {
		t.Errorf("Prompt file not created: %v", err)
	}

	// Verify manifest is valid YAML
	data, _ := os.ReadFile(result.ManifestPath)
	var manifest AgentManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		t.Errorf("Invalid manifest YAML: %v", err)
	}
	if manifest.Name != "test-guide" {
		t.Errorf("Manifest name = %q, want %q", manifest.Name, "test-guide")
	}

	// Test force=false prevents overwrite
	_, err = ImportAgent(sourceFile, instanceDir, ImportFormatAuto, false)
	if err == nil {
		t.Error("Expected error when agent already exists without --force")
	}

	// Test force=true allows overwrite
	result2, err := ImportAgent(sourceFile, instanceDir, ImportFormatAuto, true)
	if err != nil {
		t.Errorf("ImportAgent with force=true should succeed: %v", err)
	}
	if result2.AgentName != "test-guide" {
		t.Errorf("AgentName = %q after force overwrite", result2.AgentName)
	}
}

func TestInferAgentTypeFromText(t *testing.T) {
	tests := []struct {
		input    string
		expected AgentType
	}{
		{"Market Strategist", AgentTypeStrategist},
		{"Code Reviewer", AgentTypeReviewer},
		{"System Architect", AgentTypeArchitect},
		{"Onboarding Guide", AgentTypeGuide},
		{"Data Specialist", AgentTypeSpecialist},
		{"Unknown Role", AgentTypeSpecialist},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := inferAgentTypeFromText(tt.input)
			if got != tt.expected {
				t.Errorf("inferAgentTypeFromText(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestInferCapabilityFromModel(t *testing.T) {
	tests := []struct {
		model    string
		expected CapabilityClass
	}{
		{"gpt-4o", CapabilityHighReasoning},
		{"gpt-4o-mini", CapabilityFastExec},
		{"gpt-4", CapabilityHighReasoning},
		{"gpt-3.5-turbo", CapabilityFastExec},
		{"o1-preview", CapabilityHighReasoning},
		{"claude-3-opus", CapabilityBalanced},
		{"", CapabilityBalanced},
	}

	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			got := inferCapabilityFromModel(tt.model)
			if got != tt.expected {
				t.Errorf("inferCapabilityFromModel(%q) = %v, want %v", tt.model, got, tt.expected)
			}
		})
	}
}

func TestSlugify(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Market Strategist", "market-strategist"},
		{"Code Reviewer", "code-reviewer"},
		{"My  Agent!!!", "my-agent"},
		{"already-a-slug", "already-a-slug"},
		{"CamelCase", "camelcase"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := slugify(tt.input)
			if got != tt.expected {
				t.Errorf("slugify(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestDeriveNameFromPath(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/path/to/my-file.md", "my-file"},
		{"/path/to/my-agent-prompt.md", "my"}, // strips -agent then -prompt
		{"/path/to/agent_prompt.md", "agent"}, // strips _prompt
		{"simple.yaml", "simple"},
		{"/path/to/test-agent.md", "test"}, // strips -agent
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := deriveNameFromPath(tt.input)
			if got != tt.expected {
				t.Errorf("deriveNameFromPath(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}
