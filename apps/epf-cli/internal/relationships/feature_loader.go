// Package relationships provides relationship analysis between EPF artifacts
// including features, value models, and roadmap KRs.
package relationships

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// FeatureStatus represents the status of a feature definition.
type FeatureStatus string

const (
	FeatureStatusPlanned    FeatureStatus = "planned"
	FeatureStatusActive     FeatureStatus = "active"
	FeatureStatusDelivered  FeatureStatus = "delivered"
	FeatureStatusDeprecated FeatureStatus = "deprecated"
)

// StrategicContext captures how a feature connects to strategy.
type StrategicContext struct {
	ContributesTo     []string `yaml:"contributes_to"`
	Tracks            []string `yaml:"tracks"`
	AssumptionsTested []string `yaml:"assumptions_tested"`
}

// Capability represents a capability defined in a feature.
type Capability struct {
	ID          string `yaml:"id"`
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
}

// DependencyRef represents a reference to another feature in dependencies.
type DependencyRef struct {
	ID     string `yaml:"id"`
	Name   string `yaml:"name"`
	Reason string `yaml:"reason"`
}

// FeatureDefinition represents a feature definition that defines
// solution specifications for a user problem.
type FeatureDefinition struct {
	ID               string           `yaml:"id"`
	Name             string           `yaml:"name"`
	Slug             string           `yaml:"slug"`
	Status           FeatureStatus    `yaml:"status"`
	StrategicContext StrategicContext `yaml:"strategic_context"`
	Definition       struct {
		JobToBeDone      string       `yaml:"job_to_be_done"`
		SolutionApproach string       `yaml:"solution_approach"`
		Capabilities     []Capability `yaml:"capabilities"`
	} `yaml:"definition"`
	Dependencies struct {
		Requires []DependencyRef `yaml:"requires"`
		Enables  []DependencyRef `yaml:"enables"`
	} `yaml:"dependencies"`

	// FilePath is set by the loader to indicate where this was loaded from.
	FilePath string `yaml:"-"`
}

// FeatureSet holds all loaded feature definitions with various indexes.
type FeatureSet struct {
	// Features indexed by ID (e.g., "fd-001")
	ByID map[string]*FeatureDefinition

	// Features indexed by slug (e.g., "knowledge-graph-engine")
	BySlug map[string]*FeatureDefinition

	// Features indexed by status
	ByStatus map[FeatureStatus][]*FeatureDefinition

	// Reverse index: value_model_path -> features that contribute to it
	ByValueModelPath map[string][]*FeatureDefinition

	// Instance path this was loaded from
	Instance string
}

// NewFeatureSet creates an empty feature set.
func NewFeatureSet() *FeatureSet {
	return &FeatureSet{
		ByID:             make(map[string]*FeatureDefinition),
		BySlug:           make(map[string]*FeatureDefinition),
		ByStatus:         make(map[FeatureStatus][]*FeatureDefinition),
		ByValueModelPath: make(map[string][]*FeatureDefinition),
	}
}

// FeatureLoader handles loading feature definitions from an EPF instance.
type FeatureLoader struct {
	instancePath string
}

// NewFeatureLoader creates a new feature loader for an EPF instance.
func NewFeatureLoader(instancePath string) *FeatureLoader {
	return &FeatureLoader{
		instancePath: instancePath,
	}
}

// Load loads all feature definitions from the instance's FIRE/definitions/product/ directory.
func (l *FeatureLoader) Load() (*FeatureSet, error) {
	set := NewFeatureSet()
	set.Instance = l.instancePath

	// Feature definitions are in FIRE/definitions/product/
	featureDefsDir := filepath.Join(l.instancePath, "FIRE", "definitions", "product")

	// Check if directory exists
	if _, err := os.Stat(featureDefsDir); os.IsNotExist(err) {
		return set, nil // No feature definitions directory - return empty set
	}

	// Find all YAML files
	entries, err := os.ReadDir(featureDefsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read definitions/product directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		filePath := filepath.Join(featureDefsDir, name)
		feature, err := l.LoadFile(filePath)
		if err != nil {
			// Log warning but continue with other files
			fmt.Fprintf(os.Stderr, "Warning: failed to load feature definition %s: %v\n", name, err)
			continue
		}

		// Index by ID
		if feature.ID != "" {
			set.ByID[feature.ID] = feature
		}

		// Index by slug
		if feature.Slug != "" {
			set.BySlug[feature.Slug] = feature
		}

		// Index by status
		set.ByStatus[feature.Status] = append(set.ByStatus[feature.Status], feature)

		// Build reverse index: value_model_path -> features
		for _, path := range feature.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			set.ByValueModelPath[normalizedPath] = append(set.ByValueModelPath[normalizedPath], feature)
		}
	}

	return set, nil
}

