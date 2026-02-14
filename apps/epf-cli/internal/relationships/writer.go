// Package relationships provides relationship analysis and maintenance for EPF artifacts.
package relationships

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// ImplementationReference represents a reference to an implementation artifact.
type ImplementationReference struct {
	Type        string `yaml:"type"`
	Title       string `yaml:"title"`
	URL         string `yaml:"url"`
	Status      string `yaml:"status,omitempty"`
	Description string `yaml:"description,omitempty"`
}

// MappingArtifact represents an artifact in mappings.yaml.
type MappingArtifact struct {
	Type        string `yaml:"type"`
	URL         string `yaml:"url"`
	Description string `yaml:"description"`
}

// MappingEntry represents a sub-component mapping entry.
type MappingEntry struct {
	SubComponentID string            `yaml:"sub_component_id"`
	Artifacts      []MappingArtifact `yaml:"artifacts"`
}

// Writer handles writing updates to EPF relationship files.
type Writer struct {
	instancePath string
	backupDir    string
}

// NewWriter creates a new relationship writer for an EPF instance.
func NewWriter(instancePath string) *Writer {
	return &Writer{
		instancePath: instancePath,
		backupDir:    filepath.Join(instancePath, ".epf-backups"),
	}
}

// AddImplementationReferenceResult is the result of adding an implementation reference.
type AddImplementationReferenceResult struct {
	Success        bool                     `json:"success"`
	FeatureFile    string                   `json:"feature_file"`
	ReferenceAdded *ImplementationReference `json:"reference_added"`
	WasUpdate      bool                     `json:"was_update"`
	BackupFile     string                   `json:"backup_file,omitempty"`
	Guidance       map[string]interface{}   `json:"guidance"`
}

// AddImplementationReference adds or updates an implementation reference in a feature definition.
func (w *Writer) AddImplementationReference(
	featureIDOrSlug string,
	refType string,
	title string,
	url string,
	status string,
	description string,
) (*AddImplementationReferenceResult, error) {
	// Find the feature file
	featurePath, err := w.findFeatureFile(featureIDOrSlug)
	if err != nil {
		return nil, fmt.Errorf("failed to find feature: %w", err)
	}

	// Read and parse the YAML file preserving structure
	data, err := os.ReadFile(featurePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read feature file: %w", err)
	}

	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Create backup
	backupFile, err := w.createBackup(featurePath, data)
	if err != nil {
		return nil, fmt.Errorf("failed to create backup: %w", err)
	}

	// Set default status
	if status == "" {
		status = "current"
	}

	// Find or create implementation_references section
	wasUpdate, err := w.addOrUpdateReference(&doc, refType, title, url, status, description)
	if err != nil {
		return nil, fmt.Errorf("failed to add reference: %w", err)
	}

	// Write the updated YAML
	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(&doc); err != nil {
		return nil, fmt.Errorf("failed to encode YAML: %w", err)
	}

	if err := os.WriteFile(featurePath, buf.Bytes(), 0644); err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	ref := &ImplementationReference{
		Type:        refType,
		Title:       title,
		URL:         url,
		Status:      status,
		Description: description,
	}

	return &AddImplementationReferenceResult{
		Success:        true,
		FeatureFile:    featurePath,
		ReferenceAdded: ref,
		WasUpdate:      wasUpdate,
		BackupFile:     backupFile,
		Guidance: map[string]interface{}{
			"next_steps": []string{
				"Verify the reference URL is accessible",
				"Consider adding more references for related PRs, issues, or documentation",
				"Run 'epf-cli validate' to ensure the file still validates",
			},
			"related_tools": []string{
				"epf_validate_file - Validate the updated feature definition",
				"epf_get_strategic_context - View the full strategic context",
			},
		},
	}, nil
}

// UpdateCapabilityMaturityResult is the result of updating capability maturity.
type UpdateCapabilityMaturityResult struct {
	Success          bool                   `json:"success"`
	FeatureFile      string                 `json:"feature_file"`
	CapabilityID     string                 `json:"capability_id"`
	PreviousMaturity string                 `json:"previous_maturity"`
	NewMaturity      string                 `json:"new_maturity"`
	BackupFile       string                 `json:"backup_file,omitempty"`
	Guidance         map[string]interface{} `json:"guidance"`
}

