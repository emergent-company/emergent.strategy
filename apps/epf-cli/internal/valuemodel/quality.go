// Package valuemodel provides loading, resolution, maturity analysis, and
// semantic quality assessment of EPF value model files.
//
// The quality functions in this file implement heuristic checks that detect
// the product-catalog anti-pattern — value models organized around products
// instead of value delivery categories. All checks are advisory (WARNING/INFO),
// never blocking errors.
package valuemodel

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"gopkg.in/yaml.v3"
)

// WarningLevel indicates the severity of a quality warning.
type WarningLevel string

const (
	WarningLevelWarning WarningLevel = "WARNING"
	WarningLevelInfo    WarningLevel = "INFO"
)

// CheckID identifies a specific quality check.
type CheckID string

const (
	CheckIDProductNameCollision CheckID = "product_name_collision"
	CheckIDOneToOneMapping      CheckID = "one_to_one_mapping"
	CheckIDLayerNameHeuristic   CheckID = "layer_name_heuristic"
	CheckIDMultiFileOverlap     CheckID = "multi_file_overlap"
	CheckIDL2Diversity          CheckID = "l2_diversity"
	CheckIDL3Distribution       CheckID = "l3_distribution"
)

// QualityWarning represents a single advisory warning from a quality check.
type QualityWarning struct {
	Check   CheckID      `json:"check"`
	Level   WarningLevel `json:"level"`
	Message string       `json:"message"`
	Details []string     `json:"details,omitempty"`
}

// CheckResult holds the result of a single quality check.
type CheckResult struct {
	Check    CheckID          `json:"check"`
	Score    int              `json:"score"`   // 0-100
	Skipped  bool             `json:"skipped"` // true if check couldn't run (e.g., missing portfolio)
	Reason   string           `json:"reason"`  // why it was skipped
	Warnings []QualityWarning `json:"warnings,omitempty"`
}

// QualityReport aggregates results from all quality checks.
type QualityReport struct {
	ModelsAnalyzed int              `json:"models_analyzed"`
	OverallScore   int              `json:"overall_score"` // 0-100 weighted average
	ScoreLevel     string           `json:"score_level"`   // "good", "warning", "alert"
	Checks         []CheckResult    `json:"checks"`
	Warnings       []QualityWarning `json:"warnings,omitempty"` // flattened from all checks
}

// FeatureContributions maps L2 component paths to the number of features
// contributing to them, and vice versa. Used by the 1:1 mapping check.
type FeatureContributions struct {
	// ComponentToFeatureCount maps normalized L2 value model paths to number of contributing features
	ComponentToFeatureCount map[string]int
	// FeatureToComponentCount maps feature IDs to number of L2 components they contribute to
	FeatureToComponentCount map[string]int
}

// PortfolioNames holds product/brand/offering names extracted from product_portfolio.yaml.
type PortfolioNames struct {
	ProductNames  []string
	BrandNames    []string
	OfferingNames []string
	AllNames      []string // union of all above, lowercased for matching
}

// portfolioYAML is a minimal struct for extracting names from product_portfolio.yaml.
type portfolioYAML struct {
	Portfolio struct {
		ProductLines []struct {
			Name          string `yaml:"name"`
			Codename      string `yaml:"codename"`
			KeyComponents []struct {
				Name string `yaml:"name"`
			} `yaml:"key_components"`
		} `yaml:"product_lines"`
		Brands []struct {
			Name string `yaml:"name"`
		} `yaml:"brands"`
		Offerings []struct {
			Name string `yaml:"name"`
		} `yaml:"offerings"`
	} `yaml:"portfolio"`
}

