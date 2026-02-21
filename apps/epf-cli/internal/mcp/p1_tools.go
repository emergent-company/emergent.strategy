// Package mcp — P1 high-impact new tools for the EPF MCP server.
// Implements: epf_list_features, epf_batch_validate, epf_rename_value_path,
// epf_update_kr, epf_add_value_model_component, epf_add_value_model_sub.
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/checks"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/strategy"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

// ──────────────────────────────────────────────────────────────────────────────
// Task 2.1 — epf_list_features
// ──────────────────────────────────────────────────────────────────────────────

// FeatureListEntry is a single row in the feature listing table.
type FeatureListEntry struct {
	ID              string   `json:"id"`
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	Status          string   `json:"status"`
	PersonaCount    int      `json:"persona_count"`
	ScenarioCount   int      `json:"scenario_count"`
	ContributesTo   []string `json:"contributes_to"`
	MissingSections []string `json:"missing_sections,omitempty"`
	QualityScore    *int     `json:"quality_score,omitempty"`
}

func (s *Server) handleListFeatures(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil || instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	includeQualityStr, _ := request.RequireString("include_quality")
	includeQuality := includeQualityStr != "false" // default true

	// Load strategy store for feature data
	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy data: %v", err)), nil
	}

	model := store.GetModel()
	if model == nil {
		return mcp.NewToolResultError("Strategy model is empty"), nil
	}

	// Optionally run quality checker
	var qualityResults map[string]int // featureID -> score
	if includeQuality {
		fdDir := filepath.Join(instancePath, "FIRE", "definitions", "product")
		if _, statErr := os.Stat(fdDir); statErr == nil {
			checker := checks.NewFeatureQualityChecker(fdDir)
			summary, qErr := checker.Check()
			if qErr == nil && summary != nil {
				qualityResults = make(map[string]int)
				for _, r := range summary.Results {
					qualityResults[r.FeatureID] = r.Score
				}
			}
		}
	}

	// Build entry list
	entries := make([]FeatureListEntry, 0, len(model.Features))
	for _, feat := range model.Features {
		entry := FeatureListEntry{
			ID:            feat.ID,
			Slug:          feat.Slug,
			Name:          feat.Name,
			Status:        feat.Status,
			PersonaCount:  len(feat.Definition.Personas),
			ContributesTo: feat.StrategicContext.ContributesTo,
		}

		// Count scenarios from the raw YAML file (not in the strategy model)
		entry.ScenarioCount = countScenariosFromFile(instancePath, feat.ID, feat.Slug)

		// Check missing optional sections from raw YAML
		entry.MissingSections = checkMissingSections(instancePath, feat.ID, feat.Slug)

		if includeQuality && qualityResults != nil {
			if score, ok := qualityResults[feat.ID]; ok {
				entry.QualityScore = &score
			}
		}

		entries = append(entries, entry)
	}

	// Sort by ID for deterministic output
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].ID < entries[j].ID
	})

	result := map[string]interface{}{
		"success":        true,
		"instance_path":  instancePath,
		"total_features": len(entries),
		"features":       entries,
	}

	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// countScenariosFromFile reads a feature file and counts scenarios.
func countScenariosFromFile(instancePath, featureID, slug string) int {
	path := findFeatureFilePath(instancePath, featureID, slug)
	if path == "" {
		return 0
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return 0
	}

	// Check multiple locations for scenarios
	if scenarios, ok := raw["scenarios"].([]interface{}); ok {
		return len(scenarios)
	}
	if def, ok := raw["definition"].(map[string]interface{}); ok {
		if scenarios, ok := def["scenarios"].([]interface{}); ok {
			return len(scenarios)
		}
	}
	if impl, ok := raw["implementation"].(map[string]interface{}); ok {
		if scenarios, ok := impl["scenarios"].([]interface{}); ok {
			return len(scenarios)
		}
	}
	return 0
}

// checkMissingSections checks which optional sections are missing from a feature file.
func checkMissingSections(instancePath, featureID, slug string) []string {
	path := findFeatureFilePath(instancePath, featureID, slug)
	if path == "" {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil
	}

	var missing []string

	// Check scenarios
	hasScenarios := false
	if _, ok := raw["scenarios"].([]interface{}); ok {
		hasScenarios = true
	}
	if def, ok := raw["definition"].(map[string]interface{}); ok {
		if _, ok := def["scenarios"].([]interface{}); ok {
			hasScenarios = true
		}
	}
	if impl, ok := raw["implementation"].(map[string]interface{}); ok {
		if _, ok := impl["scenarios"].([]interface{}); ok {
			hasScenarios = true
		}
	}
	if !hasScenarios {
		missing = append(missing, "scenarios")
	}

	// Check implementation.contexts
	hasContexts := false
	if impl, ok := raw["implementation"].(map[string]interface{}); ok {
		if ctxs, ok := impl["contexts"].([]interface{}); ok && len(ctxs) > 0 {
			hasContexts = true
		}
	}
	if !hasContexts {
		missing = append(missing, "implementation.contexts")
	}

	// Check problem_statement
	if def, ok := raw["definition"].(map[string]interface{}); ok {
		if _, ok := def["problem_statement"].(string); !ok {
			missing = append(missing, "problem_statement")
		}
	}

	// Check success_metrics baselines
	if sm, ok := raw["success_metrics"].(map[string]interface{}); ok {
		if metrics, ok := sm["metrics"].([]interface{}); ok {
			for _, m := range metrics {
				if metric, ok := m.(map[string]interface{}); ok {
					if _, ok := metric["baseline"]; !ok {
						missing = append(missing, "success_metrics.baselines")
						break
					}
				}
			}
		}
	} else {
		missing = append(missing, "success_metrics")
	}

	return missing
}