// UpdateCapabilityMaturity updates the maturity level of a capability in a feature definition.
func (w *Writer) UpdateCapabilityMaturity(
	featureIDOrSlug string,
	capabilityID string,
	maturity string,
	evidence string,
	deliveredByKR string,
) (*UpdateCapabilityMaturityResult, error) {
	// Find the feature file
	featurePath, err := w.findFeatureFile(featureIDOrSlug)
	if err != nil {
		return nil, fmt.Errorf("failed to find feature: %w", err)
	}

	// Read and parse the YAML file preserving structure
	data, err := os.ReadFile(featurePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read feature file: %w", err)
	}

	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Create backup
	backupFile, err := w.createBackup(featurePath, data)
	if err != nil {
		return nil, fmt.Errorf("failed to create backup: %w", err)
	}

	// Find the capability and update its maturity
	previousMaturity, err := w.updateCapabilityMaturityInDoc(&doc, capabilityID, maturity, evidence, deliveredByKR)
	if err != nil {
		return nil, fmt.Errorf("failed to update capability maturity: %w", err)
	}

	// Write the updated YAML
	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(&doc); err != nil {
		return nil, fmt.Errorf("failed to encode YAML: %w", err)
	}

	if err := os.WriteFile(featurePath, buf.Bytes(), 0644); err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	return &UpdateCapabilityMaturityResult{
		Success:          true,
		FeatureFile:      featurePath,
		CapabilityID:     capabilityID,
		PreviousMaturity: previousMaturity,
		NewMaturity:      maturity,
		BackupFile:       backupFile,
		Guidance: map[string]interface{}{
			"maturity_levels": map[string]string{
				"hypothetical": "Concept only, not yet implemented",
				"emerging":     "Initial implementation, limited validation",
				"proven":       "Validated with real users, stable",
				"scaled":       "Production-ready, widely adopted",
			},
			"next_steps": []string{
				"Update related KRs if this capability delivers on their targets",
				"Consider updating feature status if all capabilities are now proven/scaled",
				"Add implementation references to track the code that delivers this capability",
			},
		},
	}, nil
}

// AddMappingArtifactResult is the result of adding a mapping artifact.
type AddMappingArtifactResult struct {
	Success       bool                   `json:"success"`
	MappingsFile  string                 `json:"mappings_file"`
	ArtifactAdded *MappingArtifact       `json:"artifact_added"`
	SubComponent  string                 `json:"sub_component"`
	WasNewEntry   bool                   `json:"was_new_entry"`
	BackupFile    string                 `json:"backup_file,omitempty"`
	Guidance      map[string]interface{} `json:"guidance"`
}

// AddMappingArtifact adds a new artifact to mappings.yaml for a value model path.
func (w *Writer) AddMappingArtifact(
	subComponentID string,
	artifactType string,
	url string,
	description string,
) (*AddMappingArtifactResult, error) {
	// Find the mappings file
	mappingsPath := filepath.Join(w.instancePath, "FIRE", "mappings.yaml")
	if _, err := os.Stat(mappingsPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("mappings.yaml not found at %s", mappingsPath)
	}

	// Read and parse the YAML file
	data, err := os.ReadFile(mappingsPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read mappings file: %w", err)
	}

	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Create backup
	backupFile, err := w.createBackup(mappingsPath, data)
	if err != nil {
		return nil, fmt.Errorf("failed to create backup: %w", err)
	}

	// Add the artifact to the appropriate section
	wasNewEntry, err := w.addArtifactToMappings(&doc, subComponentID, artifactType, url, description)
	if err != nil {
		return nil, fmt.Errorf("failed to add artifact: %w", err)
	}

	// Write the updated YAML
	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(&doc); err != nil {
		return nil, fmt.Errorf("failed to encode YAML: %w", err)
	}

	if err := os.WriteFile(mappingsPath, buf.Bytes(), 0644); err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	artifact := &MappingArtifact{
		Type:        artifactType,
		URL:         url,
		Description: description,
	}

	return &AddMappingArtifactResult{
		Success:       true,
		MappingsFile:  mappingsPath,
		ArtifactAdded: artifact,
		SubComponent:  subComponentID,
		WasNewEntry:   wasNewEntry,
		BackupFile:    backupFile,
		Guidance: map[string]interface{}{
			"artifact_types": []string{"code", "design", "documentation", "test"},
			"next_steps": []string{
				"Verify the artifact URL is accessible",
				"Consider adding related artifacts (tests, docs) for the same component",
				"Run 'epf-cli validate FIRE/mappings.yaml' to ensure validity",
			},
			"related_tools": []string{
				"epf_analyze_coverage - Check value model coverage after adding",
				"epf_validate_relationships - Validate all relationship paths",
			},
		},
	}, nil
}