// LoadPortfolioNames extracts product, brand, and offering names from product_portfolio.yaml.
// Returns nil (not error) if the file doesn't exist — the check degrades gracefully.
func LoadPortfolioNames(instancePath string) (*PortfolioNames, error) {
	filePath := filepath.Join(instancePath, "READY", "product_portfolio.yaml")
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // graceful degradation
		}
		return nil, fmt.Errorf("failed to read product_portfolio.yaml: %w", err)
	}

	var raw portfolioYAML
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse product_portfolio.yaml: %w", err)
	}

	result := &PortfolioNames{}
	for _, pl := range raw.Portfolio.ProductLines {
		if pl.Name != "" {
			result.ProductNames = append(result.ProductNames, pl.Name)
		}
		if pl.Codename != "" {
			result.ProductNames = append(result.ProductNames, pl.Codename)
		}
		for _, kc := range pl.KeyComponents {
			if kc.Name != "" {
				result.ProductNames = append(result.ProductNames, kc.Name)
			}
		}
	}
	for _, b := range raw.Portfolio.Brands {
		if b.Name != "" {
			result.BrandNames = append(result.BrandNames, b.Name)
		}
	}
	for _, o := range raw.Portfolio.Offerings {
		if o.Name != "" {
			result.OfferingNames = append(result.OfferingNames, o.Name)
		}
	}

	// Build lowercased union for matching
	seen := make(map[string]bool)
	for _, names := range [][]string{result.ProductNames, result.BrandNames, result.OfferingNames} {
		for _, n := range names {
			lower := strings.ToLower(n)
			if !seen[lower] && len(lower) > 2 { // skip very short names to avoid false positives
				seen[lower] = true
				result.AllNames = append(result.AllNames, lower)
			}
		}
	}

	return result, nil
}

// CheckProductNameCollisions detects value model layer/component names that match
// product/brand names from the portfolio. This is the strongest signal of a
// product-catalog anti-pattern.
//
// Thresholds from spec: >30% of L1 names or >40% of L2 names matching → WARNING
func CheckProductNameCollisions(models *ValueModelSet, names *PortfolioNames) CheckResult {
	result := CheckResult{Check: CheckIDProductNameCollision, Score: 100}

	if names == nil || len(names.AllNames) == 0 {
		result.Skipped = true
		result.Reason = "product_portfolio.yaml not found or empty — product-name collision check skipped"
		return result
	}

	// Only check Product track value models (the anti-pattern is product-specific)
	productModel, ok := models.GetTrack(TrackProduct)
	if !ok {
		result.Skipped = true
		result.Reason = "No Product track value model found"
		return result
	}

	var l1Names, l2Names []string
	for _, layer := range productModel.Layers {
		l1Names = append(l1Names, layer.Name)
		for _, comp := range layer.Components {
			l2Names = append(l2Names, comp.Name)
		}
	}

	l1Matches := findNameCollisions(l1Names, names.AllNames)
	l2Matches := findNameCollisions(l2Names, names.AllNames)

	var l1Ratio, l2Ratio float64
	if len(l1Names) > 0 {
		l1Ratio = float64(len(l1Matches)) / float64(len(l1Names))
	}
	if len(l2Names) > 0 {
		l2Ratio = float64(len(l2Matches)) / float64(len(l2Names))
	}

	// Score: start at 100, deduct based on collision ratio
	if l1Ratio > 0 || l2Ratio > 0 {
		// Weight L1 collisions more heavily (layers are the top organizing principle)
		deduction := int((l1Ratio*60 + l2Ratio*40))
		result.Score = max(0, 100-deduction)
	}

	// Emit warnings based on thresholds
	if l1Ratio > 0.30 {
		details := make([]string, 0, len(l1Matches))
		for vmName, portfolioName := range l1Matches {
			details = append(details, fmt.Sprintf("L1 '%s' matches product/brand '%s'", vmName, portfolioName))
		}
		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDProductNameCollision,
			Level:   WarningLevelWarning,
			Message: fmt.Sprintf("%.0f%% of L1 layer names match product/brand names (threshold: 30%%). Value model may be organized as a product catalog.", l1Ratio*100),
			Details: details,
		})
	}

	if l2Ratio > 0.40 {
		details := make([]string, 0, len(l2Matches))
		for vmName, portfolioName := range l2Matches {
			details = append(details, fmt.Sprintf("L2 '%s' matches product/brand '%s'", vmName, portfolioName))
		}
		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDProductNameCollision,
			Level:   WarningLevelWarning,
			Message: fmt.Sprintf("%.0f%% of L2 component names match product/brand names (threshold: 40%%). L2 components should be functional classes, not products.", l2Ratio*100),
			Details: details,
		})
	}

	// Also emit info-level for any collision below threshold
	if len(l1Matches) > 0 && l1Ratio <= 0.30 {
		for vmName, portfolioName := range l1Matches {
			result.Warnings = append(result.Warnings, QualityWarning{
				Check:   CheckIDProductNameCollision,
				Level:   WarningLevelInfo,
				Message: fmt.Sprintf("L1 layer '%s' matches product/brand name '%s' — verify this is intentional", vmName, portfolioName),
			})
		}
	}
	if len(l2Matches) > 0 && l2Ratio <= 0.40 {
		for vmName, portfolioName := range l2Matches {
			result.Warnings = append(result.Warnings, QualityWarning{
				Check:   CheckIDProductNameCollision,
				Level:   WarningLevelInfo,
				Message: fmt.Sprintf("L2 component '%s' matches product/brand name '%s' — verify this is intentional", vmName, portfolioName),
			})
		}
	}

	return result
}

