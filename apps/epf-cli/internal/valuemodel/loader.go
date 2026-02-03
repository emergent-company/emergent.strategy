// Package valuemodel provides loading and parsing of EPF value model files.
// Value models define the hierarchical structure of value delivered through
// four core tracks: Product, Strategy, OrgOps, and Commercial.
package valuemodel

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// MaturityStage represents the maturity level of a value model component.
type MaturityStage string

const (
	MaturityHypothetical MaturityStage = "hypothetical"
	MaturityEmerging     MaturityStage = "emerging"
	MaturityProven       MaturityStage = "proven"
	MaturityScaled       MaturityStage = "scaled"
)

// MaturityStages in order from lowest to highest.
var MaturityStages = []MaturityStage{
	MaturityHypothetical,
	MaturityEmerging,
	MaturityProven,
	MaturityScaled,
}

// Track represents a value model track (Product, Strategy, OrgOps, Commercial).
type Track string

const (
	TrackProduct    Track = "Product"
	TrackStrategy   Track = "Strategy"
	TrackOrgOps     Track = "OrgOps"
	TrackCommercial Track = "Commercial"
)

// ValidTracks contains all valid track names.
var ValidTracks = []Track{
	TrackProduct,
	TrackStrategy,
	TrackOrgOps,
	TrackCommercial,
}

// Evidence represents proof of maturity for a sub-component.
type Evidence struct {
	Type        string `yaml:"type"`
	Description string `yaml:"description"`
	Date        string `yaml:"date,omitempty"`
	Source      string `yaml:"source,omitempty"`
}

// Maturity represents the maturity assessment for a sub-component.
type Maturity struct {
	Stage             MaturityStage `yaml:"stage"`
	StageOverride     bool          `yaml:"stage_override,omitempty"`
	Evidence          []Evidence    `yaml:"evidence,omitempty"`
	MilestoneAchieved string        `yaml:"milestone_achieved,omitempty"`
	MilestoneNotes    string        `yaml:"milestone_notes,omitempty"`
}

// SubComponent represents an L3 sub-component (granular unit of value).
type SubComponent struct {
	ID       string   `yaml:"id"`
	Name     string   `yaml:"name"`
	Active   bool     `yaml:"active"`
	Premium  bool     `yaml:"premium,omitempty"`
	UVP      string   `yaml:"uvp,omitempty"`
	Maturity Maturity `yaml:"maturity,omitempty"`
}

// MaturityDistribution counts components at each maturity stage.
type MaturityDistribution struct {
	Hypothetical int `yaml:"hypothetical"`
	Emerging     int `yaml:"emerging"`
	Proven       int `yaml:"proven"`
	Scaled       int `yaml:"scaled"`
}

// MaturitySummary represents the calculated maturity for L1/L2 levels.
type MaturitySummary struct {
	CalculatedStage MaturityStage        `yaml:"calculated_stage,omitempty"`
	StageOverride   bool                 `yaml:"stage_override,omitempty"`
	L2Distribution  MaturityDistribution `yaml:"l2_distribution,omitempty"`
	L3Distribution  MaturityDistribution `yaml:"l3_distribution,omitempty"`
}

// Component represents an L2 component (functional grouping).
type Component struct {
	ID              string          `yaml:"id"`
	Name            string          `yaml:"name"`
	Description     string          `yaml:"description,omitempty"`
	Active          bool            `yaml:"active,omitempty"`
	MaturitySummary MaturitySummary `yaml:"maturity_summary,omitempty"`
	// SubComponents can be in either "sub_components" or "subs" field
	SubComponents []SubComponent `yaml:"sub_components,omitempty"`
	Subs          []SubComponent `yaml:"subs,omitempty"` // Alternative name used in some files
}

// GetSubComponents returns all sub-components, handling both field names.
func (c *Component) GetSubComponents() []SubComponent {
	if len(c.SubComponents) > 0 {
		return c.SubComponents
	}
	return c.Subs
}

// SolutionStep represents a step in implementing value.
type SolutionStep struct {
	Step    string `yaml:"step"`
	Outcome string `yaml:"outcome"`
}

// Layer represents an L1 layer (major thematic grouping).
type Layer struct {
	ID              string          `yaml:"id"`
	Name            string          `yaml:"name"`
	Description     string          `yaml:"description,omitempty"`
	Active          bool            `yaml:"active,omitempty"`
	SolutionSteps   []SolutionStep  `yaml:"solution_steps,omitempty"`
	MaturitySummary MaturitySummary `yaml:"maturity_summary,omitempty"`
	Components      []Component     `yaml:"components,omitempty"`
}

// TrackMaturity represents track-level maturity assessment.
type TrackMaturity struct {
	OverallStage          MaturityStage        `yaml:"overall_stage,omitempty"`
	StageOverride         bool                 `yaml:"stage_override,omitempty"`
	ValueDomain           string               `yaml:"value_domain,omitempty"`
	CurrentMilestone      string               `yaml:"current_milestone,omitempty"`
	NextMilestoneCriteria []map[string]string  `yaml:"next_milestone_criteria,omitempty"`
	L1Distribution        MaturityDistribution `yaml:"l1_distribution,omitempty"`
}

// ValueModel represents a complete value model for a track.
type ValueModel struct {
	TrackName       Track         `yaml:"track_name"`
	Version         string        `yaml:"version"`
	Status          string        `yaml:"status"`
	Description     string        `yaml:"description"`
	PackagedDefault bool          `yaml:"packaged_default,omitempty"`
	ActivationNotes string        `yaml:"activation_notes,omitempty"`
	HighLevelModel  interface{}   `yaml:"high_level_model,omitempty"` // Flexible extension point
	TrackMaturity   TrackMaturity `yaml:"track_maturity,omitempty"`
	Layers          []Layer       `yaml:"layers,omitempty"`

	// FilePath is set by the loader to indicate where this model was loaded from.
	FilePath string `yaml:"-"`
}