// findFeatureFilePath locates a feature definition file by ID or slug.
func findFeatureFilePath(instancePath, featureID, slug string) string {
	fdDir := filepath.Join(instancePath, "FIRE", "definitions", "product")
	entries, err := os.ReadDir(fdDir)
	if err != nil {
		return ""
	}

	for _, e := range entries {
		if e.IsDir() || (!strings.HasSuffix(e.Name(), ".yaml") && !strings.HasSuffix(e.Name(), ".yml")) {
			continue
		}

		path := filepath.Join(fdDir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var feat struct {
			ID   string `yaml:"id"`
			Slug string `yaml:"slug"`
		}
		if err := yaml.Unmarshal(data, &feat); err != nil {
			continue
		}

		if feat.ID == featureID || feat.Slug == slug {
			return path
		}
	}
	return ""
}

// ──────────────────────────────────────────────────────────────────────────────
// Task 2.6 — epf_batch_validate
// ──────────────────────────────────────────────────────────────────────────────

// BatchValidateFileResult holds validation results for a single file.
type BatchValidateFileResult struct {
	File       string `json:"file"`
	ErrorCount int    `json:"error_count"`
	Passed     bool   `json:"passed"`
}

// artifactTypeDirMap maps artifact types to their standard subdirectories within
// an EPF instance. Types not listed here are matched by auto-detection during a
// full-instance scan.
var artifactTypeDirMap = map[string][]string{
	"feature_definition":        {"FIRE/definitions/product"},
	"value_model":               {"FIRE/value_models"},
	"workflow":                  {"FIRE/workflows"},
	"mappings":                  {"FIRE"},
	"north_star":                {"READY"},
	"insight_analyses":          {"READY"},
	"strategy_foundations":      {"READY"},
	"insight_opportunity":       {"READY"},
	"strategy_formula":          {"READY"},
	"roadmap_recipe":            {"READY"},
	"product_portfolio":         {"READY"},
	"assessment_report":         {"AIM"},
	"calibration_memo":          {"AIM"},
	"strategic_reality_check":   {"AIM"},
	"living_reality_assessment": {"AIM"},
	"strategy_definition":       {"FIRE/definitions/strategy"},
	"org_ops_definition":        {"FIRE/definitions/org_ops"},
	"commercial_definition":     {"FIRE/definitions/commercial"},
}

func (s *Server) handleBatchValidate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil || instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	artifactType, _ := request.RequireString("artifact_type")
	if artifactType == "" {
		artifactType = "all"
	}

	// Determine directories to scan
	var searchDirs []string
	if artifactType == "all" {
		searchDirs = []string{instancePath}
	} else if dirs, ok := artifactTypeDirMap[artifactType]; ok {
		for _, d := range dirs {
			searchDirs = append(searchDirs, filepath.Join(instancePath, d))
		}
	} else {
		// Unknown type — scan everything but filter by detected type
		searchDirs = []string{instancePath}
	}

	// Verify at least one search directory exists
	var validDirs []string
	for _, dir := range searchDirs {
		if _, statErr := os.Stat(dir); statErr == nil {
			validDirs = append(validDirs, dir)
		}
	}
	if len(validDirs) == 0 {
		return mcp.NewToolResultError(fmt.Sprintf("No matching directories found for artifact_type=%q in %s", artifactType, instancePath)), nil
	}

	// Collect YAML files from all search directories
	seen := map[string]bool{}
	var yamlFiles []string
	for _, dir := range validDirs {
		_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			if (strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml")) &&
				!strings.HasPrefix(filepath.Base(path), "_") &&
				!seen[path] {
				seen[path] = true
				yamlFiles = append(yamlFiles, path)
			}
			return nil
		})
	}

	// When a specific (non-"all") type is requested, filter files by detected type
	filterByType := artifactType != "all"
	loader := s.validator.GetLoader()

	// Validate each file
	var results []BatchValidateFileResult
	totalErrors := 0
	passedCount := 0
	skippedCount := 0

	for _, path := range yamlFiles {
		// Type filtering: skip files whose detected type doesn't match
		if filterByType {
			detected, detectErr := loader.DetectArtifactType(path)
			if detectErr != nil || string(detected) != artifactType {
				skippedCount++
				continue
			}
		}

		vr, valErr := s.validator.ValidateFile(path)
		if valErr != nil {
			results = append(results, BatchValidateFileResult{
				File:       path,
				ErrorCount: 1,
				Passed:     false,
			})
			totalErrors++
			continue
		}
		entry := BatchValidateFileResult{
			File:       path,
			ErrorCount: len(vr.Errors),
			Passed:     len(vr.Errors) == 0,
		}
		if entry.Passed {
			passedCount++
		}
		totalErrors += len(vr.Errors)
		results = append(results, entry)
	}

	// Sort by file path
	sort.Slice(results, func(i, j int) bool {
		return results[i].File < results[j].File
	})

	overallPassed := totalErrors == 0

	response := map[string]interface{}{
		"success":        true,
		"instance_path":  instancePath,
		"artifact_type":  artifactType,
		"total_files":    len(results),
		"passed_count":   passedCount,
		"failed_count":   len(results) - passedCount,
		"total_errors":   totalErrors,
		"overall_passed": overallPassed,
		"files":          results,
	}
	if skippedCount > 0 {
		response["skipped_files"] = skippedCount
	}

	data, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Task 2.2 — epf_rename_value_path
// ──────────────────────────────────────────────────────────────────────────────

// RenamePathChange records a single file change from a rename operation.
type RenamePathChange struct {
	File  string `json:"file"`
	Field string `json:"field"`
	Old   string `json:"old_value"`
	New   string `json:"new_value"`
}