// LoadFile loads a single feature definition from a YAML file.
func (l *FeatureLoader) LoadFile(filePath string) (*FeatureDefinition, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var feature FeatureDefinition
	if err := yaml.Unmarshal(data, &feature); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	feature.FilePath = filePath
	return &feature, nil
}

// GetFeature retrieves a feature by ID or slug.
func (s *FeatureSet) GetFeature(idOrSlug string) (*FeatureDefinition, bool) {
	// Try ID first
	if feature, ok := s.ByID[idOrSlug]; ok {
		return feature, true
	}
	// Try slug
	if feature, ok := s.BySlug[idOrSlug]; ok {
		return feature, true
	}
	return nil, false
}

// GetFeaturesContributingTo returns all features that contribute to a value model path.
func (s *FeatureSet) GetFeaturesContributingTo(path string) []*FeatureDefinition {
	normalizedPath := NormalizeValueModelPath(path)

	// Try exact match first
	if features, ok := s.ByValueModelPath[normalizedPath]; ok {
		return features
	}

	// Try case-insensitive match
	lowerPath := strings.ToLower(normalizedPath)
	for p, features := range s.ByValueModelPath {
		if strings.ToLower(p) == lowerPath {
			return features
		}
	}

	return nil
}

// GetFeaturesByStatus returns all features with a given status.
func (s *FeatureSet) GetFeaturesByStatus(status FeatureStatus) []*FeatureDefinition {
	return s.ByStatus[status]
}

// GetAllFeatures returns all loaded features.
func (s *FeatureSet) GetAllFeatures() []*FeatureDefinition {
	features := make([]*FeatureDefinition, 0, len(s.ByID))
	for _, f := range s.ByID {
		features = append(features, f)
	}
	return features
}

// GetAllValueModelPaths returns all unique value model paths that features contribute to.
func (s *FeatureSet) GetAllValueModelPaths() []string {
	paths := make([]string, 0, len(s.ByValueModelPath))
	for path := range s.ByValueModelPath {
		paths = append(paths, path)
	}
	return paths
}

// GetContributionCount returns the number of features contributing to each value model path.
func (s *FeatureSet) GetContributionCount() map[string]int {
	counts := make(map[string]int)
	for path, features := range s.ByValueModelPath {
		counts[path] = len(features)
	}
	return counts
}

// FeatureIndex provides additional indexing capabilities for features.
type FeatureIndex struct {
	// ByValueModelPath maps value model paths to features contributing to them.
	// This is the primary reverse index.
	ByValueModelPath map[string][]*FeatureEntry

	// ByTrack maps tracks to features that specify that track.
	ByTrack map[string][]*FeatureEntry

	// ByAssumption maps assumption IDs to features testing them.
	ByAssumption map[string][]*FeatureEntry

	// ByDependency maps feature IDs to features that require them.
	ByDependency map[string][]*FeatureEntry
}

// FeatureEntry holds a feature with additional context.
type FeatureEntry struct {
	Feature       *FeatureDefinition
	ContributesTo []string // Normalized paths this feature contributes to
}