// SuggestRelationshipsResult is the result of suggesting relationships.
type SuggestRelationshipsResult struct {
	Suggestions []RelationshipSuggestion `json:"suggestions"`
	Guidance    map[string]interface{}   `json:"guidance"`
}

// RelationshipSuggestion represents a suggested relationship.
type RelationshipSuggestion struct {
	Type       string  `json:"type"`       // contributes_to, implementation_reference, mapping
	Target     string  `json:"target"`     // Target path or ID
	Confidence float64 `json:"confidence"` // 0-1 confidence score
	Reasoning  string  `json:"reasoning"`  // Why this suggestion
	Action     string  `json:"action"`     // MCP tool call to apply
}

// SuggestRelationships analyzes an artifact and suggests relationships.
func (w *Writer) SuggestRelationships(
	artifactType string,
	artifactPath string,
	includeCodeAnalysis bool,
) (*SuggestRelationshipsResult, error) {
	suggestions := make([]RelationshipSuggestion, 0)

	switch artifactType {
	case "feature":
		featureSuggestions, err := w.suggestForFeature(artifactPath)
		if err != nil {
			return nil, err
		}
		suggestions = append(suggestions, featureSuggestions...)

	case "code_file":
		codeSuggestions, err := w.suggestForCodeFile(artifactPath, includeCodeAnalysis)
		if err != nil {
			return nil, err
		}
		suggestions = append(suggestions, codeSuggestions...)

	case "pr":
		prSuggestions, err := w.suggestForPR(artifactPath)
		if err != nil {
			return nil, err
		}
		suggestions = append(suggestions, prSuggestions...)

	default:
		return nil, fmt.Errorf("unsupported artifact type: %s (supported: feature, code_file, pr)", artifactType)
	}

	return &SuggestRelationshipsResult{
		Suggestions: suggestions,
		Guidance: map[string]interface{}{
			"confidence_thresholds": map[string]string{
				"high":   ">0.8 - Strong match, likely correct",
				"medium": "0.5-0.8 - Reasonable match, verify before applying",
				"low":    "<0.5 - Weak match, may need manual review",
			},
			"how_to_apply": "Use the 'action' field to call the appropriate MCP tool",
			"tips": []string{
				"Review suggestions with confidence < 0.7 before applying",
				"Multiple low-confidence suggestions may indicate a cross-cutting feature",
				"Missing suggestions may mean the value model needs new components",
			},
		},
	}, nil
}

// Helper methods

func (w *Writer) findFeatureFile(featureIDOrSlug string) (string, error) {
	featureDefsDir := filepath.Join(w.instancePath, "FIRE", "feature_definitions")

	entries, err := os.ReadDir(featureDefsDir)
	if err != nil {
		return "", fmt.Errorf("failed to read feature_definitions directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || (!strings.HasSuffix(entry.Name(), ".yaml") && !strings.HasSuffix(entry.Name(), ".yml")) {
			continue
		}

		filePath := filepath.Join(featureDefsDir, entry.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		// Quick check for ID or slug in the file
		var feature struct {
			ID   string `yaml:"id"`
			Slug string `yaml:"slug"`
		}
		if err := yaml.Unmarshal(data, &feature); err != nil {
			continue
		}

		if feature.ID == featureIDOrSlug || feature.Slug == featureIDOrSlug {
			return filePath, nil
		}
	}

	return "", fmt.Errorf("feature not found: %s", featureIDOrSlug)
}

func (w *Writer) createBackup(filePath string, data []byte) (string, error) {
	if err := os.MkdirAll(w.backupDir, 0755); err != nil {
		return "", err
	}

	timestamp := time.Now().Format("20060102-150405")
	baseName := filepath.Base(filePath)
	backupName := fmt.Sprintf("%s.%s.bak", baseName, timestamp)
	backupPath := filepath.Join(w.backupDir, backupName)

	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		return "", err
	}

	return backupPath, nil
}