func (s *Server) handleRenameValuePath(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil || instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	oldPath, err := request.RequireString("old_path")
	if err != nil || oldPath == "" {
		return mcp.NewToolResultError("old_path parameter is required"), nil
	}

	newPath, err := request.RequireString("new_path")
	if err != nil || newPath == "" {
		return mcp.NewToolResultError("new_path parameter is required"), nil
	}

	dryRunStr, _ := request.RequireString("dry_run")
	dryRun := dryRunStr == "true"

	// Validate new_path exists in value models
	store, storeErr := getOrCreateStrategyStore(instancePath)
	if storeErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy data: %v", storeErr)), nil
	}

	model := store.GetModel()
	if model == nil {
		return mcp.NewToolResultError("Strategy model is empty"), nil
	}

	// Check new_path exists in value models
	newPathExists := false
	var availablePaths []string
	for _, vm := range model.ValueModels {
		for _, layer := range vm.Layers {
			for _, comp := range layer.Components {
				vmPath := fmt.Sprintf("%s.%s.%s", vm.Track, layer.ID, comp.ID)
				availablePaths = append(availablePaths, vmPath)
				if vmPath == newPath {
					newPathExists = true
				}
				for _, sub := range comp.SubComponents {
					subPath := fmt.Sprintf("%s.%s.%s.%s", vm.Track, layer.ID, comp.ID, sub.ID)
					availablePaths = append(availablePaths, subPath)
					if subPath == newPath {
						newPathExists = true
					}
				}
			}
		}
	}

	if !newPathExists {
		// Find similar paths for suggestions
		suggestions := findSimilarPaths(newPath, availablePaths, 5)
		errResult := map[string]interface{}{
			"success":     false,
			"error":       fmt.Sprintf("new_path '%s' does not exist in any value model", newPath),
			"suggestions": suggestions,
			"guidance":    "To rename to a new path: (1) first update the value model YAML to add the new component path, (2) then run rename_value_path to update all references. The new_path must exist in the value model before references can point to it.",
		}
		data, _ := json.MarshalIndent(errResult, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	}

	// Collect all changes needed
	var changes []RenamePathChange

	// 1. Update feature contributes_to arrays
	fdDir := filepath.Join(instancePath, "FIRE", "definitions", "product")
	if entries, readErr := os.ReadDir(fdDir); readErr == nil {
		for _, e := range entries {
			if e.IsDir() || (!strings.HasSuffix(e.Name(), ".yaml") && !strings.HasSuffix(e.Name(), ".yml")) {
				continue
			}
			filePath := filepath.Join(fdDir, e.Name())
			featureChanges := findContributesToChanges(filePath, oldPath, newPath)
			changes = append(changes, featureChanges...)
		}
	}

	// 2. Update mappings.yaml sub_component_id fields
	mappingsPath := filepath.Join(instancePath, "FIRE", "mappings.yaml")
	if _, statErr := os.Stat(mappingsPath); statErr == nil {
		mappingChanges := findMappingChanges(mappingsPath, oldPath, newPath)
		changes = append(changes, mappingChanges...)
	}

	// 3. Update roadmap KR value_model_target.component_path fields
	readyDir := filepath.Join(instancePath, "READY")
	if entries, readErr := os.ReadDir(readyDir); readErr == nil {
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
				continue
			}
			filePath := filepath.Join(readyDir, e.Name())
			krChanges := findKRValueModelTargetChanges(filePath, oldPath, newPath)
			changes = append(changes, krChanges...)
		}
	}

	if dryRun {
		result := map[string]interface{}{
			"success":       true,
			"dry_run":       true,
			"old_path":      oldPath,
			"new_path":      newPath,
			"total_changes": len(changes),
			"changes":       changes,
		}
		data, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	}

	// Apply changes — group by file for efficiency
	fileChanges := make(map[string][]RenamePathChange)
	for _, c := range changes {
		fileChanges[c.File] = append(fileChanges[c.File], c)
	}

	var appliedCount int
	var backupFiles []string
	for filePath := range fileChanges {
		backup, applyErr := applyValuePathRename(filePath, oldPath, newPath)
		if applyErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to update %s: %v", filePath, applyErr)), nil
		}
		if backup != "" {
			backupFiles = append(backupFiles, backup)
		}
		appliedCount++
	}

	// Invalidate caches
	s.invalidateInstanceCaches(instancePath)

	result := map[string]interface{}{
		"success":        true,
		"dry_run":        false,
		"old_path":       oldPath,
		"new_path":       newPath,
		"total_changes":  len(changes),
		"files_modified": appliedCount,
		"backup_files":   backupFiles,
		"changes":        changes,
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// findContributesToChanges scans a feature file for contributes_to references matching oldPath.
func findContributesToChanges(filePath, oldPath, newPath string) []RenamePathChange {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil
	}

	sc, ok := raw["strategic_context"].(map[string]interface{})
	if !ok {
		return nil
	}

	ct, ok := sc["contributes_to"].([]interface{})
	if !ok {
		return nil
	}

	var changes []RenamePathChange
	for i, v := range ct {
		if str, ok := v.(string); ok && str == oldPath {
			changes = append(changes, RenamePathChange{
				File:  filePath,
				Field: fmt.Sprintf("strategic_context.contributes_to[%d]", i),
				Old:   oldPath,
				New:   newPath,
			})
		}
	}
	return changes
}

// findMappingChanges scans mappings.yaml for sub_component_id references matching oldPath.
func findMappingChanges(filePath, oldPath, newPath string) []RenamePathChange {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil
	}

	var changes []RenamePathChange
	for trackName, trackVal := range raw {
		entries, ok := trackVal.([]interface{})
		if !ok {
			continue
		}
		for i, entry := range entries {
			entryMap, ok := entry.(map[string]interface{})
			if !ok {
				continue
			}
			if scID, ok := entryMap["sub_component_id"].(string); ok && scID == oldPath {
				changes = append(changes, RenamePathChange{
					File:  filePath,
					Field: fmt.Sprintf("%s[%d].sub_component_id", trackName, i),
					Old:   oldPath,
					New:   newPath,
				})
			}
		}
	}
	return changes
}

// findKRValueModelTargetChanges scans a roadmap file for KR value_model_target references.
func findKRValueModelTargetChanges(filePath, oldPath, newPath string) []RenamePathChange {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil
	}

	// Check if this is a roadmap file
	tracks, ok := raw["tracks"].(map[string]interface{})
	if !ok {
		return nil
	}

	var changes []RenamePathChange
	for trackName, trackVal := range tracks {
		trackMap, ok := trackVal.(map[string]interface{})
		if !ok {
			continue
		}
		okrs, ok := trackMap["okrs"].([]interface{})
		if !ok {
			continue
		}
		for oi, okr := range okrs {
			okrMap, ok := okr.(map[string]interface{})
			if !ok {
				continue
			}
			krs, ok := okrMap["key_results"].([]interface{})
			if !ok {
				continue
			}
			for ki, kr := range krs {
				krMap, ok := kr.(map[string]interface{})
				if !ok {
					continue
				}
				vmt, ok := krMap["value_model_target"].(map[string]interface{})
				if !ok {
					continue
				}
				if cp, ok := vmt["component_path"].(string); ok && cp == oldPath {
					changes = append(changes, RenamePathChange{
						File:  filePath,
						Field: fmt.Sprintf("tracks.%s.okrs[%d].key_results[%d].value_model_target.component_path", trackName, oi, ki),
						Old:   oldPath,
						New:   newPath,
					})
				}
			}
		}
	}
	return changes
}

