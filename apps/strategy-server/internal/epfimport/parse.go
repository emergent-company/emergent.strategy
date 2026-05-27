// Package epfimport provides shared YAML parsing logic for EPF instances.
// It converts EPF YAML files into the artifact payload map used by the import
// and reimport pipelines. Accepts either a filesystem path or a pre-loaded
// filename→content map, so the same pipeline works for both CLI local import
// and GitHub remote import.
package epfimport

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ParseFiles accepts a map of relative path → file contents (as bytes) and
// returns the same artifact payload map that scanEPFInstance produces.
// productName is extracted from _meta.yaml/_epf.yaml if present.
func ParseFiles(files map[string][]byte) (payloads map[string]any, productName string, err error) {
	payloads = make(map[string]any, len(files))

	for relPath, data := range files {
		filename := filepath.Base(relPath)
		name, raw, skip, parseErr := processYAMLBytes(data, filename, relPath, &productName)
		if parseErr != nil {
			return nil, "", parseErr
		}
		if skip {
			continue
		}
		payloads[name] = raw
	}

	return payloads, productName, nil
}

// ScanDirectory walks an EPF instance directory on the local filesystem and
// returns a payload map. This is the filesystem variant used by the CLI import.
func ScanDirectory(instancePath string) (payloads map[string]any, productName string, err error) {
	abs, err := filepath.Abs(instancePath)
	if err != nil {
		return nil, "", fmt.Errorf("resolve absolute path %q: %w", instancePath, err)
	}

	files := make(map[string][]byte)

	walkErr := filepath.WalkDir(abs, func(path string, d os.DirEntry, walkErrIn error) error {
		if walkErrIn != nil {
			return walkErrIn
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".yaml") && !strings.HasSuffix(d.Name(), ".yml") {
			return nil
		}

		rel, relErr := filepath.Rel(abs, path)
		if relErr != nil {
			rel = path
		}
		rel = filepath.ToSlash(rel)

		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return fmt.Errorf("read %s: %w", path, readErr)
		}
		files[rel] = data
		return nil
	})
	if walkErr != nil {
		return nil, "", walkErr
	}

	return ParseFiles(files)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// processYAMLBytes parses a single YAML file's content and returns its
// artifact key and payload. Returns skip=true for metadata files or
// unparseable content.
func processYAMLBytes(data []byte, filename, relPath string, productName *string) (string, map[string]any, bool, error) {
	var rawAny any
	if err := yaml.Unmarshal(data, &rawAny); err != nil {
		slog.Warn("skip unparseable YAML file", "path", relPath, "err", err)
		return "", nil, true, nil
	}
	normalized := normalizeYAML(rawAny)
	raw, ok := normalized.(map[string]any)
	if !ok || len(raw) == 0 {
		return "", nil, true, nil
	}

	// Extract product name from metadata files; do not store them as artifacts.
	if filename == "_meta.yaml" || filename == "_epf.yaml" {
		if name, ok := extractProductName(raw); ok && *productName == "" {
			*productName = name
		}
		return "", nil, true, nil
	}

	key := ArtifactKey(relPath, filename)
	return key, raw, false, nil
}

// ArtifactKey derives a stable artifact key from the file's path and name.
// Well-known READY phase filenames are normalised; FIRE feature definitions use
// their fd-* ID; everything else uses the slash-separated relative path.
func ArtifactKey(relPath, name string) string {
	// Strip extension.
	base := strings.TrimSuffix(name, filepath.Ext(name))

	switch base {
	case "00_north_star", "north_star":
		return "north_star"
	case "01_insight_analyses", "insight_analyses":
		return "insight_analyses"
	case "02_strategy_foundations", "strategy_foundations":
		return "strategy_foundations"
	case "03_insight_opportunity", "insight_opportunity":
		return "insight_opportunity"
	case "04_strategy_formula", "strategy_formula":
		return "strategy_formula"
	case "05_roadmap_recipe", "roadmap_recipe":
		return "roadmap_recipe"
	case "assessment_report":
		return "assessment_report"
	case "calibration_memo":
		return "calibration_memo"
	case "mappings":
		return "mappings"
	}

	// Feature definitions: fd-NNN.yaml → fd-NNN
	if strings.HasPrefix(base, "fd-") {
		return base
	}

	// Value models: use track name from path segment
	if strings.Contains(relPath, "value_models/") {
		return "value_model_" + base
	}

	// Default: slash path without extension
	ext := filepath.Ext(relPath)
	return strings.TrimSuffix(relPath, ext)
}

// normalizeYAML recursively converts yaml.v3 map[interface{}]interface{} values
// into map[string]any so they can be JSON-marshalled without error.
func normalizeYAML(v any) any {
	switch val := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[k] = normalizeYAML(vv)
		}
		return out
	case map[interface{}]interface{}:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[fmt.Sprintf("%v", k)] = normalizeYAML(vv)
		}
		return out
	case []any:
		for i, item := range val {
			val[i] = normalizeYAML(item)
		}
		return val
	default:
		return val
	}
}

// extractProductName pulls the product name from a _meta.yaml or _epf.yaml map.
func extractProductName(raw map[string]any) (string, bool) {
	for _, key := range []string{"product_name", "product", "name"} {
		if v, ok := raw[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s, true
			}
		}
	}
	return "", false
}
