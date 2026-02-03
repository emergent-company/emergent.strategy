// Package checks - Version alignment validation
package checks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// VersionAlignmentChecker validates artifact versions against schema versions
type VersionAlignmentChecker struct {
	instancePath string
	schemasPath  string
}

// NewVersionAlignmentChecker creates a new version alignment checker
func NewVersionAlignmentChecker(instancePath string, schemasPath string) *VersionAlignmentChecker {
	return &VersionAlignmentChecker{
		instancePath: instancePath,
		schemasPath:  schemasPath,
	}
}

// VersionAlignmentResult contains the result of version alignment check
type VersionAlignmentResult struct {
	Path                  string             `json:"path"`
	TotalArtifacts        int                `json:"total_artifacts"`
	ArtifactsWithVersions int                `json:"artifacts_with_versions"`
	CurrentArtifacts      int                `json:"current_artifacts"`
	StaleArtifacts        int                `json:"stale_artifacts"`
	OutdatedArtifacts     int                `json:"outdated_artifacts"`
	AlignmentPercentage   int                `json:"alignment_percentage"`
	Results               []*ArtifactVersion `json:"results,omitempty"`
	Recommendations       []string           `json:"recommendations"`
}

// ArtifactVersion contains version info for a single artifact
type ArtifactVersion struct {
	File            string `json:"file"`
	ArtifactType    string `json:"artifact_type"`
	ArtifactVersion string `json:"artifact_version"`
	SchemaVersion   string `json:"schema_version"`
	Status          string `json:"status"` // CURRENT, BEHIND, STALE, OUTDATED, UNKNOWN
	Message         string `json:"message,omitempty"`
}

// Version gap severity levels
const (
	VersionCurrent  = "CURRENT"
	VersionBehind   = "BEHIND"   // 1-2 minor versions behind
	VersionStale    = "STALE"    // 3+ minor versions behind
	VersionOutdated = "OUTDATED" // Major version behind
	VersionUnknown  = "UNKNOWN"
)

// Regex to extract version from EPF header comment
var epfVersionHeaderRegex = regexp.MustCompile(`(?m)^#\s*EPF\s+v?(\d+\.\d+\.\d+)`)

// Check runs the version alignment check
func (c *VersionAlignmentChecker) Check() (*VersionAlignmentResult, error) {
	result := &VersionAlignmentResult{
		Path:            c.instancePath,
		Results:         make([]*ArtifactVersion, 0),
		Recommendations: make([]string, 0),
	}

	// Analyze READY phase
	readyPath := filepath.Join(c.instancePath, "READY")
	if _, err := os.Stat(readyPath); err == nil {
		c.analyzeDirectory(readyPath, result)
	}

	// Analyze FIRE phase - feature definitions
	fireFdPath := filepath.Join(c.instancePath, "FIRE", "feature_definitions")
	if _, err := os.Stat(fireFdPath); err == nil {
		c.analyzeDirectory(fireFdPath, result)
	}

	// Analyze FIRE phase - value models
	fireVmPath := filepath.Join(c.instancePath, "FIRE", "value_models")
	if _, err := os.Stat(fireVmPath); err == nil {
		c.analyzeDirectory(fireVmPath, result)
	}

	// Calculate alignment percentage
	if result.ArtifactsWithVersions > 0 {
		result.AlignmentPercentage = (result.CurrentArtifacts * 100) / result.ArtifactsWithVersions
	}

	// Generate recommendations
	c.generateRecommendations(result)

	return result, nil
}

func (c *VersionAlignmentChecker) analyzeDirectory(dirPath string, result *VersionAlignmentResult) {
	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}

		base := filepath.Base(path)
		if strings.HasPrefix(base, "_") {
			return nil
		}

		artifactVersion := c.analyzeArtifact(path)
		if artifactVersion != nil {
			result.Results = append(result.Results, artifactVersion)
			result.TotalArtifacts++

			if artifactVersion.ArtifactVersion != "unknown" {
				result.ArtifactsWithVersions++

				switch artifactVersion.Status {
				case VersionCurrent, VersionBehind:
					result.CurrentArtifacts++
				case VersionStale:
					result.StaleArtifacts++
				case VersionOutdated:
					result.OutdatedArtifacts++
				}
			}
		}

		return nil
	})
}

func (c *VersionAlignmentChecker) analyzeArtifact(path string) *ArtifactVersion {
	artifactType := c.detectArtifactType(path)
	if artifactType == "" {
		return nil
	}

	result := &ArtifactVersion{
		File:         path,
		ArtifactType: artifactType,
	}

	// Extract artifact version
	result.ArtifactVersion = c.extractArtifactVersion(path)

	// Get schema version
	result.SchemaVersion = c.getSchemaVersion(artifactType)

	// Calculate status
	result.Status = c.calculateVersionStatus(result.ArtifactVersion, result.SchemaVersion)

	// Generate message
	switch result.Status {
	case VersionOutdated:
		result.Message = "Major version behind - migration may be required"
	case VersionStale:
		result.Message = "3+ minor versions behind - new fields available"
	case VersionBehind:
		result.Message = "Slightly behind - consider updating"
	case VersionUnknown:
		result.Message = "No version info found"
	}

	return result
}