// applyValuePathRename performs the actual string replacement in a YAML file using yaml.Node.
func applyValuePathRename(filePath, oldPath, newPath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("read: %w", err)
	}

	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return "", fmt.Errorf("parse: %w", err)
	}

	// Create backup
	backupDir := filepath.Join(filepath.Dir(filePath), "..", ".epf-backups")
	if strings.Contains(filePath, "READY") || strings.Contains(filePath, "FIRE") {
		// Go up from READY/ or FIRE/ to instance root
		backupDir = filepath.Join(filepath.Dir(filepath.Dir(filePath)), ".epf-backups")
	}
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", fmt.Errorf("create backup dir: %w", err)
	}
	timestamp := time.Now().Format("20060102-150405")
	baseName := filepath.Base(filePath)
	backupPath := filepath.Join(backupDir, fmt.Sprintf("%s.%s.bak", baseName, timestamp))
	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		return "", fmt.Errorf("write backup: %w", err)
	}

	// Walk all nodes and replace matching scalar values
	replaceScalarValues(&doc, oldPath, newPath)

	// Write back
	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(&doc); err != nil {
		return "", fmt.Errorf("encode: %w", err)
	}
	if err := os.WriteFile(filePath, buf.Bytes(), 0644); err != nil {
		return "", fmt.Errorf("write: %w", err)
	}

	return backupPath, nil
}

// replaceScalarValues recursively walks a yaml.Node tree replacing scalar values.
func replaceScalarValues(node *yaml.Node, oldVal, newVal string) {
	if node == nil {
		return
	}
	if node.Kind == yaml.ScalarNode && node.Value == oldVal {
		node.Value = newVal
	}
	for _, child := range node.Content {
		replaceScalarValues(child, oldVal, newVal)
	}
}

// findSimilarPaths returns paths that are similar to the target (simple substring matching).
func findSimilarPaths(target string, available []string, maxResults int) []string {
	type scored struct {
		path  string
		score int
	}

	targetParts := strings.Split(strings.ToLower(target), ".")
	var results []scored

	for _, path := range available {
		pathParts := strings.Split(strings.ToLower(path), ".")
		score := 0
		for _, tp := range targetParts {
			for _, pp := range pathParts {
				if tp == pp {
					score += 3
				} else if strings.Contains(pp, tp) || strings.Contains(tp, pp) {
					score += 1
				}
			}
		}
		if score > 0 {
			results = append(results, scored{path: path, score: score})
		}
	}

	sort.Slice(results, func(i, j int) bool { return results[i].score > results[j].score })

	var out []string
	for i, r := range results {
		if i >= maxResults {
			break
		}
		out = append(out, r.path)
	}
	return out
}

// ──────────────────────────────────────────────────────────────────────────────
// Task 2.3 — epf_update_kr
// ──────────────────────────────────────────────────────────────────────────────

func (s *Server) handleUpdateKR(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil || instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	krID, err := request.RequireString("kr_id")
	if err != nil || krID == "" {
		return mcp.NewToolResultError("kr_id parameter is required"), nil
	}

	dryRunStr, _ := request.RequireString("dry_run")
	dryRun := dryRunStr == "true"

	// Extract fields to update from the request arguments
	args := request.GetArguments()

	fieldsRaw, ok := args["fields"]
	if !ok {
		return mcp.NewToolResultError("fields parameter is required"), nil
	}
	fieldsMap, ok := fieldsRaw.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("fields must be an object"), nil
	}

	// If value_model_target.component_path is provided, validate it
	if vmt, ok := fieldsMap["value_model_target"].(map[string]interface{}); ok {
		if cp, ok := vmt["component_path"].(string); ok && cp != "" {
			store, storeErr := getOrCreateStrategyStore(instancePath)
			if storeErr != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy data: %v", storeErr)), nil
			}

			model := store.GetModel()
			if model != nil {
				valid, suggestions := validateComponentPath(model, cp)
				if !valid {
					errResult := map[string]interface{}{
						"success":     false,
						"error":       fmt.Sprintf("component_path '%s' does not exist in value models", cp),
						"suggestions": suggestions,
					}
					data, _ := json.MarshalIndent(errResult, "", "  ")
					return mcp.NewToolResultText(string(data)), nil
				}
			}
		}
	}

	// Find the roadmap file
	roadmapPath := findRoadmapFile(instancePath)
	if roadmapPath == "" {
		return mcp.NewToolResultError("Roadmap file not found in READY/ directory"), nil
	}

	// Read and parse
	fileData, err := os.ReadFile(roadmapPath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to read roadmap: %v", err)), nil
	}

	var doc yaml.Node
	if err := yaml.Unmarshal(fileData, &doc); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to parse roadmap YAML: %v", err)), nil
	}

	// Find the KR node and update
	krNode, krPath, findErr := findKRNodeByID(&doc, krID)
	if findErr != nil {
		return mcp.NewToolResultError(findErr.Error()), nil
	}

	if dryRun {
		result := map[string]interface{}{
			"success": true,
			"dry_run": true,
			"kr_id":   krID,
			"kr_path": krPath,
			"file":    roadmapPath,
			"fields":  fieldsMap,
			"message": "Would update KR with the specified fields",
		}
		data, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	}

	// Create backup
	backupDir := filepath.Join(instancePath, ".epf-backups")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create backup dir: %v", err)), nil
	}
	timestamp := time.Now().Format("20060102-150405")
	backupPath := filepath.Join(backupDir, fmt.Sprintf("%s.%s.bak", filepath.Base(roadmapPath), timestamp))
	if err := os.WriteFile(backupPath, fileData, 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create backup: %v", err)), nil
	}

	// Apply field updates to the KR node
	applyKRFieldUpdates(krNode, fieldsMap)

	// Write back
	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(&doc); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to encode YAML: %v", err)), nil
	}
	if err := os.WriteFile(roadmapPath, buf.Bytes(), 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to write file: %v", err)), nil
	}

	// Invalidate caches
	s.invalidateInstanceCaches(instancePath)

	result := map[string]interface{}{
		"success":     true,
		"dry_run":     false,
		"kr_id":       krID,
		"kr_path":     krPath,
		"file":        roadmapPath,
		"backup_file": backupPath,
		"fields":      fieldsMap,
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// findRoadmapFile locates the roadmap YAML in READY/ using content-based discovery.
func findRoadmapFile(instancePath string) string {
	readyDir := filepath.Join(instancePath, "READY")
	entries, err := os.ReadDir(readyDir)
	if err != nil {
		return ""
	}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		path := filepath.Join(readyDir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var raw map[string]interface{}
		if err := yaml.Unmarshal(data, &raw); err != nil {
			continue
		}
		// Content-based: check for roadmap top-level keys
		// Standard format: nested under "roadmap" wrapper
		if rm, ok := raw["roadmap"]; ok {
			if rmMap, ok := rm.(map[string]interface{}); ok {
				if _, ok := rmMap["tracks"]; ok {
					return path
				}
			}
		}
		// Legacy format: tracks at root level
		if _, ok := raw["tracks"]; ok {
			if _, ok2 := raw["strategy_id"]; ok2 {
				return path
			}
		}
		// Fallback: filename pattern
		lower := strings.ToLower(e.Name())
		if strings.Contains(lower, "roadmap") {
			return path
		}
	}
	return ""
}

// findKRNodeByID searches for a KR node in a roadmap document by its ID.
func findKRNodeByID(doc *yaml.Node, krID string) (*yaml.Node, string, error) {
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return nil, "", fmt.Errorf("invalid document structure")
	}

	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return nil, "", fmt.Errorf("root must be a mapping")
	}

	// Navigate to tracks — handle both:
	// 1. Standard format: roadmap: { tracks: [...] }
	// 2. Legacy format: tracks: { ... } at root level
	var tracksNode *yaml.Node
	for i := 0; i < len(root.Content); i += 2 {
		key := root.Content[i].Value
		if key == "roadmap" && root.Content[i+1].Kind == yaml.MappingNode {
			// Standard format: navigate into roadmap wrapper
			rmNode := root.Content[i+1]
			for j := 0; j < len(rmNode.Content); j += 2 {
				if rmNode.Content[j].Value == "tracks" {
					tracksNode = rmNode.Content[j+1]
					break
				}
			}
			break
		}
		if key == "tracks" {
			// Legacy format: tracks at root level
			tracksNode = root.Content[i+1]
			break
		}
	}

	if tracksNode == nil {
		return nil, "", fmt.Errorf("tracks section not found or invalid")
	}

	// Handle tracks as SequenceNode (standard format: list of {track: name, okrs: [...]})
	if tracksNode.Kind == yaml.SequenceNode {
		return findKRInSequenceTracks(tracksNode, krID)
	}

	// Handle tracks as MappingNode (legacy format: {product: {okrs: [...]}, ...})
	if tracksNode.Kind == yaml.MappingNode {
		return findKRInMappingTracks(tracksNode, krID)
	}

	return nil, "", fmt.Errorf("tracks section has unexpected type")
}

