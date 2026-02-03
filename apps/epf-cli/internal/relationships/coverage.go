package relationships

import (
	"sort"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/roadmap"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/valuemodel"
)

// CoverageAnalysis contains the results of analyzing feature coverage.
type CoverageAnalysis struct {
	// Track being analyzed (or "all" for full analysis)
	Track string

	// Total L2 components in the value model
	TotalL2Components int

	// L2 components with at least one feature contribution
	CoveredL2Components int

	// L2 components without any feature contributions
	UncoveredL2Components []string

	// Coverage percentage (0-100)
	CoveragePercent float64

	// Coverage broken down by L1 layer
	ByLayer map[string]*LayerCoverage

	// Features that don't contribute to any value model path
	OrphanFeatures []*FeatureDefinition

	// Value model paths with the most features
	MostContributed []PathContribution

	// Value model paths targeted by KRs but not yet covered by features
	KRTargetsWithoutFeatures []string
}

// LayerCoverage contains coverage analysis for a single L1 layer.
type LayerCoverage struct {
	LayerName       string
	LayerPath       string
	TotalComponents int
	CoveredCount    int
	UncoveredPaths  []string
	CoveragePercent float64
}

// PathContribution tracks how many features contribute to a path.
type PathContribution struct {
	Path          string
	FeatureCount  int
	FeatureIDs    []string
	HasKRTargeted bool
}

// CoverageAnalyzer analyzes feature coverage of the value model.
type CoverageAnalyzer struct {
	valueModels *valuemodel.ValueModelSet
	resolver    *valuemodel.Resolver
	features    *FeatureSet
	krIndex     *roadmap.KRIndex
}

// NewCoverageAnalyzer creates a new coverage analyzer.
func NewCoverageAnalyzer(
	valueModels *valuemodel.ValueModelSet,
	features *FeatureSet,
	krIndex *roadmap.KRIndex,
) *CoverageAnalyzer {
	return &CoverageAnalyzer{
		valueModels: valueModels,
		resolver:    valuemodel.NewResolver(valueModels),
		features:    features,
		krIndex:     krIndex,
	}
}

// AnalyzeAll analyzes coverage across all tracks.
func (a *CoverageAnalyzer) AnalyzeAll() *CoverageAnalysis {
	analysis := &CoverageAnalysis{
		Track:   "all",
		ByLayer: make(map[string]*LayerCoverage),
	}

	// Get all L2 component paths from value model
	l2Paths := a.getAllL2Paths()
	analysis.TotalL2Components = len(l2Paths)

	// Build coverage map: path -> features
	coverageMap := a.buildCoverageMap()

	// Analyze each L2 component
	for _, path := range l2Paths {
		if features := coverageMap[path]; len(features) > 0 {
			analysis.CoveredL2Components++
		} else {
			analysis.UncoveredL2Components = append(analysis.UncoveredL2Components, path)
		}
	}

	// Calculate percentage
	if analysis.TotalL2Components > 0 {
		analysis.CoveragePercent = float64(analysis.CoveredL2Components) / float64(analysis.TotalL2Components) * 100
	}

	// Analyze by layer
	a.analyzeByLayer(analysis)

	// Find orphan features
	analysis.OrphanFeatures = a.findOrphanFeatures()

	// Find most contributed paths
	analysis.MostContributed = a.findMostContributed(coverageMap)

	// Find KR targets without feature coverage
	if a.krIndex != nil {
		analysis.KRTargetsWithoutFeatures = a.findKRTargetsWithoutFeatures(coverageMap)
	}

	return analysis
}

// AnalyzeTrack analyzes coverage for a specific track.
func (a *CoverageAnalyzer) AnalyzeTrack(track string) *CoverageAnalysis {
	normalizedTrack, ok := valuemodel.NormalizeTrack(track)
	if !ok {
		return &CoverageAnalysis{
			Track:                 track,
			UncoveredL2Components: []string{},
			ByLayer:               make(map[string]*LayerCoverage),
		}
	}

	analysis := &CoverageAnalysis{
		Track:   string(normalizedTrack),
		ByLayer: make(map[string]*LayerCoverage),
	}

	// Get L2 paths for this track only
	l2Paths := a.getL2PathsForTrack(normalizedTrack)
	analysis.TotalL2Components = len(l2Paths)

	// Build coverage map
	coverageMap := a.buildCoverageMap()

	// Filter to just this track
	trackPrefix := string(normalizedTrack) + "."
	for _, path := range l2Paths {
		if !strings.HasPrefix(path, trackPrefix) {
			continue
		}

		if features := coverageMap[path]; len(features) > 0 {
			analysis.CoveredL2Components++
		} else {
			analysis.UncoveredL2Components = append(analysis.UncoveredL2Components, path)
		}
	}

	// Calculate percentage
	if analysis.TotalL2Components > 0 {
		analysis.CoveragePercent = float64(analysis.CoveredL2Components) / float64(analysis.TotalL2Components) * 100
	}

	// Analyze by layer for this track
	a.analyzeByLayerForTrack(analysis, normalizedTrack)

	return analysis
}

