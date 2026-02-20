package relationships

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/roadmap"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
	"gopkg.in/yaml.v3"
)

// Analyzer provides cross-artifact relationship analysis.
type Analyzer struct {
	instancePath string
	valueModels  *valuemodel.ValueModelSet
	resolver     *valuemodel.Resolver
	features     *FeatureSet
	featureIndex *FeatureIndex
	roadmapData  *roadmap.Roadmap
	krIndex      *roadmap.KRIndex
	mappings     []MappingEntry
	validator    *Validator
	coverage     *CoverageAnalyzer
}

// NewAnalyzer creates a new relationship analyzer for an EPF instance.
func NewAnalyzer(instancePath string) *Analyzer {
	return &Analyzer{
		instancePath: instancePath,
	}
}

// Load loads all required artifacts from the EPF instance.
func (a *Analyzer) Load() error {
	// Load value models
	vmLoader := valuemodel.NewLoader(a.instancePath)
	valueModels, err := vmLoader.Load()
	if err != nil {
		return fmt.Errorf("failed to load value models: %w", err)
	}
	a.valueModels = valueModels
	a.resolver = valuemodel.NewResolver(valueModels)

	// Load features
	featureLoader := NewFeatureLoader(a.instancePath)
	features, err := featureLoader.Load()
	if err != nil {
		return fmt.Errorf("failed to load features: %w", err)
	}
	a.features = features
	a.featureIndex = NewFeatureIndex(features)

	// Load roadmap
	rmLoader := roadmap.NewLoader(a.instancePath)
	roadmapData, err := rmLoader.Load()
	if err != nil {
		// Roadmap is optional - just log warning
		fmt.Printf("Warning: could not load roadmap: %v\n", err)
	} else {
		a.roadmapData = roadmapData
		a.krIndex = roadmap.NewKRIndex(roadmapData)
	}

	// Initialize validator and coverage analyzer
	a.validator = NewValidator(valueModels)
	a.coverage = NewCoverageAnalyzer(valueModels, features, a.krIndex)

	// Load mappings (optional - FIRE/mappings.yaml may not exist)
	a.mappings = a.loadMappings()

	// Pass mappings to coverage analyzer for multi-signal analysis
	a.coverage.SetMappings(a.mappings)

	return nil
}

// GetStrategicContext returns the strategic context for a feature.
func (a *Analyzer) GetStrategicContext(featureIDOrSlug string) (*StrategicContextResult, error) {
	feature, ok := a.features.GetFeature(featureIDOrSlug)
	if !ok {
		return nil, fmt.Errorf("feature not found: %s", featureIDOrSlug)
	}

	result := &StrategicContextResult{
		Feature:       feature,
		ContributesTo: make([]*PathExplanation, 0),
		RelatedKRs:    make([]*roadmap.KREntry, 0),
	}

	// Resolve and explain each contributes_to path
	for _, path := range feature.StrategicContext.ContributesTo {
		explanation, err := a.ExplainPath(path)
		if err != nil {
			// Include error info but continue
			result.ContributesTo = append(result.ContributesTo, &PathExplanation{
				Path:     path,
				IsValid:  false,
				ErrorMsg: err.Error(),
			})
			continue
		}
		result.ContributesTo = append(result.ContributesTo, explanation)
	}

	// Find related KRs (KRs that target the same value model paths)
	if a.krIndex != nil {
		seenKRs := make(map[string]bool)
		for _, path := range feature.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			krs := a.krIndex.GetKRsTargetingPath(normalizedPath)
			for _, kr := range krs {
				if !seenKRs[kr.KR.ID] {
					result.RelatedKRs = append(result.RelatedKRs, kr)
					seenKRs[kr.KR.ID] = true
				}
			}
		}
	}

	// Find dependent features (features this feature enables)
	for _, enabled := range feature.Dependencies.Enables {
		if enabledFeature, ok := a.features.GetFeature(enabled.ID); ok {
			result.EnablesFeatures = append(result.EnablesFeatures, enabledFeature)
		}
	}

	// Find dependency features (features this feature requires)
	for _, required := range feature.Dependencies.Requires {
		if requiredFeature, ok := a.features.GetFeature(required.ID); ok {
			result.RequiresFeatures = append(result.RequiresFeatures, requiredFeature)
		}
	}

	return result, nil
}

// StrategicContextResult contains the strategic context for a feature.
type StrategicContextResult struct {
	Feature          *FeatureDefinition
	ContributesTo    []*PathExplanation
	RelatedKRs       []*roadmap.KREntry
	EnablesFeatures  []*FeatureDefinition
	RequiresFeatures []*FeatureDefinition
}

