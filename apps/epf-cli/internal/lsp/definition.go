package lsp

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/relationships"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
	"github.com/tliron/glsp"
	protocol "github.com/tliron/glsp/protocol_3_16"
	"gopkg.in/yaml.v3"
)

// handleTextDocumentDefinition resolves go-to-definition requests for EPF YAML files.
// It supports:
//   - contributes_to values → jump to the value model file at the matching layer/component
//   - dependency IDs (requires/enables) → jump to the referenced feature definition file
func (s *Server) handleTextDocumentDefinition(ctx *glsp.Context, params *protocol.DefinitionParams) (any, error) {
	doc := s.documents.Get(params.TextDocument.URI)
	if doc == nil || !doc.IsYAML() || doc.ArtifactType == "" {
		return nil, nil
	}

	content := []byte(doc.Content)
	pos := ResolveYAMLPosition(content, params.Position.Line, params.Position.Character)

	// We only resolve definitions for values, not keys
	if !pos.IsValue || pos.Node == nil || pos.Node.Value == "" {
		return nil, nil
	}

	instancePath := s.detectInstancePath()
	if instancePath == "" {
		return nil, nil
	}

	// Check if cursor is on a contributes_to value
	if isContributesToField(pos.SchemaPath) {
		return s.definitionForContributesTo(pos.Node.Value, instancePath)
	}

	// Check if cursor is on a dependency ID value
	if isDependencyIDField(pos.SchemaPath) {
		return s.definitionForDependencyID(pos.Node.Value, instancePath)
	}

	return nil, nil
}

// isDependencyIDField checks if the schema path indicates a dependency requires/enables ID value.
// Matches paths like:
//   - dependencies.requires.id
//   - dependencies.enables.id
func isDependencyIDField(schemaPath string) bool {
	return strings.Contains(schemaPath, "dependencies.requires") && strings.HasSuffix(schemaPath, ".id") ||
		strings.Contains(schemaPath, "dependencies.enables") && strings.HasSuffix(schemaPath, ".id")
}

// definitionForContributesTo resolves a value model path to a Location in the
// corresponding value model YAML file.
func (s *Server) definitionForContributesTo(path, instancePath string) (*protocol.Location, error) {
	// Load value models
	loader := valuemodel.NewLoader(instancePath)
	models, err := loader.Load()
	if err != nil {
		return nil, nil // Gracefully return nothing on load error
	}

	resolver := valuemodel.NewResolver(models)
	resolution, err := resolver.Resolve(path)
	if err != nil {
		return nil, nil // Path doesn't resolve — no definition to jump to
	}

	if resolution.TrackModel == nil || resolution.TrackModel.FilePath == "" {
		return nil, nil
	}

	filePath := resolution.TrackModel.FilePath
	line := findValueModelNodeLine(filePath, resolution)

	uri := pathToURI(filePath)
	return &protocol.Location{
		URI: uri,
		Range: protocol.Range{
			Start: protocol.Position{Line: line, Character: 0},
			End:   protocol.Position{Line: line, Character: 0},
		},
	}, nil
}

// definitionForDependencyID resolves a feature dependency ID (e.g., "fd-003") to a
// Location in the referenced feature definition file.
func (s *Server) definitionForDependencyID(featureID, instancePath string) (*protocol.Location, error) {
	featureLoader := relationships.NewFeatureLoader(instancePath)
	featureSet, err := featureLoader.Load()
	if err != nil {
		return nil, nil
	}

	feature, ok := featureSet.GetFeature(featureID)
	if !ok || feature.FilePath == "" {
		return nil, nil
	}

	uri := pathToURI(feature.FilePath)
	return &protocol.Location{
		URI: uri,
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 0},
		},
	}, nil
}

