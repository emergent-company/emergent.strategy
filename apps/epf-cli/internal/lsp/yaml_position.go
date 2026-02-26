package lsp

import (
	"encoding/json"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"gopkg.in/yaml.v3"
)

// YAMLPosition represents a position within a YAML document, together with
// the resolved schema path and the node at that position.
type YAMLPosition struct {
	// SchemaPath is the dot-separated path from the root to the node,
	// e.g., "north_star.vision.vision_statement".
	SchemaPath string

	// Node is the yaml.Node at (or nearest to) the cursor position.
	// nil if no node could be found.
	Node *yaml.Node

	// ParentNode is the parent mapping/sequence node, if available.
	ParentNode *yaml.Node

	// IsKey is true if the cursor is on a mapping key rather than a value.
	IsKey bool

	// IsValue is true if the cursor is on a mapping value.
	IsValue bool

	// Key is the YAML key name at the cursor (if inside a mapping).
	Key string

	// Depth is the nesting depth (0 = root).
	Depth int
}

// ResolveYAMLPosition parses the YAML content and finds the node at the
// given LSP position (0-indexed line and character). It returns the schema
// path and context information for completions and hover.
func ResolveYAMLPosition(content []byte, line, character uint32) *YAMLPosition {
	var docNode yaml.Node
	if err := yaml.Unmarshal(content, &docNode); err != nil {
		return &YAMLPosition{}
	}

	// yaml.Unmarshal wraps everything in a DocumentNode
	if docNode.Kind != yaml.DocumentNode || len(docNode.Content) == 0 {
		return &YAMLPosition{}
	}

	root := docNode.Content[0]

	// Convert LSP 0-indexed position to yaml.v3 1-indexed
	yamlLine := int(line) + 1
	yamlCol := int(character) + 1

	result := &YAMLPosition{}
	var pathParts []string

	findNodeAtPosition(root, yamlLine, yamlCol, pathParts, result, nil)

	return result
}

// findNodeAtPosition recursively walks the YAML node tree to find the node
// at or nearest to the given position. It builds the schema path as it walks.
func findNodeAtPosition(node *yaml.Node, targetLine, targetCol int, path []string, result *YAMLPosition, parent *yaml.Node) {
	if node == nil {
		return
	}

	switch node.Kind {
	case yaml.MappingNode:
		findInMapping(node, targetLine, targetCol, path, result, parent)

	case yaml.SequenceNode:
		findInSequence(node, targetLine, targetCol, path, result, parent)

	case yaml.ScalarNode:
		// Direct hit on a scalar — update result if this is on the target line
		if node.Line == targetLine {
			result.Node = node
			result.ParentNode = parent
			result.SchemaPath = joinPath(path)
			result.Depth = len(path)
			// Scalars that are direct children of a sequence are values
			if parent != nil && parent.Kind == yaml.SequenceNode {
				result.IsValue = true
			}
		}
	}
}

// findInMapping handles MappingNode traversal.
// MappingNode.Content alternates: [key0, val0, key1, val1, ...]
func findInMapping(node *yaml.Node, targetLine, targetCol int, path []string, result *YAMLPosition, grandparent *yaml.Node) {
	for i := 0; i+1 < len(node.Content); i += 2 {
		keyNode := node.Content[i]
		valNode := node.Content[i+1]

		keyName := keyNode.Value

		// Determine the range this key-value pair covers:
		// from keyNode.Line to (next key's Line - 1) or end of mapping
		pairEndLine := endLineOfPair(node, i)

		// Is the cursor on the key itself?
		if keyNode.Line == targetLine {
			// Cursor is on or before the colon — treat as key position
			keyEndCol := keyNode.Column + len(keyNode.Value)
			if targetCol <= keyEndCol {
				result.Node = keyNode
				result.ParentNode = node
				result.SchemaPath = joinPath(append(path, keyName))
				result.Key = keyName
				result.IsKey = true
				result.IsValue = false
				result.Depth = len(path) + 1
				// Don't return — keep scanning for a more specific match
				// But a key hit is already specific, so we can return
				return
			}

			// Cursor is after the key on the same line — it's on the value
			if valNode.Kind == yaml.ScalarNode && valNode.Line == targetLine {
				result.Node = valNode
				result.ParentNode = node
				result.SchemaPath = joinPath(append(path, keyName))
				result.Key = keyName
				result.IsKey = false
				result.IsValue = true
				result.Depth = len(path) + 1
				return
			}
		}

		// Is the cursor within this key-value pair's line range?
		if targetLine >= keyNode.Line && targetLine <= pairEndLine {
			// The cursor is inside this key's value subtree
			subPath := append(path, keyName)

			// If the value is a complex node (mapping/sequence), recurse
			if valNode.Kind == yaml.MappingNode || valNode.Kind == yaml.SequenceNode {
				// Update result with current path context as we descend
				result.ParentNode = node
				result.Key = keyName
				result.SchemaPath = joinPath(subPath)
				result.Depth = len(subPath)

				findNodeAtPosition(valNode, targetLine, targetCol, subPath, result, node)
				return
			}

			// Scalar or alias value
			result.Node = valNode
			result.ParentNode = node
			result.SchemaPath = joinPath(subPath)
			result.Key = keyName
			result.IsKey = false
			result.IsValue = true
			result.Depth = len(subPath)
			return
		}
	}

	// Cursor is inside the mapping but not on any specific key-value pair
	// (e.g., on a blank line between entries). Report the mapping itself.
	if isWithinNodeRange(node, targetLine) {
		result.Node = node
		result.ParentNode = grandparent
		result.SchemaPath = joinPath(path)
		result.Depth = len(path)
	}
}