// NewFeatureIndex creates an index from a feature set.
func NewFeatureIndex(set *FeatureSet) *FeatureIndex {
	idx := &FeatureIndex{
		ByValueModelPath: make(map[string][]*FeatureEntry),
		ByTrack:          make(map[string][]*FeatureEntry),
		ByAssumption:     make(map[string][]*FeatureEntry),
		ByDependency:     make(map[string][]*FeatureEntry),
	}

	for _, feature := range set.ByID {
		// Normalize all contributes_to paths
		normalizedPaths := make([]string, 0, len(feature.StrategicContext.ContributesTo))
		for _, path := range feature.StrategicContext.ContributesTo {
			normalizedPaths = append(normalizedPaths, NormalizeValueModelPath(path))
		}

		entry := &FeatureEntry{
			Feature:       feature,
			ContributesTo: normalizedPaths,
		}

		// Index by value model path
		for _, path := range normalizedPaths {
			idx.ByValueModelPath[path] = append(idx.ByValueModelPath[path], entry)
		}

		// Index by track
		for _, track := range feature.StrategicContext.Tracks {
			normalizedTrack := strings.ToLower(track)
			idx.ByTrack[normalizedTrack] = append(idx.ByTrack[normalizedTrack], entry)
		}

		// Index by assumption
		for _, assumption := range feature.StrategicContext.AssumptionsTested {
			idx.ByAssumption[assumption] = append(idx.ByAssumption[assumption], entry)
		}

		// Index by dependency (features this feature requires)
		for _, dep := range feature.Dependencies.Requires {
			idx.ByDependency[dep.ID] = append(idx.ByDependency[dep.ID], entry)
		}
	}

	return idx
}

// GetFeaturesTargetingPath returns all features that contribute to a specific value model path.
func (idx *FeatureIndex) GetFeaturesTargetingPath(path string) []*FeatureEntry {
	normalizedPath := NormalizeValueModelPath(path)

	// Try exact match first
	if entries, ok := idx.ByValueModelPath[normalizedPath]; ok {
		return entries
	}

	// Try case-insensitive match
	lowerPath := strings.ToLower(normalizedPath)
	for p, entries := range idx.ByValueModelPath {
		if strings.ToLower(p) == lowerPath {
			return entries
		}
	}

	return nil
}

// GetFeaturesInTrack returns all features that specify a given track.
func (idx *FeatureIndex) GetFeaturesInTrack(track string) []*FeatureEntry {
	return idx.ByTrack[strings.ToLower(track)]
}

// GetFeaturesTestingAssumption returns features testing a specific assumption.
func (idx *FeatureIndex) GetFeaturesTestingAssumption(assumptionID string) []*FeatureEntry {
	return idx.ByAssumption[assumptionID]
}

// GetFeaturesDependingOn returns features that depend on a specific feature.
func (idx *FeatureIndex) GetFeaturesDependingOn(featureID string) []*FeatureEntry {
	return idx.ByDependency[featureID]
}

// NormalizeValueModelPath normalizes a value model path for consistent comparison.
// Handles variations like:
// - "Product.Discovery.KnowledgeExploration" -> "Product.Discovery.KnowledgeExploration"
// - "product.discovery.knowledge-exploration" -> "Product.Discovery.KnowledgeExploration"
func NormalizeValueModelPath(path string) string {
	parts := strings.Split(path, ".")
	normalized := make([]string, len(parts))

	for i, part := range parts {
		// Convert to PascalCase
		normalized[i] = toPascalCaseFromAny(part)
	}

	return strings.Join(normalized, ".")
}

// toPascalCaseFromAny converts any string format to PascalCase.
// Handles kebab-case, snake_case, camelCase, and space-separated.
func toPascalCaseFromAny(s string) string {
	// First, split on common delimiters
	s = strings.ReplaceAll(s, "-", " ")
	s = strings.ReplaceAll(s, "_", " ")

	// Split camelCase by inserting spaces before capitals
	// Also handle digits followed by capitals (e.g., "Layer1LocalTools" -> "Layer1 Local Tools")
	var result strings.Builder
	for i, r := range s {
		if i > 0 && r >= 'A' && r <= 'Z' {
			prev := rune(s[i-1])
			// Insert space if previous char is lowercase letter OR a digit
			if (prev >= 'a' && prev <= 'z') || (prev >= '0' && prev <= '9') {
				result.WriteRune(' ')
			}
		}
		result.WriteRune(r)
	}
	s = result.String()

	// Now split on spaces and capitalize each word
	words := strings.Fields(s)
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(word[:1]) + strings.ToLower(word[1:])
		}
	}

	return strings.Join(words, "")
}

// NormalizeForComparison normalizes a path for case-insensitive comparison.
func NormalizeForComparison(path string) string {
	// Remove all separators and lowercase
	path = strings.ReplaceAll(path, "-", "")
	path = strings.ReplaceAll(path, "_", "")
	path = strings.ReplaceAll(path, ".", "")
	return strings.ToLower(path)
}
