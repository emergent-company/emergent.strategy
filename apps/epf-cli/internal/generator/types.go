package generator

import (
	"fmt"
	"strings"
)

// GeneratorSource indicates where a generator was discovered
type GeneratorSource string

const (
	// SourceInstance is a generator in the EPF instance's generators/ directory
	SourceInstance GeneratorSource = "instance"
	// SourceFramework is a generator in the canonical EPF outputs/ directory
	SourceFramework GeneratorSource = "framework"
	// SourceGlobal is a generator in ~/.epf-cli/generators/
	SourceGlobal GeneratorSource = "global"
)

// GeneratorCategory categorizes generators by their purpose
type GeneratorCategory string

const (
	CategoryCompliance  GeneratorCategory = "compliance"
	CategoryMarketing   GeneratorCategory = "marketing"
	CategoryInvestor    GeneratorCategory = "investor"
	CategoryInternal    GeneratorCategory = "internal"
	CategoryDevelopment GeneratorCategory = "development"
	CategoryCustom      GeneratorCategory = "custom"
	CategoryUnspecified GeneratorCategory = ""
)

// ValidCategories returns all valid generator categories
func ValidCategories() []GeneratorCategory {
	return []GeneratorCategory{
		CategoryCompliance,
		CategoryMarketing,
		CategoryInvestor,
		CategoryInternal,
		CategoryDevelopment,
		CategoryCustom,
	}
}

// CategoryFromString converts a string to GeneratorCategory
func CategoryFromString(s string) (GeneratorCategory, error) {
	lower := strings.ToLower(strings.TrimSpace(s))
	switch lower {
	case "compliance":
		return CategoryCompliance, nil
	case "marketing":
		return CategoryMarketing, nil
	case "investor":
		return CategoryInvestor, nil
	case "internal":
		return CategoryInternal, nil
	case "development":
		return CategoryDevelopment, nil
	case "custom":
		return CategoryCustom, nil
	case "":
		return CategoryUnspecified, nil
	default:
		return "", fmt.Errorf("unknown generator category: %s", s)
	}
}

// OutputFormat specifies the format of generated output
type OutputFormat string

const (
	FormatMarkdown OutputFormat = "markdown"
	FormatJSON     OutputFormat = "json"
	FormatYAML     OutputFormat = "yaml"
	FormatHTML     OutputFormat = "html"
	FormatText     OutputFormat = "text"
)

// GeneratorManifest represents the parsed generator.yaml file
type GeneratorManifest struct {
	Name        string            `yaml:"name"`
	Version     string            `yaml:"version"`
	Description string            `yaml:"description"`
	Category    GeneratorCategory `yaml:"category"`
	Author      string            `yaml:"author,omitempty"`
	Regions     []string          `yaml:"regions,omitempty"` // Geographic relevance (e.g., ["NO"] for Norway)

	// What EPF artifacts are needed
	Requires *RequiresSpec `yaml:"requires,omitempty"`

	// Output specification
	Output *OutputSpec `yaml:"output,omitempty"`

	// File locations (auto-detected if not specified)
	Files *FilesSpec `yaml:"files,omitempty"`
}

// RequiresSpec defines what EPF artifacts a generator needs
type RequiresSpec struct {
	Artifacts []string `yaml:"artifacts,omitempty"` // Required artifact types
	Optional  []string `yaml:"optional,omitempty"`  // Optional artifact types
}

// OutputSpec defines the output format and validation
type OutputSpec struct {
	Format    OutputFormat `yaml:"format,omitempty"`
	Schema    string       `yaml:"schema,omitempty"`    // Path to output schema (for validating generated content)
	Validator string       `yaml:"validator,omitempty"` // Path to validator script
}

// FilesSpec defines the file locations within a generator
type FilesSpec struct {
	Schema    string `yaml:"schema,omitempty"`    // Input schema (schema.json)
	Wizard    string `yaml:"wizard,omitempty"`    // Wizard instructions (wizard.instructions.md)
	Validator string `yaml:"validator,omitempty"` // Validator script (validator.sh)
	Template  string `yaml:"template,omitempty"`  // Output template (template.md)
}