// findInSequence handles SequenceNode traversal.
func findInSequence(node *yaml.Node, targetLine, targetCol int, path []string, result *YAMLPosition, parent *yaml.Node) {
	for idx, item := range node.Content {
		itemEndLine := endLineOfSequenceItem(node, idx)

		if targetLine >= item.Line && targetLine <= itemEndLine {
			// Index into the schema path as [n] for arrays
			// But for schema purposes, we just pass through to the item
			// since JSON Schema uses "items" for array elements
			findNodeAtPosition(item, targetLine, targetCol, path, result, node)
			return
		}
	}

	// On a blank line within the sequence
	if isWithinNodeRange(node, targetLine) {
		result.Node = node
		result.ParentNode = parent
		result.SchemaPath = joinPath(path)
		result.Depth = len(path)
	}
}

// endLineOfPair returns the last line covered by the key-value pair at index i
// in a mapping node. If there's a next pair, it's (nextKey.Line - 1).
// Otherwise, we estimate from the value node.
func endLineOfPair(mapping *yaml.Node, keyIndex int) int {
	nextKeyIndex := keyIndex + 2
	if nextKeyIndex < len(mapping.Content) {
		return mapping.Content[nextKeyIndex].Line - 1
	}
	// Last pair — use the value node's extent
	valNode := mapping.Content[keyIndex+1]
	return estimateEndLine(valNode)
}

// endLineOfSequenceItem returns the last line of a sequence item.
func endLineOfSequenceItem(seq *yaml.Node, idx int) int {
	if idx+1 < len(seq.Content) {
		return seq.Content[idx+1].Line - 1
	}
	return estimateEndLine(seq.Content[idx])
}

// estimateEndLine tries to estimate the last line a node spans.
// For scalar nodes, it's just the node's line. For complex nodes,
// we look at the last child recursively.
func estimateEndLine(node *yaml.Node) int {
	if node == nil {
		return 0
	}
	switch node.Kind {
	case yaml.MappingNode:
		if len(node.Content) >= 2 {
			return estimateEndLine(node.Content[len(node.Content)-1])
		}
		return node.Line
	case yaml.SequenceNode:
		if len(node.Content) > 0 {
			return estimateEndLine(node.Content[len(node.Content)-1])
		}
		return node.Line
	default:
		// For multiline scalars, count newlines
		lines := strings.Count(node.Value, "\n")
		return node.Line + lines
	}
}

// isWithinNodeRange checks if a line falls within a node's range.
func isWithinNodeRange(node *yaml.Node, line int) bool {
	if node == nil {
		return false
	}
	return line >= node.Line && line <= estimateEndLine(node)
}

// joinPath joins path parts with dots.
func joinPath(parts []string) string {
	return strings.Join(parts, ".")
}

// SchemaPropertyInfo holds information about a JSON Schema property,
// extracted for completions and hover.
type SchemaPropertyInfo struct {
	Name        string   `json:"name"`
	Type        string   `json:"type,omitempty"` // "string", "object", "array", etc.
	Description string   `json:"description,omitempty"`
	Enum        []string `json:"enum,omitempty"`    // Valid enum values
	Pattern     string   `json:"pattern,omitempty"` // Regex pattern constraint
	MinLength   *int     `json:"minLength,omitempty"`
	MaxLength   *int     `json:"maxLength,omitempty"`
	MinItems    *int     `json:"minItems,omitempty"`
	MaxItems    *int     `json:"maxItems,omitempty"`
	Required    bool     `json:"required,omitempty"` // Is this property required?
	Default     any      `json:"default,omitempty"`
}

// ResolveSchemaPath navigates a JSON Schema to find information about
// the property at the given dot-separated path.
// Returns nil if the path cannot be resolved in the schema.
func ResolveSchemaPath(schemaJSON json.RawMessage, path string) *SchemaPropertyInfo {
	if len(schemaJSON) == 0 || path == "" {
		return nil
	}

	var schemaMap map[string]any
	if err := json.Unmarshal(schemaJSON, &schemaMap); err != nil {
		return nil
	}

	parts := strings.Split(path, ".")
	return navigateSchema(schemaMap, parts, nil)
}