// findValueModelNodeLine parses a value model YAML file and finds the line number
// of the deepest matched node from the resolution. Returns a 0-indexed line number.
func findValueModelNodeLine(filePath string, resolution *valuemodel.PathResolution) uint32 {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0
	}

	var docNode yaml.Node
	if err := yaml.Unmarshal(data, &docNode); err != nil {
		return 0
	}

	if docNode.Kind != yaml.DocumentNode || len(docNode.Content) == 0 {
		return 0
	}

	root := docNode.Content[0]

	// Find the "layers" sequence in the root mapping
	layersNode := findMappingValue(root, "layers")
	if layersNode == nil || layersNode.Kind != yaml.SequenceNode {
		return 0
	}

	if resolution.Layer == nil {
		return 0
	}

	// Walk layers to find matching layer
	for _, layerNode := range layersNode.Content {
		if layerNode.Kind != yaml.MappingNode {
			continue
		}

		if !matchesIDOrName(layerNode, resolution.Layer.ID, resolution.Layer.Name) {
			continue
		}

		// Found the layer — if no deeper resolution needed, return layer line
		if resolution.Component == nil {
			return yamlToLSPLine(layerNode.Line)
		}

		// Find components sequence within this layer
		componentsNode := findMappingValue(layerNode, "components")
		if componentsNode == nil || componentsNode.Kind != yaml.SequenceNode {
			return yamlToLSPLine(layerNode.Line)
		}

		for _, compNode := range componentsNode.Content {
			if compNode.Kind != yaml.MappingNode {
				continue
			}

			if !matchesIDOrName(compNode, resolution.Component.ID, resolution.Component.Name) {
				continue
			}

			// Found the component — if no deeper resolution, return component line
			if resolution.SubComponent == nil {
				return yamlToLSPLine(compNode.Line)
			}

			// Find sub_components or subs sequence
			subsNode := findMappingValue(compNode, "sub_components")
			if subsNode == nil {
				subsNode = findMappingValue(compNode, "subs")
			}
			if subsNode == nil || subsNode.Kind != yaml.SequenceNode {
				return yamlToLSPLine(compNode.Line)
			}

			for _, subNode := range subsNode.Content {
				if subNode.Kind != yaml.MappingNode {
					continue
				}

				if matchesIDOrName(subNode, resolution.SubComponent.ID, resolution.SubComponent.Name) {
					return yamlToLSPLine(subNode.Line)
				}
			}

			// Sub-component not found in YAML — fall back to component line
			return yamlToLSPLine(compNode.Line)
		}

		// Component not found in YAML — fall back to layer line
		return yamlToLSPLine(layerNode.Line)
	}

	// Layer not found — fall back to top of file
	return 0
}

// matchesIDOrName checks if a YAML mapping node has an "id" or "name" field
// that matches the given values (case-insensitive for normalized comparison).
func matchesIDOrName(node *yaml.Node, id, name string) bool {
	if node.Kind != yaml.MappingNode {
		return false
	}

	for i := 0; i < len(node.Content)-1; i += 2 {
		key := node.Content[i].Value
		val := node.Content[i+1].Value

		if key == "id" && val != "" {
			if strings.EqualFold(val, id) {
				return true
			}
			// Also check normalized form: kebab-case ID might match PascalCase
			if normalizeForMatch(val) == normalizeForMatch(id) {
				return true
			}
		}
		if key == "name" && val != "" {
			if strings.EqualFold(val, name) {
				return true
			}
			if normalizeForMatch(val) == normalizeForMatch(name) {
				return true
			}
		}
	}

	return false
}

// normalizeForMatch normalizes a string for fuzzy matching by removing
// hyphens, underscores, spaces, and lowercasing.
func normalizeForMatch(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, " ", "")
	return s
}

// yamlToLSPLine converts a 1-indexed yaml.Node.Line to a 0-indexed LSP line.
func yamlToLSPLine(yamlLine int) uint32 {
	if yamlLine <= 0 {
		return 0
	}
	return uint32(yamlLine - 1)
}

// pathToURI converts a filesystem path to an LSP document URI.
func pathToURI(filePath string) protocol.DocumentUri {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		absPath = filePath
	}
	return protocol.DocumentUri(fmt.Sprintf("file://%s", absPath))
}