// ValueModelSet holds all loaded value models indexed by track.
type ValueModelSet struct {
	Models   map[Track]*ValueModel
	ByFile   map[string]*ValueModel // Index by file path
	Instance string                 // Instance path this was loaded from
}

// NewValueModelSet creates a new empty value model set.
func NewValueModelSet() *ValueModelSet {
	return &ValueModelSet{
		Models: make(map[Track]*ValueModel),
		ByFile: make(map[string]*ValueModel),
	}
}

// Loader handles loading value models from an EPF instance.
type Loader struct {
	instancePath string
}

// NewLoader creates a new value model loader for an EPF instance.
func NewLoader(instancePath string) *Loader {
	return &Loader{
		instancePath: instancePath,
	}
}

// Load loads all value models from the instance's FIRE/value_models/ directory.
func (l *Loader) Load() (*ValueModelSet, error) {
	set := NewValueModelSet()
	set.Instance = l.instancePath

	// Value models are in FIRE/value_models/
	valueModelsDir := filepath.Join(l.instancePath, "FIRE", "value_models")

	// Check if directory exists
	if _, err := os.Stat(valueModelsDir); os.IsNotExist(err) {
		return set, nil // No value models directory - return empty set
	}

	// Find all YAML files
	entries, err := os.ReadDir(valueModelsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read value_models directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		filePath := filepath.Join(valueModelsDir, name)
		model, err := l.LoadFile(filePath)
		if err != nil {
			// Log warning but continue with other files
			fmt.Fprintf(os.Stderr, "Warning: failed to load value model %s: %v\n", name, err)
			continue
		}

		// Index by track
		if model.TrackName != "" {
			set.Models[model.TrackName] = model
		}
		set.ByFile[filePath] = model
	}

	return set, nil
}

// LoadFile loads a single value model from a YAML file.
func (l *Loader) LoadFile(filePath string) (*ValueModel, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var model ValueModel
	if err := yaml.Unmarshal(data, &model); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	model.FilePath = filePath
	return &model, nil
}

// GetTrack returns the value model for a specific track.
func (s *ValueModelSet) GetTrack(track Track) (*ValueModel, bool) {
	// Try exact match first
	if model, ok := s.Models[track]; ok {
		return model, true
	}

	// Try case-insensitive match
	trackLower := strings.ToLower(string(track))
	for t, model := range s.Models {
		if strings.ToLower(string(t)) == trackLower {
			return model, true
		}
	}

	return nil, false
}

// GetAllTracks returns all loaded tracks.
func (s *ValueModelSet) GetAllTracks() []Track {
	tracks := make([]Track, 0, len(s.Models))
	for track := range s.Models {
		tracks = append(tracks, track)
	}
	return tracks
}

// HasTrack checks if a track is loaded.
func (s *ValueModelSet) HasTrack(track Track) bool {
	_, ok := s.GetTrack(track)
	return ok
}

// GetAllPaths returns all valid value model paths (Track.Layer.Component format).
func (s *ValueModelSet) GetAllPaths() []string {
	var paths []string

	for track, model := range s.Models {
		for _, layer := range model.Layers {
			// Add layer path
			layerPath := fmt.Sprintf("%s.%s", track, normalizePathSegment(layer.ID, layer.Name))
			paths = append(paths, layerPath)

			for _, component := range layer.Components {
				// Add component path
				componentPath := fmt.Sprintf("%s.%s.%s",
					track,
					normalizePathSegment(layer.ID, layer.Name),
					normalizePathSegment(component.ID, component.Name))
				paths = append(paths, componentPath)

				// Add sub-component paths
				for _, sub := range component.GetSubComponents() {
					subPath := fmt.Sprintf("%s.%s.%s.%s",
						track,
						normalizePathSegment(layer.ID, layer.Name),
						normalizePathSegment(component.ID, component.Name),
						normalizePathSegment(sub.ID, sub.Name))
					paths = append(paths, subPath)
				}
			}
		}
	}

	return paths
}

// normalizePathSegment converts an ID or name to a path-friendly format.
// Prefers ID if available, otherwise converts name to PascalCase.
func normalizePathSegment(id, name string) string {
	if id != "" {
		// Convert kebab-case to PascalCase for path consistency
		return kebabToPascal(id)
	}
	// Convert name to PascalCase (remove spaces, capitalize each word)
	return toPascalCase(name)
}

// kebabToPascal converts kebab-case to PascalCase.
// e.g., "core-knowledge-platform" -> "CoreKnowledgePlatform"
func kebabToPascal(s string) string {
	parts := strings.Split(s, "-")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}

// toPascalCase converts a string with spaces to PascalCase.
// e.g., "Core Knowledge Platform" -> "CoreKnowledgePlatform"
func toPascalCase(s string) string {
	words := strings.Fields(s)
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(word[:1]) + strings.ToLower(word[1:])
		}
	}
	return strings.Join(words, "")
}

// NormalizeTrack normalizes a track name to canonical form.
func NormalizeTrack(input string) (Track, bool) {
	lower := strings.ToLower(strings.TrimSpace(input))
	switch lower {
	case "product":
		return TrackProduct, true
	case "strategy":
		return TrackStrategy, true
	case "orgops", "org_ops", "org-ops":
		return TrackOrgOps, true
	case "commercial":
		return TrackCommercial, true
	default:
		return "", false
	}
}