// getAllL2Paths returns all L2 component paths from the value model.
func (a *CoverageAnalyzer) getAllL2Paths() []string {
	var paths []string

	for track, model := range a.valueModels.Models {
		for _, layer := range model.Layers {
			layerPath := normalizePathSegment(layer.ID, layer.Name)
			for _, comp := range layer.Components {
				compPath := normalizePathSegment(comp.ID, comp.Name)
				fullPath := string(track) + "." + layerPath + "." + compPath
				paths = append(paths, fullPath)
			}
		}
	}

	return paths
}

// getL2PathsForTrack returns L2 component paths for a specific track.
func (a *CoverageAnalyzer) getL2PathsForTrack(track valuemodel.Track) []string {
	model, ok := a.valueModels.GetTrack(track)
	if !ok {
		return nil
	}

	var paths []string
	for _, layer := range model.Layers {
		layerPath := normalizePathSegment(layer.ID, layer.Name)
		for _, comp := range layer.Components {
			compPath := normalizePathSegment(comp.ID, comp.Name)
			fullPath := string(track) + "." + layerPath + "." + compPath
			paths = append(paths, fullPath)
		}
	}

	return paths
}

// buildCoverageMap builds a map of value model paths to features that contribute to them.
func (a *CoverageAnalyzer) buildCoverageMap() map[string][]*FeatureDefinition {
	coverageMap := make(map[string][]*FeatureDefinition)

	for _, feature := range a.features.ByID {
		for _, path := range feature.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)

			// Extract L2 path (first 3 segments: Track.Layer.Component)
			l2Path := a.extractL2Path(normalizedPath)
			if l2Path != "" {
				coverageMap[l2Path] = append(coverageMap[l2Path], feature)
			}
		}
	}

	return coverageMap
}

// extractL2Path extracts the L2 component path from a full path.
func (a *CoverageAnalyzer) extractL2Path(path string) string {
	parts := strings.Split(path, ".")
	if len(parts) >= 3 {
		return strings.Join(parts[:3], ".")
	}
	return path
}

// analyzeByLayer breaks down coverage by L1 layer.
func (a *CoverageAnalyzer) analyzeByLayer(analysis *CoverageAnalysis) {
	coverageMap := a.buildCoverageMap()

	for track, model := range a.valueModels.Models {
		for _, layer := range model.Layers {
			layerPath := normalizePathSegment(layer.ID, layer.Name)
			fullLayerPath := string(track) + "." + layerPath

			layerCoverage := &LayerCoverage{
				LayerName: layer.Name,
				LayerPath: fullLayerPath,
			}

			for _, comp := range layer.Components {
				compPath := normalizePathSegment(comp.ID, comp.Name)
				fullPath := fullLayerPath + "." + compPath
				layerCoverage.TotalComponents++

				if features := coverageMap[fullPath]; len(features) > 0 {
					layerCoverage.CoveredCount++
				} else {
					layerCoverage.UncoveredPaths = append(layerCoverage.UncoveredPaths, fullPath)
				}
			}

			if layerCoverage.TotalComponents > 0 {
				layerCoverage.CoveragePercent = float64(layerCoverage.CoveredCount) / float64(layerCoverage.TotalComponents) * 100
			}

			analysis.ByLayer[fullLayerPath] = layerCoverage
		}
	}
}

// analyzeByLayerForTrack analyzes coverage by layer for a specific track.
func (a *CoverageAnalyzer) analyzeByLayerForTrack(analysis *CoverageAnalysis, track valuemodel.Track) {
	model, ok := a.valueModels.GetTrack(track)
	if !ok {
		return
	}

	coverageMap := a.buildCoverageMap()

	for _, layer := range model.Layers {
		layerPath := normalizePathSegment(layer.ID, layer.Name)
		fullLayerPath := string(track) + "." + layerPath

		layerCoverage := &LayerCoverage{
			LayerName: layer.Name,
			LayerPath: fullLayerPath,
		}

		for _, comp := range layer.Components {
			compPath := normalizePathSegment(comp.ID, comp.Name)
			fullPath := fullLayerPath + "." + compPath
			layerCoverage.TotalComponents++

			if features := coverageMap[fullPath]; len(features) > 0 {
				layerCoverage.CoveredCount++
			} else {
				layerCoverage.UncoveredPaths = append(layerCoverage.UncoveredPaths, fullPath)
			}
		}

		if layerCoverage.TotalComponents > 0 {
			layerCoverage.CoveragePercent = float64(layerCoverage.CoveredCount) / float64(layerCoverage.TotalComponents) * 100
		}

		analysis.ByLayer[fullLayerPath] = layerCoverage
	}
}

