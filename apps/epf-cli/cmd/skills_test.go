package cmd

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/skill"
)

// Task 4.4: CLI command tests for skills

func TestGetSkillTypeIcon(t *testing.T) {
	tests := []struct {
		skillType skill.SkillType
		wantIcon  string
	}{
		{skill.SkillTypeCreation, "✏️"},
		{skill.SkillTypeGeneration, "📄"},
		{skill.SkillTypeReview, "🔍"},
		{skill.SkillTypeEnrichment, "🔧"},
		{skill.SkillTypeAnalysis, "📊"},
		{skill.SkillType("unknown"), "⚙️"},
	}

	for _, tt := range tests {
		t.Run(string(tt.skillType), func(t *testing.T) {
			got := getSkillTypeIcon(tt.skillType)
			if got != tt.wantIcon {
				t.Errorf("getSkillTypeIcon(%q) = %q, want %q", tt.skillType, got, tt.wantIcon)
			}
		})
	}
}

func TestPrintSkillsJSON(t *testing.T) {
	// Verify that printSkillsJSON handles empty list without panic
	skills := []*skill.SkillInfo{}
	printSkillsJSON(skills)
}

func TestPrintSkillContentJSON(t *testing.T) {
	content := &skill.SkillContent{
		SkillInfo: &skill.SkillInfo{
			Name:              "test-skill",
			Type:              skill.SkillTypeGeneration,
			Description:       "A test skill",
			Category:          skill.CategoryInternal,
			Source:            skill.SourceFramework,
			Author:            "Test Author",
			RequiredArtifacts: []string{"north_star"},
			OptionalArtifacts: []string{"value_models"},
			HasManifest:       true,
			HasPrompt:         true,
			HasSchema:         true,
		},
		ManifestContent: "name: test-skill",
		PromptContent:   "# Test Prompt",
		SchemaContent:   "{}",
	}

	// Should not panic
	printSkillContentJSON(content)
}

func TestCheckSkillPrerequisites_AllPresent(t *testing.T) {
	sk := &skill.SkillInfo{
		RequiredArtifacts: []string{}, // No requirements
	}

	result := checkSkillPrerequisites(sk, t.TempDir())
	if !result.Ready {
		t.Error("Expected Ready=true when no artifacts are required")
	}
}

func TestCheckSkillPrerequisites_Missing(t *testing.T) {
	sk := &skill.SkillInfo{
		RequiredArtifacts: []string{"north_star", "strategy_formula"},
	}

	// Use empty temp dir so nothing will be found
	result := checkSkillPrerequisites(sk, t.TempDir())
	if result.Ready {
		t.Error("Expected Ready=false when required artifacts are missing")
	}
	if len(result.MissingArtifacts) != 2 {
		t.Errorf("Expected 2 missing artifacts, got %d", len(result.MissingArtifacts))
	}
	if len(result.Suggestions) == 0 {
		t.Error("Expected suggestions when artifacts are missing")
	}
}

func TestSkillsCmd_Structure(t *testing.T) {
	if skillsCmd == nil {
		t.Fatal("skillsCmd is nil")
	}

	if skillsCmd.Use != "skills" {
		t.Errorf("skillsCmd.Use = %q, want %q", skillsCmd.Use, "skills")
	}

	// Check subcommands
	expectedSubcommands := []string{
		"list", "show", "check", "scaffold", "validate", "copy", "export", "install",
	}

	subNames := make(map[string]bool)
	for _, sub := range skillsCmd.Commands() {
		// Use field starts with the command name
		for _, expected := range expectedSubcommands {
			if len(sub.Use) >= len(expected) && sub.Use[:len(expected)] == expected {
				subNames[expected] = true
			}
		}
	}

	for _, name := range expectedSubcommands {
		if !subNames[name] {
			t.Errorf("skillsCmd missing subcommand %q", name)
		}
	}
}

func TestListSkillsCmd_Flags(t *testing.T) {
	flags := listSkillsCmd.Flags()

	if flags.Lookup("type") == nil {
		t.Error("listSkillsCmd missing --type flag")
	}
	if flags.Lookup("category") == nil {
		t.Error("listSkillsCmd missing --category flag")
	}
	if flags.Lookup("source") == nil {
		t.Error("listSkillsCmd missing --source flag")
	}
	if flags.Lookup("json") == nil {
		t.Error("listSkillsCmd missing --json flag")
	}
}