func (w *Writer) addOrUpdateReference(doc *yaml.Node, refType, title, url, status, description string) (bool, error) {
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return false, fmt.Errorf("invalid YAML document structure")
	}

	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return false, fmt.Errorf("root must be a mapping")
	}

	// Find or create implementation_references key
	var refsNode *yaml.Node
	var refsIndex int = -1

	for i := 0; i < len(root.Content); i += 2 {
		keyNode := root.Content[i]
		if keyNode.Value == "implementation_references" {
			refsIndex = i + 1
			refsNode = root.Content[i+1]
			break
		}
	}

	// Create new reference node
	newRef := &yaml.Node{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "type"},
			{Kind: yaml.ScalarNode, Value: refType},
			{Kind: yaml.ScalarNode, Value: "title"},
			{Kind: yaml.ScalarNode, Value: title},
			{Kind: yaml.ScalarNode, Value: "url"},
			{Kind: yaml.ScalarNode, Value: url},
			{Kind: yaml.ScalarNode, Value: "status"},
			{Kind: yaml.ScalarNode, Value: status},
		},
	}

	if description != "" {
		newRef.Content = append(newRef.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "description"},
			&yaml.Node{Kind: yaml.ScalarNode, Value: description},
		)
	}

	if refsNode == nil {
		// Create new implementation_references section
		keyNode := &yaml.Node{Kind: yaml.ScalarNode, Value: "implementation_references"}
		refsNode = &yaml.Node{
			Kind:    yaml.SequenceNode,
			Content: []*yaml.Node{newRef},
		}
		root.Content = append(root.Content, keyNode, refsNode)
		return false, nil
	}

	// Check if this URL already exists and update it
	for _, item := range refsNode.Content {
		if item.Kind == yaml.MappingNode {
			for j := 0; j < len(item.Content); j += 2 {
				if item.Content[j].Value == "url" && item.Content[j+1].Value == url {
					// Update existing reference
					for k := 0; k < len(item.Content); k += 2 {
						switch item.Content[k].Value {
						case "type":
							item.Content[k+1].Value = refType
						case "title":
							item.Content[k+1].Value = title
						case "status":
							item.Content[k+1].Value = status
						case "description":
							item.Content[k+1].Value = description
						}
					}
					return true, nil
				}
			}
		}
	}

	// Add new reference
	refsNode.Content = append(refsNode.Content, newRef)
	_ = refsIndex // silence unused variable
	return false, nil
}

func (w *Writer) updateCapabilityMaturityInDoc(doc *yaml.Node, capabilityID, maturity, evidence, deliveredByKR string) (string, error) {
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return "", fmt.Errorf("invalid YAML document structure")
	}

	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return "", fmt.Errorf("root must be a mapping")
	}

	// Navigate to feature_maturity section
	var maturityNode *yaml.Node
	for i := 0; i < len(root.Content); i += 2 {
		if root.Content[i].Value == "feature_maturity" {
			maturityNode = root.Content[i+1]
			break
		}
	}

	if maturityNode == nil {
		// Create feature_maturity section
		maturityNode = &yaml.Node{
			Kind: yaml.MappingNode,
			Content: []*yaml.Node{
				{Kind: yaml.ScalarNode, Value: "overall_stage"},
				{Kind: yaml.ScalarNode, Value: "emerging"},
				{Kind: yaml.ScalarNode, Value: "capabilities"},
				{Kind: yaml.MappingNode, Content: []*yaml.Node{}},
			},
		}
		root.Content = append(root.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "feature_maturity"},
			maturityNode,
		)
	}

	// Find capabilities within feature_maturity
	var capsNode *yaml.Node
	for i := 0; i < len(maturityNode.Content); i += 2 {
		if maturityNode.Content[i].Value == "capabilities" {
			capsNode = maturityNode.Content[i+1]
			break
		}
	}

	if capsNode == nil {
		capsNode = &yaml.Node{Kind: yaml.MappingNode, Content: []*yaml.Node{}}
		maturityNode.Content = append(maturityNode.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: "capabilities"},
			capsNode,
		)
	}

	// Find or create the capability entry
	var previousMaturity string = "not_set"
	var capFound bool

	for i := 0; i < len(capsNode.Content); i += 2 {
		if capsNode.Content[i].Value == capabilityID {
			capFound = true
			capNode := capsNode.Content[i+1]
			if capNode.Kind == yaml.MappingNode {
				for j := 0; j < len(capNode.Content); j += 2 {
					if capNode.Content[j].Value == "maturity" {
						previousMaturity = capNode.Content[j+1].Value
						capNode.Content[j+1].Value = maturity
					} else if capNode.Content[j].Value == "evidence" {
						capNode.Content[j+1].Value = evidence
					} else if capNode.Content[j].Value == "delivered_by_kr" && deliveredByKR != "" {
						capNode.Content[j+1].Value = deliveredByKR
					}
				}
			}
			break
		}
	}

	if !capFound {
		// Create new capability entry
		newCapContent := []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "maturity"},
			{Kind: yaml.ScalarNode, Value: maturity},
			{Kind: yaml.ScalarNode, Value: "evidence"},
			{Kind: yaml.ScalarNode, Value: evidence},
		}
		if deliveredByKR != "" {
			newCapContent = append(newCapContent,
				&yaml.Node{Kind: yaml.ScalarNode, Value: "delivered_by_kr"},
				&yaml.Node{Kind: yaml.ScalarNode, Value: deliveredByKR},
			)
		}
		capsNode.Content = append(capsNode.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: capabilityID},
			&yaml.Node{Kind: yaml.MappingNode, Content: newCapContent},
		)
	}

	return previousMaturity, nil
}