// findKRInSequenceTracks searches for a KR in sequence-format tracks (standard EPF format).
// Format: tracks: [{track: "product", okrs: [...]}, ...]
func findKRInSequenceTracks(tracksNode *yaml.Node, krID string) (*yaml.Node, string, error) {
	for _, trackItem := range tracksNode.Content {
		if trackItem.Kind != yaml.MappingNode {
			continue
		}

		var trackName string
		var okrsNode *yaml.Node

		for fi := 0; fi < len(trackItem.Content); fi += 2 {
			key := trackItem.Content[fi].Value
			val := trackItem.Content[fi+1]
			if key == "track" {
				trackName = val.Value
			} else if key == "okrs" && val.Kind == yaml.SequenceNode {
				okrsNode = val
			}
		}

		if okrsNode == nil {
			continue
		}

		for oi, okrNode := range okrsNode.Content {
			if okrNode.Kind != yaml.MappingNode {
				continue
			}
			for ofi := 0; ofi < len(okrNode.Content); ofi += 2 {
				if okrNode.Content[ofi].Value != "key_results" {
					continue
				}
				krsNode := okrNode.Content[ofi+1]
				if krsNode.Kind != yaml.SequenceNode {
					continue
				}
				for ki, krNode := range krsNode.Content {
					if krNode.Kind != yaml.MappingNode {
						continue
					}
					for kfi := 0; kfi < len(krNode.Content); kfi += 2 {
						if krNode.Content[kfi].Value == "id" && krNode.Content[kfi+1].Value == krID {
							path := fmt.Sprintf("tracks.%s.okrs[%d].key_results[%d]", trackName, oi, ki)
							return krNode, path, nil
						}
					}
				}
			}
		}
	}

	return nil, "", fmt.Errorf("KR '%s' not found in roadmap", krID)
}

// findKRInMappingTracks searches for a KR in mapping-format tracks (legacy format).
// Format: tracks: {product: {okrs: [...]}, ...}
func findKRInMappingTracks(tracksNode *yaml.Node, krID string) (*yaml.Node, string, error) {
	for ti := 0; ti < len(tracksNode.Content); ti += 2 {
		trackName := tracksNode.Content[ti].Value
		trackNode := tracksNode.Content[ti+1]

		if trackNode.Kind != yaml.MappingNode {
			continue
		}

		// Find okrs array
		for tfi := 0; tfi < len(trackNode.Content); tfi += 2 {
			if trackNode.Content[tfi].Value != "okrs" {
				continue
			}
			okrsNode := trackNode.Content[tfi+1]
			if okrsNode.Kind != yaml.SequenceNode {
				continue
			}

			for oi, okrNode := range okrsNode.Content {
				if okrNode.Kind != yaml.MappingNode {
					continue
				}
				// Find key_results
				for ofi := 0; ofi < len(okrNode.Content); ofi += 2 {
					if okrNode.Content[ofi].Value != "key_results" {
						continue
					}
					krsNode := okrNode.Content[ofi+1]
					if krsNode.Kind != yaml.SequenceNode {
						continue
					}

					for ki, krNode := range krsNode.Content {
						if krNode.Kind != yaml.MappingNode {
							continue
						}
						// Check ID
						for kfi := 0; kfi < len(krNode.Content); kfi += 2 {
							if krNode.Content[kfi].Value == "id" && krNode.Content[kfi+1].Value == krID {
								path := fmt.Sprintf("tracks.%s.okrs[%d].key_results[%d]", trackName, oi, ki)
								return krNode, path, nil
							}
						}
					}
				}
			}
		}
	}

	return nil, "", fmt.Errorf("KR '%s' not found in roadmap", krID)
}

// applyKRFieldUpdates applies field updates to a KR yaml.Node.
func applyKRFieldUpdates(krNode *yaml.Node, fields map[string]interface{}) {
	if krNode.Kind != yaml.MappingNode {
		return
	}

	for key, value := range fields {
		if key == "value_model_target" {
			// Handle nested object
			vmtMap, ok := value.(map[string]interface{})
			if !ok {
				continue
			}
			applyNestedMapUpdate(krNode, "value_model_target", vmtMap)
			continue
		}

		// Simple scalar update
		strVal := fmt.Sprintf("%v", value)
		setOrAddScalarField(krNode, key, strVal)
	}
}

