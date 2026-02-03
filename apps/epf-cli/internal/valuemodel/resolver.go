package valuemodel

import (
	"fmt"
	"strings"
)

// PathResolution contains the result of resolving a value model path.
type PathResolution struct {
	// Input path that was resolved
	Path string

	// Resolved components
	Track        Track
	TrackModel   *ValueModel
	Layer        *Layer
	Component    *Component
	SubComponent *SubComponent

	// Path depth (1=track, 2=layer, 3=component, 4=sub-component)
	Depth int

	// Canonical path with normalized casing
	CanonicalPath string
}

// PathError represents an error resolving a path with helpful context.
type PathError struct {
	Path           string
	Message        string
	AvailablePaths []string
	DidYouMean     string
	Hint           string
}

func (e *PathError) Error() string {
	return fmt.Sprintf("path resolution error for %q: %s", e.Path, e.Message)
}

// Resolver handles resolving value model paths.
type Resolver struct {
	models *ValueModelSet
}

// NewResolver creates a new path resolver with the given value models.
func NewResolver(models *ValueModelSet) *Resolver {
	return &Resolver{models: models}
}

// Resolve resolves a path like "Product.CoreKnowledgePlatform.DocumentIntelligence"
// to its corresponding value model components.
func (r *Resolver) Resolve(path string) (*PathResolution, error) {
	parts := strings.Split(path, ".")
	if len(parts) < 1 || parts[0] == "" {
		return nil, &PathError{
			Path:    path,
			Message: "path cannot be empty",
			Hint:    "Value model paths follow: {Track}.{L1Layer}.{L2Component} or {Track}.{L1Layer}.{L2Component}.{L3SubComponent}",
		}
	}

	resolution := &PathResolution{
		Path:  path,
		Depth: len(parts),
	}

	// Step 1: Resolve track
	track, ok := NormalizeTrack(parts[0])
	if !ok {
		return nil, r.trackNotFoundError(path, parts[0])
	}
	resolution.Track = track

	// Get the track's value model
	model, ok := r.models.GetTrack(track)
	if !ok {
		return nil, r.trackNotFoundError(path, parts[0])
	}
	resolution.TrackModel = model

	// Build canonical path
	canonicalParts := []string{string(track)}

	if len(parts) == 1 {
		resolution.CanonicalPath = strings.Join(canonicalParts, ".")
		return resolution, nil
	}

	// Step 2: Resolve L1 layer
	layer, err := r.findLayer(model, parts[1])
	if err != nil {
		return nil, r.layerNotFoundError(path, track, parts[1], model)
	}
	resolution.Layer = layer
	canonicalParts = append(canonicalParts, normalizePathSegment(layer.ID, layer.Name))

	if len(parts) == 2 {
		resolution.CanonicalPath = strings.Join(canonicalParts, ".")
		return resolution, nil
	}

	// Step 3: Resolve L2 component
	component, err := r.findComponent(layer, parts[2])
	if err != nil {
		return nil, r.componentNotFoundError(path, track, layer, parts[2])
	}
	resolution.Component = component
	canonicalParts = append(canonicalParts, normalizePathSegment(component.ID, component.Name))

	if len(parts) == 3 {
		resolution.CanonicalPath = strings.Join(canonicalParts, ".")
		return resolution, nil
	}

	// Step 4: Resolve L3 sub-component
	subComponent, err := r.findSubComponent(component, parts[3])
	if err != nil {
		return nil, r.subComponentNotFoundError(path, track, layer, component, parts[3])
	}
	resolution.SubComponent = subComponent
	canonicalParts = append(canonicalParts, normalizePathSegment(subComponent.ID, subComponent.Name))
	resolution.CanonicalPath = strings.Join(canonicalParts, ".")

	return resolution, nil
}