// ExplainPath provides a detailed explanation of a value model path.
func (a *Analyzer) ExplainPath(path string) (*PathExplanation, error) {
	resolution, err := a.resolver.Resolve(path)
	if err != nil {
		return &PathExplanation{
			Path:     path,
			IsValid:  false,
			ErrorMsg: err.Error(),
		}, err
	}

	explanation := &PathExplanation{
		Path:          path,
		CanonicalPath: resolution.CanonicalPath,
		IsValid:       true,
		Track:         string(resolution.Track),
		Depth:         resolution.Depth,
	}

	// Add layer info
	if resolution.Layer != nil {
		explanation.Layer = &LayerInfo{
			ID:          resolution.Layer.ID,
			Name:        resolution.Layer.Name,
			Description: resolution.Layer.Description,
		}
	}

	// Add component info
	if resolution.Component != nil {
		explanation.Component = &ComponentInfo{
			ID:          resolution.Component.ID,
			Name:        resolution.Component.Name,
			Description: resolution.Component.Description,
		}

		// Get maturity if available
		if resolution.Component.MaturitySummary.CalculatedStage != "" {
			explanation.Component.Maturity = string(resolution.Component.MaturitySummary.CalculatedStage)
		}
	}

	// Add sub-component info
	if resolution.SubComponent != nil {
		explanation.SubComponent = &SubComponentInfo{
			ID:     resolution.SubComponent.ID,
			Name:   resolution.SubComponent.Name,
			Active: resolution.SubComponent.Active,
		}
		if resolution.SubComponent.Maturity.Stage != "" {
			explanation.SubComponent.Maturity = string(resolution.SubComponent.Maturity.Stage)
		}
	}

	// Find features contributing to this path
	normalizedPath := resolution.CanonicalPath
	features := a.featureIndex.GetFeaturesTargetingPath(normalizedPath)
	for _, f := range features {
		explanation.ContributingFeatures = append(explanation.ContributingFeatures, f.Feature.ID)
	}

	// Find KRs targeting this path
	if a.krIndex != nil {
		krs := a.krIndex.GetKRsTargetingPath(normalizedPath)
		for _, kr := range krs {
			explanation.TargetingKRs = append(explanation.TargetingKRs, kr.KR.ID)
		}
	}

	return explanation, nil
}

// PathExplanation contains a detailed explanation of a value model path.
type PathExplanation struct {
	Path                 string
	CanonicalPath        string
	IsValid              bool
	ErrorMsg             string
	Track                string
	Depth                int
	Layer                *LayerInfo
	Component            *ComponentInfo
	SubComponent         *SubComponentInfo
	ContributingFeatures []string
	TargetingKRs         []string
}

// LayerInfo contains information about an L1 layer.
type LayerInfo struct {
	ID          string
	Name        string
	Description string
}

// ComponentInfo contains information about an L2 component.
type ComponentInfo struct {
	ID          string
	Name        string
	Description string
	Maturity    string
}

// SubComponentInfo contains information about an L3 sub-component.
type SubComponentInfo struct {
	ID       string
	Name     string
	Active   bool
	Maturity string
}

// ValidateAll validates all relationships and returns the result.
func (a *Analyzer) ValidateAll() *ValidationResult {
	return a.validator.ValidateAll(a.features, a.roadmapData, a.mappings)
}

// ValidateFile validates relationships only for a specific file.
// If the file is a feature definition, only that feature's contributes_to paths are checked.
// If the file is the roadmap, only KR value_model_target paths are checked.
func (a *Analyzer) ValidateFile(filePath string) *ValidationResult {
	result := &ValidationResult{
		Valid: true,
	}

	// Try to match the file to a loaded feature
	for _, feature := range a.features.ByID {
		if feature.FilePath == filePath || filepath.Base(feature.FilePath) == filepath.Base(filePath) {
			errors := a.validator.ValidateFeature(feature)
			result.Stats.TotalFeaturesChecked = 1
			for _, e := range errors {
				result.Stats.TotalPathsChecked++
				result.AddError(e)
			}
			// Count valid paths
			result.Stats.ValidPaths = len(feature.StrategicContext.ContributesTo) - result.Stats.InvalidPaths
			result.Stats.TotalPathsChecked = len(feature.StrategicContext.ContributesTo)
			return result
		}
	}

	// If no feature matched, check if it's a roadmap file — validate all KRs
	baseName := filepath.Base(filePath)
	if strings.Contains(baseName, "roadmap") {
		if a.roadmapData != nil {
			krResult := a.validator.ValidateKRs(a.roadmapData)
			return krResult
		}
	}

	// Fallback: file doesn't match any known artifact, return empty valid result
	return result
}

// AnalyzeCoverage returns coverage analysis for all tracks or a specific track.
func (a *Analyzer) AnalyzeCoverage(track string) *CoverageAnalysis {
	if track == "" || track == "all" {
		return a.coverage.AnalyzeAll()
	}
	return a.coverage.AnalyzeTrack(track)
}

