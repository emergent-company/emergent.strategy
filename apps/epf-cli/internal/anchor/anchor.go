// Package anchor provides EPF anchor file management.
// The anchor file (_epf.yaml) is the authoritative marker that identifies
// a valid EPF directory, enabling robust discovery and preventing false positives.
package anchor

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// AnchorFileName is the standard name for the EPF anchor file
const AnchorFileName = "_epf.yaml"

// MinimumVersion is the minimum anchor file version supported
const MinimumVersion = "1.0.0"

// CurrentVersion is the current anchor file schema version
const CurrentVersion = "1.0.0"

// Anchor represents the EPF anchor file structure
type Anchor struct {
	// EPFAnchor is the marker that identifies this as an EPF anchor file
	// Must be set to true for valid anchor files
	EPFAnchor bool `yaml:"epf_anchor" json:"epf_anchor"`

	// Version is the anchor file schema version (e.g., "1.0.0")
	Version string `yaml:"version" json:"version"`

	// InstanceID is a unique identifier for this EPF instance
	// Generated once when the anchor is created, never changes
	InstanceID string `yaml:"instance_id" json:"instance_id"`

	// CreatedAt is when this EPF instance was initialized
	CreatedAt time.Time `yaml:"created_at" json:"created_at"`

	// EPFVersion is the EPF framework version this instance uses
	// Optional, but recommended for migration tracking
	EPFVersion string `yaml:"epf_version,omitempty" json:"epf_version,omitempty"`

	// ProductName is the name of the product this instance represents
	// Optional, populated during init
	ProductName string `yaml:"product_name,omitempty" json:"product_name,omitempty"`

	// Description is a brief description of the instance
	// Optional, populated during init
	Description string `yaml:"description,omitempty" json:"description,omitempty"`

	// Structure describes the EPF directory structure in use
	Structure *StructureInfo `yaml:"structure,omitempty" json:"structure,omitempty"`
}

// StructureInfo describes the EPF directory structure
type StructureInfo struct {
	// Type is the structure type: "phased" (READY/FIRE/AIM) or "flat" (legacy)
	Type string `yaml:"type" json:"type"`

	// Location is the relative path from repo root to EPF instance
	// e.g., "docs/epf/_instances/emergent" or "."
	Location string `yaml:"location,omitempty" json:"location,omitempty"`
}

// ValidationResult contains the result of anchor file validation
type ValidationResult struct {
	Valid    bool     `json:"valid"`
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
	Anchor   *Anchor  `json:"anchor,omitempty"`
}

// New creates a new anchor with default values
func New() *Anchor {
	return &Anchor{
		EPFAnchor:  true,
		Version:    CurrentVersion,
		InstanceID: uuid.New().String(),
		CreatedAt:  time.Now().UTC(),
		Structure: &StructureInfo{
			Type: "phased",
		},
	}
}

// NewWithOptions creates a new anchor with specified options
func NewWithOptions(productName, description, epfVersion string) *Anchor {
	anchor := New()
	anchor.ProductName = productName
	anchor.Description = description
	anchor.EPFVersion = epfVersion
	return anchor
}

// Load reads and parses an anchor file from the given path
func Load(path string) (*Anchor, error) {
	// Check if path is a directory
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("cannot access path: %w", err)
	}

	var anchorPath string
	if info.IsDir() {
		anchorPath = filepath.Join(path, AnchorFileName)
	} else {
		anchorPath = path
	}

	data, err := os.ReadFile(anchorPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read anchor file: %w", err)
	}

	var anchor Anchor
	if err := yaml.Unmarshal(data, &anchor); err != nil {
		return nil, fmt.Errorf("failed to parse anchor file: %w", err)
	}

	return &anchor, nil
}

// Exists checks if an anchor file exists at the given path
func Exists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}

	var anchorPath string
	if info.IsDir() {
		anchorPath = filepath.Join(path, AnchorFileName)
	} else {
		anchorPath = path
	}

	_, err = os.Stat(anchorPath)
	return err == nil
}

