// Package skill provides skill discovery, loading, validation, and scaffolding for EPF.
//
// A Skill is a bundled capability that an agent (or any AI runtime) can invoke.
// Skills unify the previous wizard (.wizard.md) creation guides and output
// generator concepts into a single format with a structured manifest
// (skill.yaml), prompt file (prompt.md), and optional validation schema and
// bash validator.
//
// Legacy formats are permanently supported:
//   - generator.yaml is read as skill.yaml (type: generation inferred)
//   - wizard.instructions.md is read as prompt.md
//   - {instance}/generators/ is scanned alongside {instance}/skills/
package skill

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/agent"
)

// SkillType classifies skills by their purpose.
type SkillType string

const (
	// SkillTypeCreation is for creating EPF artifacts (replaces .wizard.md).
	SkillTypeCreation SkillType = "creation"

	// SkillTypeGeneration is for generating output documents (replaces generators).
	SkillTypeGeneration SkillType = "generation"

	// SkillTypeReview is for evaluating artifact quality.
	SkillTypeReview SkillType = "review"

	// SkillTypeEnrichment is for enhancing existing artifacts.
	SkillTypeEnrichment SkillType = "enrichment"

	// SkillTypeAnalysis is for analyzing and reporting.
	SkillTypeAnalysis SkillType = "analysis"
)

// String returns the string representation of the skill type.
func (t SkillType) String() string {
	return string(t)
}

// SkillTypeFromString converts a string to SkillType with validation.
func SkillTypeFromString(s string) (SkillType, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "creation":
		return SkillTypeCreation, nil
	case "generation":
		return SkillTypeGeneration, nil
	case "review":
		return SkillTypeReview, nil
	case "enrichment":
		return SkillTypeEnrichment, nil
	case "analysis":
		return SkillTypeAnalysis, nil
	default:
		return "", fmt.Errorf("unknown skill type: %q", s)
	}
}

// ValidSkillTypes returns all valid skill type values.
func ValidSkillTypes() []SkillType {
	return []SkillType{
		SkillTypeCreation,
		SkillTypeGeneration,
		SkillTypeReview,
		SkillTypeEnrichment,
		SkillTypeAnalysis,
	}
}

// SkillSource indicates where a skill was discovered.
type SkillSource string

const (
	// SourceInstance is a skill in the EPF instance's skills/ or generators/ directory.
	SourceInstance SkillSource = "instance"

	// SourceFramework is a skill in the canonical EPF skills/ (or outputs/, wizards/) directory.
	SourceFramework SkillSource = "framework"

	// SourceGlobal is a skill in ~/.epf-cli/skills/ or ~/.epf-cli/generators/.
	SourceGlobal SkillSource = "global"
)