// GetDetailedCoverageByTrack returns detailed coverage statistics for each track.
func (a *Analyzer) GetDetailedCoverageByTrack() map[string]*TrackCoverageDetail {
	return a.coverage.GetDetailedCoverageByTrack()
}

// FindCoverageGaps returns detailed information about coverage gaps.
func (a *Analyzer) FindCoverageGaps() []CoverageGap {
	return a.coverage.FindGaps()
}

// GetValueModels returns the loaded value models.
func (a *Analyzer) GetValueModels() *valuemodel.ValueModelSet {
	return a.valueModels
}

// GetResolver returns the value model path resolver.
func (a *Analyzer) GetResolver() *valuemodel.Resolver {
	return a.resolver
}

// GetFeatures returns the loaded features.
func (a *Analyzer) GetFeatures() *FeatureSet {
	return a.features
}

// GetRoadmap returns the loaded roadmap.
func (a *Analyzer) GetRoadmap() *roadmap.Roadmap {
	return a.roadmapData
}

// GetKRIndex returns the KR index.
func (a *Analyzer) GetKRIndex() *roadmap.KRIndex {
	return a.krIndex
}

// GetMappings returns the loaded mappings.
func (a *Analyzer) GetMappings() []MappingEntry {
	return a.mappings
}

// loadMappings loads mapping entries from FIRE/mappings.yaml.
// Returns nil if the file doesn't exist or can't be parsed.
func (a *Analyzer) loadMappings() []MappingEntry {
	mappingsPath := filepath.Join(a.instancePath, "FIRE", "mappings.yaml")
	data, err := os.ReadFile(mappingsPath)
	if err != nil {
		return nil
	}

	// mappings.yaml has top-level keys for each track (product, strategy, org_ops, commercial)
	// Each track contains an array of MappingEntry objects.
	var raw map[string][]MappingEntry
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil
	}

	var entries []MappingEntry
	for _, trackEntries := range raw {
		entries = append(entries, trackEntries...)
	}
	return entries
}

// Summary returns a high-level summary of the EPF instance relationships.
type Summary struct {
	InstancePath     string
	TracksLoaded     []string
	TotalFeatures    int
	FeaturesByStatus map[FeatureStatus]int
	TotalKRs         int
	CoverageByTrack  map[string]float64
	ValidationResult *ValidationResult
}

// GetSummary returns a summary of the EPF instance relationships.
func (a *Analyzer) GetSummary() *Summary {
	summary := &Summary{
		InstancePath:     a.instancePath,
		TracksLoaded:     make([]string, 0),
		FeaturesByStatus: make(map[FeatureStatus]int),
		CoverageByTrack:  make(map[string]float64),
	}

	// Tracks
	for track := range a.valueModels.Models {
		summary.TracksLoaded = append(summary.TracksLoaded, string(track))
	}

	// Features
	summary.TotalFeatures = len(a.features.ByID)
	for status, features := range a.features.ByStatus {
		summary.FeaturesByStatus[status] = len(features)
	}

	// KRs
	if a.krIndex != nil {
		summary.TotalKRs = len(a.krIndex.ByID)
	}

	// Coverage
	summary.CoverageByTrack = a.coverage.GetCoverageByTrack()

	// Validation
	summary.ValidationResult = a.ValidateAll()

	return summary
}

// SummaryText returns a formatted text summary.
func (s *Summary) SummaryText() string {
	var sb strings.Builder

	sb.WriteString("EPF Instance Relationship Summary\n")
	sb.WriteString("==================================\n\n")

	sb.WriteString(fmt.Sprintf("Instance: %s\n", s.InstancePath))
	sb.WriteString(fmt.Sprintf("Tracks: %s\n", strings.Join(s.TracksLoaded, ", ")))
	sb.WriteString(fmt.Sprintf("Features: %d\n", s.TotalFeatures))

	if len(s.FeaturesByStatus) > 0 {
		sb.WriteString("  By status:\n")
		for status, count := range s.FeaturesByStatus {
			sb.WriteString(fmt.Sprintf("    %s: %d\n", status, count))
		}
	}

	sb.WriteString(fmt.Sprintf("Key Results: %d\n", s.TotalKRs))

	sb.WriteString("\nCoverage by Track:\n")
	for track, pct := range s.CoverageByTrack {
		sb.WriteString(fmt.Sprintf("  %s: %.1f%%\n", track, pct))
	}

	sb.WriteString("\nValidation:\n")
	if s.ValidationResult.Valid {
		sb.WriteString("  ✓ All relationships valid\n")
	} else {
		sb.WriteString(fmt.Sprintf("  ✗ %d errors, %d warnings\n",
			s.ValidationResult.Stats.ErrorCount,
			s.ValidationResult.Stats.WarningCount))
	}

	return sb.String()
}