// Validate checks if an anchor file is valid
func Validate(anchor *Anchor) *ValidationResult {
	result := &ValidationResult{
		Valid:  true,
		Anchor: anchor,
	}

	// Check required fields
	if !anchor.EPFAnchor {
		result.Valid = false
		result.Errors = append(result.Errors, "epf_anchor must be true")
	}

	if anchor.Version == "" {
		result.Valid = false
		result.Errors = append(result.Errors, "version is required")
	}

	if anchor.InstanceID == "" {
		result.Valid = false
		result.Errors = append(result.Errors, "instance_id is required")
	}

	if anchor.CreatedAt.IsZero() {
		result.Valid = false
		result.Errors = append(result.Errors, "created_at is required")
	}

	// Warnings for optional but recommended fields
	if anchor.EPFVersion == "" {
		result.Warnings = append(result.Warnings, "epf_version is recommended for migration tracking")
	}

	if anchor.ProductName == "" {
		result.Warnings = append(result.Warnings, "product_name is recommended for instance identification")
	}

	return result
}

// ValidateFile validates an anchor file at the given path
func ValidateFile(path string) *ValidationResult {
	anchor, err := Load(path)
	if err != nil {
		return &ValidationResult{
			Valid:  false,
			Errors: []string{err.Error()},
		}
	}
	return Validate(anchor)
}

// Save writes the anchor to the given path
func (a *Anchor) Save(path string) error {
	// Determine if path is a directory
	info, err := os.Stat(path)
	if err == nil && info.IsDir() {
		path = filepath.Join(path, AnchorFileName)
	}

	data, err := yaml.Marshal(a)
	if err != nil {
		return fmt.Errorf("failed to marshal anchor: %w", err)
	}

	// Add header comment
	content := fmt.Sprintf(`# EPF Anchor File
# This file identifies this directory as a valid EPF instance.
# Do not modify instance_id or created_at after initialization.
# Generated by epf-cli

%s`, string(data))

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write anchor file: %w", err)
	}

	return nil
}

// ToYAML returns the anchor as a YAML string
func (a *Anchor) ToYAML() (string, error) {
	data, err := yaml.Marshal(a)
	if err != nil {
		return "", fmt.Errorf("failed to marshal anchor: %w", err)
	}
	return string(data), nil
}

// IsLegacyInstance checks if a directory is a legacy EPF instance (no anchor file)
func IsLegacyInstance(path string) bool {
	// Check if it looks like an EPF instance but has no anchor
	if Exists(path) {
		return false // Has anchor, not legacy
	}

	// Check for EPF markers
	markers := []string{"READY", "FIRE", "AIM", "_meta.yaml"}
	markerCount := 0
	for _, marker := range markers {
		if _, err := os.Stat(filepath.Join(path, marker)); err == nil {
			markerCount++
		}
	}

	// If it has at least 2 EPF markers but no anchor, it's legacy
	return markerCount >= 2
}

// InferFromLegacy creates an anchor from a legacy EPF instance
// by reading existing metadata files
func InferFromLegacy(path string) (*Anchor, error) {
	anchor := New()

	// Try to read _meta.yaml for additional info
	metaPath := filepath.Join(path, "_meta.yaml")
	if data, err := os.ReadFile(metaPath); err == nil {
		var meta struct {
			Instance struct {
				ProductName string `yaml:"product_name"`
				EPFVersion  string `yaml:"epf_version"`
				Description string `yaml:"description"`
			} `yaml:"instance"`
			// Legacy format
			EPFVersion   string `yaml:"epf_version"`
			InstanceName string `yaml:"instance_name"`
		}

		if err := yaml.Unmarshal(data, &meta); err == nil {
			// Prefer nested instance format
			if meta.Instance.ProductName != "" {
				anchor.ProductName = meta.Instance.ProductName
			} else if meta.InstanceName != "" {
				anchor.ProductName = meta.InstanceName
			}

			if meta.Instance.EPFVersion != "" {
				anchor.EPFVersion = meta.Instance.EPFVersion
			} else if meta.EPFVersion != "" {
				anchor.EPFVersion = meta.EPFVersion
			}

			if meta.Instance.Description != "" {
				anchor.Description = meta.Instance.Description
			}
		}
	}

	// Detect structure type
	if _, err := os.Stat(filepath.Join(path, "READY")); err == nil {
		anchor.Structure = &StructureInfo{Type: "phased"}
	} else {
		anchor.Structure = &StructureInfo{Type: "flat"}
	}

	return anchor, nil
}