// findNameCollisions returns a map of value model names that match portfolio names.
// Matching is case-insensitive and supports partial matching (portfolio name appears
// as a substring in the value model name).
func findNameCollisions(vmNames []string, portfolioNames []string) map[string]string {
	matches := make(map[string]string)
	for _, vmName := range vmNames {
		vmLower := strings.ToLower(vmName)
		for _, pName := range portfolioNames {
			// Exact match (case-insensitive)
			if vmLower == pName {
				matches[vmName] = pName
				break
			}
			// Partial match: portfolio name is a significant substring of the VM name
			// Only match if the portfolio name is at least 4 chars to avoid noise
			if len(pName) >= 4 && strings.Contains(vmLower, pName) {
				matches[vmName] = pName
				break
			}
			// Reverse partial: VM name is a significant substring of portfolio name
			if len(vmLower) >= 4 && strings.Contains(pName, vmLower) {
				matches[vmName] = pName
				break
			}
		}
	}
	return matches
}

// CheckOneToOneMapping detects when the feature-to-component relationship is
// predominantly 1:1, which suggests a product-catalog structure.
//
// Thresholds from spec: >70% of components have exactly 1 feature AND
// >70% of features point to exactly 1 component → WARNING
func CheckOneToOneMapping(models *ValueModelSet, contributions *FeatureContributions) CheckResult {
	result := CheckResult{Check: CheckIDOneToOneMapping, Score: 100}

	if contributions == nil {
		result.Skipped = true
		result.Reason = "No feature contribution data available"
		return result
	}

	totalComponents := len(contributions.ComponentToFeatureCount)
	totalFeatures := len(contributions.FeatureToComponentCount)

	if totalComponents == 0 || totalFeatures == 0 {
		result.Skipped = true
		result.Reason = "No feature-to-component relationships found"
		return result
	}

	// Count components with exactly 1 contributing feature
	singleFeatureComponents := 0
	for _, count := range contributions.ComponentToFeatureCount {
		if count == 1 {
			singleFeatureComponents++
		}
	}

	// Count features pointing to exactly 1 component
	singleComponentFeatures := 0
	for _, count := range contributions.FeatureToComponentCount {
		if count == 1 {
			singleComponentFeatures++
		}
	}

	componentRatio := float64(singleFeatureComponents) / float64(totalComponents)
	featureRatio := float64(singleComponentFeatures) / float64(totalFeatures)

	// Score based on how far from 1:1 we are
	// Perfect many-to-many = 100, pure 1:1 = 0
	avgRatio := (componentRatio + featureRatio) / 2
	result.Score = max(0, 100-int(avgRatio*100))

	if componentRatio > 0.70 && featureRatio > 0.70 {
		result.Warnings = append(result.Warnings, QualityWarning{
			Check: CheckIDOneToOneMapping,
			Level: WarningLevelWarning,
			Message: fmt.Sprintf(
				"Value model has predominantly 1:1 feature mapping (%.0f%% of components have 1 feature, %.0f%% of features target 1 component). "+
					"This may indicate a product-catalog structure. Value delivery models typically have many-to-many relationships.",
				componentRatio*100, featureRatio*100),
			Details: []string{
				fmt.Sprintf("Components with single feature: %d/%d", singleFeatureComponents, totalComponents),
				fmt.Sprintf("Features with single target: %d/%d", singleComponentFeatures, totalFeatures),
			},
		})
	} else if componentRatio > 0.50 || featureRatio > 0.50 {
		result.Warnings = append(result.Warnings, QualityWarning{
			Check: CheckIDOneToOneMapping,
			Level: WarningLevelInfo,
			Message: fmt.Sprintf(
				"Feature-to-component mapping is moderately 1:1 (%.0f%% components with 1 feature, %.0f%% features with 1 target). "+
					"Consider whether more cross-cutting relationships exist.",
				componentRatio*100, featureRatio*100),
		})
	}

	return result
}