func (c *VersionAlignmentChecker) detectArtifactType(path string) string {
	base := filepath.Base(path)
	normalizedPath := filepath.ToSlash(path)

	switch {
	case strings.Contains(base, "north_star"):
		return "north_star"
	case strings.Contains(base, "insight_analyses"):
		return "insight_analyses"
	case strings.Contains(base, "strategy_foundations"):
		return "strategy_foundations"
	case strings.Contains(base, "insight_opportunity"):
		return "insight_opportunity"
	case strings.Contains(base, "strategy_formula"):
		return "strategy_formula"
	case strings.Contains(base, "roadmap_recipe"):
		return "roadmap_recipe"
	case strings.HasPrefix(base, "fd-") || strings.Contains(normalizedPath, "feature_definitions"):
		return "feature_definition"
	case strings.Contains(base, ".value_model.") || strings.Contains(normalizedPath, "value_models"):
		return "value_model"
	default:
		return ""
	}
}

func (c *VersionAlignmentChecker) extractArtifactVersion(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return "unknown"
	}

	content := string(data)

	// Try header comment first: # EPF v1.9.6
	matches := epfVersionHeaderRegex.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1]
	}

	// Try parsing YAML to get meta.epf_version
	var artifact map[string]interface{}
	if err := yaml.Unmarshal(data, &artifact); err != nil {
		return "unknown"
	}

	// Check meta.epf_version
	if meta, ok := artifact["meta"].(map[string]interface{}); ok {
		if version, ok := meta["epf_version"].(string); ok {
			return version
		}
	}

	// Check top-level epf_version
	if version, ok := artifact["epf_version"].(string); ok {
		return version
	}

	// Check template_version in roadmap
	if roadmap, ok := artifact["roadmap"].(map[string]interface{}); ok {
		if version, ok := roadmap["template_version"].(string); ok {
			return version
		}
	}

	return "unknown"
}

func (c *VersionAlignmentChecker) getSchemaVersion(artifactType string) string {
	if c.schemasPath == "" {
		return "unknown"
	}

	schemaFile := c.schemaFilename(artifactType)
	if schemaFile == "" {
		return "unknown"
	}

	schemaPath := filepath.Join(c.schemasPath, schemaFile)
	data, err := os.ReadFile(schemaPath)
	if err != nil {
		return "unknown"
	}

	var schema map[string]interface{}
	if err := json.Unmarshal(data, &schema); err != nil {
		return "unknown"
	}

	if version, ok := schema["version"].(string); ok {
		return version
	}

	return "unknown"
}

func (c *VersionAlignmentChecker) schemaFilename(artifactType string) string {
	mapping := map[string]string{
		"north_star":           "north_star_schema.json",
		"insight_analyses":     "insight_analyses_schema.json",
		"strategy_foundations": "strategy_foundations_schema.json",
		"insight_opportunity":  "insight_opportunity_schema.json",
		"strategy_formula":     "strategy_formula_schema.json",
		"roadmap_recipe":       "roadmap_recipe_schema.json",
		"feature_definition":   "feature_definition_schema.json",
		"value_model":          "value_model_schema.json",
	}
	return mapping[artifactType]
}

func (c *VersionAlignmentChecker) calculateVersionStatus(artifactVersion, schemaVersion string) string {
	if artifactVersion == "unknown" || schemaVersion == "unknown" {
		return VersionUnknown
	}

	if artifactVersion == schemaVersion {
		return VersionCurrent
	}

	// Parse versions
	aMajor, aMinor, _ := parseVersion(artifactVersion)
	sMajor, sMinor, _ := parseVersion(schemaVersion)

	// Major version difference
	if sMajor > aMajor {
		return VersionOutdated
	}

	// Minor version difference
	minorDiff := sMinor - aMinor
	if minorDiff >= 3 {
		return VersionStale
	} else if minorDiff > 0 {
		return VersionBehind
	}

	return VersionCurrent
}

func parseVersion(version string) (major, minor, patch int) {
	parts := strings.Split(version, ".")
	if len(parts) >= 1 {
		major, _ = strconv.Atoi(parts[0])
	}
	if len(parts) >= 2 {
		minor, _ = strconv.Atoi(parts[1])
	}
	if len(parts) >= 3 {
		patch, _ = strconv.Atoi(parts[2])
	}
	return
}

func (c *VersionAlignmentChecker) generateRecommendations(result *VersionAlignmentResult) {
	if result.OutdatedArtifacts > 0 {
		result.Recommendations = append(result.Recommendations,
			fmt.Sprintf("URGENT: %d artifact(s) are major versions behind - migration may be required", result.OutdatedArtifacts))
	}

	if result.StaleArtifacts > 0 {
		result.Recommendations = append(result.Recommendations,
			fmt.Sprintf("Review %d stale artifact(s) - new fields available for enrichment", result.StaleArtifacts))
	}

	if result.ArtifactsWithVersions == 0 && result.TotalArtifacts > 0 {
		result.Recommendations = append(result.Recommendations,
			"Add version headers (# EPF v2.3.2) or meta.epf_version fields to track alignment")
	}
}

// HasOutdatedArtifacts returns true if there are artifacts with major version gaps
func (r *VersionAlignmentResult) HasOutdatedArtifacts() bool {
	return r.OutdatedArtifacts > 0
}

// HasStaleArtifacts returns true if there are stale artifacts (3+ minor versions behind)
func (r *VersionAlignmentResult) HasStaleArtifacts() bool {
	return r.StaleArtifacts > 0
}

// IsPassed returns true if alignment is acceptable (>=70%)
func (r *VersionAlignmentResult) IsPassed() bool {
	return r.AlignmentPercentage >= 70
}
