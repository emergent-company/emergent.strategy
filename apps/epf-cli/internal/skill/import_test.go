package skill

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestDetectSkillFormat(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		path     string
		expected ImportFormat
	}{
		{
			name:     "raw markdown",
			content:  "# My Workflow\n\nFollow these steps...",
			path:     "workflow.md",
			expected: ImportFormatRaw,
		},
		{
			name:     "crewai task yaml",
			content:  "description: Analyze the market\nexpected_output: A report with findings",
			path:     "task.yaml",
			expected: ImportFormatCrewAI,
		},
		{
			name:     "yaml without crewai fields",
			content:  "name: test\ntype: creation",
			path:     "skill.yaml",
			expected: ImportFormatRaw,
		},
		{
			name:     "plain text",
			content:  "Just some instructions.",
			path:     "instructions.txt",
			expected: ImportFormatRaw,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := detectSkillFormat(tt.content, tt.path)
			if got != tt.expected {
				t.Errorf("detectSkillFormat() = %v, want %v", got, tt.expected)
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
		{"CrewAI", ImportFormatCrewAI, false},
		{"openai", "", true}, // Not supported for skills
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

func TestImportCrewAITask(t *testing.T) {
	content := `description: Analyze market trends and identify opportunities
expected_output: A comprehensive report with 3-5 key trends
tools:
  - web_search
agent: market_analyst`

	manifest, prompt, todos, err := importCrewAITask(content)
	if err != nil {
		t.Fatalf("importCrewAITask() error = %v", err)
	}

	if manifest.Name == "" {
		t.Error("Expected non-empty name")
	}
	if manifest.Output == nil {
		t.Error("Expected output spec from expected_output field")
	}
	if prompt == "" {
		t.Error("Expected non-empty prompt")
	}
	if len(todos) == 0 {
		t.Error("Expected TODO fields")
	}
}

func TestImportRawSkill(t *testing.T) {
	content := "# My Workflow\n\nStep 1: Do this\nStep 2: Do that"

	manifest, prompt, todos, err := importRawSkill(content, "/path/to/my-workflow.md")
	if err != nil {
		t.Fatalf("importRawSkill() error = %v", err)
	}

	if manifest.Name != "my-workflow" {
		t.Errorf("Name = %q, want %q", manifest.Name, "my-workflow")
	}
	if manifest.Type != SkillTypeCreation {
		t.Errorf("Type = %v, want %v", manifest.Type, SkillTypeCreation)
	}
	if prompt != content {
		t.Error("Expected prompt to match input content")
	}
	if len(todos) == 0 {
		t.Error("Expected TODO fields")
	}
}

func TestImportSkillEndToEnd(t *testing.T) {
	// Create temp directory structure
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "instance")
	os.MkdirAll(instanceDir, 0o755)

	// Create a source file
	sourceContent := "# Review Checklist\n\nCheck code quality and test coverage."
	sourceFile := filepath.Join(tmpDir, "review-checklist.md")
	os.WriteFile(sourceFile, []byte(sourceContent), 0o644)

	// Import
	result, err := ImportSkill(sourceFile, instanceDir, ImportFormatAuto, false)
	if err != nil {
		t.Fatalf("ImportSkill() error = %v", err)
	}

	if result.SkillName != "review-checklist" {
		t.Errorf("SkillName = %q, want %q", result.SkillName, "review-checklist")
	}
	if result.Format != "raw" {
		t.Errorf("Format = %q, want %q", result.Format, "raw")
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
	var manifest SkillManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		t.Errorf("Invalid manifest YAML: %v", err)
	}
	if manifest.Name != "review-checklist" {
		t.Errorf("Manifest name = %q, want %q", manifest.Name, "review-checklist")
	}

	// Verify prompt file content
	promptData, _ := os.ReadFile(result.PromptPath)
	if string(promptData) != sourceContent {
		t.Error("Prompt content doesn't match source")
	}

	// Test force=false prevents overwrite
	_, err = ImportSkill(sourceFile, instanceDir, ImportFormatAuto, false)
	if err == nil {
		t.Error("Expected error when skill already exists without --force")
	}

	// Test force=true allows overwrite
	result2, err := ImportSkill(sourceFile, instanceDir, ImportFormatAuto, true)
	if err != nil {
		t.Errorf("ImportSkill with force=true should succeed: %v", err)
	}
	if result2.SkillName != "review-checklist" {
		t.Errorf("SkillName = %q after force overwrite", result2.SkillName)
	}
}

func TestInferSkillTypeFromText(t *testing.T) {
	tests := []struct {
		input    string
		expected SkillType
	}{
		{"Create a feature definition", SkillTypeCreation},
		{"Review code quality", SkillTypeReview},
		{"Analyze market trends", SkillTypeAnalysis},
		{"Enrich existing data", SkillTypeEnrichment},
		{"Something generic", SkillTypeCreation}, // Default
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := inferSkillTypeFromText(tt.input)
			if got != tt.expected {
				t.Errorf("inferSkillTypeFromText(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSkillSlugify(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Analyze Market Trends", "analyze-market-trends"},
		{"my-skill", "my-skill"},
		{"UPPER CASE", "upper-case"},
		{"Special!! Characters##", "special-characters"},
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