// positiveSignalWords are words that indicate value-delivery-stage thinking.
var positiveSignalWords = []string{
	"transformation", "processing", "delivery", "management",
	"exchange", "integration", "operations", "storage",
	"analytics", "orchestration", "distribution", "optimization",
	"synthesis", "acquisition", "generation", "monitoring",
	"circulation", "assembly", "connection", "service",
	"discovery", "creation", "intelligence", "automation",
	"governance", "engagement", "enablement", "coordination",
}

// CheckLayerNameHeuristics applies heuristic patterns to detect likely
// product/brand names vs value-delivery-category names.
func CheckLayerNameHeuristics(models *ValueModelSet) CheckResult {
	result := CheckResult{Check: CheckIDLayerNameHeuristic, Score: 100}

	productModel, ok := models.GetTrack(TrackProduct)
	if !ok {
		result.Skipped = true
		result.Reason = "No Product track value model found"
		return result
	}

	if len(productModel.Layers) == 0 {
		result.Skipped = true
		result.Reason = "Product value model has no layers"
		return result
	}

	totalNames := 0
	positiveCount := 0
	flaggedCount := 0
	var flaggedNames []string

	for _, layer := range productModel.Layers {
		totalNames++
		name := layer.Name

		if hasPositiveSignal(name) {
			positiveCount++
		}
		if looksLikeProductName(name) {
			flaggedCount++
			flaggedNames = append(flaggedNames, fmt.Sprintf("L1 '%s'", name))
		}

		for _, comp := range layer.Components {
			totalNames++
			compName := comp.Name

			if hasPositiveSignal(compName) {
				positiveCount++
			}
			if looksLikeProductName(compName) {
				flaggedCount++
				flaggedNames = append(flaggedNames, fmt.Sprintf("L2 '%s'", compName))
			}
		}
	}

	if totalNames == 0 {
		return result
	}

	positiveRatio := float64(positiveCount) / float64(totalNames)
	flaggedRatio := float64(flaggedCount) / float64(totalNames)

	// Score: reward positive signals, penalize flagged names
	result.Score = max(0, min(100, int(50+positiveRatio*50-flaggedRatio*50)))

	if flaggedCount > 0 {
		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDLayerNameHeuristic,
			Level:   WarningLevelInfo,
			Message: fmt.Sprintf("%d of %d layer/component names may be product/brand names rather than value delivery categories", flaggedCount, totalNames),
			Details: flaggedNames,
		})
	}

	return result
}

// hasPositiveSignal returns true if the name contains words associated with
// value-delivery-stage thinking.
func hasPositiveSignal(name string) bool {
	lower := strings.ToLower(name)
	for _, word := range positiveSignalWords {
		if strings.Contains(lower, word) {
			return true
		}
	}
	return false
}

// looksLikeProductName returns true if the name has characteristics of a
// product or brand name rather than a value delivery category.
func looksLikeProductName(name string) bool {
	// Skip empty or very short names
	if len(name) < 3 {
		return false
	}

	words := strings.Fields(name)

	// If it already has positive signals, don't flag it
	if hasPositiveSignal(name) {
		return false
	}

	// Check for likely proper nouns (capitalized words not in common vocab)
	properNounCount := 0
	for _, word := range words {
		if len(word) >= 3 && isLikelyProperNoun(word) {
			properNounCount++
		}
	}

	// If most words are likely proper nouns, it's probably a product name
	if len(words) > 0 && float64(properNounCount)/float64(len(words)) > 0.5 {
		return true
	}

	// Check for CamelCase/PascalCase words that look like brand names
	for _, word := range words {
		if hasMixedCase(word) && len(word) > 4 {
			return true
		}
	}

	return false
}

// commonWords that should not be flagged as proper nouns.
var commonWords = map[string]bool{
	"the": true, "and": true, "for": true, "with": true, "from": true,
	"core": true, "data": true, "user": true, "web": true, "app": true,
	"api": true, "system": true, "platform": true, "engine": true,
	"server": true, "client": true, "cloud": true, "local": true,
	"main": true, "base": true, "hub": true, "lab": true, "pro": true,
	"heat": true, "energy": true, "power": true, "fuel": true,
	"thermal": true, "carbon": true, "ocean": true, "air": true, "water": true,
	"value": true, "model": true, "service": true, "product": true,
}