func (w *Writer) addArtifactToMappings(doc *yaml.Node, subComponentID, artifactType, url, description string) (bool, error) {
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return false, fmt.Errorf("invalid YAML document structure")
	}

	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return false, fmt.Errorf("root must be a mapping")
	}

	// Parse the sub_component_id to determine track
	parts := strings.Split(subComponentID, ".")
	if len(parts) < 2 {
		return false, fmt.Errorf("invalid sub_component_id format: %s (expected Track.Component...)", subComponentID)
	}
	track := strings.ToLower(parts[0])

	// Find the track section
	var trackNode *yaml.Node
	for i := 0; i < len(root.Content); i += 2 {
		if strings.ToLower(root.Content[i].Value) == track {
			trackNode = root.Content[i+1]
			break
		}
	}

	if trackNode == nil {
		// Create track section
		trackNode = &yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{}}
		root.Content = append(root.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Value: track},
			trackNode,
		)
	}

	if trackNode.Kind != yaml.SequenceNode {
		return false, fmt.Errorf("track '%s' is not a sequence", track)
	}

	// Create artifact node
	artifactNode := &yaml.Node{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "type"},
			{Kind: yaml.ScalarNode, Value: artifactType},
			{Kind: yaml.ScalarNode, Value: "url"},
			{Kind: yaml.ScalarNode, Value: url},
			{Kind: yaml.ScalarNode, Value: "description"},
			{Kind: yaml.ScalarNode, Value: description},
		},
	}

	// Find existing sub_component_id entry
	for _, entry := range trackNode.Content {
		if entry.Kind != yaml.MappingNode {
			continue
		}

		for j := 0; j < len(entry.Content); j += 2 {
			if entry.Content[j].Value == "sub_component_id" && entry.Content[j+1].Value == subComponentID {
				// Found existing entry, add artifact to its artifacts list
				for k := 0; k < len(entry.Content); k += 2 {
					if entry.Content[k].Value == "artifacts" {
						artifactsNode := entry.Content[k+1]
						if artifactsNode.Kind == yaml.SequenceNode {
							// Check for duplicate URL
							for _, existing := range artifactsNode.Content {
								if existing.Kind == yaml.MappingNode {
									for m := 0; m < len(existing.Content); m += 2 {
										if existing.Content[m].Value == "url" && existing.Content[m+1].Value == url {
											return false, fmt.Errorf("artifact with URL already exists: %s", url)
										}
									}
								}
							}
							artifactsNode.Content = append(artifactsNode.Content, artifactNode)
							return false, nil
						}
					}
				}
			}
		}
	}

	// Create new entry for this sub_component_id
	newEntry := &yaml.Node{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "sub_component_id"},
			{Kind: yaml.ScalarNode, Value: subComponentID},
			{Kind: yaml.ScalarNode, Value: "artifacts"},
			{Kind: yaml.SequenceNode, Content: []*yaml.Node{artifactNode}},
		},
	}
	trackNode.Content = append(trackNode.Content, newEntry)

	return true, nil
}

