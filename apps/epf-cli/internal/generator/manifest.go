package generator

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// ParseManifest parses a generator.yaml file
func ParseManifest(path string) (*GeneratorManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest: %w", err)
	}

	return ParseManifestContent(data)
}

// ParseManifestContent parses generator.yaml content
func ParseManifestContent(data []byte) (*GeneratorManifest, error) {
	var manifest GeneratorManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("failed to parse manifest: %w", err)
	}

	// Apply defaults
	if manifest.Files == nil {
		manifest.Files = &FilesSpec{}
	}
	if manifest.Files.Schema == "" {
		manifest.Files.Schema = DefaultSchemaFile
	}
	if manifest.Files.Wizard == "" {
		manifest.Files.Wizard = DefaultWizardFile
	}
	if manifest.Files.Validator == "" {
		manifest.Files.Validator = DefaultValidatorFile
	}
	if manifest.Files.Template == "" {
		manifest.Files.Template = DefaultTemplateFile
	}

	if manifest.Output == nil {
		manifest.Output = &OutputSpec{}
	}
	if manifest.Output.Format == "" {
		manifest.Output.Format = FormatMarkdown
	}

	return &manifest, nil
}

// InferGeneratorInfo creates GeneratorInfo from a generator directory
// This works even without a generator.yaml by detecting files
func InferGeneratorInfo(genDir string, source GeneratorSource) (*GeneratorInfo, error) {
	name := filepath.Base(genDir)

	info := &GeneratorInfo{
		Name:   name,
		Source: source,
		Path:   genDir,
	}

	// Check for manifest
	manifestPath := filepath.Join(genDir, DefaultManifestFile)
	if data, err := os.ReadFile(manifestPath); err == nil {
		manifest, err := ParseManifestContent(data)
		if err != nil {
			return nil, fmt.Errorf("failed to parse manifest in %s: %w", genDir, err)
		}
		info.HasManifest = true
		info.populateFromManifest(manifest)
	}

	// Detect available files
	info.detectFiles(genDir)

	// If no manifest, try to infer from directory name
	if !info.HasManifest {
		info.Name = name
		info.Version = "0.0.0" // Unknown version
		info.Category = CategoryCustom
	}

	return info, nil
}

// populateFromManifest fills GeneratorInfo from a parsed manifest
func (g *GeneratorInfo) populateFromManifest(m *GeneratorManifest) {
	if m.Name != "" {
		g.Name = m.Name
	}
	g.Version = m.Version
	g.Description = m.Description
	g.Category = m.Category
	g.Author = m.Author
	g.Regions = m.Regions

	if m.Requires != nil {
		g.RequiredArtifacts = m.Requires.Artifacts
		g.OptionalArtifacts = m.Requires.Optional
	}

	if m.Output != nil {
		g.OutputFormat = m.Output.Format
	}

	// File paths from manifest
	if m.Files != nil {
		g.SchemaFile = m.Files.Schema
		g.WizardFile = m.Files.Wizard
		g.ValidatorFile = m.Files.Validator
		g.TemplateFile = m.Files.Template
	}
}

// detectFiles checks which standard files exist in the generator directory
func (g *GeneratorInfo) detectFiles(genDir string) {
	// Schema
	schemaPath := g.SchemaFile
	if schemaPath == "" {
		schemaPath = DefaultSchemaFile
	}
	if _, err := os.Stat(filepath.Join(genDir, schemaPath)); err == nil {
		g.HasSchema = true
		g.SchemaFile = schemaPath
	}

	// Wizard
	wizardPath := g.WizardFile
	if wizardPath == "" {
		wizardPath = DefaultWizardFile
	}
	if _, err := os.Stat(filepath.Join(genDir, wizardPath)); err == nil {
		g.HasWizard = true
		g.WizardFile = wizardPath
	}

	// Validator
	validatorPath := g.ValidatorFile
	if validatorPath == "" {
		validatorPath = DefaultValidatorFile
	}
	if _, err := os.Stat(filepath.Join(genDir, validatorPath)); err == nil {
		g.HasValidator = true
		g.ValidatorFile = validatorPath
	}

	// Template
	templatePath := g.TemplateFile
	if templatePath == "" {
		templatePath = DefaultTemplateFile
	}
	if _, err := os.Stat(filepath.Join(genDir, templatePath)); err == nil {
		g.HasTemplate = true
		g.TemplateFile = templatePath
	}

	// Also check for template.html (for HTML generators)
	if !g.HasTemplate {
		if _, err := os.Stat(filepath.Join(genDir, "template.html")); err == nil {
			g.HasTemplate = true
			g.TemplateFile = "template.html"
		}
	}
}

// ValidateManifest checks if a manifest is valid
func ValidateManifest(m *GeneratorManifest) []string {
	var errors []string

	if m.Name == "" {
		errors = append(errors, "name is required")
	}

	if m.Version == "" {
		errors = append(errors, "version is required")
	}

	if m.Description == "" {
		errors = append(errors, "description is required")
	}

	// Validate category if specified
	if m.Category != "" {
		if _, err := CategoryFromString(string(m.Category)); err != nil {
			errors = append(errors, fmt.Sprintf("invalid category: %s", m.Category))
		}
	}

	return errors
}