// GetChildProperties returns the available child properties for a node
// at the given schema path. Used for key completion.
func GetChildProperties(schemaJSON json.RawMessage, path string) []SchemaPropertyInfo {
	if len(schemaJSON) == 0 {
		return nil
	}

	var schemaMap map[string]any
	if err := json.Unmarshal(schemaJSON, &schemaMap); err != nil {
		return nil
	}

	// Navigate to the target node in the schema
	var current map[string]any
	if path == "" {
		current = schemaMap
	} else {
		parts := strings.Split(path, ".")
		current = navigateToSchemaNode(schemaMap, parts)
	}

	if current == nil {
		return nil
	}

	return extractProperties(current)
}

// navigateSchema walks the JSON Schema tree following the given path parts.
func navigateSchema(schemaMap map[string]any, parts []string, parentRequired []string) *SchemaPropertyInfo {
	current := schemaMap

	var lastRequired []string

	for i, part := range parts {
		// Get required list at this level
		requiredList := getRequiredList(current)

		// Look in "properties"
		props, ok := current["properties"].(map[string]any)
		if !ok {
			return nil
		}

		propSchema, ok := props[part].(map[string]any)
		if !ok {
			return nil
		}

		// If this is the last part, extract info
		if i == len(parts)-1 {
			return extractPropertyInfo(part, propSchema, requiredList)
		}

		// Descend into the property's schema
		lastRequired = requiredList
		current = resolvePropertySchema(propSchema)
		if current == nil {
			return nil
		}
		_ = lastRequired
	}

	return nil
}

// navigateToSchemaNode walks to a schema node without extracting info.
func navigateToSchemaNode(schemaMap map[string]any, parts []string) map[string]any {
	current := schemaMap

	for _, part := range parts {
		props, ok := current["properties"].(map[string]any)
		if !ok {
			return nil
		}

		propSchema, ok := props[part].(map[string]any)
		if !ok {
			return nil
		}

		current = resolvePropertySchema(propSchema)
		if current == nil {
			return nil
		}
	}

	return current
}

// resolvePropertySchema resolves a property schema, handling type=object
// (return as-is), type=array (return items schema), and nested structures.
func resolvePropertySchema(propSchema map[string]any) map[string]any {
	typ, _ := propSchema["type"].(string)

	switch typ {
	case "object":
		return propSchema
	case "array":
		// For arrays, the relevant schema for children is in "items"
		if items, ok := propSchema["items"].(map[string]any); ok {
			return items
		}
		return nil
	default:
		// If it has "properties", treat it as object-like
		if _, ok := propSchema["properties"]; ok {
			return propSchema
		}
		return nil
	}
}

// extractPropertyInfo creates a SchemaPropertyInfo from a JSON Schema property.
func extractPropertyInfo(name string, propSchema map[string]any, requiredList []string) *SchemaPropertyInfo {
	info := &SchemaPropertyInfo{
		Name: name,
	}

	if typ, ok := propSchema["type"].(string); ok {
		info.Type = typ
	}
	if desc, ok := propSchema["description"].(string); ok {
		info.Description = desc
	}
	if pattern, ok := propSchema["pattern"].(string); ok {
		info.Pattern = pattern
	}
	if def, ok := propSchema["default"]; ok {
		info.Default = def
	}

	// Enum values
	if enumRaw, ok := propSchema["enum"].([]any); ok {
		for _, v := range enumRaw {
			if s, ok := v.(string); ok {
				info.Enum = append(info.Enum, s)
			}
		}
	}

	// Numeric constraints
	if v, ok := propSchema["minLength"].(float64); ok {
		i := int(v)
		info.MinLength = &i
	}
	if v, ok := propSchema["maxLength"].(float64); ok {
		i := int(v)
		info.MaxLength = &i
	}
	if v, ok := propSchema["minItems"].(float64); ok {
		i := int(v)
		info.MinItems = &i
	}
	if v, ok := propSchema["maxItems"].(float64); ok {
		i := int(v)
		info.MaxItems = &i
	}

	// Check if required
	for _, req := range requiredList {
		if req == name {
			info.Required = true
			break
		}
	}

	return info
}

// extractProperties returns all child properties from a schema node.
func extractProperties(schemaNode map[string]any) []SchemaPropertyInfo {
	props, ok := schemaNode["properties"].(map[string]any)
	if !ok {
		return nil
	}

	requiredList := getRequiredList(schemaNode)

	var result []SchemaPropertyInfo
	for name, propRaw := range props {
		propSchema, ok := propRaw.(map[string]any)
		if !ok {
			continue
		}
		info := extractPropertyInfo(name, propSchema, requiredList)
		result = append(result, *info)
	}

	return result
}

// getRequiredList extracts the "required" array from a schema node.
func getRequiredList(schemaNode map[string]any) []string {
	reqRaw, ok := schemaNode["required"].([]any)
	if !ok {
		return nil
	}
	var result []string
	for _, r := range reqRaw {
		if s, ok := r.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

// GetSchemaForArtifact loads and returns the raw JSON schema for an artifact type.
// This is a convenience function for the LSP server.
func GetSchemaForArtifact(loader *schema.Loader, artifactType schema.ArtifactType) json.RawMessage {
	info, err := loader.GetSchema(artifactType)
	if err != nil {
		return nil
	}
	return info.Schema
}
