// Package embedded provides access to embedded EPF framework artifacts.
//
// These artifacts are copied from canonical-epf at build time using scripts/sync-embedded.sh.
// The embedded files serve as fallbacks when filesystem versions are not available.
//
// Loading priority (highest to lowest):
//  1. Instance-level files (e.g., {instance}/generators/)
//  2. Framework files from ~/.epf-cli.yaml canonical_path
//  3. Embedded files (this package)
package embedded

import (
	"embed"
	"io/fs"
	"path"
	"strings"
)

// Schemas contains all JSON Schema files for EPF artifact validation.
// These are the canonical schemas from the EPF framework.
//
//go:embed schemas/*.json
var Schemas embed.FS

// Templates contains YAML template files for creating new EPF artifacts.
// Organized by phase: READY, FIRE, AIM.
//
//go:embed templates/**/*
var Templates embed.FS

// Wizards contains agent prompt and wizard instruction files.
// These are used by MCP tools and AI-assisted workflows.
//
//go:embed wizards/*.md
var Wizards embed.FS

// Guides contains reference documentation for AI agents.
// These are embedded in the binary and always available via MCP tools.
//
//go:embed guides/*.md
var Guides embed.FS

// Generators contains the default output generator definitions.
// Each subdirectory is a generator with schema.json, wizard.instructions.md, etc.
//
//go:embed outputs/**/*
var Generators embed.FS

// Version contains the EPF framework version that was embedded at build time.
//
//go:embed VERSION
var Version string

// Manifest contains a list of all embedded files.
//
//go:embed MANIFEST.txt
var Manifest string

// AgentsMD contains the comprehensive AGENTS.md file for epf-cli.
// This file provides AI agents with complete instructions for using epf-cli
// in product repositories. It is distributed by `epf-cli init` to each instance.
//
//go:embed AGENTS.md
var AgentsMD string

// GetSchema returns the contents of an embedded schema file.
// The filename should be just the schema name (e.g., "feature_definition_schema.json").
func GetSchema(filename string) ([]byte, error) {
	return Schemas.ReadFile(path.Join("schemas", filename))
}

// GetSchemaFS returns an fs.FS rooted at the schemas directory.
func GetSchemaFS() (fs.FS, error) {
	return fs.Sub(Schemas, "schemas")
}