// applyNestedMapUpdate sets or creates a nested mapping node with the given fields.
func applyNestedMapUpdate(parent *yaml.Node, key string, fields map[string]interface{}) {
	// Find existing key
	var existingNode *yaml.Node
	for i := 0; i < len(parent.Content); i += 2 {
		if parent.Content[i].Value == key {
			existingNode = parent.Content[i+1]
			break
		}
	}

	if existingNode == nil {
		// Create the nested mapping
		existingNode = &yaml.Node{Kind: yaml.MappingNode, Content: []*yaml.Node{}}
		parent.Content = append(parent.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: key},
			existingNode,
		)
	}

	if existingNode.Kind != yaml.MappingNode {
		return
	}

	for k, v := range fields {
		strVal := fmt.Sprintf("%v", v)
		setOrAddScalarField(existingNode, k, strVal)
	}
}

// setOrAddScalarField sets an existing scalar field or adds a new one.
func setOrAddScalarField(mapping *yaml.Node, key, value string) {
	for i := 0; i < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			mapping.Content[i+1].Value = value
			return
		}
	}
	// Add new field
	mapping.Content = append(mapping.Content,
		&yaml.Node{Kind: yaml.ScalarNode, Value: key},
		&yaml.Node{Kind: yaml.ScalarNode, Value: value},
	)
}

// validateComponentPath checks if a component path exists in the value models.
func validateComponentPath(model *strategy.StrategyModel, cp string) (bool, []string) {
	var available []string
	for _, vm := range model.ValueModels {
		for _, layer := range vm.Layers {
			for _, comp := range layer.Components {
				p := fmt.Sprintf("%s.%s.%s", vm.Track, layer.ID, comp.ID)
				available = append(available, p)
				if p == cp {
					return true, nil
				}
				for _, sub := range comp.SubComponents {
					sp := fmt.Sprintf("%s.%s.%s.%s", vm.Track, layer.ID, comp.ID, sub.ID)
					available = append(available, sp)
					if sp == cp {
						return true, nil
					}
				}
			}
		}
	}
	return false, findSimilarPaths(cp, available, 5)
}

// ──────────────────────────────────────────────────────────────────────────────
// Task 2.4 — epf_add_value_model_component
// ──────────────────────────────────────────────────────────────────────────────