// isLikelyProperNoun returns true if a word looks like it might be a proper noun
// (brand/product name) rather than a common English word.
func isLikelyProperNoun(word string) bool {
	lower := strings.ToLower(word)

	// Skip common words
	if commonWords[lower] {
		return false
	}

	// If it starts with uppercase and isn't the first word in context,
	// it might be a proper noun. But since we get names as standalone strings,
	// we check for unusual capitalization patterns.
	if hasMixedCase(word) {
		return true
	}

	return false
}

// hasMixedCase returns true if a word has internal uppercase letters
// (e.g., "IoCore", "FluxIt", "CarbonX") suggesting a brand name.
func hasMixedCase(word string) bool {
	if len(word) < 2 {
		return false
	}
	runes := []rune(word)
	for i := 1; i < len(runes); i++ {
		if unicode.IsUpper(runes[i]) && unicode.IsLower(runes[i-1]) {
			return true
		}
	}
	return false
}

// CheckMultiFileOverlap detects when multiple Product track value model files
// have overlapping layer purposes, suggesting they should be consolidated.
func CheckMultiFileOverlap(models *ValueModelSet) CheckResult {
	result := CheckResult{Check: CheckIDMultiFileOverlap, Score: 100}

	// Find all Product track files
	var productFiles []*ValueModel
	for _, model := range models.ByFile {
		if model.TrackName == TrackProduct {
			productFiles = append(productFiles, model)
		}
	}

	if len(productFiles) <= 1 {
		result.Skipped = true
		result.Reason = "Only one or zero Product value model files — no overlap possible"
		return result
	}

	// Check for overlapping layer names or descriptions across files
	type layerInfo struct {
		Name     string
		FilePath string
	}

	layersByName := make(map[string][]layerInfo)
	for _, model := range productFiles {
		for _, layer := range model.Layers {
			key := strings.ToLower(layer.Name)
			layersByName[key] = append(layersByName[key], layerInfo{
				Name:     layer.Name,
				FilePath: filepath.Base(model.FilePath),
			})
		}
	}

	// Find duplicate layer names across files
	var overlaps []string
	for _, layers := range layersByName {
		if len(layers) > 1 {
			files := make([]string, len(layers))
			for i, l := range layers {
				files[i] = l.FilePath
			}
			overlaps = append(overlaps, fmt.Sprintf("Layer '%s' appears in: %s", layers[0].Name, strings.Join(files, ", ")))
		}
	}

	// Check for keyword overlap in layer descriptions
	fileKeywords := make(map[string]map[string]bool)
	for _, model := range productFiles {
		base := filepath.Base(model.FilePath)
		keywords := make(map[string]bool)
		for _, layer := range model.Layers {
			for _, word := range extractKeywords(layer.Name + " " + layer.Description) {
				keywords[word] = true
			}
		}
		fileKeywords[base] = keywords
	}

	// Calculate pairwise keyword overlap
	fileNames := make([]string, 0, len(fileKeywords))
	for f := range fileKeywords {
		fileNames = append(fileNames, f)
	}
	for i := 0; i < len(fileNames); i++ {
		for j := i + 1; j < len(fileNames); j++ {
			overlap := keywordOverlap(fileKeywords[fileNames[i]], fileKeywords[fileNames[j]])
			if overlap > 0.50 {
				overlaps = append(overlaps, fmt.Sprintf("High keyword overlap (%.0f%%) between %s and %s", overlap*100, fileNames[i], fileNames[j]))
			}
		}
	}

	if len(overlaps) > 0 {
		// Deduct from score based on number of overlaps relative to files
		deduction := min(60, len(overlaps)*20)
		result.Score = max(0, 100-deduction)

		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDMultiFileOverlap,
			Level:   WarningLevelWarning,
			Message: fmt.Sprintf("Multiple Product value model files (%d) have overlapping value domains. Consider consolidating into fewer files organized by independent value delivery chains.", len(productFiles)),
			Details: overlaps,
		})
	}

	return result
}

// extractKeywords extracts significant words from a string for overlap analysis.
func extractKeywords(text string) []string {
	stopWords := map[string]bool{
		"the": true, "a": true, "an": true, "and": true, "or": true,
		"in": true, "of": true, "to": true, "for": true, "with": true,
		"is": true, "are": true, "was": true, "be": true, "has": true,
		"that": true, "this": true, "from": true, "by": true, "on": true,
		"at": true, "as": true, "it": true, "its": true, "not": true,
	}

	var keywords []string
	for _, word := range strings.Fields(strings.ToLower(text)) {
		// Remove non-alpha chars
		cleaned := strings.Map(func(r rune) rune {
			if unicode.IsLetter(r) {
				return r
			}
			return -1
		}, word)
		if len(cleaned) >= 3 && !stopWords[cleaned] {
			keywords = append(keywords, cleaned)
		}
	}
	return keywords
}

