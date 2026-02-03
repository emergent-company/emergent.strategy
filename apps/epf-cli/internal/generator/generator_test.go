package generator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCategoryFromString tests category parsing
func TestCategoryFromString(t *testing.T) {
	tests := []struct {
		input    string
		expected GeneratorCategory
		wantErr  bool
	}{
		{"compliance", CategoryCompliance, false},
		{"COMPLIANCE", CategoryCompliance, false},
		{"Compliance", CategoryCompliance, false},
		{"marketing", CategoryMarketing, false},
		{"investor", CategoryInvestor, false},
		{"internal", CategoryInternal, false},
		{"development", CategoryDevelopment, false},
		{"custom", CategoryCustom, false},
		{"", CategoryUnspecified, false},
		{"  compliance  ", CategoryCompliance, false},
		{"invalid", "", true},
		{"foo", "", true},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			got, err := CategoryFromString(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error for input %q, got nil", tc.input)
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error for input %q: %v", tc.input, err)
				return
			}
			if got != tc.expected {
				t.Errorf("CategoryFromString(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

// TestValidCategories tests that ValidCategories returns all categories
func TestValidCategories(t *testing.T) {
	cats := ValidCategories()
	if len(cats) != 6 {
		t.Errorf("expected 6 categories, got %d", len(cats))
	}

	// Verify all expected categories are present
	expected := map[GeneratorCategory]bool{
		CategoryCompliance:  false,
		CategoryMarketing:   false,
		CategoryInvestor:    false,
		CategoryInternal:    false,
		CategoryDevelopment: false,
		CategoryCustom:      false,
	}

	for _, cat := range cats {
		expected[cat] = true
	}

	for cat, found := range expected {
		if !found {
			t.Errorf("category %q not found in ValidCategories()", cat)
		}
	}
}

// TestSourcePriority tests source priority ordering
func TestSourcePriority(t *testing.T) {
	// Instance should have highest priority (lowest number)
	if SourcePriority(SourceInstance) >= SourcePriority(SourceFramework) {
		t.Error("SourceInstance should have higher priority than SourceFramework")
	}
	if SourcePriority(SourceFramework) >= SourcePriority(SourceGlobal) {
		t.Error("SourceFramework should have higher priority than SourceGlobal")
	}
}

// TestSourceString tests source string representation
func TestSourceString(t *testing.T) {
	tests := []struct {
		source   GeneratorSource
		expected string
	}{
		{SourceInstance, "Instance"},
		{SourceFramework, "EPF Framework"},
		{SourceGlobal, "Global"},
		{GeneratorSource("unknown"), "unknown"},
	}

	for _, tc := range tests {
		t.Run(string(tc.source), func(t *testing.T) {
			if got := tc.source.String(); got != tc.expected {
				t.Errorf("Source(%q).String() = %q, want %q", tc.source, got, tc.expected)
			}
		})
	}
}

// TestCategoryString tests category string representation
func TestCategoryString(t *testing.T) {
	tests := []struct {
		cat      GeneratorCategory
		expected string
	}{
		{CategoryCompliance, "Compliance"},
		{CategoryMarketing, "Marketing"},
		{CategoryInvestor, "Investor"},
		{CategoryInternal, "Internal"},
		{CategoryDevelopment, "Development"},
		{CategoryCustom, "Custom"},
		{CategoryUnspecified, "Unspecified"},
	}

	for _, tc := range tests {
		t.Run(string(tc.cat), func(t *testing.T) {
			if got := tc.cat.String(); got != tc.expected {
				t.Errorf("Category(%q).String() = %q, want %q", tc.cat, got, tc.expected)
			}
		})
	}
}

// TestParseManifestContent tests manifest parsing
func TestParseManifestContent(t *testing.T) {
	validManifest := `
name: test-generator
version: 1.0.0
description: A test generator
category: compliance
author: Test Author
regions:
  - NO
  - SE

requires:
  artifacts:
    - north_star
    - strategy_formula
  optional:
    - roadmap_recipe

output:
  format: markdown
`

	manifest, err := ParseManifestContent([]byte(validManifest))
	if err != nil {
		t.Fatalf("failed to parse valid manifest: %v", err)
	}

	// Check basic fields
	if manifest.Name != "test-generator" {
		t.Errorf("Name = %q, want %q", manifest.Name, "test-generator")
	}
	if manifest.Version != "1.0.0" {
		t.Errorf("Version = %q, want %q", manifest.Version, "1.0.0")
	}
	if manifest.Description != "A test generator" {
		t.Errorf("Description = %q, want %q", manifest.Description, "A test generator")
	}
	if manifest.Category != CategoryCompliance {
		t.Errorf("Category = %q, want %q", manifest.Category, CategoryCompliance)
	}
	if manifest.Author != "Test Author" {
		t.Errorf("Author = %q, want %q", manifest.Author, "Test Author")
	}

	// Check regions
	if len(manifest.Regions) != 2 {
		t.Errorf("expected 2 regions, got %d", len(manifest.Regions))
	}

	// Check requires
	if manifest.Requires == nil {
		t.Fatal("Requires is nil")
	}
	if len(manifest.Requires.Artifacts) != 2 {
		t.Errorf("expected 2 required artifacts, got %d", len(manifest.Requires.Artifacts))
	}
	if len(manifest.Requires.Optional) != 1 {
		t.Errorf("expected 1 optional artifact, got %d", len(manifest.Requires.Optional))
	}

	// Check output
	if manifest.Output == nil {
		t.Fatal("Output is nil")
	}
	if manifest.Output.Format != FormatMarkdown {
		t.Errorf("Output.Format = %q, want %q", manifest.Output.Format, FormatMarkdown)
	}

	// Check defaults for Files
	if manifest.Files == nil {
		t.Fatal("Files is nil (should have defaults)")
	}
	if manifest.Files.Schema != DefaultSchemaFile {
		t.Errorf("Files.Schema = %q, want default %q", manifest.Files.Schema, DefaultSchemaFile)
	}
}

// TestParseManifestContentDefaults tests that defaults are applied
func TestParseManifestContentDefaults(t *testing.T) {
	minimalManifest := `
name: minimal
version: 1.0.0
description: Minimal generator
`

	manifest, err := ParseManifestContent([]byte(minimalManifest))
	if err != nil {
		t.Fatalf("failed to parse minimal manifest: %v", err)
	}

	// Check defaults are applied
	if manifest.Files == nil {
		t.Fatal("Files should not be nil")
	}
	if manifest.Files.Schema != DefaultSchemaFile {
		t.Errorf("default schema file not applied")
	}
	if manifest.Files.Wizard != DefaultWizardFile {
		t.Errorf("default wizard file not applied")
	}
	if manifest.Files.Validator != DefaultValidatorFile {
		t.Errorf("default validator file not applied")
	}
	if manifest.Files.Template != DefaultTemplateFile {
		t.Errorf("default template file not applied")
	}

	if manifest.Output == nil {
		t.Fatal("Output should not be nil")
	}
	if manifest.Output.Format != FormatMarkdown {
		t.Errorf("default output format not applied, got %q", manifest.Output.Format)
	}
}

// TestParseManifestContentInvalid tests invalid YAML
func TestParseManifestContentInvalid(t *testing.T) {
	invalidYAML := `
name: [invalid
  yaml: content
`
	_, err := ParseManifestContent([]byte(invalidYAML))
	if err == nil {
		t.Error("expected error for invalid YAML, got nil")
	}
}

// TestValidateManifest tests manifest validation
func TestValidateManifest(t *testing.T) {
	tests := []struct {
		name     string
		manifest GeneratorManifest
		wantErrs int
	}{
		{
			name: "valid",
			manifest: GeneratorManifest{
				Name:        "test",
				Version:     "1.0.0",
				Description: "A test",
			},
			wantErrs: 0,
		},
		{
			name: "missing name",
			manifest: GeneratorManifest{
				Version:     "1.0.0",
				Description: "A test",
			},
			wantErrs: 1,
		},
		{
			name: "missing version",
			manifest: GeneratorManifest{
				Name:        "test",
				Description: "A test",
			},
			wantErrs: 1,
		},
		{
			name: "missing description",
			manifest: GeneratorManifest{
				Name:    "test",
				Version: "1.0.0",
			},
			wantErrs: 1,
		},
		{
			name:     "missing all",
			manifest: GeneratorManifest{},
			wantErrs: 3,
		},
		{
			name: "invalid category",
			manifest: GeneratorManifest{
				Name:        "test",
				Version:     "1.0.0",
				Description: "A test",
				Category:    "invalid-cat",
			},
			wantErrs: 1,
		},
		{
			name: "valid category",
			manifest: GeneratorManifest{
				Name:        "test",
				Version:     "1.0.0",
				Description: "A test",
				Category:    CategoryCompliance,
			},
			wantErrs: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			errs := ValidateManifest(&tc.manifest)
			if len(errs) != tc.wantErrs {
				t.Errorf("ValidateManifest() returned %d errors, want %d: %v", len(errs), tc.wantErrs, errs)
			}
		})
	}
}

// TestLoaderWithEmptyDirs tests loader with no generators
func TestLoaderWithEmptyDirs(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	loader := NewLoader(tmpDir)
	err = loader.Load()
	if err != nil {
		t.Fatalf("Load() failed on empty dir: %v", err)
	}

	if loader.HasGenerators() {
		t.Error("HasGenerators() should return false for empty dir")
	}
	if loader.GeneratorCount() != 0 {
		t.Errorf("GeneratorCount() = %d, want 0", loader.GeneratorCount())
	}
}

// TestLoaderDiscovery tests generator discovery
func TestLoaderDiscovery(t *testing.T) {
	// Create temp directory structure
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create outputs directory (framework)
	outputsDir := filepath.Join(tmpDir, "outputs")
	if err := os.MkdirAll(outputsDir, 0755); err != nil {
		t.Fatalf("failed to create outputs dir: %v", err)
	}

	// Create a test generator
	testGenDir := filepath.Join(outputsDir, "test-gen")
	if err := os.MkdirAll(testGenDir, 0755); err != nil {
		t.Fatalf("failed to create test-gen dir: %v", err)
	}

	// Create manifest
	manifestContent := `
name: test-gen
version: 1.0.0
description: Test generator
category: internal
`
	if err := os.WriteFile(filepath.Join(testGenDir, "generator.yaml"), []byte(manifestContent), 0644); err != nil {
		t.Fatalf("failed to write manifest: %v", err)
	}

	// Create schema
	if err := os.WriteFile(filepath.Join(testGenDir, "schema.json"), []byte(`{}`), 0644); err != nil {
		t.Fatalf("failed to write schema: %v", err)
	}

	// Create wizard
	if err := os.WriteFile(filepath.Join(testGenDir, "wizard.instructions.md"), []byte("# Instructions"), 0644); err != nil {
		t.Fatalf("failed to write wizard: %v", err)
	}

	// Load generators
	loader := NewLoader(tmpDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Verify generator was discovered
	if !loader.HasGenerators() {
		t.Error("HasGenerators() should return true")
	}
	if loader.GeneratorCount() != 1 {
		t.Errorf("GeneratorCount() = %d, want 1", loader.GeneratorCount())
	}

	// Get generator
	gen, err := loader.GetGenerator("test-gen")
	if err != nil {
		t.Fatalf("GetGenerator() failed: %v", err)
	}

	if gen.Name != "test-gen" {
		t.Errorf("Name = %q, want %q", gen.Name, "test-gen")
	}
	if gen.Source != SourceFramework {
		t.Errorf("Source = %q, want %q", gen.Source, SourceFramework)
	}
	if gen.Category != CategoryInternal {
		t.Errorf("Category = %q, want %q", gen.Category, CategoryInternal)
	}
	if !gen.HasManifest {
		t.Error("HasManifest should be true")
	}
	if !gen.HasSchema {
		t.Error("HasSchema should be true")
	}
	if !gen.HasWizard {
		t.Error("HasWizard should be true")
	}
}

// TestLoaderPriority tests that instance generators override framework generators
func TestLoaderPriority(t *testing.T) {
	// Create temp directory structure
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create framework generator
	frameworkDir := filepath.Join(tmpDir, "outputs", "shared-gen")
	if err := os.MkdirAll(frameworkDir, 0755); err != nil {
		t.Fatalf("failed to create framework dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(frameworkDir, "generator.yaml"), []byte(`
name: shared-gen
version: 1.0.0
description: Framework version
category: internal
`), 0644); err != nil {
		t.Fatalf("failed to write framework manifest: %v", err)
	}

	// Create instance directory
	instanceDir := filepath.Join(tmpDir, "instance")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("failed to create instance dir: %v", err)
	}

	// Create instance generator with same name
	instanceGenDir := filepath.Join(instanceDir, "generators", "shared-gen")
	if err := os.MkdirAll(instanceGenDir, 0755); err != nil {
		t.Fatalf("failed to create instance gen dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(instanceGenDir, "generator.yaml"), []byte(`
name: shared-gen
version: 2.0.0
description: Instance version (override)
category: custom
`), 0644); err != nil {
		t.Fatalf("failed to write instance manifest: %v", err)
	}

	// Load with instance root
	loader := NewLoader(tmpDir)
	loader.SetInstanceRoot(instanceDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Should only have 1 generator (instance overrides framework)
	if loader.GeneratorCount() != 1 {
		t.Errorf("GeneratorCount() = %d, want 1", loader.GeneratorCount())
	}

	// Get generator and verify it's the instance version
	gen, err := loader.GetGenerator("shared-gen")
	if err != nil {
		t.Fatalf("GetGenerator() failed: %v", err)
	}

	if gen.Source != SourceInstance {
		t.Errorf("Source = %q, want %q (instance should override)", gen.Source, SourceInstance)
	}
	if gen.Version != "2.0.0" {
		t.Errorf("Version = %q, want %q (instance version)", gen.Version, "2.0.0")
	}
	if gen.Description != "Instance version (override)" {
		t.Errorf("Description = %q, want instance version", gen.Description)
	}
}

// TestLoaderGetGeneratorNotFound tests error for non-existent generator
func TestLoaderGetGeneratorNotFound(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	loader := NewLoader(tmpDir)
	loader.Load()

	_, err = loader.GetGenerator("non-existent")
	if err == nil {
		t.Error("expected error for non-existent generator")
	}
	if !strings.Contains(err.Error(), "generator not found") {
		t.Errorf("error should mention 'generator not found', got: %v", err)
	}
}

// TestLoaderGetGeneratorContent tests loading full content
func TestLoaderGetGeneratorContent(t *testing.T) {
	// Create temp directory structure
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a generator with all files
	genDir := filepath.Join(tmpDir, "outputs", "full-gen")
	if err := os.MkdirAll(genDir, 0755); err != nil {
		t.Fatalf("failed to create gen dir: %v", err)
	}

	files := map[string]string{
		"generator.yaml":         "name: full-gen\nversion: 1.0.0\ndescription: Full test",
		"schema.json":            `{"type": "object"}`,
		"wizard.instructions.md": "# Wizard Instructions\n\nDo this.",
		"validator.sh":           "#!/bin/bash\nexit 0",
		"template.md":            "# Template\n\n{{content}}",
		"README.md":              "# Full Generator\n\nDocumentation here.",
	}

	for name, content := range files {
		if err := os.WriteFile(filepath.Join(genDir, name), []byte(content), 0644); err != nil {
			t.Fatalf("failed to write %s: %v", name, err)
		}
	}

	loader := NewLoader(tmpDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	content, err := loader.GetGeneratorContent("full-gen")
	if err != nil {
		t.Fatalf("GetGeneratorContent() failed: %v", err)
	}

	// Verify all content was loaded
	if content.Manifest == "" {
		t.Error("Manifest content not loaded")
	}
	if content.Schema == "" {
		t.Error("Schema content not loaded")
	}
	if content.Wizard == "" {
		t.Error("Wizard content not loaded")
	}
	if content.Validator == "" {
		t.Error("Validator content not loaded")
	}
	if content.Template == "" {
		t.Error("Template content not loaded")
	}
	if content.Readme == "" {
		t.Error("Readme content not loaded")
	}

	// Verify content values
	if !strings.Contains(content.Wizard, "Wizard Instructions") {
		t.Error("Wizard content doesn't match expected")
	}
	if !strings.Contains(content.Schema, "object") {
		t.Error("Schema content doesn't match expected")
	}
}

// TestLoaderListGenerators tests listing with filters
func TestLoaderListGenerators(t *testing.T) {
	// Create temp directory structure
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	outputsDir := filepath.Join(tmpDir, "outputs")
	os.MkdirAll(outputsDir, 0755)

	// Create multiple generators with different categories
	generators := []struct {
		name     string
		category string
	}{
		{"gen-compliance", "compliance"},
		{"gen-investor", "investor"},
		{"gen-internal", "internal"},
		{"gen-internal-2", "internal"},
	}

	for _, g := range generators {
		genDir := filepath.Join(outputsDir, g.name)
		os.MkdirAll(genDir, 0755)
		manifest := "name: " + g.name + "\nversion: 1.0.0\ndescription: Test\ncategory: " + g.category
		os.WriteFile(filepath.Join(genDir, "generator.yaml"), []byte(manifest), 0644)
	}

	loader := NewLoader(tmpDir)
	loader.Load()

	// Test list all
	all := loader.ListGenerators(nil, nil)
	if len(all) != 4 {
		t.Errorf("ListGenerators(nil, nil) returned %d, want 4", len(all))
	}

	// Test filter by category
	internal := CategoryInternal
	internalGens := loader.ListGenerators(&internal, nil)
	if len(internalGens) != 2 {
		t.Errorf("ListGenerators(internal, nil) returned %d, want 2", len(internalGens))
	}

	// Test filter by source
	framework := SourceFramework
	frameworkGens := loader.ListGenerators(nil, &framework)
	if len(frameworkGens) != 4 {
		t.Errorf("ListGenerators(nil, framework) returned %d, want 4", len(frameworkGens))
	}
}

// TestLoaderGeneratorsBySource tests grouping by source
func TestLoaderGeneratorsBySource(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create framework generator
	frameworkDir := filepath.Join(tmpDir, "outputs", "framework-gen")
	os.MkdirAll(frameworkDir, 0755)
	os.WriteFile(filepath.Join(frameworkDir, "generator.yaml"), []byte("name: framework-gen\nversion: 1.0.0\ndescription: Test"), 0644)

	// Create instance
	instanceDir := filepath.Join(tmpDir, "instance", "generators", "instance-gen")
	os.MkdirAll(instanceDir, 0755)
	os.WriteFile(filepath.Join(instanceDir, "generator.yaml"), []byte("name: instance-gen\nversion: 1.0.0\ndescription: Test"), 0644)

	loader := NewLoader(tmpDir)
	loader.SetInstanceRoot(filepath.Join(tmpDir, "instance"))
	loader.Load()

	bySource := loader.GeneratorsBySource()

	if len(bySource[SourceFramework]) != 1 {
		t.Errorf("expected 1 framework generator, got %d", len(bySource[SourceFramework]))
	}
	if len(bySource[SourceInstance]) != 1 {
		t.Errorf("expected 1 instance generator, got %d", len(bySource[SourceInstance]))
	}
}

// TestLoaderGeneratorsByCategory tests grouping by category
func TestLoaderGeneratorsByCategory(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	outputsDir := filepath.Join(tmpDir, "outputs")

	// Create generators with unique names
	generators := []struct {
		name     string
		category string
	}{
		{"gen-compliance-1", "compliance"},
		{"gen-internal-1", "internal"},
		{"gen-internal-2", "internal"},
	}

	for _, g := range generators {
		genDir := filepath.Join(outputsDir, g.name)
		os.MkdirAll(genDir, 0755)
		os.WriteFile(filepath.Join(genDir, "generator.yaml"), []byte("name: "+g.name+"\nversion: 1.0.0\ndescription: Test\ncategory: "+g.category), 0644)
	}

	loader := NewLoader(tmpDir)
	loader.Load()

	byCat := loader.GeneratorsByCategory()

	if len(byCat[CategoryCompliance]) != 1 {
		t.Errorf("expected 1 compliance generator, got %d", len(byCat[CategoryCompliance]))
	}
	if len(byCat[CategoryInternal]) != 2 {
		t.Errorf("expected 2 internal generators, got %d", len(byCat[CategoryInternal]))
	}
}

// TestInferGeneratorInfoWithoutManifest tests inference without manifest
func TestInferGeneratorInfoWithoutManifest(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	genDir := filepath.Join(tmpDir, "my-generator")
	os.MkdirAll(genDir, 0755)

	// Only create schema (no manifest)
	os.WriteFile(filepath.Join(genDir, "schema.json"), []byte("{}"), 0644)

	info, err := InferGeneratorInfo(genDir, SourceFramework)
	if err != nil {
		t.Fatalf("InferGeneratorInfo() failed: %v", err)
	}

	if info.HasManifest {
		t.Error("HasManifest should be false")
	}
	if info.Name != "my-generator" {
		t.Errorf("Name should be inferred from directory: got %q", info.Name)
	}
	if info.Category != CategoryCustom {
		t.Errorf("Category should default to custom: got %q", info.Category)
	}
	if info.Version != "0.0.0" {
		t.Errorf("Version should be 0.0.0 for unknown: got %q", info.Version)
	}
	if !info.HasSchema {
		t.Error("HasSchema should be true")
	}
}

// TestScaffold tests generator scaffolding
func TestScaffold(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "scaffold-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	opts := ScaffoldOptions{
		Name:              "my-test-generator",
		Description:       "A test generator",
		Category:          CategoryInternal,
		Author:            "Test Author",
		OutputDir:         tmpDir,
		RequiredArtifacts: []string{"north_star", "strategy_formula"},
		OptionalArtifacts: []string{"roadmap_recipe"},
		OutputFormat:      FormatMarkdown,
		Regions:           []string{"NO"},
	}

	result, err := Scaffold(opts)
	if err != nil {
		t.Fatalf("Scaffold() failed: %v", err)
	}

	// Check path was created
	if result.GeneratorPath == "" {
		t.Error("GeneratorPath is empty")
	}
	if _, err := os.Stat(result.GeneratorPath); os.IsNotExist(err) {
		t.Error("generator directory was not created")
	}

	// Check all required files were created
	expectedFiles := []string{
		"generator.yaml",
		"wizard.instructions.md",
		"schema.json",
		"validator.sh",
		"README.md",
	}

	for _, f := range expectedFiles {
		filePath := filepath.Join(result.GeneratorPath, f)
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			t.Errorf("expected file %q was not created", f)
		}
	}

	// Verify files were created list
	if len(result.FilesCreated) != len(expectedFiles) {
		t.Errorf("FilesCreated has %d entries, want %d", len(result.FilesCreated), len(expectedFiles))
	}

	// Verify next steps
	if len(result.NextSteps) == 0 {
		t.Error("NextSteps is empty")
	}

	// Parse the created manifest and verify content
	manifestPath := filepath.Join(result.GeneratorPath, "generator.yaml")
	manifest, err := ParseManifest(manifestPath)
	if err != nil {
		t.Fatalf("failed to parse created manifest: %v", err)
	}

	if manifest.Name != "my-test-generator" {
		t.Errorf("manifest.Name = %q, want %q", manifest.Name, "my-test-generator")
	}
	if string(manifest.Category) != string(CategoryInternal) {
		t.Errorf("manifest.Category = %q, want %q", manifest.Category, CategoryInternal)
	}
	if manifest.Author != "Test Author" {
		t.Errorf("manifest.Author = %q, want %q", manifest.Author, "Test Author")
	}
}

// TestScaffoldNameNormalization tests that names are normalized
func TestScaffoldNameNormalization(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"My Generator", "my-generator"},
		{"my_generator", "my-generator"},
		{"MY_GENERATOR", "my-generator"},
		{"My_Test Generator", "my-test-generator"},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			// Create fresh temp dir for each test
			tmpDir, err := os.MkdirTemp("", "scaffold-test-*")
			if err != nil {
				t.Fatalf("failed to create temp dir: %v", err)
			}
			defer os.RemoveAll(tmpDir)

			result, err := Scaffold(ScaffoldOptions{
				Name:        tc.input,
				Description: "Test",
				OutputDir:   tmpDir,
			})
			if err != nil {
				t.Fatalf("Scaffold() failed: %v", err)
			}

			if !strings.HasSuffix(result.GeneratorPath, tc.expected) {
				t.Errorf("path should end with %q, got %q", tc.expected, result.GeneratorPath)
			}
		})
	}
}

// TestScaffoldMissingName tests error when name is missing
func TestScaffoldMissingName(t *testing.T) {
	_, err := Scaffold(ScaffoldOptions{
		Description: "Test",
		OutputDir:   "/tmp",
	})

	if err == nil {
		t.Error("expected error for missing name")
	}
}

// TestScaffoldMissingOutputDir tests error when output dir is missing
func TestScaffoldMissingOutputDir(t *testing.T) {
	_, err := Scaffold(ScaffoldOptions{
		Name:        "test",
		Description: "Test",
	})

	if err == nil {
		t.Error("expected error for missing output dir")
	}
}

// TestScaffoldAlreadyExists tests error when generator already exists
func TestScaffoldAlreadyExists(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "scaffold-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create the generator directory first
	existingDir := filepath.Join(tmpDir, "existing")
	os.MkdirAll(existingDir, 0755)

	_, err = Scaffold(ScaffoldOptions{
		Name:        "existing",
		Description: "Test",
		OutputDir:   tmpDir,
	})

	if err == nil {
		t.Error("expected error for existing generator")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("error should mention 'already exists', got: %v", err)
	}
}

// TestLooksLikeGenerator tests generator directory detection
func TestLooksLikeGenerator(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "generator-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	loader := NewLoader(tmpDir)

	// Test with manifest only
	genWithManifest := filepath.Join(tmpDir, "with-manifest")
	os.MkdirAll(genWithManifest, 0755)
	os.WriteFile(filepath.Join(genWithManifest, "generator.yaml"), []byte(""), 0644)
	if !loader.looksLikeGenerator(genWithManifest) {
		t.Error("should detect generator with manifest")
	}

	// Test with schema only
	genWithSchema := filepath.Join(tmpDir, "with-schema")
	os.MkdirAll(genWithSchema, 0755)
	os.WriteFile(filepath.Join(genWithSchema, "schema.json"), []byte(""), 0644)
	if !loader.looksLikeGenerator(genWithSchema) {
		t.Error("should detect generator with schema")
	}

	// Test with wizard only
	genWithWizard := filepath.Join(tmpDir, "with-wizard")
	os.MkdirAll(genWithWizard, 0755)
	os.WriteFile(filepath.Join(genWithWizard, "wizard.instructions.md"), []byte(""), 0644)
	if !loader.looksLikeGenerator(genWithWizard) {
		t.Error("should detect generator with wizard")
	}

	// Test empty directory
	emptyDir := filepath.Join(tmpDir, "empty")
	os.MkdirAll(emptyDir, 0755)
	if loader.looksLikeGenerator(emptyDir) {
		t.Error("should not detect empty dir as generator")
	}

	// Test directory with random files
	randomDir := filepath.Join(tmpDir, "random")
	os.MkdirAll(randomDir, 0755)
	os.WriteFile(filepath.Join(randomDir, "foo.txt"), []byte(""), 0644)
	if loader.looksLikeGenerator(randomDir) {
		t.Error("should not detect dir with random files as generator")
	}
}

// TestSetInstanceRoot tests changing instance root
func TestSetInstanceRoot(t *testing.T) {
	loader := NewLoader("/epf")

	// Initially empty
	if loader.instanceRoot != "" {
		t.Error("instanceRoot should be empty initially")
	}

	loader.SetInstanceRoot("/some/instance")

	if loader.instanceRoot != "/some/instance" {
		t.Errorf("instanceRoot = %q, want %q", loader.instanceRoot, "/some/instance")
	}

	// Should reset loaded flag
	loader.loaded = true
	loader.SetInstanceRoot("/other/instance")
	if loader.loaded {
		t.Error("SetInstanceRoot should reset loaded flag")
	}
}