// String returns a human-readable label for the source.
func (s SkillSource) String() string {
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

// SourcePriority returns the priority of a source (lower is higher priority).
func SourcePriority(s SkillSource) int {
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

// Category categorizes skills by their domain (preserves generator categories).
type Category string

const (
	CategoryCompliance  Category = "compliance"
	CategoryMarketing   Category = "marketing"
	CategoryInvestor    Category = "investor"
	CategoryInternal    Category = "internal"
	CategoryDevelopment Category = "development"
	CategoryCustom      Category = "custom"
	CategoryUnspecified Category = ""
)

// ValidCategories returns all valid category values.
func ValidCategories() []Category {
	return []Category{
		CategoryCompliance,
		CategoryMarketing,
		CategoryInvestor,
		CategoryInternal,
		CategoryDevelopment,
		CategoryCustom,
	}
}

// CategoryFromString converts a string to Category with validation.
func CategoryFromString(s string) (Category, error) {
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
		return "", fmt.Errorf("unknown skill category: %q", s)
	}
}

// OutputFormat specifies the format of generated output.
type OutputFormat string

const (
	FormatMarkdown OutputFormat = "markdown"
	FormatJSON     OutputFormat = "json"
	FormatYAML     OutputFormat = "yaml"
	FormatHTML     OutputFormat = "html"
	FormatText     OutputFormat = "text"
)

// RequiresSpec defines what EPF artifacts and MCP tools a skill needs.
type RequiresSpec struct {
	Artifacts []string `yaml:"artifacts,omitempty" json:"artifacts,omitempty"` // Required artifact types
	Optional  []string `yaml:"optional,omitempty" json:"optional,omitempty"`   // Optional artifact types
	Tools     []string `yaml:"tools,omitempty" json:"tools,omitempty"`         // Required MCP tools
}

// OutputSpec defines the output format and validation.
type OutputSpec struct {
	Format       OutputFormat `yaml:"format,omitempty" json:"format,omitempty"`
	ArtifactType string       `yaml:"artifact_type,omitempty" json:"artifact_type,omitempty"` // For creation skills
	Schema       string       `yaml:"schema,omitempty" json:"schema,omitempty"`               // Path to output schema
	Validator    string       `yaml:"validator,omitempty" json:"validator,omitempty"`         // Path to validator script
}

// FilesSpec defines the file locations within a skill bundle.
type FilesSpec struct {
	Prompt    string `yaml:"prompt,omitempty" json:"prompt,omitempty"`       // prompt.md (or wizard.instructions.md)
	Schema    string `yaml:"schema,omitempty" json:"schema,omitempty"`       // schema.json
	Validator string `yaml:"validator,omitempty" json:"validator,omitempty"` // validator.sh
	Template  string `yaml:"template,omitempty" json:"template,omitempty"`   // template.md or template.yaml
}

// ScopeSpec declares advisory tool scoping for orchestration plugins.
type ScopeSpec struct {
	PreferredTools   []string `yaml:"preferred_tools,omitempty" json:"preferred_tools,omitempty"`
	AvoidTools       []string `yaml:"avoid_tools,omitempty" json:"avoid_tools,omitempty"`
	FilesystemAccess string   `yaml:"filesystem_access,omitempty" json:"filesystem_access,omitempty"` // read_only, read_write, none
}

// SkillManifest represents the parsed skill.yaml (or generator.yaml) file.
type SkillManifest struct {
	Name        string    `yaml:"name" json:"name"`
	Version     string    `yaml:"version" json:"version"`
	Type        SkillType `yaml:"type,omitempty" json:"type,omitempty"` // Inferred as "generation" if absent
	Phase       string    `yaml:"phase,omitempty" json:"phase,omitempty"`
	Description string    `yaml:"description" json:"description"`

	// Preserved from generator.yaml for backward compatibility
	Category Category `yaml:"category,omitempty" json:"category,omitempty"`
	Author   string   `yaml:"author,omitempty" json:"author,omitempty"`
	Regions  []string `yaml:"regions,omitempty" json:"regions,omitempty"`

	// Requirements
	Requires *RequiresSpec `yaml:"requires,omitempty" json:"requires,omitempty"`

	// Output specification
	Output *OutputSpec `yaml:"output,omitempty" json:"output,omitempty"`

	// File locations (auto-detected if not specified)
	Files *FilesSpec `yaml:"files,omitempty" json:"files,omitempty"`

	// Capability hints (new in agents/skills architecture)
	Capability *agent.CapabilitySpec `yaml:"capability,omitempty" json:"capability,omitempty"`

	// Tool scoping (new in agents/skills architecture)
	Scope *ScopeSpec `yaml:"scope,omitempty" json:"scope,omitempty"`
}

// SkillInfo contains full metadata about a discovered skill, combining manifest
// data with discovery context. Prompt content is lazily loaded.
type SkillInfo struct {
	// Identity
	Name   string      `json:"name"`
	Source SkillSource `json:"source"`
	Path   string      `json:"path"` // Full path to skill directory

	// From manifest (or inferred from legacy format)
	Type        SkillType `json:"type"`
	Phase       string    `json:"phase,omitempty"`
	Version     string    `json:"version,omitempty"`
	Description string    `json:"description"`

	// Preserved from generator format
	Category Category `json:"category,omitempty"`
	Author   string   `json:"author,omitempty"`
	Regions  []string `json:"regions,omitempty"`

	// Requirements
	RequiredArtifacts []string `json:"required_artifacts,omitempty"`
	OptionalArtifacts []string `json:"optional_artifacts,omitempty"`
	RequiredTools     []string `json:"required_tools,omitempty"`

	// Output
	OutputFormat OutputFormat `json:"output_format,omitempty"`
	ArtifactType string       `json:"artifact_type,omitempty"` // For creation skills

	// Capability hints
	Capability *agent.CapabilitySpec `json:"capability,omitempty"`

	// Tool scoping
	Scope *ScopeSpec `json:"scope,omitempty"`

	// Available files
	HasManifest  bool `json:"has_manifest"`  // true if skill.yaml or generator.yaml exists
	HasPrompt    bool `json:"has_prompt"`    // true if prompt.md or wizard.instructions.md exists
	HasSchema    bool `json:"has_schema"`    // true if schema.json exists
	HasValidator bool `json:"has_validator"` // true if validator.sh exists
	HasTemplate  bool `json:"has_template"`  // true if template file exists

	// File paths (relative to skill directory)
	PromptFile    string `json:"prompt_file,omitempty"`
	SchemaFile    string `json:"schema_file,omitempty"`
	ValidatorFile string `json:"validator_file,omitempty"`
	TemplateFile  string `json:"template_file,omitempty"`

	// Legacy format indicators
	LegacyFormat       bool   `json:"legacy_format,omitempty"`        // true if loaded from generator.yaml or .wizard.md
	LegacyManifestName string `json:"legacy_manifest_name,omitempty"` // "generator.yaml" if loaded from that format
	LegacyPromptName   string `json:"legacy_prompt_name,omitempty"`   // "wizard.instructions.md" if loaded from that name

	// Lazily loaded content
	promptLoaded bool
	Prompt       string `json:"prompt,omitempty"` // Full prompt content (loaded on demand)
}

// PromptLoaded returns whether the prompt content has been loaded.
func (s *SkillInfo) PromptLoaded() bool {
	return s.promptLoaded
}

// SetPrompt sets the prompt content and marks it as loaded.
func (s *SkillInfo) SetPrompt(content string) {
	s.Prompt = content
	s.promptLoaded = true
}

// SkillContent contains the full content of all files in a skill bundle.
type SkillContent struct {
	*SkillInfo

	// File contents
	ManifestContent  string `json:"manifest,omitempty"`       // skill.yaml or generator.yaml content
	SchemaContent    string `json:"schema,omitempty"`         // schema.json content
	PromptContent    string `json:"prompt_content,omitempty"` // prompt.md or wizard.instructions.md content
	ValidatorContent string `json:"validator,omitempty"`      // validator.sh content
	TemplateContent  string `json:"template,omitempty"`       // template file content
	ReadmeContent    string `json:"readme,omitempty"`         // README.md content
}

// PrerequisiteResult contains the result of checking skill prerequisites.
type PrerequisiteResult struct {
	Ready               bool     `json:"ready"`
	MissingArtifacts    []string `json:"missing_artifacts,omitempty"`
	IncompleteArtifacts []string `json:"incomplete_artifacts,omitempty"`
	MissingTools        []string `json:"missing_tools,omitempty"`
	Suggestions         []string `json:"suggestions,omitempty"`
}

// ValidationResult contains the result of validating skill output.
type ValidationResult struct {
	Valid    bool                   `json:"valid"`
	Errors   []string               `json:"errors,omitempty"`
	Warnings []string               `json:"warnings,omitempty"`
	Layers   map[string]LayerResult `json:"layers,omitempty"`
}

// LayerResult contains validation results for a specific validation layer.
type LayerResult struct {
	Name     string   `json:"name"`
	Passed   bool     `json:"passed"`
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

// ScaffoldResult contains the result of scaffolding a new skill.
type ScaffoldResult struct {
	SkillPath    string   `json:"skill_path"`
	FilesCreated []string `json:"files_created"`
	NextSteps    []string `json:"next_steps"`
}

// Default file and directory names.
const (
	// New format file names.
	DefaultManifestFile  = "skill.yaml"
	DefaultPromptFile    = "prompt.md"
	DefaultSchemaFile    = "schema.json"
	DefaultValidatorFile = "validator.sh"
	DefaultTemplateFile  = "template.md"
	DefaultReadmeFile    = "README.md"

	// Legacy generator file names (permanently supported).
	LegacyManifestFile = "generator.yaml"
	LegacyPromptFile   = "wizard.instructions.md"

	// Directory names for three-tier discovery.
	InstanceSkillsDir     = "skills"
	InstanceGeneratorsDir = "generators" // Legacy, permanently scanned
	FrameworkSkillsDir    = "skills"
	FrameworkOutputsDir   = "outputs" // Legacy canonical-epf directory
	GlobalSkillsDir       = "skills"
	GlobalGeneratorsDir   = "generators" // Legacy, permanently scanned
)