// keywordOverlap calculates the Jaccard similarity between two keyword sets.
func keywordOverlap(a, b map[string]bool) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}

	intersection := 0
	for word := range a {
		if b[word] {
			intersection++
		}
	}

	union := len(a) + len(b) - intersection
	if union == 0 {
		return 0
	}

	return float64(intersection) / float64(union)
}

// CheckL2Diversity checks that each L1 layer has sufficient L2 component diversity.
// A healthy value model has multiple L2 components per L1 layer — a layer with only
// one component may indicate a product-as-layer anti-pattern.
func CheckL2Diversity(models *ValueModelSet) CheckResult {
	result := CheckResult{Check: CheckIDL2Diversity, Score: 100}

	productModel, ok := models.GetTrack(TrackProduct)
	if !ok {
		result.Skipped = true
		result.Reason = "No Product track value model found"
		return result
	}

	if len(productModel.Layers) == 0 {
		result.Skipped = true
		result.Reason = "Product value model has no layers"
		return result
	}

	totalLayers := len(productModel.Layers)
	singleComponentLayers := 0
	var lowDiversityNames []string

	for _, layer := range productModel.Layers {
		count := len(layer.Components)
		if count <= 1 {
			singleComponentLayers++
			lowDiversityNames = append(lowDiversityNames, fmt.Sprintf("L1 '%s' has %d component(s)", layer.Name, count))
		}
	}

	singleRatio := float64(singleComponentLayers) / float64(totalLayers)

	// Score: start at 100, deduct based on ratio of low-diversity layers
	result.Score = max(0, 100-int(singleRatio*80))

	if singleRatio > 0.50 {
		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDL2Diversity,
			Level:   WarningLevelWarning,
			Message: fmt.Sprintf("%.0f%% of L1 layers have 1 or fewer L2 components. Low diversity may indicate layers modeled after individual products.", singleRatio*100),
			Details: lowDiversityNames,
		})
	} else if singleComponentLayers > 0 {
		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDL2Diversity,
			Level:   WarningLevelInfo,
			Message: fmt.Sprintf("%d of %d L1 layers have only 1 component — consider whether these can be expanded", singleComponentLayers, totalLayers),
			Details: lowDiversityNames,
		})
	}

	return result
}

// CheckL3Distribution checks that L3 sub-components are reasonably distributed
// across L2 components. Extreme concentration (one L2 has all the L3s while
// others have none) suggests the value model is structured around one product's
// features rather than balanced value delivery categories.
func CheckL3Distribution(models *ValueModelSet) CheckResult {
	result := CheckResult{Check: CheckIDL3Distribution, Score: 100}

	productModel, ok := models.GetTrack(TrackProduct)
	if !ok {
		result.Skipped = true
		result.Reason = "No Product track value model found"
		return result
	}

	// Collect L3 counts per L2 component
	var l3Counts []int
	var emptyL2s []string

	for _, layer := range productModel.Layers {
		for _, comp := range layer.Components {
			count := len(comp.SubComponents)
			l3Counts = append(l3Counts, count)
			if count == 0 {
				emptyL2s = append(emptyL2s, fmt.Sprintf("L2 '%s' in L1 '%s' has no sub-components", comp.Name, layer.Name))
			}
		}
	}

	if len(l3Counts) < 2 {
		result.Skipped = true
		result.Reason = "Fewer than 2 L2 components — distribution analysis not meaningful"
		return result
	}

	// Calculate coefficient of variation (CV) to measure distribution evenness
	total := 0
	maxCount := 0
	for _, c := range l3Counts {
		total += c
		if c > maxCount {
			maxCount = c
		}
	}

	if total == 0 {
		// No sub-components at all — not necessarily bad, just nothing to measure
		result.Skipped = true
		result.Reason = "No L3 sub-components defined yet"
		return result
	}

	mean := float64(total) / float64(len(l3Counts))

	// Calculate standard deviation
	sumSquaredDiff := 0.0
	for _, c := range l3Counts {
		diff := float64(c) - mean
		sumSquaredDiff += diff * diff
	}
	stddev := 0.0
	if len(l3Counts) > 1 {
		stddev = sqrt(sumSquaredDiff / float64(len(l3Counts)))
	}

	// CV (coefficient of variation) — higher means more uneven
	cv := 0.0
	if mean > 0 {
		cv = stddev / mean
	}

	// Score: CV of 0 = perfectly even = 100, CV of 2+ = very uneven = 0
	result.Score = max(0, 100-int(cv*50))

	emptyRatio := float64(len(emptyL2s)) / float64(len(l3Counts))

	if cv > 1.5 || emptyRatio > 0.50 {
		details := []string{
			fmt.Sprintf("L3 count range: %d to %d (mean: %.1f, CV: %.2f)", minSlice(l3Counts), maxCount, mean, cv),
		}
		details = append(details, emptyL2s...)
		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDL3Distribution,
			Level:   WarningLevelWarning,
			Message: fmt.Sprintf("L3 sub-components are unevenly distributed (CV=%.2f). This may indicate some L2 components are product feature dumps while others are hollow.", cv),
			Details: details,
		})
	} else if cv > 0.8 {
		result.Warnings = append(result.Warnings, QualityWarning{
			Check:   CheckIDL3Distribution,
			Level:   WarningLevelInfo,
			Message: fmt.Sprintf("L3 distribution is moderately uneven (CV=%.2f). Consider whether all L2 components have appropriate sub-component granularity.", cv),
		})
	}

	return result
}