// ListSchemas returns the names of all embedded schema files.
func ListSchemas() ([]string, error) {
	entries, err := Schemas.ReadDir("schemas")
	if err != nil {
		return nil, err
	}

	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

// GetTemplate returns the contents of an embedded template file.
// The templatePath should be relative to the templates directory (e.g., "READY/00_north_star.yaml").
func GetTemplate(templatePath string) ([]byte, error) {
	return Templates.ReadFile(path.Join("templates", templatePath))
}

// GetTemplateFS returns an fs.FS rooted at the templates directory.
func GetTemplateFS() (fs.FS, error) {
	return fs.Sub(Templates, "templates")
}

// GetWizard returns the contents of an embedded wizard file.
// The filename should be just the wizard name (e.g., "feature_definition.wizard.md").
func GetWizard(filename string) ([]byte, error) {
	return Wizards.ReadFile(path.Join("wizards", filename))
}

// GetWizardFS returns an fs.FS rooted at the wizards directory.
func GetWizardFS() (fs.FS, error) {
	return fs.Sub(Wizards, "wizards")
}

// ListWizards returns the names of all embedded wizard files.
func ListWizards() ([]string, error) {
	entries, err := Wizards.ReadDir("wizards")
	if err != nil {
		return nil, err
	}

	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".md") {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

// GetGenerator returns an fs.FS for a specific embedded generator.
// The name should be the generator directory name (e.g., "context-sheet").
func GetGenerator(name string) (fs.FS, error) {
	return fs.Sub(Generators, path.Join("outputs", name))
}

// GetGeneratorFS returns an fs.FS rooted at the outputs directory.
func GetGeneratorFS() (fs.FS, error) {
	return fs.Sub(Generators, "outputs")
}

// ListGenerators returns the names of all embedded generators.
func ListGenerators() ([]string, error) {
	entries, err := Generators.ReadDir("outputs")
	if err != nil {
		return nil, err
	}

	var names []string
	for _, entry := range entries {
		if entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

// GetVersion returns the embedded EPF framework version.
func GetVersion() string {
	return strings.TrimSpace(Version)
}

// HasEmbeddedArtifacts returns true if embedded artifacts are available.
// This is useful for checking if the binary was built with embedded support.
func HasEmbeddedArtifacts() bool {
	schemas, err := ListSchemas()
	return err == nil && len(schemas) > 0
}

// GeneratorContent holds the parsed content of an embedded generator
type GeneratorContent struct {
	Name         string
	Manifest     string
	Schema       string
	Wizard       string
	Template     string
	TemplateFile string
	Readme       string
}

// GetGeneratorContent returns the parsed content of an embedded generator.
func GetGeneratorContent(name string) (*GeneratorContent, error) {
	genFS, err := GetGenerator(name)
	if err != nil {
		return nil, err
	}

	content := &GeneratorContent{Name: name}

	// Read manifest (generator.yaml)
	if data, err := fs.ReadFile(genFS, "generator.yaml"); err == nil {
		content.Manifest = string(data)
	}

	// Read schema (schema.json)
	if data, err := fs.ReadFile(genFS, "schema.json"); err == nil {
		content.Schema = string(data)
	}

	// Read wizard (wizard.instructions.md)
	if data, err := fs.ReadFile(genFS, "wizard.instructions.md"); err == nil {
		content.Wizard = string(data)
	}

	// Read README
	if data, err := fs.ReadFile(genFS, "README.md"); err == nil {
		content.Readme = string(data)
	}

	// Try to find template file
	entries, err := fs.ReadDir(genFS, ".")
	if err == nil {
		for _, entry := range entries {
			name := entry.Name()
			if strings.HasSuffix(name, ".template") || strings.HasSuffix(name, ".tmpl") ||
				strings.HasSuffix(name, ".md.template") || strings.HasSuffix(name, ".yaml.template") {
				content.TemplateFile = name
				if data, err := fs.ReadFile(genFS, name); err == nil {
					content.Template = string(data)
				}
				break
			}
		}
	}

	return content, nil
}

// GetCanonicalDefinition returns the content of an embedded canonical definition.
// The id should be the definition file basename (e.g., "sd-001-trends-and-opportunities.yaml").
// It searches through all track/category subdirectories under templates/FIRE/definitions/.
func GetCanonicalDefinition(id string) ([]byte, error) {
	defFS, err := fs.Sub(Templates, "templates/FIRE/definitions")
	if err != nil {
		return nil, err
	}

	// Walk through track/category directories to find the definition
	var found []byte
	fs.WalkDir(defFS, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if d.Name() == id || d.Name() == id+".yaml" || d.Name() == id+".yml" {
			data, readErr := fs.ReadFile(defFS, p)
			if readErr == nil {
				found = data
				return fs.SkipAll // stop walking
			}
		}
		return nil
	})

	if found != nil {
		return found, nil
	}
	return nil, &fs.PathError{Op: "open", Path: id, Err: fs.ErrNotExist}
}

// CanonicalDefinitionInfo holds metadata about an embedded canonical definition.
type CanonicalDefinitionInfo struct {
	ID       string // filename without extension (e.g., "sd-001-trends-and-opportunities")
	Filename string // full filename (e.g., "sd-001-trends-and-opportunities.yaml")
	Track    string // track directory (e.g., "strategy", "org_ops", "commercial")
	Category string // category directory (e.g., "context", "communications")
	Path     string // relative path within definitions dir (e.g., "strategy/context/sd-001-trends-and-opportunities.yaml")
}

// ListCanonicalDefinitions returns metadata for all embedded canonical definitions.
func ListCanonicalDefinitions() ([]CanonicalDefinitionInfo, error) {
	defFS, err := fs.Sub(Templates, "templates/FIRE/definitions")
	if err != nil {
		return nil, err
	}

	var defs []CanonicalDefinitionInfo
	fs.WalkDir(defFS, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		name := d.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			return nil
		}

		// Extract track and category from path (e.g., "strategy/context/sd-001.yaml")
		parts := strings.Split(p, "/")
		var track, category string
		if len(parts) >= 3 {
			track = parts[0]
			category = parts[1]
		} else if len(parts) >= 2 {
			track = parts[0]
		}

		// Skip product track — product definitions are examples, not canonical
		if track == "product" {
			return nil
		}

		ext := path.Ext(name)
		id := strings.TrimSuffix(name, ext)

		defs = append(defs, CanonicalDefinitionInfo{
			ID:       id,
			Filename: name,
			Track:    track,
			Category: category,
			Path:     p,
		})
		return nil
	})

	return defs, nil
}

// GetAgentsMD returns the embedded AGENTS.md content.
// This file contains comprehensive AI agent instructions for using epf-cli.
func GetAgentsMD() ([]byte, error) {
	return []byte(AgentsMD), nil
}

// GetGuide returns the contents of an embedded guide file.
// The filename should be just the guide name (e.g., "VALUE_MODEL_STRUCTURAL_ANTI_PATTERNS.md").
func GetGuide(filename string) ([]byte, error) {
	return Guides.ReadFile(path.Join("guides", filename))
}

// GetGuideFS returns an fs.FS rooted at the guides directory.
func GetGuideFS() (fs.FS, error) {
	return fs.Sub(Guides, "guides")
}

// ListGuides returns the names of all embedded guide files.
func ListGuides() ([]string, error) {
	entries, err := Guides.ReadDir("guides")
	if err != nil {
		return nil, err
	}

	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".md") {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}
