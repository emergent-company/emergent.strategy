package template

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// DefinitionType indicates whether a definition is canonical or an example
type DefinitionType string

const (
	DefinitionTypeExample   DefinitionType = "example"   // Product track - learning reference
	DefinitionTypeCanonical DefinitionType = "canonical" // Strategy/OrgOps/Commercial - adopt directly
)

// Track represents an EPF track
type Track string

const (
	TrackProduct    Track = "product"
	TrackStrategy   Track = "strategy"
	TrackOrgOps     Track = "org_ops"
	TrackCommercial Track = "commercial"
)

// AllTracks returns all available tracks
func AllTracks() []Track {
	return []Track{TrackProduct, TrackStrategy, TrackOrgOps, TrackCommercial}
}

// TrackFromString converts a string to a Track
func TrackFromString(s string) (Track, error) {
	normalized := strings.ToLower(strings.ReplaceAll(s, "-", "_"))
	switch normalized {
	case "product":
		return TrackProduct, nil
	case "strategy":
		return TrackStrategy, nil
	case "org_ops", "orgops":
		return TrackOrgOps, nil
	case "commercial":
		return TrackCommercial, nil
	default:
		return "", fmt.Errorf("unknown track: %s", s)
	}
}

// DefinitionInfo contains metadata about a loaded definition
type DefinitionInfo struct {
	ID          string         `json:"id"`          // e.g., "pd-005", "fd-002"
	Name        string         `json:"name"`        // Human-readable name
	Track       Track          `json:"track"`       // product, strategy, org_ops, commercial
	Type        DefinitionType `json:"type"`        // example or canonical
	Category    string         `json:"category"`    // e.g., "01-technical", "financial-legal"
	FilePath    string         `json:"file_path"`   // Path relative to EPF root
	Content     string         `json:"content"`     // Raw YAML content
	Description string         `json:"description"` // Brief description
	UsageHint   string         `json:"usage_hint"`  // How to use this definition
}

// CategoryInfo contains metadata about a definition category
type CategoryInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// DefinitionLoader loads and manages EPF definitions
type DefinitionLoader struct {
	epfRoot     string
	definitions map[string]*DefinitionInfo // keyed by ID
}

// Track to directory mapping
var trackDirs = map[Track]string{
	TrackProduct:    "definitions/product",
	TrackStrategy:   "definitions/strategy",
	TrackOrgOps:     "definitions/org_ops",
	TrackCommercial: "definitions/commercial",
}

// ID prefix to track mapping
var idPrefixToTrack = map[string]Track{
	"fd": TrackProduct,
	"sd": TrackStrategy,
	"pd": TrackOrgOps,
	"cd": TrackCommercial,
}

// Definition ID pattern
var definitionIDPattern = regexp.MustCompile(`^(fd|sd|pd|cd)-(\d+|[a-z]+-\d+)`)

// NewDefinitionLoader creates a new definition loader
func NewDefinitionLoader(epfRoot string) *DefinitionLoader {
	return &DefinitionLoader{
		epfRoot:     epfRoot,
		definitions: make(map[string]*DefinitionInfo),
	}
}

// Load loads all definitions from the EPF directory
func (l *DefinitionLoader) Load() error {
	for track, dir := range trackDirs {
		trackPath := filepath.Join(l.epfRoot, dir)
		if err := l.loadTrackDefinitions(track, trackPath, l.epfRoot); err != nil {
			// Track directory might not exist - that's okay
			continue
		}
	}

	return nil
}

// LoadFromInstancePath loads definitions from an instance's FIRE/definitions/ directory.
// This supplements definitions loaded from the framework root. Instance definitions
// take precedence over framework definitions with the same ID.
func (l *DefinitionLoader) LoadFromInstancePath(instancePath string) error {
	defsDir := filepath.Join(instancePath, "FIRE", "definitions")
	if _, err := os.Stat(defsDir); os.IsNotExist(err) {
		return nil // No instance definitions — not an error
	}
	// Use instancePath/FIRE as relBase so filepath.Rel produces
	// "definitions/{track}/{category}/{file}.yaml" — matching extractCategory expectations
	relBase := filepath.Join(instancePath, "FIRE")
	for track, dir := range trackDirs {
		// trackDirs values are like "definitions/strategy"; we only need the track sub-dir
		trackSubDir := filepath.Base(dir)
		trackPath := filepath.Join(defsDir, trackSubDir)
		if err := l.loadTrackDefinitions(track, trackPath, relBase); err != nil {
			continue
		}
	}
	return nil
}

// loadTrackDefinitions loads definitions for a specific track.
// relBase is the base directory for computing relative paths (used for category extraction).
func (l *DefinitionLoader) loadTrackDefinitions(track Track, trackPath string, relBase string) error {
	return filepath.Walk(trackPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip directories and non-YAML files
		if info.IsDir() {
			return nil
		}

		// Skip template directory for product track
		if track == TrackProduct && strings.Contains(path, "_template") {
			return nil
		}

		// Only process YAML files
		if !strings.HasSuffix(path, ".yaml") && !strings.HasSuffix(path, ".yml") {
			return nil
		}

		// Skip README files
		if strings.Contains(strings.ToLower(info.Name()), "readme") {
			return nil
		}

		// Check if filename matches definition pattern
		filename := info.Name()
		if !definitionIDPattern.MatchString(filename) {
			return nil
		}

		// Load the definition
		def, err := l.loadDefinition(track, path, relBase)
		if err != nil {
			// Skip files that can't be loaded
			return nil
		}

		l.definitions[def.ID] = def
		return nil
	})
}