func (w *Writer) suggestForFeature(featurePath string) ([]RelationshipSuggestion, error) {
	suggestions := make([]RelationshipSuggestion, 0)

	// Load the feature
	data, err := os.ReadFile(featurePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read feature file: %w", err)
	}

	var feature struct {
		ID               string `yaml:"id"`
		Name             string `yaml:"name"`
		Slug             string `yaml:"slug"`
		StrategicContext struct {
			ContributesTo []string `yaml:"contributes_to"`
		} `yaml:"strategic_context"`
		Definition struct {
			JobToBeDone      string `yaml:"job_to_be_done"`
			SolutionApproach string `yaml:"solution_approach"`
		} `yaml:"definition"`
	}
	if err := yaml.Unmarshal(data, &feature); err != nil {
		return nil, fmt.Errorf("failed to parse feature: %w", err)
	}

	// Load value models to suggest contributes_to paths
	analyzer := NewAnalyzer(w.instancePath)
	if err := analyzer.Load(); err != nil {
		// Can't load analyzer, return empty suggestions
		return suggestions, nil
	}

	// If feature has no contributes_to, suggest based on name/description
	if len(feature.StrategicContext.ContributesTo) == 0 {
		// Simple keyword matching for suggestions
		keywords := extractKeywords(feature.Name + " " + feature.Definition.JobToBeDone)

		for _, path := range analyzer.valueModels.GetAllPaths() {
			pathLower := strings.ToLower(path)
			for _, keyword := range keywords {
				if strings.Contains(pathLower, keyword) {
					suggestions = append(suggestions, RelationshipSuggestion{
						Type:       "contributes_to",
						Target:     path,
						Confidence: 0.6,
						Reasoning:  fmt.Sprintf("Feature name/description contains keyword '%s' matching path", keyword),
						Action:     fmt.Sprintf("Add '%s' to contributes_to in %s", path, featurePath),
					})
					break
				}
			}
		}
	}

	// Suggest implementation references based on feature slug/name
	suggestions = append(suggestions, RelationshipSuggestion{
		Type:       "implementation_reference",
		Target:     fmt.Sprintf("https://github.com/emergent-company/product-factory-os/tree/main/apps/%s", feature.Slug),
		Confidence: 0.4,
		Reasoning:  "Suggested code location based on feature slug",
		Action:     fmt.Sprintf("epf_add_implementation_reference feature_id=%s ref_type=code url=...", feature.ID),
	})

	return suggestions, nil
}

func (w *Writer) suggestForCodeFile(codePath string, includeCodeAnalysis bool) ([]RelationshipSuggestion, error) {
	suggestions := make([]RelationshipSuggestion, 0)

	// Extract path components for matching
	pathParts := strings.Split(codePath, string(filepath.Separator))

	// Load analyzer
	analyzer := NewAnalyzer(w.instancePath)
	if err := analyzer.Load(); err != nil {
		return suggestions, nil
	}

	// Match path parts against value model paths
	for _, vmPath := range analyzer.valueModels.GetAllPaths() {
		vmPathLower := strings.ToLower(vmPath)
		for _, part := range pathParts {
			partLower := strings.ToLower(part)
			if len(partLower) > 3 && strings.Contains(vmPathLower, partLower) {
				suggestions = append(suggestions, RelationshipSuggestion{
					Type:       "mapping",
					Target:     vmPath,
					Confidence: 0.5,
					Reasoning:  fmt.Sprintf("Code path component '%s' matches value model path", part),
					Action:     fmt.Sprintf("epf_add_mapping_artifact sub_component_id=%s artifact_type=code url=%s", vmPath, codePath),
				})
				break
			}
		}
	}

	return suggestions, nil
}

func (w *Writer) suggestForPR(prURL string) ([]RelationshipSuggestion, error) {
	suggestions := make([]RelationshipSuggestion, 0)

	// Load features
	loader := NewFeatureLoader(w.instancePath)
	features, err := loader.Load()
	if err != nil {
		return suggestions, nil
	}

	// Suggest adding PR as implementation reference to active/delivered features
	for _, feature := range features.ByStatus[FeatureStatusActive] {
		suggestions = append(suggestions, RelationshipSuggestion{
			Type:       "implementation_reference",
			Target:     feature.ID,
			Confidence: 0.3,
			Reasoning:  fmt.Sprintf("Feature '%s' is active and may be related to this PR", feature.Name),
			Action:     fmt.Sprintf("epf_add_implementation_reference feature_id=%s ref_type=pr url=%s title=\"PR: ...\"", feature.ID, prURL),
		})
	}

	return suggestions, nil
}

func extractKeywords(text string) []string {
	// Simple keyword extraction - lowercase words > 4 chars
	words := strings.Fields(strings.ToLower(text))
	keywords := make([]string, 0)
	seen := make(map[string]bool)

	stopWords := map[string]bool{
		"when": true, "want": true, "that": true, "this": true, "with": true,
		"from": true, "have": true, "will": true, "been": true, "would": true,
		"could": true, "should": true, "their": true, "there": true, "which": true,
	}

	for _, word := range words {
		// Remove punctuation
		word = strings.Trim(word, ".,;:!?\"'()-")
		if len(word) > 4 && !stopWords[word] && !seen[word] {
			keywords = append(keywords, word)
			seen[word] = true
		}
	}

	return keywords
}