// GeneratorInfo contains full information about a discovered generator
type GeneratorInfo struct {
	// Identity
	Name   string          `json:"name"`
	Source GeneratorSource `json:"source"`
	Path   string          `json:"path"` // Full path to generator directory

	// From manifest
	Version     string            `json:"version"`
	Description string            `json:"description"`
	Category    GeneratorCategory `json:"category"`
	Author      string            `json:"author,omitempty"`
	Regions     []string          `json:"regions,omitempty"`

	// Requirements
	RequiredArtifacts []string `json:"required_artifacts,omitempty"`
	OptionalArtifacts []string `json:"optional_artifacts,omitempty"`

	// Output
	OutputFormat OutputFormat `json:"output_format,omitempty"`

	// Available files
	HasSchema    bool `json:"has_schema"`
	HasWizard    bool `json:"has_wizard"`
	HasValidator bool `json:"has_validator"`
	HasTemplate  bool `json:"has_template"`
	HasManifest  bool `json:"has_manifest"`

	// File paths (relative to generator directory)
	SchemaFile    string `json:"schema_file,omitempty"`
	WizardFile    string `json:"wizard_file,omitempty"`
	ValidatorFile string `json:"validator_file,omitempty"`
	TemplateFile  string `json:"template_file,omitempty"`
}

// GeneratorContent contains the actual content of generator files
type GeneratorContent struct {
	*GeneratorInfo

	// File contents
	Manifest  string `json:"manifest,omitempty"`  // generator.yaml content
	Schema    string `json:"schema,omitempty"`    // schema.json content
	Wizard    string `json:"wizard,omitempty"`    // wizard.instructions.md content
	Validator string `json:"validator,omitempty"` // validator.sh content
	Template  string `json:"template,omitempty"`  // template.md content
	Readme    string `json:"readme,omitempty"`    // README.md content
}

// PrerequisiteResult contains the result of checking generator prerequisites
type PrerequisiteResult struct {
	Ready               bool     `json:"ready"`
	MissingArtifacts    []string `json:"missing_artifacts,omitempty"`
	IncompleteArtifacts []string `json:"incomplete_artifacts,omitempty"`
	Suggestions         []string `json:"suggestions,omitempty"`
}

// ValidationResult contains the result of validating generator output
type ValidationResult struct {
	Valid    bool                   `json:"valid"`
	Errors   []string               `json:"errors,omitempty"`
	Warnings []string               `json:"warnings,omitempty"`
	Layers   map[string]LayerResult `json:"layers,omitempty"`
}

// LayerResult contains validation results for a specific layer
type LayerResult struct {
	Name     string   `json:"name"`
	Passed   bool     `json:"passed"`
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

// Default file names for generator components
const (
	DefaultManifestFile  = "generator.yaml"
	DefaultSchemaFile    = "schema.json"
	DefaultWizardFile    = "wizard.instructions.md"
	DefaultValidatorFile = "validator.sh"
	DefaultTemplateFile  = "template.md"
	DefaultReadmeFile    = "README.md"
)

// SourcePriority returns the priority of a source (lower is higher priority)
func SourcePriority(s GeneratorSource) int {
	switch s {
	case SourceInstance:
		return 0 // Highest priority
	case SourceFramework:
		return 1
	case SourceGlobal:
		return 2
	default:
		return 99
	}
}

// String returns a human-readable description of the source
func (s GeneratorSource) String() string {
	switch s {
	case SourceInstance:
		return "Instance"
	case SourceFramework:
		return "EPF Framework"
	case SourceGlobal:
		return "Global"
	default:
		return string(s)
	}
}

// String returns a human-readable description of the category
func (c GeneratorCategory) String() string {
	if c == "" {
		return "Unspecified"
	}
	// Capitalize first letter
	s := string(c)
	return strings.ToUpper(s[:1]) + s[1:]
}