func (s *Server) handleAddValueModelComponent(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil || instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	track, err := request.RequireString("track")
	if err != nil || track == "" {
		return mcp.NewToolResultError("track parameter is required"), nil
	}

	l1ID, err := request.RequireString("l1_id")
	if err != nil || l1ID == "" {
		return mcp.NewToolResultError("l1_id parameter is required"), nil
	}

	componentID, err := request.RequireString("component_id")
	if err != nil || componentID == "" {
		return mcp.NewToolResultError("component_id parameter is required"), nil
	}

	name, err := request.RequireString("name")
	if err != nil || name == "" {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	dryRunStr, _ := request.RequireString("dry_run")
	dryRun := dryRunStr == "true"

	activeStr, _ := request.RequireString("active")
	active := activeStr != "false" // default true

	// Find value model file containing this L1
	vmPaths := findValueModelFiles(instancePath, track)
	if len(vmPaths) == 0 {
		return mcp.NewToolResultError(fmt.Sprintf("Value model file for track '%s' not found", track)), nil
	}

	var vmPath string
	var doc yaml.Node
	var fileData []byte
	var l1Node *yaml.Node
	for _, candidate := range vmPaths {
		data, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}
		var d yaml.Node
		if err := yaml.Unmarshal(data, &d); err != nil {
			continue
		}
		node, findErr := findValueModelL1(&d, l1ID)
		if findErr == nil {
			vmPath = candidate
			doc = d
			fileData = data
			l1Node = node
			break
		}
	}
	if vmPath == "" {
		return mcp.NewToolResultError(fmt.Sprintf("L1 layer '%s' not found in any '%s' value model file", l1ID, track)), nil
	}

	// Check for duplicate
	if hasComponent(l1Node, componentID) {
		return mcp.NewToolResultError(fmt.Sprintf("Component '%s' already exists in L1 '%s'", componentID, l1ID)), nil
	}

	if dryRun {
		result := map[string]interface{}{
			"success":      true,
			"dry_run":      true,
			"track":        track,
			"l1_id":        l1ID,
			"component_id": componentID,
			"name":         name,
			"active":       active,
			"file":         vmPath,
			"message":      fmt.Sprintf("Would add L2 component '%s' (%s) to %s.%s", componentID, name, track, l1ID),
		}
		data, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	}

	// Create backup
	backupDir := filepath.Join(instancePath, ".epf-backups")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create backup dir: %v", err)), nil
	}
	timestamp := time.Now().Format("20060102-150405")
	backupPath := filepath.Join(backupDir, fmt.Sprintf("%s.%s.bak", filepath.Base(vmPath), timestamp))
	if err := os.WriteFile(backupPath, fileData, 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create backup: %v", err)), nil
	}

	// Build the component node based on track type
	componentNode := buildComponentNode(track, componentID, name, active)

	// Find the components array in L1 and append
	addComponentToL1(l1Node, componentNode, track)

	// Write back
	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(&doc); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to encode YAML: %v", err)), nil
	}
	if err := os.WriteFile(vmPath, buf.Bytes(), 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to write file: %v", err)), nil
	}

	// Invalidate caches
	s.invalidateInstanceCaches(instancePath)

	result := map[string]interface{}{
		"success":      true,
		"dry_run":      false,
		"track":        track,
		"l1_id":        l1ID,
		"component_id": componentID,
		"name":         name,
		"active":       active,
		"file":         vmPath,
		"backup_file":  backupPath,
		"path":         fmt.Sprintf("%s.%s.%s", track, l1ID, componentID),
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Task 2.5 — epf_add_value_model_sub
// ──────────────────────────────────────────────────────────────────────────────

func (s *Server) handleAddValueModelSub(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil || instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	track, err := request.RequireString("track")
	if err != nil || track == "" {
		return mcp.NewToolResultError("track parameter is required"), nil
	}

	l1ID, err := request.RequireString("l1_id")
	if err != nil || l1ID == "" {
		return mcp.NewToolResultError("l1_id parameter is required"), nil
	}

	l2ID, err := request.RequireString("l2_id")
	if err != nil || l2ID == "" {
		return mcp.NewToolResultError("l2_id parameter is required"), nil
	}

	subID, err := request.RequireString("sub_id")
	if err != nil || subID == "" {
		return mcp.NewToolResultError("sub_id parameter is required"), nil
	}

	name, err := request.RequireString("name")
	if err != nil || name == "" {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	dryRunStr, _ := request.RequireString("dry_run")
	dryRun := dryRunStr == "true"

	activeStr, _ := request.RequireString("active")
	active := activeStr != "false" // default true

	// Find value model file containing this L1/L2
	vmPaths := findValueModelFiles(instancePath, track)
	if len(vmPaths) == 0 {
		return mcp.NewToolResultError(fmt.Sprintf("Value model file for track '%s' not found", track)), nil
	}

	var vmPath string
	var doc yaml.Node
	var fileData []byte
	var l2Node *yaml.Node
	for _, candidate := range vmPaths {
		data, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}
		var d yaml.Node
		if err := yaml.Unmarshal(data, &d); err != nil {
			continue
		}
		node, findErr := findValueModelL2(&d, l1ID, l2ID)
		if findErr == nil {
			vmPath = candidate
			doc = d
			fileData = data
			l2Node = node
			break
		}
	}
	if vmPath == "" {
		return mcp.NewToolResultError(fmt.Sprintf("L2 component '%s' in L1 '%s' not found in any '%s' value model file", l2ID, l1ID, track)), nil
	}
	_ = doc // used for YAML write-back

	// Check for duplicate
	if hasSub(l2Node, subID, track) {
		return mcp.NewToolResultError(fmt.Sprintf("Sub '%s' already exists in %s.%s", subID, l1ID, l2ID)), nil
	}

	isProduct := strings.EqualFold(track, "product")

	if dryRun {
		fieldName := "subs"
		if isProduct {
			fieldName = "sub_components"
		}
		result := map[string]interface{}{
			"success":    true,
			"dry_run":    true,
			"track":      track,
			"l1_id":      l1ID,
			"l2_id":      l2ID,
			"sub_id":     subID,
			"name":       name,
			"active":     active,
			"field_used": fieldName,
			"file":       vmPath,
			"message":    fmt.Sprintf("Would add L3 sub '%s' (%s) to %s.%s.%s using '%s'", subID, name, track, l1ID, l2ID, fieldName),
		}
		data, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	}

	// Backup
	backupDir := filepath.Join(instancePath, ".epf-backups")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create backup dir: %v", err)), nil
	}
	timestamp := time.Now().Format("20060102-150405")
	backupPath := filepath.Join(backupDir, fmt.Sprintf("%s.%s.bak", filepath.Base(vmPath), timestamp))
	if err := os.WriteFile(backupPath, fileData, 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create backup: %v", err)), nil
	}

	// Build sub node and add
	subNode := buildSubNode(track, subID, name, active)
	addSubToL2(l2Node, subNode, track)

	// Write back
	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(&doc); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to encode YAML: %v", err)), nil
	}
	if err := os.WriteFile(vmPath, buf.Bytes(), 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to write file: %v", err)), nil
	}

	// Invalidate caches
	s.invalidateInstanceCaches(instancePath)

	fieldName := "subs"
	if isProduct {
		fieldName = "sub_components"
	}

	result := map[string]interface{}{
		"success":     true,
		"dry_run":     false,
		"track":       track,
		"l1_id":       l1ID,
		"l2_id":       l2ID,
		"sub_id":      subID,
		"name":        name,
		"active":      active,
		"field_used":  fieldName,
		"file":        vmPath,
		"backup_file": backupPath,
		"path":        fmt.Sprintf("%s.%s.%s.%s", track, l1ID, l2ID, subID),
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Value model helpers
// ──────────────────────────────────────────────────────────────────────────────

// findValueModelFiles returns all value model YAML file paths matching a given track.
func findValueModelFiles(instancePath, track string) []string {
	vmDir := filepath.Join(instancePath, "FIRE", "value_models")
	entries, err := os.ReadDir(vmDir)
	if err != nil {
		return nil
	}

	trackLower := strings.ToLower(track)
	var contentMatches []string
	var filenameMatches []string

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		path := filepath.Join(vmDir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var raw map[string]interface{}
		if err := yaml.Unmarshal(data, &raw); err != nil {
			continue
		}
		// Content-based: check track_name (flat format)
		if t, ok := raw["track_name"].(string); ok && strings.EqualFold(t, trackLower) {
			contentMatches = append(contentMatches, path)
			continue
		}
		// Legacy: check value_model.track (wrapper format)
		if vm, ok := raw["value_model"].(map[string]interface{}); ok {
			if t, ok := vm["track"].(string); ok && strings.EqualFold(t, trackLower) {
				contentMatches = append(contentMatches, path)
				continue
			}
		}
		// Fallback: filename
		if strings.Contains(strings.ToLower(e.Name()), trackLower) {
			filenameMatches = append(filenameMatches, path)
		}
	}

	// Prefer content matches over filename matches
	if len(contentMatches) > 0 {
		return contentMatches
	}
	return filenameMatches
}

// findValueModelFile locates the first value model YAML file for a given track.
func findValueModelFile(instancePath, track string) string {
	files := findValueModelFiles(instancePath, track)
	if len(files) > 0 {
		return files[0]
	}
	return ""
}

// findValueModelL1 finds the L1 layer node inside a value model document.
func findValueModelL1(doc *yaml.Node, l1ID string) (*yaml.Node, error) {
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return nil, fmt.Errorf("invalid document structure")
	}

	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("root must be a mapping")
	}

	// Find layers at root level (flat value model format: track_name, layers, ...)
	// Also support legacy wrapper format (value_model: { layers: [...] })
	var layersNode *yaml.Node
	for i := 0; i < len(root.Content); i += 2 {
		if root.Content[i].Value == "layers" {
			layersNode = root.Content[i+1]
			break
		}
		if root.Content[i].Value == "value_model" && root.Content[i+1].Kind == yaml.MappingNode {
			// Legacy wrapper format
			vmNode := root.Content[i+1]
			for j := 0; j < len(vmNode.Content); j += 2 {
				if vmNode.Content[j].Value == "layers" {
					layersNode = vmNode.Content[j+1]
					break
				}
			}
			break
		}
	}
	if layersNode == nil || layersNode.Kind != yaml.SequenceNode {
		return nil, fmt.Errorf("layers section not found or invalid")
	}

	// Find the L1 with matching ID
	for _, layerNode := range layersNode.Content {
		if layerNode.Kind != yaml.MappingNode {
			continue
		}
		for i := 0; i < len(layerNode.Content); i += 2 {
			if layerNode.Content[i].Value == "id" && layerNode.Content[i+1].Value == l1ID {
				return layerNode, nil
			}
		}
	}

	return nil, fmt.Errorf("L1 layer '%s' not found", l1ID)
}