// sqrt computes the square root using Newton's method.
// Avoids importing math for a single function.
func sqrt(x float64) float64 {
	if x <= 0 {
		return 0
	}
	z := x
	for i := 0; i < 20; i++ {
		z = z - (z*z-x)/(2*z)
	}
	return z
}

// minSlice returns the minimum value in a slice of ints.
func minSlice(vals []int) int {
	if len(vals) == 0 {
		return 0
	}
	m := vals[0]
	for _, v := range vals[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

// AssessQuality runs all quality checks and produces a QualityReport.
// Parameters:
//   - models: loaded value model set (required)
//   - portfolioNames: from LoadPortfolioNames (nil if portfolio doesn't exist)
//   - contributions: feature contribution data (nil to skip 1:1 check)
func AssessQuality(models *ValueModelSet, portfolioNames *PortfolioNames, contributions *FeatureContributions) *QualityReport {
	report := &QualityReport{}

	// Count analyzed models
	report.ModelsAnalyzed = len(models.ByFile)
	if report.ModelsAnalyzed == 0 {
		return report
	}

	// Run all checks
	checks := []CheckResult{
		CheckProductNameCollisions(models, portfolioNames),
		CheckOneToOneMapping(models, contributions),
		CheckLayerNameHeuristics(models),
		CheckMultiFileOverlap(models),
		CheckL2Diversity(models),
		CheckL3Distribution(models),
	}

	report.Checks = checks

	// Flatten all warnings
	for _, check := range checks {
		report.Warnings = append(report.Warnings, check.Warnings...)
	}

	// Calculate weighted overall score
	// Weights from spec: collision 30%, mapping 20%, names 20%, diversity 15%, distribution 15%
	// Multi-file overlap is informational — its warnings appear but don't affect the overall score.
	type weightedCheck struct {
		weight float64
		score  int
		active bool
	}
	weighted := []weightedCheck{
		{0.30, checks[0].Score, !checks[0].Skipped}, // product-name collision
		{0.20, checks[1].Score, !checks[1].Skipped}, // 1:1 mapping
		{0.20, checks[2].Score, !checks[2].Skipped}, // layer name heuristic
		{0.00, checks[3].Score, false},              // multi-file overlap (informational)
		{0.15, checks[4].Score, !checks[4].Skipped}, // L2 diversity
		{0.15, checks[5].Score, !checks[5].Skipped}, // L3 distribution
	}

	totalWeight := 0.0
	weightedSum := 0.0
	for _, w := range weighted {
		if w.active {
			totalWeight += w.weight
			weightedSum += w.weight * float64(w.score)
		}
	}

	if totalWeight > 0 {
		report.OverallScore = int(weightedSum / totalWeight)
	} else {
		report.OverallScore = 100 // All checks skipped — no negative signal
	}

	// Determine score level
	switch {
	case report.OverallScore >= 80:
		report.ScoreLevel = "good"
	case report.OverallScore >= 60:
		report.ScoreLevel = "warning"
	default:
		report.ScoreLevel = "alert"
	}

	return report
}
