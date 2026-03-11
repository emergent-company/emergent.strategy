package skill

import (
	"archive/tar"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// =============================================================================
// Task 2.10: Skill loader unit tests
// =============================================================================

// --- Type tests ---

func TestSkillTypeFromString(t *testing.T) {
	tests := []struct {
		input    string
		expected SkillType
		wantErr  bool
	}{
		{"creation", SkillTypeCreation, false},
		{"generation", SkillTypeGeneration, false},
		{"review", SkillTypeReview, false},
		{"enrichment", SkillTypeEnrichment, false},
		{"analysis", SkillTypeAnalysis, false},
		{"Creation", SkillTypeCreation, false},         // case-insensitive
		{"  generation  ", SkillTypeGeneration, false}, // trim spaces
		{"REVIEW", SkillTypeReview, false},
		{"invalid", "", true},
		{"", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := SkillTypeFromString(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("SkillTypeFromString(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("SkillTypeFromString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestValidSkillTypes(t *testing.T) {
	types := ValidSkillTypes()
	if len(types) != 5 {
		t.Errorf("ValidSkillTypes() returned %d types, want 5", len(types))
	}
}

func TestCategoryFromString(t *testing.T) {
	tests := []struct {
		input    string
		expected Category
		wantErr  bool
	}{
		{"compliance", CategoryCompliance, false},
		{"marketing", CategoryMarketing, false},
		{"investor", CategoryInvestor, false},
		{"internal", CategoryInternal, false},
		{"development", CategoryDevelopment, false},
		{"custom", CategoryCustom, false},
		{"", CategoryUnspecified, false},
		{"invalid_cat", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := CategoryFromString(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("CategoryFromString(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("CategoryFromString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSourcePriority(t *testing.T) {
	if SourcePriority(SourceInstance) >= SourcePriority(SourceFramework) {
		t.Error("SourceInstance should have higher priority than SourceFramework")
	}
	if SourcePriority(SourceFramework) >= SourcePriority(SourceGlobal) {
		t.Error("SourceFramework should have higher priority than SourceGlobal")
	}
}

func TestSkillSourceString(t *testing.T) {
	tests := []struct {
		source   SkillSource
		expected string
	}{
		{SourceInstance, "Instance"},
		{SourceFramework, "EPF Framework"},
		{SourceGlobal, "Global"},
		{SkillSource("unknown"), "unknown"},
	}
	for _, tt := range tests {
		if got := tt.source.String(); got != tt.expected {
			t.Errorf("SkillSource(%q).String() = %q, want %q", tt.source, got, tt.expected)
		}
	}
}

// --- Skill.yaml manifest loading ---

func TestLoaderSkillYAMLManifest(t *testing.T) {
	tempDir := t.TempDir()

	// Create skills/ with a new-format skill bundle
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	skillDir := filepath.Join(skillsDir, "my-review-skill")
	mustMkdir(t, skillDir)

	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: my-review-skill
version: 2.0.0
type: review
phase: FIRE
description: Reviews feature definitions for quality
category: development
author: TestAuthor

requires:
  artifacts:
    - feature_definition
  optional:
    - value_models
  tools:
    - epf_validate_file

output:
  format: markdown
  artifact_type: feature_definition

capability:
  class: high-reasoning
  context_budget: large

scope:
  preferred_tools:
    - epf_validate_file
    - epf_check_feature_quality
  avoid_tools:
    - epf_init_instance
  filesystem_access: read_only
`)

	writeFile(t, filepath.Join(skillDir, "prompt.md"), `# My Review Skill

You are a feature quality reviewer.`)

	writeFile(t, filepath.Join(skillDir, "schema.json"), `{"type": "object"}`)
	writeFile(t, filepath.Join(skillDir, "validator.sh"), `#!/bin/bash
echo "OK"`)

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if loader.SkillCount() != 1 {
		t.Fatalf("SkillCount() = %d, want 1", loader.SkillCount())
	}

	skill, err := loader.GetSkill("my-review-skill")
	if err != nil {
		t.Fatalf("GetSkill() error = %v", err)
	}

	// Verify all manifest fields
	if skill.Type != SkillTypeReview {
		t.Errorf("Type = %v, want review", skill.Type)
	}
	if skill.Version != "2.0.0" {
		t.Errorf("Version = %q, want 2.0.0", skill.Version)
	}
	if skill.Description != "Reviews feature definitions for quality" {
		t.Errorf("Description = %q", skill.Description)
	}
	if skill.Category != CategoryDevelopment {
		t.Errorf("Category = %q, want development", skill.Category)
	}
	if skill.Author != "TestAuthor" {
		t.Errorf("Author = %q, want TestAuthor", skill.Author)
	}
	if len(skill.RequiredArtifacts) != 1 || skill.RequiredArtifacts[0] != "feature_definition" {
		t.Errorf("RequiredArtifacts = %v", skill.RequiredArtifacts)
	}
	if len(skill.OptionalArtifacts) != 1 || skill.OptionalArtifacts[0] != "value_models" {
		t.Errorf("OptionalArtifacts = %v", skill.OptionalArtifacts)
	}
	if len(skill.RequiredTools) != 1 || skill.RequiredTools[0] != "epf_validate_file" {
		t.Errorf("RequiredTools = %v", skill.RequiredTools)
	}
	if skill.OutputFormat != FormatMarkdown {
		t.Errorf("OutputFormat = %q, want markdown", skill.OutputFormat)
	}
	if skill.ArtifactType != "feature_definition" {
		t.Errorf("ArtifactType = %q", skill.ArtifactType)
	}
	if skill.Capability == nil {
		t.Fatal("Capability should not be nil")
	}
	if skill.Scope == nil {
		t.Fatal("Scope should not be nil")
	}
	if len(skill.Scope.PreferredTools) != 2 {
		t.Errorf("Scope.PreferredTools = %v", skill.Scope.PreferredTools)
	}
	if skill.Scope.FilesystemAccess != "read_only" {
		t.Errorf("Scope.FilesystemAccess = %q", skill.Scope.FilesystemAccess)
	}

	// File detection
	if !skill.HasManifest {
		t.Error("HasManifest should be true")
	}
	if !skill.HasPrompt {
		t.Error("HasPrompt should be true")
	}
	if skill.PromptFile != DefaultPromptFile {
		t.Errorf("PromptFile = %q, want %q", skill.PromptFile, DefaultPromptFile)
	}
	if !skill.HasSchema {
		t.Error("HasSchema should be true")
	}
	if !skill.HasValidator {
		t.Error("HasValidator should be true")
	}
	if !skill.LegacyFormat {
		// skill.yaml in skills/ is NOT legacy
		t.Log("LegacyFormat is false as expected for skill.yaml")
	}
}

// --- Legacy wizard file loading ---

func TestLoaderLegacyWizardFiles(t *testing.T) {
	tempDir := t.TempDir()

	// Create wizards/ with .wizard.md files
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)

	writeFile(t, filepath.Join(wizardsDir, "feature_definition.wizard.md"), `# Wizard: Feature Definition

Step-by-step guide for creating feature definitions.

Duration: 45-60 min`)

	writeFile(t, filepath.Join(wizardsDir, "feature_enrichment.wizard.md"), `# Feature Enrichment

Enriches existing feature definitions with deeper personas and scenarios.`)

	// .agent_prompt.md files should NOT be loaded as skills (those are agents)
	writeFile(t, filepath.Join(wizardsDir, "start_epf.agent_prompt.md"), `# Start EPF

You are the welcome guide.`)

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Only .wizard.md files should be loaded as skills
	names := loader.GetSkillNames()
	for _, n := range names {
		if n == "start_epf" {
			t.Error("start_epf (.agent_prompt.md) should NOT be loaded as a skill")
		}
	}

	// feature_definition should be a creation skill
	fd, err := loader.GetSkill("feature_definition")
	if err != nil {
		t.Fatalf("GetSkill(feature_definition) error = %v", err)
	}
	if fd.Type != SkillTypeCreation {
		t.Errorf("feature_definition.Type = %v, want creation", fd.Type)
	}
	if !fd.LegacyFormat {
		t.Error("feature_definition.LegacyFormat should be true")
	}
	if !fd.HasPrompt {
		t.Error("feature_definition.HasPrompt should be true")
	}
	if fd.HasManifest {
		t.Error("feature_definition.HasManifest should be false (legacy file)")
	}

	// feature_enrichment should be an enrichment skill
	fe, _ := loader.GetSkill("feature_enrichment")
	if fe.Type != SkillTypeEnrichment {
		t.Errorf("feature_enrichment.Type = %v, want enrichment", fe.Type)
	}
}

// --- Three-tier priority tests ---

func TestLoaderThreeTierPriority(t *testing.T) {
	frameworkDir := t.TempDir()
	instanceDir := t.TempDir()

	// Framework skill
	frameworkSkillsDir := filepath.Join(frameworkDir, "skills")
	mustMkdir(t, frameworkSkillsDir)
	fwSkill := filepath.Join(frameworkSkillsDir, "my-skill")
	mustMkdir(t, fwSkill)
	writeFile(t, filepath.Join(fwSkill, "skill.yaml"), `name: my-skill
version: 1.0.0
type: review
description: Framework version
category: internal
`)
	writeFile(t, filepath.Join(fwSkill, "prompt.md"), "# Framework version")

	// Instance skill with same name (should override)
	instanceSkillsDir := filepath.Join(instanceDir, "skills")
	mustMkdir(t, instanceSkillsDir)
	instSkill := filepath.Join(instanceSkillsDir, "my-skill")
	mustMkdir(t, instSkill)
	writeFile(t, filepath.Join(instSkill, "skill.yaml"), `name: my-skill
version: 2.0.0
type: review
description: Instance override
category: development
`)
	writeFile(t, filepath.Join(instSkill, "prompt.md"), "# Instance override")

	loader := NewLoader(frameworkDir)
	loader.SetInstanceRoot(instanceDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	skill, err := loader.GetSkill("my-skill")
	if err != nil {
		t.Fatalf("GetSkill(my-skill) error = %v", err)
	}

	if skill.Source != SourceInstance {
		t.Errorf("Source = %v, want instance (instance should override framework)", skill.Source)
	}
	if skill.Version != "2.0.0" {
		t.Errorf("Version = %q, want 2.0.0 (instance version)", skill.Version)
	}
	if skill.Description != "Instance override" {
		t.Errorf("Description = %q, want 'Instance override'", skill.Description)
	}
}

// --- Lazy content loading ---

func TestLoaderLazyPromptLoading(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	skillDir := filepath.Join(skillsDir, "test-skill")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: test-skill
version: 1.0.0
type: creation
description: Test
`)
	expectedPrompt := "# Test Skill\n\nThis is the full prompt content."
	writeFile(t, filepath.Join(skillDir, "prompt.md"), expectedPrompt)

	loader := NewLoader(tempDir)
	loader.Load()

	skill, _ := loader.GetSkill("test-skill")

	// Prompt should NOT be loaded yet
	if skill.PromptLoaded() {
		t.Error("Prompt should not be loaded before LoadPrompt()")
	}

	// Load it
	if err := loader.LoadPrompt(skill); err != nil {
		t.Fatalf("LoadPrompt() error = %v", err)
	}
	if !skill.PromptLoaded() {
		t.Error("Prompt should be loaded after LoadPrompt()")
	}
	if skill.Prompt != expectedPrompt {
		t.Errorf("Prompt = %q, want %q", skill.Prompt, expectedPrompt)
	}

	// Second call should be a no-op
	if err := loader.LoadPrompt(skill); err != nil {
		t.Fatalf("Second LoadPrompt() error = %v", err)
	}
}

// --- GetSkillContent ---

func TestGetSkillContent(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	skillDir := filepath.Join(skillsDir, "full-skill")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: full-skill
version: 1.0.0
type: generation
description: Full skill for testing
`)
	writeFile(t, filepath.Join(skillDir, "prompt.md"), "# Full Skill prompt")
	writeFile(t, filepath.Join(skillDir, "schema.json"), `{"type":"object"}`)
	writeFile(t, filepath.Join(skillDir, "validator.sh"), `#!/bin/bash
echo ok`)
	writeFile(t, filepath.Join(skillDir, "template.md"), "# Template")
	writeFile(t, filepath.Join(skillDir, "README.md"), "# Readme")

	loader := NewLoader(tempDir)
	loader.Load()

	content, err := loader.GetSkillContent("full-skill")
	if err != nil {
		t.Fatalf("GetSkillContent() error = %v", err)
	}

	if content.ManifestContent == "" {
		t.Error("ManifestContent should not be empty")
	}
	if content.PromptContent != "# Full Skill prompt" {
		t.Errorf("PromptContent = %q", content.PromptContent)
	}
	if content.SchemaContent == "" {
		t.Error("SchemaContent should not be empty")
	}
	if content.ValidatorContent == "" {
		t.Error("ValidatorContent should not be empty")
	}
	if content.TemplateContent != "# Template" {
		t.Errorf("TemplateContent = %q", content.TemplateContent)
	}
	if content.ReadmeContent != "# Readme" {
		t.Errorf("ReadmeContent = %q", content.ReadmeContent)
	}
}

// --- Lookup tests ---

func TestGetSkillCaseInsensitive(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)
	sd := filepath.Join(skillsDir, "my-skill")
	mustMkdir(t, sd)
	writeFile(t, filepath.Join(sd, "skill.yaml"), `name: my-skill
version: 1.0.0
description: Test
`)

	loader := NewLoader(tempDir)
	loader.Load()

	s, err := loader.GetSkill("My-Skill")
	if err != nil {
		t.Errorf("GetSkill('My-Skill') should match case-insensitively: %v", err)
	}
	if s != nil && s.Name != "my-skill" {
		t.Errorf("Name = %q, want my-skill", s.Name)
	}
}

func TestGetSkillPartialMatch(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)
	sd := filepath.Join(skillsDir, "skattefunn-application")
	mustMkdir(t, sd)
	writeFile(t, filepath.Join(sd, "skill.yaml"), `name: skattefunn-application
version: 1.0.0
description: SkatteFUNN
`)

	loader := NewLoader(tempDir)
	loader.Load()

	s, err := loader.GetSkill("skattefunn")
	if err != nil {
		t.Errorf("GetSkill('skattefunn') should match partially: %v", err)
	}
	if s != nil && s.Name != "skattefunn-application" {
		t.Errorf("Name = %q, want skattefunn-application", s.Name)
	}
}

func TestGetSkillNotFound(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)
	sd := filepath.Join(skillsDir, "existing")
	mustMkdir(t, sd)
	writeFile(t, filepath.Join(sd, "skill.yaml"), `name: existing
version: 1.0.0
description: Test
`)

	loader := NewLoader(tempDir)
	loader.Load()

	_, err := loader.GetSkill("nonexistent")
	if err == nil {
		t.Error("GetSkill('nonexistent') should return error")
	}
}

// --- Filter tests ---

func TestListSkillsFilterByType(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	for _, s := range []struct{ name, stype string }{
		{"review-skill", "review"},
		{"gen-skill", "generation"},
		{"create-skill", "creation"},
	} {
		sd := filepath.Join(skillsDir, s.name)
		mustMkdir(t, sd)
		writeFile(t, filepath.Join(sd, "skill.yaml"), "name: "+s.name+"\nversion: 1.0.0\ntype: "+s.stype+"\ndescription: Test\n")
	}

	loader := NewLoader(tempDir)
	loader.Load()

	reviewType := SkillTypeReview
	reviews := loader.ListSkills(&reviewType, nil, nil)
	if len(reviews) != 1 {
		t.Errorf("ListSkills(review) returned %d, want 1", len(reviews))
	}
	if len(reviews) > 0 && reviews[0].Name != "review-skill" {
		t.Errorf("Review skill name = %q", reviews[0].Name)
	}
}

func TestListSkillsFilterByCategory(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	for _, s := range []struct{ name, cat string }{
		{"comp-skill", "compliance"},
		{"inv-skill", "investor"},
	} {
		sd := filepath.Join(skillsDir, s.name)
		mustMkdir(t, sd)
		writeFile(t, filepath.Join(sd, "skill.yaml"), "name: "+s.name+"\nversion: 1.0.0\ncategory: "+s.cat+"\ndescription: Test\n")
	}

	loader := NewLoader(tempDir)
	loader.Load()

	compCat := CategoryCompliance
	comps := loader.ListSkills(nil, &compCat, nil)
	if len(comps) != 1 {
		t.Errorf("ListSkills(compliance) returned %d, want 1", len(comps))
	}
}

func TestSkillsByCategory(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	for _, s := range []struct{ name, cat string }{
		{"comp-skill", "compliance"},
		{"inv-skill", "investor"},
		{"no-cat-skill", ""},
	} {
		sd := filepath.Join(skillsDir, s.name)
		mustMkdir(t, sd)
		catLine := ""
		if s.cat != "" {
			catLine = "\ncategory: " + s.cat
		}
		writeFile(t, filepath.Join(sd, "skill.yaml"), "name: "+s.name+"\nversion: 1.0.0"+catLine+"\ndescription: Test\n")
	}

	loader := NewLoader(tempDir)
	loader.Load()

	byCat := loader.SkillsByCategory()
	if len(byCat) == 0 {
		t.Error("SkillsByCategory() should return non-empty map")
	}
}

func TestSkillsByType(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	for _, s := range []struct{ name, stype string }{
		{"r-skill", "review"},
		{"g-skill", "generation"},
	} {
		sd := filepath.Join(skillsDir, s.name)
		mustMkdir(t, sd)
		writeFile(t, filepath.Join(sd, "skill.yaml"), "name: "+s.name+"\nversion: 1.0.0\ntype: "+s.stype+"\ndescription: Test\n")
	}

	loader := NewLoader(tempDir)
	loader.Load()

	byType := loader.SkillsByType()
	if len(byType) == 0 {
		t.Error("SkillsByType() should return non-empty map")
	}
}

// --- inferSkillType tests ---

func TestInferSkillType(t *testing.T) {
	tests := []struct {
		name     string
		expected SkillType
	}{
		{"feature_definition", SkillTypeCreation},
		{"roadmap_enrichment", SkillTypeCreation},
		{"feature_enrichment", SkillTypeEnrichment},
		{"value_model_review", SkillTypeReview},
		{"feature_quality_review", SkillTypeReview},
		{"strategic_coherence_review", SkillTypeReview},
		{"balance_checker", SkillTypeReview},
		{"aim_trigger_assessment", SkillTypeAnalysis},
		{"strategic_reality_check", SkillTypeAnalysis},
		{"context_sheet_generator", SkillTypeGeneration},
		{"unknown_skill", SkillTypeCreation}, // default
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := inferSkillType(tt.name)
			if got != tt.expected {
				t.Errorf("inferSkillType(%q) = %q, want %q", tt.name, got, tt.expected)
			}
		})
	}
}

// --- inferCategoryFromName tests ---

func TestInferCategoryFromName(t *testing.T) {
	tests := []struct {
		name     string
		expected Category
	}{
		{"skattefunn-application", CategoryCompliance},
		{"investor-memo", CategoryInvestor},
		{"context-sheet", CategoryInternal},
		{"development-brief", CategoryDevelopment},
		{"marketing-materials", CategoryMarketing},
		{"my-custom-generator", CategoryCustom},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := inferCategoryFromName(tt.name)
			if got != tt.expected {
				t.Errorf("inferCategoryFromName(%q) = %q, want %q", tt.name, got, tt.expected)
			}
		})
	}
}

// --- SkillInfo methods ---

func TestSkillInfoSetPrompt(t *testing.T) {
	info := &SkillInfo{Name: "test"}
	if info.PromptLoaded() {
		t.Error("New SkillInfo should have promptLoaded = false")
	}
	info.SetPrompt("hello")
	if !info.PromptLoaded() {
		t.Error("After SetPrompt, promptLoaded should be true")
	}
	if info.Prompt != "hello" {
		t.Errorf("Prompt = %q, want 'hello'", info.Prompt)
	}
}

// --- looksLikeSkill tests ---

func TestLooksLikeSkill(t *testing.T) {
	tempDir := t.TempDir()

	// Directory with skill.yaml -> true
	skillDir := filepath.Join(tempDir, "with-skill-yaml")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), "name: test")
	if !looksLikeSkill(skillDir) {
		t.Error("Directory with skill.yaml should look like a skill")
	}

	// Directory with generator.yaml -> true
	genDir := filepath.Join(tempDir, "with-gen-yaml")
	mustMkdir(t, genDir)
	writeFile(t, filepath.Join(genDir, "generator.yaml"), "name: test")
	if !looksLikeSkill(genDir) {
		t.Error("Directory with generator.yaml should look like a skill")
	}

	// Directory with schema.json -> true
	schemaDir := filepath.Join(tempDir, "with-schema")
	mustMkdir(t, schemaDir)
	writeFile(t, filepath.Join(schemaDir, "schema.json"), "{}")
	if !looksLikeSkill(schemaDir) {
		t.Error("Directory with schema.json should look like a skill")
	}

	// Empty directory -> false
	emptyDir := filepath.Join(tempDir, "empty")
	mustMkdir(t, emptyDir)
	if looksLikeSkill(emptyDir) {
		t.Error("Empty directory should not look like a skill")
	}
}

// =============================================================================
// Task 2.11: Backward compatibility tests for generator format
// =============================================================================

func TestGeneratorYAMLReadAsSkill(t *testing.T) {
	tempDir := t.TempDir()

	// Create an old-format generator in generators/
	gensDir := filepath.Join(tempDir, "outputs")
	mustMkdir(t, gensDir)

	genDir := filepath.Join(gensDir, "context-sheet")
	mustMkdir(t, genDir)

	writeFile(t, filepath.Join(genDir, "generator.yaml"), `name: context-sheet
version: 1.0.0
description: Creates AI context summaries
category: internal
author: EPF Team

requires:
  artifacts:
    - north_star
    - strategy_formula
  optional:
    - value_models

output:
  format: markdown

files:
  schema: schema.json
  wizard: wizard.instructions.md
  validator: validator.sh
`)

	writeFile(t, filepath.Join(genDir, "wizard.instructions.md"), `# Context Sheet Generator

Generate a concise AI context sheet from EPF data.`)

	writeFile(t, filepath.Join(genDir, "schema.json"), `{"type": "object", "properties": {"content": {"type": "string"}}}`)
	writeFile(t, filepath.Join(genDir, "validator.sh"), `#!/bin/bash
echo "valid"`)

	loader := NewLoader(tempDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	skill, err := loader.GetSkill("context-sheet")
	if err != nil {
		t.Fatalf("GetSkill(context-sheet) error = %v", err)
	}

	// Verify generator.yaml is correctly read as a skill
	if skill.Name != "context-sheet" {
		t.Errorf("Name = %q, want context-sheet", skill.Name)
	}
	if skill.Version != "1.0.0" {
		t.Errorf("Version = %q, want 1.0.0", skill.Version)
	}
	if skill.Description != "Creates AI context summaries" {
		t.Errorf("Description = %q", skill.Description)
	}
	if skill.Category != CategoryInternal {
		t.Errorf("Category = %q, want internal", skill.Category)
	}
	if skill.Author != "EPF Team" {
		t.Errorf("Author = %q, want 'EPF Team'", skill.Author)
	}

	// type: generation should be inferred for generator.yaml
	if skill.Type != SkillTypeGeneration {
		t.Errorf("Type = %q, want generation (should be inferred from generator.yaml)", skill.Type)
	}

	// All existing fields preserved
	if len(skill.RequiredArtifacts) != 2 {
		t.Errorf("RequiredArtifacts = %v, want [north_star, strategy_formula]", skill.RequiredArtifacts)
	}
	if len(skill.OptionalArtifacts) != 1 {
		t.Errorf("OptionalArtifacts = %v, want [value_models]", skill.OptionalArtifacts)
	}
	if skill.OutputFormat != FormatMarkdown {
		t.Errorf("OutputFormat = %q, want markdown", skill.OutputFormat)
	}

	// Legacy format flags
	if !skill.LegacyFormat {
		t.Error("LegacyFormat should be true for generator.yaml")
	}
	if skill.LegacyManifestName != LegacyManifestFile {
		t.Errorf("LegacyManifestName = %q, want %q", skill.LegacyManifestName, LegacyManifestFile)
	}

	// File detection
	if !skill.HasManifest {
		t.Error("HasManifest should be true")
	}
	if !skill.HasPrompt {
		t.Error("HasPrompt should be true")
	}
	if skill.PromptFile != LegacyPromptFile {
		t.Errorf("PromptFile = %q, want %q (wizard.instructions.md)", skill.PromptFile, LegacyPromptFile)
	}
	if !skill.HasSchema {
		t.Error("HasSchema should be true")
	}
	if !skill.HasValidator {
		t.Error("HasValidator should be true")
	}
}

func TestWizardInstructionsMDLoadedAsPrompt(t *testing.T) {
	tempDir := t.TempDir()
	outputsDir := filepath.Join(tempDir, "outputs")
	mustMkdir(t, outputsDir)

	genDir := filepath.Join(outputsDir, "test-gen")
	mustMkdir(t, genDir)
	writeFile(t, filepath.Join(genDir, "generator.yaml"), `name: test-gen
version: 1.0.0
description: Test
`)
	expectedPrompt := "# Test Generator\n\nThis is the wizard content."
	writeFile(t, filepath.Join(genDir, "wizard.instructions.md"), expectedPrompt)

	loader := NewLoader(tempDir)
	loader.Load()

	skill, _ := loader.GetSkill("test-gen")

	// Load prompt
	if err := loader.LoadPrompt(skill); err != nil {
		t.Fatalf("LoadPrompt() error = %v", err)
	}
	if skill.Prompt != expectedPrompt {
		t.Errorf("Prompt = %q, want %q", skill.Prompt, expectedPrompt)
	}
}

func TestGeneratorsDirScanned(t *testing.T) {
	tempDir := t.TempDir()
	instanceDir := t.TempDir()

	// Instance-level generators/ directory should be scanned
	gensDir := filepath.Join(instanceDir, "generators")
	mustMkdir(t, gensDir)

	genDir := filepath.Join(gensDir, "custom-generator")
	mustMkdir(t, genDir)
	writeFile(t, filepath.Join(genDir, "generator.yaml"), `name: custom-generator
version: 1.0.0
description: Custom generator in generators/ dir
category: custom
`)

	// Also skills/ should be scanned
	skillsDir := filepath.Join(instanceDir, "skills")
	mustMkdir(t, skillsDir)

	skillDir := filepath.Join(skillsDir, "custom-skill")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: custom-skill
version: 1.0.0
type: review
description: Custom skill in skills/ dir
`)

	loader := NewLoader(tempDir)
	loader.SetInstanceRoot(instanceDir)
	loader.Load()

	// Both directories should be scanned
	_, err1 := loader.GetSkill("custom-generator")
	if err1 != nil {
		t.Errorf("custom-generator from generators/ dir not found: %v", err1)
	}
	_, err2 := loader.GetSkill("custom-skill")
	if err2 != nil {
		t.Errorf("custom-skill from skills/ dir not found: %v", err2)
	}
}

func TestGeneratorTypeInferred(t *testing.T) {
	tempDir := t.TempDir()
	outputsDir := filepath.Join(tempDir, "outputs")
	mustMkdir(t, outputsDir)

	// generator.yaml without type field
	genDir := filepath.Join(outputsDir, "no-type-gen")
	mustMkdir(t, genDir)
	writeFile(t, filepath.Join(genDir, "generator.yaml"), `name: no-type-gen
version: 1.0.0
description: Generator with no type field
`)

	loader := NewLoader(tempDir)
	loader.Load()

	skill, _ := loader.GetSkill("no-type-gen")
	if skill.Type != SkillTypeGeneration {
		t.Errorf("Type = %q, want generation (should be inferred for generator.yaml without type)", skill.Type)
	}
}

// =============================================================================
// Task 2.12: Backward compatibility tests for scaffold
// =============================================================================

func TestScaffoldGenerationUsesLegacyNames(t *testing.T) {
	outputDir := t.TempDir()

	// Generation-type skills should produce generator.yaml + wizard.instructions.md
	result, err := Scaffold(ScaffoldOptions{
		Name:              "test-generator",
		Description:       "Test generator description",
		Type:              SkillTypeGeneration,
		Category:          CategoryInvestor,
		Author:            "TestAuthor",
		OutputDir:         outputDir,
		RequiredArtifacts: []string{"north_star", "strategy_formula"},
		OptionalArtifacts: []string{"value_models"},
		OutputFormat:      FormatMarkdown,
		Regions:           []string{"NO"},
	})

	if err != nil {
		t.Fatalf("Scaffold() error = %v", err)
	}

	skillPath := result.SkillPath
	if !strings.HasSuffix(skillPath, "test-generator") {
		t.Errorf("SkillPath = %q, expected to end with test-generator", skillPath)
	}

	// CRITICAL: generation-type must create generator.yaml, NOT skill.yaml
	if _, err := os.Stat(filepath.Join(skillPath, "generator.yaml")); err != nil {
		t.Error("Scaffold(generation) must create generator.yaml, not skill.yaml")
	}
	if _, err := os.Stat(filepath.Join(skillPath, "skill.yaml")); err == nil {
		t.Error("Scaffold(generation) must NOT create skill.yaml")
	}

	// CRITICAL: must create wizard.instructions.md, NOT prompt.md
	if _, err := os.Stat(filepath.Join(skillPath, "wizard.instructions.md")); err != nil {
		t.Error("Scaffold(generation) must create wizard.instructions.md, not prompt.md")
	}
	if _, err := os.Stat(filepath.Join(skillPath, "prompt.md")); err == nil {
		t.Error("Scaffold(generation) must NOT create prompt.md")
	}

	// Standard files should also exist
	if _, err := os.Stat(filepath.Join(skillPath, "schema.json")); err != nil {
		t.Error("schema.json should be created")
	}
	if _, err := os.Stat(filepath.Join(skillPath, "validator.sh")); err != nil {
		t.Error("validator.sh should be created")
	}
	if _, err := os.Stat(filepath.Join(skillPath, "README.md")); err != nil {
		t.Error("README.md should be created")
	}

	// Verify manifest content doesn't contain "type:" field (legacy format)
	manifestData, _ := os.ReadFile(filepath.Join(skillPath, "generator.yaml"))
	manifestStr := string(manifestData)
	if strings.Contains(manifestStr, "type:") {
		t.Error("generator.yaml should NOT contain a 'type:' field (legacy format)")
	}
	if !strings.Contains(manifestStr, "name: test-generator") {
		t.Error("generator.yaml should contain 'name: test-generator'")
	}
	if !strings.Contains(manifestStr, "description: Test generator description") {
		t.Error("generator.yaml should contain description")
	}
	if !strings.Contains(manifestStr, "category: investor") {
		t.Error("generator.yaml should contain 'category: investor'")
	}
	if !strings.Contains(manifestStr, "north_star") {
		t.Error("generator.yaml should contain required artifact 'north_star'")
	}
}

func TestScaffoldNonGenerationUsesNewNames(t *testing.T) {
	outputDir := t.TempDir()

	// Non-generation skills should use new names
	for _, skillType := range []SkillType{SkillTypeCreation, SkillTypeReview, SkillTypeEnrichment, SkillTypeAnalysis} {
		testName := "test-" + string(skillType)
		result, err := Scaffold(ScaffoldOptions{
			Name:      testName,
			Type:      skillType,
			OutputDir: outputDir,
		})
		if err != nil {
			t.Fatalf("Scaffold(%s) error = %v", skillType, err)
		}

		// New format: skill.yaml + prompt.md
		if _, err := os.Stat(filepath.Join(result.SkillPath, "skill.yaml")); err != nil {
			t.Errorf("Scaffold(%s) should create skill.yaml", skillType)
		}
		if _, err := os.Stat(filepath.Join(result.SkillPath, "prompt.md")); err != nil {
			t.Errorf("Scaffold(%s) should create prompt.md", skillType)
		}
		// Should NOT have legacy names
		if _, err := os.Stat(filepath.Join(result.SkillPath, "generator.yaml")); err == nil {
			t.Errorf("Scaffold(%s) should NOT create generator.yaml", skillType)
		}
		if _, err := os.Stat(filepath.Join(result.SkillPath, "wizard.instructions.md")); err == nil {
			t.Errorf("Scaffold(%s) should NOT create wizard.instructions.md", skillType)
		}

		// New format manifest should contain "type:" field
		manifestData, _ := os.ReadFile(filepath.Join(result.SkillPath, "skill.yaml"))
		if !strings.Contains(string(manifestData), "type: "+string(skillType)) {
			t.Errorf("skill.yaml for %s should contain 'type: %s'", skillType, skillType)
		}
	}
}

func TestScaffoldDefaultTypeIsGeneration(t *testing.T) {
	outputDir := t.TempDir()

	// Default (empty type) should behave like generation
	result, err := Scaffold(ScaffoldOptions{
		Name:      "default-type",
		OutputDir: outputDir,
	})
	if err != nil {
		t.Fatalf("Scaffold() error = %v", err)
	}

	// Should use legacy names since default is generation
	if _, err := os.Stat(filepath.Join(result.SkillPath, "generator.yaml")); err != nil {
		t.Error("Default scaffold should create generator.yaml (default type is generation)")
	}
}

func TestScaffoldUseLegacyNamesOverride(t *testing.T) {
	outputDir := t.TempDir()

	// Force legacy names on a non-generation type
	forceLegacy := true
	_, err := Scaffold(ScaffoldOptions{
		Name:           "forced-legacy",
		Type:           SkillTypeReview,
		OutputDir:      outputDir,
		UseLegacyNames: &forceLegacy,
	})
	if err != nil {
		t.Fatalf("Scaffold() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(outputDir, "forced-legacy", "generator.yaml")); err != nil {
		t.Error("UseLegacyNames=true should force generator.yaml")
	}
}

func TestScaffoldAlreadyExists(t *testing.T) {
	outputDir := t.TempDir()

	// Create the first time
	_, err := Scaffold(ScaffoldOptions{
		Name:      "existing-skill",
		OutputDir: outputDir,
	})
	if err != nil {
		t.Fatalf("First scaffold error = %v", err)
	}

	// Second creation should fail
	_, err = Scaffold(ScaffoldOptions{
		Name:      "existing-skill",
		OutputDir: outputDir,
	})
	if err == nil {
		t.Error("Scaffold should fail when skill already exists")
	}
}

func TestScaffoldNameNormalization(t *testing.T) {
	outputDir := t.TempDir()

	result, err := Scaffold(ScaffoldOptions{
		Name:      "My Custom Skill_Name",
		OutputDir: outputDir,
	})
	if err != nil {
		t.Fatalf("Scaffold() error = %v", err)
	}

	expected := "my-custom-skill-name"
	if filepath.Base(result.SkillPath) != expected {
		t.Errorf("Skill path = %q, want normalized name %q", filepath.Base(result.SkillPath), expected)
	}
}

func TestScaffoldRequiresName(t *testing.T) {
	_, err := Scaffold(ScaffoldOptions{
		OutputDir: t.TempDir(),
	})
	if err == nil {
		t.Error("Scaffold without name should fail")
	}
}

func TestScaffoldRequiresOutputDir(t *testing.T) {
	_, err := Scaffold(ScaffoldOptions{
		Name: "test",
	})
	if err == nil {
		t.Error("Scaffold without output dir should fail")
	}
}

// =============================================================================
// Task 2.13: Backward compatibility tests for sharing
// =============================================================================

func TestGeneratorsOverrideFrameworkSkills(t *testing.T) {
	frameworkDir := t.TempDir()
	instanceDir := t.TempDir()

	// Framework has a skill in outputs/
	outputsDir := filepath.Join(frameworkDir, "outputs")
	mustMkdir(t, outputsDir)
	fwGen := filepath.Join(outputsDir, "context-sheet")
	mustMkdir(t, fwGen)
	writeFile(t, filepath.Join(fwGen, "generator.yaml"), `name: context-sheet
version: 1.0.0
description: Framework version
category: internal
`)

	// Instance has override in generators/
	gensDir := filepath.Join(instanceDir, "generators")
	mustMkdir(t, gensDir)
	instGen := filepath.Join(gensDir, "context-sheet")
	mustMkdir(t, instGen)
	writeFile(t, filepath.Join(instGen, "generator.yaml"), `name: context-sheet
version: 2.0.0
description: Instance override
category: internal
`)
	writeFile(t, filepath.Join(instGen, "wizard.instructions.md"), "# Custom context sheet")

	loader := NewLoader(frameworkDir)
	loader.SetInstanceRoot(instanceDir)
	loader.Load()

	skill, err := loader.GetSkill("context-sheet")
	if err != nil {
		t.Fatalf("GetSkill error = %v", err)
	}

	// Instance generators/ should override framework outputs/
	if skill.Source != SourceInstance {
		t.Errorf("Source = %v, want instance", skill.Source)
	}
	if skill.Version != "2.0.0" {
		t.Errorf("Version = %q, want 2.0.0 (instance override)", skill.Version)
	}
	if skill.Description != "Instance override" {
		t.Errorf("Description = %q, want 'Instance override'", skill.Description)
	}
}

func TestCopySkillToInstance(t *testing.T) {
	frameworkDir := t.TempDir()
	instanceDir := t.TempDir()

	// Framework skill
	skillsDir := filepath.Join(frameworkDir, "skills")
	mustMkdir(t, skillsDir)
	skillDir := filepath.Join(skillsDir, "my-skill")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: my-skill
version: 1.0.0
type: review
description: Framework skill
`)
	writeFile(t, filepath.Join(skillDir, "prompt.md"), "# My Skill prompt")

	loader := NewLoader(frameworkDir)
	loader.Load()

	result, err := loader.Copy(CopyOptions{
		Name:         "my-skill",
		Destination:  DestInstance,
		InstancePath: instanceDir,
	})
	if err != nil {
		t.Fatalf("Copy() error = %v", err)
	}

	// Verify copy went to generators/ (backward compat)
	if !strings.Contains(result.DestinationPath, "generators") {
		t.Errorf("DestinationPath = %q, should contain 'generators' for backward compatibility", result.DestinationPath)
	}

	// Verify files were copied
	if len(result.FilesCopied) == 0 {
		t.Error("FilesCopied should not be empty")
	}

	// Verify destination exists and has files
	if _, err := os.Stat(result.DestinationPath); err != nil {
		t.Errorf("Destination directory should exist: %v", err)
	}
}

func TestCopyLegacyWizardFileReturnsError(t *testing.T) {
	tempDir := t.TempDir()
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "feature_definition.wizard.md"), "# FD Wizard")

	loader := NewLoader(tempDir)
	loader.Load()

	_, err := loader.Copy(CopyOptions{
		Name:            "feature_definition",
		Destination:     DestPath,
		DestinationPath: t.TempDir(),
	})
	if err == nil {
		t.Error("Copy of legacy wizard file should return error")
	}
}

func TestExportSkillAsArchive(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	skillDir := filepath.Join(skillsDir, "exportable")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: exportable
version: 1.0.0
type: generation
description: Exportable skill
`)
	writeFile(t, filepath.Join(skillDir, "prompt.md"), "# Export test")
	writeFile(t, filepath.Join(skillDir, "schema.json"), `{}`)

	loader := NewLoader(tempDir)
	loader.Load()

	outputPath := filepath.Join(t.TempDir(), "export.tar.gz")
	result, err := loader.Export(ExportOptions{
		Name:          "exportable",
		OutputPath:    outputPath,
		IncludeReadme: false,
	})
	if err != nil {
		t.Fatalf("Export() error = %v", err)
	}

	if result.ArchivePath != outputPath {
		t.Errorf("ArchivePath = %q, want %q", result.ArchivePath, outputPath)
	}
	if result.SizeBytes <= 0 {
		t.Error("SizeBytes should be > 0")
	}
	if len(result.FilesExported) == 0 {
		t.Error("FilesExported should not be empty")
	}

	// Verify archive is valid tar.gz
	file, err := os.Open(outputPath)
	if err != nil {
		t.Fatalf("Open archive error = %v", err)
	}
	defer file.Close()

	gzReader, err := gzip.NewReader(file)
	if err != nil {
		t.Fatalf("gzip.NewReader error = %v", err)
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	fileCount := 0
	for {
		_, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("tar.Next() error = %v", err)
		}
		fileCount++
	}
	if fileCount == 0 {
		t.Error("Archive should contain files")
	}
}

func TestExportLegacyWizardReturnsError(t *testing.T) {
	tempDir := t.TempDir()
	wizardsDir := filepath.Join(tempDir, "wizards")
	mustMkdir(t, wizardsDir)
	writeFile(t, filepath.Join(wizardsDir, "feature_definition.wizard.md"), "# FD")

	loader := NewLoader(tempDir)
	loader.Load()

	_, err := loader.Export(ExportOptions{
		Name:       "feature_definition",
		OutputPath: filepath.Join(t.TempDir(), "export.tar.gz"),
	})
	if err == nil {
		t.Error("Export of legacy wizard file should return error")
	}
}

func TestInstallFromDirectory(t *testing.T) {
	// Create a source skill directory
	sourceDir := t.TempDir()
	skillDir := filepath.Join(sourceDir, "my-installable")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "generator.yaml"), `name: my-installable
version: 1.0.0
description: Installable generator
`)
	writeFile(t, filepath.Join(skillDir, "wizard.instructions.md"), "# Instructions")

	destDir := t.TempDir()

	result, err := Install(InstallOptions{
		Source:          InstallFromDirectory,
		SourcePath:      skillDir,
		Destination:     DestPath,
		DestinationPath: destDir,
	})
	if err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	if result.SkillName == "" {
		t.Error("SkillName should not be empty")
	}
	if len(result.FilesInstalled) == 0 {
		t.Error("FilesInstalled should not be empty")
	}

	// Verify files exist at destination
	destSkill := filepath.Join(destDir, result.SkillName)
	if _, err := os.Stat(destSkill); err != nil {
		t.Errorf("Installed skill should exist at %s: %v", destSkill, err)
	}
}

func TestInstallFromArchive(t *testing.T) {
	// Create a skill directory and export it
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	skillDir := filepath.Join(skillsDir, "archived-skill")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "generator.yaml"), `name: archived-skill
version: 1.0.0
description: Archived skill
`)
	writeFile(t, filepath.Join(skillDir, "wizard.instructions.md"), "# Archived instructions")

	loader := NewLoader(tempDir)
	loader.Load()

	archivePath := filepath.Join(t.TempDir(), "skill.tar.gz")
	_, err := loader.Export(ExportOptions{
		Name:       "archived-skill",
		OutputPath: archivePath,
	})
	if err != nil {
		t.Fatalf("Export error = %v", err)
	}

	// Install from archive
	destDir := t.TempDir()
	result, err := Install(InstallOptions{
		Source:          InstallFromFile,
		SourcePath:      archivePath,
		Destination:     DestPath,
		DestinationPath: destDir,
	})
	if err != nil {
		t.Fatalf("Install from archive error = %v", err)
	}

	if result.SkillName != "archived-skill" {
		t.Errorf("SkillName = %q, want archived-skill", result.SkillName)
	}

	// Verify the installed files
	installedDir := filepath.Join(destDir, "archived-skill")
	if _, err := os.Stat(filepath.Join(installedDir, "generator.yaml")); err != nil {
		t.Error("Installed skill should have generator.yaml")
	}
	if _, err := os.Stat(filepath.Join(installedDir, "wizard.instructions.md")); err != nil {
		t.Error("Installed skill should have wizard.instructions.md")
	}
}

func TestCopyWithRename(t *testing.T) {
	tempDir := t.TempDir()
	skillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, skillsDir)

	skillDir := filepath.Join(skillsDir, "original")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: original
version: 1.0.0
type: review
description: Original
`)
	writeFile(t, filepath.Join(skillDir, "prompt.md"), "# Original")

	destDir := t.TempDir()

	loader := NewLoader(tempDir)
	loader.Load()

	result, err := loader.Copy(CopyOptions{
		Name:            "original",
		Destination:     DestPath,
		DestinationPath: destDir,
		NewName:         "renamed-skill",
	})
	if err != nil {
		t.Fatalf("Copy with rename error = %v", err)
	}

	if result.NewName != "renamed-skill" {
		t.Errorf("NewName = %q, want renamed-skill", result.NewName)
	}

	if _, err := os.Stat(filepath.Join(destDir, "renamed-skill")); err != nil {
		t.Errorf("Renamed skill should exist at destination: %v", err)
	}
}

// --- Global directory backward compat ---

func TestGlobalGeneratorsDirScanned(t *testing.T) {
	// This tests that ~/.epf-cli/generators/ is scanned alongside ~/.epf-cli/skills/
	// We simulate this by constructing the loader with a custom global root

	tempDir := t.TempDir()
	frameworkDir := t.TempDir()

	// Create a "global" generators dir
	globalGensDir := filepath.Join(tempDir, "generators")
	mustMkdir(t, globalGensDir)

	genDir := filepath.Join(globalGensDir, "global-gen")
	mustMkdir(t, genDir)
	writeFile(t, filepath.Join(genDir, "generator.yaml"), `name: global-gen
version: 1.0.0
description: Global generator
`)

	// Create a "global" skills dir
	globalSkillsDir := filepath.Join(tempDir, "skills")
	mustMkdir(t, globalSkillsDir)

	skillDir := filepath.Join(globalSkillsDir, "global-skill")
	mustMkdir(t, skillDir)
	writeFile(t, filepath.Join(skillDir, "skill.yaml"), `name: global-skill
version: 1.0.0
type: review
description: Global skill
`)

	// Create loader and override global root
	loader := &Loader{
		epfRoot:    frameworkDir,
		globalRoot: tempDir,
		skills:     make(map[string]*SkillInfo),
	}
	loader.Load()

	_, err1 := loader.GetSkill("global-gen")
	if err1 != nil {
		t.Errorf("global-gen from generators/ not found: %v", err1)
	}
	_, err2 := loader.GetSkill("global-skill")
	if err2 != nil {
		t.Errorf("global-skill from skills/ not found: %v", err2)
	}
}

// --- Helper functions ---

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