// findLayer finds a layer by ID or name (case-insensitive).
func (r *Resolver) findLayer(model *ValueModel, search string) (*Layer, error) {
	searchLower := strings.ToLower(search)
	searchNormalized := normalizeForComparison(search)

	for i := range model.Layers {
		layer := &model.Layers[i]

		// Try exact ID match
		if strings.ToLower(layer.ID) == searchLower {
			return layer, nil
		}

		// Try normalized ID match (kebab to pascal)
		if normalizeForComparison(layer.ID) == searchNormalized {
			return layer, nil
		}

		// Try name match
		if normalizeForComparison(layer.Name) == searchNormalized {
			return layer, nil
		}
	}

	return nil, fmt.Errorf("layer not found: %s", search)
}

// findComponent finds a component by ID or name (case-insensitive).
func (r *Resolver) findComponent(layer *Layer, search string) (*Component, error) {
	searchLower := strings.ToLower(search)
	searchNormalized := normalizeForComparison(search)

	for i := range layer.Components {
		comp := &layer.Components[i]

		// Try exact ID match
		if strings.ToLower(comp.ID) == searchLower {
			return comp, nil
		}

		// Try normalized ID match
		if normalizeForComparison(comp.ID) == searchNormalized {
			return comp, nil
		}

		// Try name match
		if normalizeForComparison(comp.Name) == searchNormalized {
			return comp, nil
		}
	}

	return nil, fmt.Errorf("component not found: %s", search)
}

// findSubComponent finds a sub-component by ID or name (case-insensitive).
func (r *Resolver) findSubComponent(component *Component, search string) (*SubComponent, error) {
	searchLower := strings.ToLower(search)
	searchNormalized := normalizeForComparison(search)

	for i, sub := range component.GetSubComponents() {
		// Try exact ID match
		if strings.ToLower(sub.ID) == searchLower {
			return &component.GetSubComponents()[i], nil
		}

		// Try normalized ID match
		if normalizeForComparison(sub.ID) == searchNormalized {
			return &component.GetSubComponents()[i], nil
		}

		// Try name match
		if normalizeForComparison(sub.Name) == searchNormalized {
			return &component.GetSubComponents()[i], nil
		}
	}

	return nil, fmt.Errorf("sub-component not found: %s", search)
}

// normalizeForComparison normalizes a string for comparison by:
// - Converting to lowercase
// - Removing hyphens, underscores, and spaces
func normalizeForComparison(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, " ", "")
	return s
}

// Error building helpers with rich context

func (r *Resolver) trackNotFoundError(path, trackInput string) *PathError {
	available := make([]string, len(ValidTracks))
	for i, t := range ValidTracks {
		available[i] = string(t)
	}

	// Find closest match
	didYouMean := findClosestMatch(trackInput, available)

	return &PathError{
		Path:           path,
		Message:        fmt.Sprintf("track %q not found", trackInput),
		AvailablePaths: available,
		DidYouMean:     didYouMean,
		Hint:           "Valid tracks are: Product, Strategy, OrgOps, Commercial",
	}
}

func (r *Resolver) layerNotFoundError(path string, track Track, layerInput string, model *ValueModel) *PathError {
	available := make([]string, 0, len(model.Layers))
	for _, layer := range model.Layers {
		available = append(available, fmt.Sprintf("%s.%s", track, normalizePathSegment(layer.ID, layer.Name)))
	}

	didYouMean := findClosestMatch(layerInput, extractLastSegments(available))

	return &PathError{
		Path:           path,
		Message:        fmt.Sprintf("layer %q not found in track %s", layerInput, track),
		AvailablePaths: available,
		DidYouMean:     didYouMean,
		Hint:           fmt.Sprintf("Available L1 layers in %s track: %s", track, strings.Join(extractLastSegments(available), ", ")),
	}
}

func (r *Resolver) componentNotFoundError(path string, track Track, layer *Layer, componentInput string) *PathError {
	layerPath := normalizePathSegment(layer.ID, layer.Name)
	available := make([]string, 0, len(layer.Components))
	for _, comp := range layer.Components {
		available = append(available, fmt.Sprintf("%s.%s.%s", track, layerPath, normalizePathSegment(comp.ID, comp.Name)))
	}

	didYouMean := findClosestMatch(componentInput, extractLastSegments(available))

	return &PathError{
		Path:           path,
		Message:        fmt.Sprintf("component %q not found in layer %s", componentInput, layer.Name),
		AvailablePaths: available,
		DidYouMean:     didYouMean,
		Hint:           fmt.Sprintf("Available L2 components in %s: %s", layer.Name, strings.Join(extractLastSegments(available), ", ")),
	}
}