// findOrphanFeatures finds features that don't contribute to any value model path.
func (a *CoverageAnalyzer) findOrphanFeatures() []*FeatureDefinition {
	var orphans []*FeatureDefinition

	for _, feature := range a.features.ByID {
		if len(feature.StrategicContext.ContributesTo) == 0 {
			orphans = append(orphans, feature)
		}
	}

	return orphans
}

// findMostContributed returns paths sorted by number of contributing features.
func (a *CoverageAnalyzer) findMostContributed(coverageMap map[string][]*FeatureDefinition) []PathContribution {
	var contributions []PathContribution

	for path, features := range coverageMap {
		if len(features) == 0 {
			continue
		}

		contribution := PathContribution{
			Path:         path,
			FeatureCount: len(features),
		}

		for _, f := range features {
			contribution.FeatureIDs = append(contribution.FeatureIDs, f.ID)
		}

		// Check if any KR targets this path
		if a.krIndex != nil {
			contribution.HasKRTargeted = len(a.krIndex.GetKRsTargetingPath(path)) > 0
		}

		contributions = append(contributions, contribution)
	}

	// Sort by feature count descending
	sort.Slice(contributions, func(i, j int) bool {
		return contributions[i].FeatureCount > contributions[j].FeatureCount
	})

	// Return top 10
	if len(contributions) > 10 {
		contributions = contributions[:10]
	}

	return contributions
}

// findKRTargetsWithoutFeatures finds KR-targeted paths without feature coverage.
func (a *CoverageAnalyzer) findKRTargetsWithoutFeatures(coverageMap map[string][]*FeatureDefinition) []string {
	var gaps []string

	if a.krIndex == nil {
		return gaps
	}

	for path := range a.krIndex.ByValueModelPath {
		// Extract L2 path
		l2Path := a.extractL2Path(path)

		// Check if any features cover this path
		if len(coverageMap[l2Path]) == 0 {
			gaps = append(gaps, path)
		}
	}

	return gaps
}

// normalizePathSegment converts an ID or name to PascalCase.
func normalizePathSegment(id, name string) string {
	if id != "" {
		return toPascalCaseFromKebab(id)
	}
	return toPascalCaseFromSpaces(name)
}

// toPascalCaseFromKebab converts kebab-case to PascalCase.
func toPascalCaseFromKebab(s string) string {
	parts := strings.Split(s, "-")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}

// toPascalCaseFromSpaces converts space-separated words to PascalCase.
func toPascalCaseFromSpaces(s string) string {
	words := strings.Fields(s)
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(word[:1]) + strings.ToLower(word[1:])
		}
	}
	return strings.Join(words, "")
}

// CoverageGap represents a gap in coverage.
type CoverageGap struct {
	Path            string
	LayerName       string
	ComponentName   string
	HasKRTarget     bool
	TargetingKRs    []string
	SuggestedAction string
}

// FindGaps returns detailed information about coverage gaps.
func (a *CoverageAnalyzer) FindGaps() []CoverageGap {
	analysis := a.AnalyzeAll()
	var gaps []CoverageGap

	for _, uncoveredPath := range analysis.UncoveredL2Components {
		gap := CoverageGap{
			Path: uncoveredPath,
		}

		// Extract layer and component names
		parts := strings.Split(uncoveredPath, ".")
		if len(parts) >= 2 {
			gap.LayerName = parts[1]
		}
		if len(parts) >= 3 {
			gap.ComponentName = parts[2]
		}

		// Check if any KRs target this path
		if a.krIndex != nil {
			krs := a.krIndex.GetKRsTargetingPath(uncoveredPath)
			if len(krs) > 0 {
				gap.HasKRTarget = true
				for _, kr := range krs {
					gap.TargetingKRs = append(gap.TargetingKRs, kr.KR.ID)
				}
				gap.SuggestedAction = "High priority: KRs are targeting this component but no features contribute to it"
			} else {
				gap.SuggestedAction = "Consider adding features to build value in this area"
			}
		}

		gaps = append(gaps, gap)
	}

	// Sort by priority (KR-targeted gaps first)
	sort.Slice(gaps, func(i, j int) bool {
		if gaps[i].HasKRTarget != gaps[j].HasKRTarget {
			return gaps[i].HasKRTarget
		}
		return gaps[i].Path < gaps[j].Path
	})

	return gaps
}

// GetCoverageByTrack returns coverage statistics for each track.
func (a *CoverageAnalyzer) GetCoverageByTrack() map[string]float64 {
	coverage := make(map[string]float64)

	for track := range a.valueModels.Models {
		analysis := a.AnalyzeTrack(string(track))
		coverage[string(track)] = analysis.CoveragePercent
	}

	return coverage
}