func TestShowSkillCmd_Flags(t *testing.T) {
	flags := showSkillCmd.Flags()

	if flags.Lookup("prompt") == nil {
		t.Error("showSkillCmd missing --prompt flag")
	}
	if flags.Lookup("schema") == nil {
		t.Error("showSkillCmd missing --schema flag")
	}
	if flags.Lookup("json") == nil {
		t.Error("showSkillCmd missing --json flag")
	}
}

func TestScaffoldSkillCmd_Flags(t *testing.T) {
	flags := scaffoldSkillCmd.Flags()

	expectedFlags := []string{
		"description", "category", "type", "author",
		"output", "format", "requires", "optional", "region",
	}

	for _, name := range expectedFlags {
		if flags.Lookup(name) == nil {
			t.Errorf("scaffoldSkillCmd missing --%s flag", name)
		}
	}
}

func TestValidateSkillCmd_Flags(t *testing.T) {
	flags := validateSkillCmd.Flags()

	if flags.Lookup("bash") == nil {
		t.Error("validateSkillCmd missing --bash flag")
	}
	if flags.Lookup("json") == nil {
		t.Error("validateSkillCmd missing --json flag")
	}
}

func TestCopySkillCmd_Flags(t *testing.T) {
	flags := copySkillCmd.Flags()

	if flags.Lookup("as") == nil {
		t.Error("copySkillCmd missing --as flag")
	}
	if flags.Lookup("to-instance") == nil {
		t.Error("copySkillCmd missing --to-instance flag")
	}
	if flags.Lookup("force") == nil {
		t.Error("copySkillCmd missing --force flag")
	}
}

func TestExportSkillCmd_Flags(t *testing.T) {
	flags := exportSkillCmd.Flags()

	if flags.Lookup("output") == nil {
		t.Error("exportSkillCmd missing --output flag")
	}
	if flags.Lookup("include-readme") == nil {
		t.Error("exportSkillCmd missing --include-readme flag")
	}
}

func TestInstallSkillCmd_Flags(t *testing.T) {
	flags := installSkillCmd.Flags()

	if flags.Lookup("as") == nil {
		t.Error("installSkillCmd missing --as flag")
	}
	if flags.Lookup("to") == nil {
		t.Error("installSkillCmd missing --to flag")
	}
	if flags.Lookup("force") == nil {
		t.Error("installSkillCmd missing --force flag")
	}
}

func TestSkillValidationJSON(t *testing.T) {
	result := &skill.ValidationResult{
		Valid:    false,
		Errors:   []string{"missing required section"},
		Warnings: []string{"optional field empty"},
	}

	// Should not panic
	printSkillValidationJSON("test-skill", "output.md", result)
}

func TestPrintSkillInfo(t *testing.T) {
	content := &skill.SkillContent{
		SkillInfo: &skill.SkillInfo{
			Name:              "context-sheet",
			Type:              skill.SkillTypeGeneration,
			Description:       "Creates AI context summaries",
			Category:          skill.CategoryInternal,
			Source:            skill.SourceFramework,
			Author:            "EPF",
			Path:              "/some/path",
			OutputFormat:      skill.FormatMarkdown,
			RequiredArtifacts: []string{"north_star", "strategy_formula"},
			OptionalArtifacts: []string{"value_models"},
			HasManifest:       true,
			HasPrompt:         true,
			HasSchema:         true,
			HasValidator:      false,
			HasTemplate:       true,
			PromptFile:        "wizard.instructions.md",
			SchemaFile:        "schema.json",
			TemplateFile:      "template.md",
		},
		ManifestContent: "name: context-sheet",
	}

	// Should not panic
	printSkillInfo(content)
}

func TestBothCommandSetsRegistered(t *testing.T) {
	// Verify that both old (wizards/generators) and new (agents/skills)
	// command sets are registered on root
	foundAgents := false
	foundWizards := false
	foundSkills := false
	foundGenerators := false

	for _, sub := range rootCmd.Commands() {
		switch sub.Use {
		case "agents":
			foundAgents = true
		case "wizards":
			foundWizards = true
		case "skills":
			foundSkills = true
		case "generators":
			foundGenerators = true
		}
	}

	if !foundAgents {
		t.Error("rootCmd missing 'agents' subcommand")
	}
	if !foundWizards {
		t.Error("rootCmd missing 'wizards' subcommand (backward compat)")
	}
	if !foundSkills {
		t.Error("rootCmd missing 'skills' subcommand")
	}
	if !foundGenerators {
		t.Error("rootCmd missing 'generators' subcommand (backward compat)")
	}
}
