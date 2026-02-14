// Package migration provides EPF version migration detection and guidance.
// It helps AI agents understand what changes are needed when EPF schemas
// or templates are updated, following the "Agent as Writer, Tool as Linter" principle.
package migration

import (
	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/schema"
)

// MigrationStatus represents the overall migration status for an instance
type MigrationStatus struct {
	NeedsMigration bool   `json:"needs_migration"`
	CurrentVersion string `json:"current_version,omitempty"`
	TargetVersion  string `json:"target_version"`
	Summary        string `json:"summary"`

	// Per-file status
	Files []FileMigrationStatus `json:"files,omitempty"`

	// Aggregate stats
	TotalFiles      int `json:"total_files"`
	FilesNeedingFix int `json:"files_needing_fix"`
	UpToDateFiles   int `json:"up_to_date_files"`
	UnknownFiles    int `json:"unknown_files"`
}

// FileMigrationStatus represents migration status for a single file
type FileMigrationStatus struct {
	Path           string `json:"path"`
	ArtifactType   string `json:"artifact_type"`
	CurrentVersion string `json:"current_version,omitempty"`
	TargetVersion  string `json:"target_version"`
	NeedsMigration bool   `json:"needs_migration"`
	Reason         string `json:"reason,omitempty"`

	// Validation errors that indicate migration needs
	ValidationErrors []string `json:"validation_errors,omitempty"`
}

// MigrationGuide provides detailed instructions for migrating files
type MigrationGuide struct {
	InstancePath   string `json:"instance_path"`
	CurrentVersion string `json:"current_version,omitempty"`
	TargetVersion  string `json:"target_version"`

	// Summary
	Summary         string `json:"summary"`
	TotalChanges    int    `json:"total_changes"`
	BreakingChanges int    `json:"breaking_changes"`
	AutoFixable     int    `json:"auto_fixable"`
	ManualRequired  int    `json:"manual_required"`

	// Per-file guides
	FileGuides []FileGuide `json:"file_guides"`

	// Schema changes affecting all files of a type
	SchemaChanges map[string]*SchemaDiff `json:"schema_changes,omitempty"`

	// General guidance
	Guidance Guidance `json:"guidance"`
}

// FileGuide provides migration instructions for a single file
type FileGuide struct {
	Path          string `json:"path"`
	ArtifactType  string `json:"artifact_type"`
	SchemaVersion string `json:"schema_version"`

	// Version info
	CurrentVersion string `json:"current_version,omitempty"`
	TargetVersion  string `json:"target_version"`

	// What needs to change
	Changes []Change `json:"changes"`

	// Current validation errors
	ValidationErrors []ValidationError `json:"validation_errors,omitempty"`

	// Template reference for this artifact type
	TemplateReference string `json:"template_reference,omitempty"`

	// Priority (based on breaking changes)
	Priority string `json:"priority"` // critical, high, medium, low
}

// Change represents a single change needed in a file
type Change struct {
	Type        ChangeType `json:"type"`
	Path        string     `json:"path"` // JSON/YAML path (e.g., "meta.epf_version")
	Description string     `json:"description"`
	Reason      string     `json:"reason,omitempty"`

	// For add/modify
	SuggestedValue interface{} `json:"suggested_value,omitempty"`

	// For restructure
	FromFormat string `json:"from_format,omitempty"`
	ToFormat   string `json:"to_format,omitempty"`
	Example    string `json:"example,omitempty"`

	// Metadata
	IsBreaking    bool   `json:"is_breaking"`
	IsAutoFixable bool   `json:"is_auto_fixable"`
	Hint          string `json:"hint,omitempty"`
}

// ChangeType categorizes the type of change
type ChangeType string

const (
	ChangeAddField      ChangeType = "add_field"
	ChangeRemoveField   ChangeType = "remove_field"
	ChangeModifyField   ChangeType = "modify_field"
	ChangeRestructure   ChangeType = "restructure"
	ChangeRename        ChangeType = "rename"
	ChangeTypeChange    ChangeType = "type_change"
	ChangePatternChange ChangeType = "pattern_change"
	ChangeVersionUpdate ChangeType = "version_update"
)

// ValidationError from schema validation with migration context
type ValidationError struct {
	Path         string `json:"path"`
	Message      string `json:"message"`
	SchemaPath   string `json:"schema_path,omitempty"`
	SuggestedFix string `json:"suggested_fix,omitempty"`
}

// SchemaDiff represents differences between two schema versions
type SchemaDiff struct {
	ArtifactType string `json:"artifact_type"`
	OldVersion   string `json:"old_version"`
	NewVersion   string `json:"new_version"`

	AddedRequiredFields []FieldInfo     `json:"added_required_fields,omitempty"`
	AddedOptionalFields []FieldInfo     `json:"added_optional_fields,omitempty"`
	RemovedFields       []FieldInfo     `json:"removed_fields,omitempty"`
	TypeChanges         []TypeChange    `json:"type_changes,omitempty"`
	PatternChanges      []PatternChange `json:"pattern_changes,omitempty"`
	EnumChanges         []EnumChange    `json:"enum_changes,omitempty"`

	HasBreakingChanges bool `json:"has_breaking_changes"`
}

// FieldInfo describes a schema field
type FieldInfo struct {
	Path        string      `json:"path"`
	Type        string      `json:"type"`
	Description string      `json:"description,omitempty"`
	Default     interface{} `json:"default,omitempty"`
	Required    bool        `json:"required"`
}

// TypeChange describes a field type change
type TypeChange struct {
	Path    string `json:"path"`
	OldType string `json:"old_type"`
	NewType string `json:"new_type"`
}

// PatternChange describes a pattern/format change
type PatternChange struct {
	Path       string `json:"path"`
	OldPattern string `json:"old_pattern"`
	NewPattern string `json:"new_pattern"`
}

// EnumChange describes enum value changes
type EnumChange struct {
	Path          string   `json:"path"`
	AddedValues   []string `json:"added_values,omitempty"`
	RemovedValues []string `json:"removed_values,omitempty"`
}

// Guidance provides helpful tips for migration
type Guidance struct {
	NextSteps []string `json:"next_steps,omitempty"`
	Warnings  []string `json:"warnings,omitempty"`
	Tips      []string `json:"tips,omitempty"`
}

// SchemaInfo contains version info about a schema
type SchemaInfo struct {
	ArtifactType schema.ArtifactType
	Version      string
	FilePath     string
}
