// Package checks - Cross-reference validation
package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// CrossReferenceChecker validates cross-references between features
type CrossReferenceChecker struct {
	path string
}

// NewCrossReferenceChecker creates a new cross-reference checker
func NewCrossReferenceChecker(path string) *CrossReferenceChecker {
	return &CrossReferenceChecker{path: path}
}

// CrossReferenceResult contains the cross-reference validation result
type CrossReferenceResult struct {
	Path            string       `json:"path"`
	TotalFeatures   int          `json:"total_features"`
	TotalReferences int          `json:"total_references"`
	ValidReferences int          `json:"valid_references"`
	BrokenLinks     []BrokenLink `json:"broken_links"`
	FeatureIDs      []string     `json:"feature_ids"`
}

// BrokenLink represents a broken cross-reference
type BrokenLink struct {
	SourceFile      string `json:"source_file"`
	SourceFeatureID string `json:"source_feature_id"`
	ReferenceType   string `json:"reference_type"` // requires, enables, based_on
	TargetID        string `json:"target_id"`
	Message         string `json:"message"`
}

// Check validates cross-references in feature definitions
func (c *CrossReferenceChecker) Check() (*CrossReferenceResult, error) {
	result := &CrossReferenceResult{
		Path:        c.path,
		BrokenLinks: make([]BrokenLink, 0),
		FeatureIDs:  make([]string, 0),
	}

	// First pass: collect all feature IDs
	featureRegistry := make(map[string]string) // id -> file path

	err := filepath.Walk(c.path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}

		// Only check YAML files
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}

		// Skip files starting with _
		base := filepath.Base(path)
		if strings.HasPrefix(base, "_") {
			return nil
		}

		// Check if it's a feature definition
		if !strings.HasPrefix(base, "fd-") && !strings.Contains(path, "feature_definitions") {
			return nil
		}

		// Read and parse
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		var feature map[string]interface{}
		if err := yaml.Unmarshal(data, &feature); err != nil {
			return nil
		}

		// Extract feature ID
		if id, ok := feature["id"].(string); ok && id != "" {
			featureRegistry[id] = path
			result.FeatureIDs = append(result.FeatureIDs, id)
			result.TotalFeatures++
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Second pass: validate references
	err = filepath.Walk(c.path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
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

		if !strings.HasPrefix(base, "fd-") && !strings.Contains(path, "feature_definitions") {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		var feature map[string]interface{}
		if err := yaml.Unmarshal(data, &feature); err != nil {
			return nil
		}

		sourceID, _ := feature["id"].(string)

		// Check dependencies
		c.checkDependencyRefs(path, sourceID, feature, featureRegistry, result)

		return nil
	})

	if err != nil {
		return nil, err
	}

	return result, nil
}

func (c *CrossReferenceChecker) checkDependencyRefs(
	path string,
	sourceID string,
	feature map[string]interface{},
	registry map[string]string,
	result *CrossReferenceResult,
) {
	deps, ok := feature["dependencies"].(map[string]interface{})
	if !ok {
		return
	}

	// Check requires
	c.checkRefArray(path, sourceID, deps, "requires", registry, result)

	// Check enables
	c.checkRefArray(path, sourceID, deps, "enables", registry, result)

	// Check based_on
	c.checkRefArray(path, sourceID, deps, "based_on", registry, result)
}

func (c *CrossReferenceChecker) checkRefArray(
	path string,
	sourceID string,
	deps map[string]interface{},
	refType string,
	registry map[string]string,
	result *CrossReferenceResult,
) {
	refs, ok := deps[refType].([]interface{})
	if !ok {
		return
	}

	for _, r := range refs {
		result.TotalReferences++

		var targetID string

		// Handle both string IDs and object with id field
		switch v := r.(type) {
		case string:
			targetID = v
		case map[string]interface{}:
			if id, ok := v["id"].(string); ok {
				targetID = id
			} else if id, ok := v["feature_id"].(string); ok {
				targetID = id
			}
		}

		if targetID == "" {
			continue
		}

		// Check if target exists
		if _, exists := registry[targetID]; exists {
			result.ValidReferences++
		} else {
			result.BrokenLinks = append(result.BrokenLinks, BrokenLink{
				SourceFile:      path,
				SourceFeatureID: sourceID,
				ReferenceType:   refType,
				TargetID:        targetID,
				Message:         fmt.Sprintf("Feature '%s' not found in registry", targetID),
			})
		}
	}
}

// IsPassed returns true if there are no broken links
func (r *CrossReferenceResult) IsPassed() bool {
	return len(r.BrokenLinks) == 0
}