// loadDefinition loads a single definition file.
// relBase is the directory used for computing the relative path (for category extraction).
func (l *DefinitionLoader) loadDefinition(track Track, path string, relBase string) (*DefinitionInfo, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("could not read definition file: %w", err)
	}

	// Parse YAML to extract metadata
	var metadata struct {
		ID          string `yaml:"id"`
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
	}

	if err := yaml.Unmarshal(content, &metadata); err != nil {
		return nil, fmt.Errorf("could not parse definition YAML: %w", err)
	}

	// Determine category from directory structure
	relPath, _ := filepath.Rel(relBase, path)
	category := extractCategory(relPath)

	// Determine definition type
	defType := DefinitionTypeCanonical
	if track == TrackProduct {
		defType = DefinitionTypeExample
	}

	// Generate usage hint based on type
	usageHint := generateUsageHint(track, defType)

	return &DefinitionInfo{
		ID:          metadata.ID,
		Name:        metadata.Name,
		Track:       track,
		Type:        defType,
		Category:    category,
		FilePath:    relPath,
		Content:     string(content),
		Description: generateDescription(track, defType, metadata.Name),
		UsageHint:   usageHint,
	}, nil
}

// extractCategory extracts the category from a file path
// e.g., "definitions/product/01-technical/fd-001.yaml" -> "01-technical"
func extractCategory(relPath string) string {
	parts := strings.Split(filepath.ToSlash(relPath), "/")
	if len(parts) >= 3 {
		// Path is like: definitions/product/01-technical/fd-001.yaml
		// Category is the third part
		category := parts[2]
		// Don't return the filename as category
		if strings.HasSuffix(category, ".yaml") || strings.HasSuffix(category, ".yml") {
			if len(parts) >= 4 {
				return parts[2]
			}
			return ""
		}
		return category
	}
	return ""
}

// generateDescription generates a description based on track and type
func generateDescription(track Track, defType DefinitionType, name string) string {
	switch defType {
	case DefinitionTypeExample:
		return fmt.Sprintf("Example feature definition: %s - demonstrates quality patterns for product features", name)
	case DefinitionTypeCanonical:
		trackName := strings.Title(strings.ReplaceAll(string(track), "_", " "))
		return fmt.Sprintf("Canonical %s definition: %s", trackName, name)
	default:
		return name
	}
}

// generateUsageHint generates usage guidance based on definition type
func generateUsageHint(track Track, defType DefinitionType) string {
	switch defType {
	case DefinitionTypeExample:
		return "This is an EXAMPLE. Learn from the patterns (personas, scenarios, capabilities) but write your own unique feature definition for your product."
	case DefinitionTypeCanonical:
		return "This is a CANONICAL definition. Adopt it into your instance, customizing only where your organization has specific needs."
	default:
		return ""
	}
}

// GetDefinition returns a definition by ID
func (l *DefinitionLoader) GetDefinition(id string) (*DefinitionInfo, error) {
	def, ok := l.definitions[id]
	if !ok {
		return nil, fmt.Errorf("definition not found: %s", id)
	}
	return def, nil
}

// ListDefinitions returns all definitions, optionally filtered by track and category
func (l *DefinitionLoader) ListDefinitions(track *Track, category *string) []*DefinitionInfo {
	var result []*DefinitionInfo

	for _, def := range l.definitions {
		// Filter by track if specified
		if track != nil && def.Track != *track {
			continue
		}

		// Filter by category if specified
		if category != nil && def.Category != *category {
			continue
		}

		result = append(result, def)
	}

	// Sort by ID
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})

	return result
}

// ListDefinitionsByTrack returns definitions for a specific track
func (l *DefinitionLoader) ListDefinitionsByTrack(track Track) []*DefinitionInfo {
	return l.ListDefinitions(&track, nil)
}

// GetCategories returns all categories for a track
func (l *DefinitionLoader) GetCategories(track Track) []CategoryInfo {
	categoryCount := make(map[string]int)

	for _, def := range l.definitions {
		if def.Track != track {
			continue
		}
		if def.Category != "" {
			categoryCount[def.Category]++
		}
	}

	var result []CategoryInfo
	for name, count := range categoryCount {
		result = append(result, CategoryInfo{Name: name, Count: count})
	}

	// Sort by name
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result
}

// GetTrackDescription returns a description of what the track's definitions represent
func GetTrackDescription(track Track) (string, DefinitionType) {
	switch track {
	case TrackProduct:
		return "Example feature definitions showing quality patterns. Use as reference when writing your own unique product features.", DefinitionTypeExample
	case TrackStrategy:
		return "Canonical strategy definitions for strategic planning and positioning. Adopt these into your instance.", DefinitionTypeCanonical
	case TrackOrgOps:
		return "Canonical process definitions for organizational operations. Adopt these into your instance.", DefinitionTypeCanonical
	case TrackCommercial:
		return "Canonical commercial definitions for go-to-market activities. Adopt these into your instance.", DefinitionTypeCanonical
	default:
		return "", ""
	}
}

// DefinitionCount returns the number of loaded definitions
func (l *DefinitionLoader) DefinitionCount() int {
	return len(l.definitions)
}

// DefinitionCountByTrack returns the number of definitions for a track
func (l *DefinitionLoader) DefinitionCountByTrack(track Track) int {
	count := 0
	for _, def := range l.definitions {
		if def.Track == track {
			count++
		}
	}
	return count
}

// GetTrackForID returns the track for a definition ID based on its prefix
func GetTrackForID(id string) (Track, error) {
	for prefix, track := range idPrefixToTrack {
		if strings.HasPrefix(id, prefix+"-") {
			return track, nil
		}
	}
	return "", fmt.Errorf("could not determine track for definition ID: %s", id)
}