func (r *Resolver) subComponentNotFoundError(path string, track Track, layer *Layer, component *Component, subInput string) *PathError {
	layerPath := normalizePathSegment(layer.ID, layer.Name)
	compPath := normalizePathSegment(component.ID, component.Name)

	subs := component.GetSubComponents()
	available := make([]string, 0, len(subs))
	for _, sub := range subs {
		available = append(available, fmt.Sprintf("%s.%s.%s.%s", track, layerPath, compPath, normalizePathSegment(sub.ID, sub.Name)))
	}

	didYouMean := findClosestMatch(subInput, extractLastSegments(available))

	return &PathError{
		Path:           path,
		Message:        fmt.Sprintf("sub-component %q not found in component %s", subInput, component.Name),
		AvailablePaths: available,
		DidYouMean:     didYouMean,
		Hint:           fmt.Sprintf("Available L3 sub-components in %s: %s", component.Name, strings.Join(extractLastSegments(available), ", ")),
	}
}

// extractLastSegments extracts the last segment from each path.
func extractLastSegments(paths []string) []string {
	result := make([]string, len(paths))
	for i, p := range paths {
		parts := strings.Split(p, ".")
		result[i] = parts[len(parts)-1]
	}
	return result
}

// findClosestMatch finds the closest string match using simple edit distance.
func findClosestMatch(input string, candidates []string) string {
	if len(candidates) == 0 {
		return ""
	}

	inputNorm := normalizeForComparison(input)
	bestMatch := ""
	bestScore := -1

	for _, candidate := range candidates {
		candidateNorm := normalizeForComparison(candidate)

		// Simple similarity: count matching characters
		score := 0
		for i := 0; i < len(inputNorm) && i < len(candidateNorm); i++ {
			if inputNorm[i] == candidateNorm[i] {
				score++
			}
		}

		// Bonus for substring match
		if strings.Contains(candidateNorm, inputNorm) || strings.Contains(inputNorm, candidateNorm) {
			score += 5
		}

		if score > bestScore {
			bestScore = score
			bestMatch = candidate
		}
	}

	// Only suggest if there's some similarity
	if bestScore >= 2 {
		return bestMatch
	}
	return ""
}

// ValidatePath checks if a path is valid without returning full resolution.
func (r *Resolver) ValidatePath(path string) error {
	_, err := r.Resolve(path)
	return err
}

// GetAvailablePaths returns all valid paths in the value model set.
func (r *Resolver) GetAvailablePaths() []string {
	return r.models.GetAllPaths()
}

// GetPathsForTrack returns all paths within a specific track.
func (r *Resolver) GetPathsForTrack(track Track) []string {
	model, ok := r.models.GetTrack(track)
	if !ok {
		return nil
	}

	var paths []string
	trackName := string(track)

	for _, layer := range model.Layers {
		layerPath := fmt.Sprintf("%s.%s", trackName, normalizePathSegment(layer.ID, layer.Name))
		paths = append(paths, layerPath)

		for _, comp := range layer.Components {
			compPath := fmt.Sprintf("%s.%s", layerPath, normalizePathSegment(comp.ID, comp.Name))
			paths = append(paths, compPath)

			for _, sub := range comp.GetSubComponents() {
				subPath := fmt.Sprintf("%s.%s", compPath, normalizePathSegment(sub.ID, sub.Name))
				paths = append(paths, subPath)
			}
		}
	}

	return paths
}

// SuggestPaths returns paths that partially match the input.
func (r *Resolver) SuggestPaths(partialPath string) []string {
	allPaths := r.GetAvailablePaths()
	partialNorm := normalizeForComparison(partialPath)

	var suggestions []string
	for _, p := range allPaths {
		pNorm := normalizeForComparison(p)
		if strings.Contains(pNorm, partialNorm) {
			suggestions = append(suggestions, p)
		}
	}

	return suggestions
}