// findValueModelL2 finds a specific L2 component node within a value model document.
func findValueModelL2(doc *yaml.Node, l1ID, l2ID string) (*yaml.Node, error) {
	l1Node, err := findValueModelL1(doc, l1ID)
	if err != nil {
		return nil, err
	}

	// Find components array
	var componentsNode *yaml.Node
	for i := 0; i < len(l1Node.Content); i += 2 {
		if l1Node.Content[i].Value == "components" {
			componentsNode = l1Node.Content[i+1]
			break
		}
	}
	if componentsNode == nil || componentsNode.Kind != yaml.SequenceNode {
		return nil, fmt.Errorf("components section not found in L1 '%s'", l1ID)
	}

	for _, compNode := range componentsNode.Content {
		if compNode.Kind != yaml.MappingNode {
			continue
		}
		for i := 0; i < len(compNode.Content); i += 2 {
			if compNode.Content[i].Value == "id" && compNode.Content[i+1].Value == l2ID {
				return compNode, nil
			}
		}
	}

	return nil, fmt.Errorf("L2 component '%s' not found in L1 '%s'", l2ID, l1ID)
}

// hasComponent checks if a component with the given ID already exists in an L1 layer.
func hasComponent(l1Node *yaml.Node, componentID string) bool {
	for i := 0; i < len(l1Node.Content); i += 2 {
		if l1Node.Content[i].Value == "components" {
			compsNode := l1Node.Content[i+1]
			if compsNode.Kind != yaml.SequenceNode {
				return false
			}
			for _, comp := range compsNode.Content {
				if comp.Kind != yaml.MappingNode {
					continue
				}
				for j := 0; j < len(comp.Content); j += 2 {
					if comp.Content[j].Value == "id" && comp.Content[j+1].Value == componentID {
						return true
					}
				}
			}
		}
	}
	return false
}

// hasSub checks if a sub-component exists in an L2 component.
func hasSub(l2Node *yaml.Node, subID, track string) bool {
	isProduct := strings.EqualFold(track, "product")
	fieldName := "subs"
	if isProduct {
		fieldName = "sub_components"
	}

	for i := 0; i < len(l2Node.Content); i += 2 {
		if l2Node.Content[i].Value == fieldName {
			subsNode := l2Node.Content[i+1]
			if subsNode.Kind != yaml.SequenceNode {
				return false
			}
			for _, sub := range subsNode.Content {
				if sub.Kind != yaml.MappingNode {
					continue
				}
				for j := 0; j < len(sub.Content); j += 2 {
					if sub.Content[j].Value == "id" && sub.Content[j+1].Value == subID {
						return true
					}
				}
			}
		}
	}
	return false
}

// buildComponentNode creates a new L2 component yaml.Node with track-aware structure.
func buildComponentNode(track, id, name string, active bool) *yaml.Node {
	isProduct := strings.EqualFold(track, "product")

	activeStr := "true"
	if !active {
		activeStr = "false"
	}

	content := []*yaml.Node{
		{Kind: yaml.ScalarNode, Value: "id"},
		{Kind: yaml.ScalarNode, Value: id},
		{Kind: yaml.ScalarNode, Value: "name"},
		{Kind: yaml.ScalarNode, Value: name},
		{Kind: yaml.ScalarNode, Value: "active"},
		{Kind: yaml.ScalarNode, Value: activeStr, Tag: "!!bool"},
	}

	if isProduct {
		// Product: add sub_components: [] and maturity
		content = append(content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "maturity"},
			&yaml.Node{Kind: yaml.ScalarNode, Value: "hypothetical"},
			&yaml.Node{Kind: yaml.ScalarNode, Value: "sub_components"},
			&yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{}},
		)
	} else {
		// Non-product: add subs: []
		content = append(content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "subs"},
			&yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{}},
		)
	}

	return &yaml.Node{Kind: yaml.MappingNode, Content: content}
}

// buildSubNode creates a new L3 sub yaml.Node with track-aware structure.
func buildSubNode(track, id, name string, active bool) *yaml.Node {
	isProduct := strings.EqualFold(track, "product")

	activeStr := "true"
	if !active {
		activeStr = "false"
	}

	content := []*yaml.Node{
		{Kind: yaml.ScalarNode, Value: "id"},
		{Kind: yaml.ScalarNode, Value: id},
		{Kind: yaml.ScalarNode, Value: "name"},
		{Kind: yaml.ScalarNode, Value: name},
		{Kind: yaml.ScalarNode, Value: "active"},
		{Kind: yaml.ScalarNode, Value: activeStr, Tag: "!!bool"},
	}

	if isProduct {
		// Product sub_components have maturity
		content = append(content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "maturity"},
			&yaml.Node{Kind: yaml.ScalarNode, Value: "hypothetical"},
		)
	} else {
		// Non-product subs have uvp
		content = append(content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "uvp"},
			&yaml.Node{Kind: yaml.ScalarNode, Value: ""},
		)
	}

	return &yaml.Node{Kind: yaml.MappingNode, Content: content}
}

// addComponentToL1 adds a component to the L1 layer's components array.
func addComponentToL1(l1Node, componentNode *yaml.Node, track string) {
	for i := 0; i < len(l1Node.Content); i += 2 {
		if l1Node.Content[i].Value == "components" {
			compsNode := l1Node.Content[i+1]
			if compsNode.Kind == yaml.SequenceNode {
				compsNode.Content = append(compsNode.Content, componentNode)
				return
			}
		}
	}
	// No components array found — create one
	l1Node.Content = append(l1Node.Content,
		&yaml.Node{Kind: yaml.ScalarNode, Value: "components"},
		&yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{componentNode}},
	)
}

// addSubToL2 adds a sub to the L2 component's subs/sub_components array.
func addSubToL2(l2Node, subNode *yaml.Node, track string) {
	isProduct := strings.EqualFold(track, "product")
	fieldName := "subs"
	if isProduct {
		fieldName = "sub_components"
	}

	for i := 0; i < len(l2Node.Content); i += 2 {
		if l2Node.Content[i].Value == fieldName {
			subsNode := l2Node.Content[i+1]
			if subsNode.Kind == yaml.SequenceNode {
				subsNode.Content = append(subsNode.Content, subNode)
				return
			}
		}
	}
	// No subs/sub_components array found — create one
	l2Node.Content = append(l2Node.Content,
		&yaml.Node{Kind: yaml.ScalarNode, Value: fieldName},
		&yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{subNode}},
	)
}
