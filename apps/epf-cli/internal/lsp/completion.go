package lsp

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
	"github.com/tliron/glsp"
	protocol "github.com/tliron/glsp/protocol_3_16"
	"gopkg.in/yaml.v3"
)

// handleTextDocumentCompletion provides context-aware completions for EPF YAML files.
// It supports:
//   - Key completions: suggest valid YAML keys from schema at current position
//   - Enum value completions: suggest valid enum values for constrained fields
//   - contributes_to path completions: suggest valid value model paths
//   - Pattern hint completions: show regex patterns for constrained fields
func (s *Server) handleTextDocumentCompletion(ctx *glsp.Context, params *protocol.CompletionParams) (any, error) {
	doc := s.documents.Get(params.TextDocument.URI)
	if doc == nil || !doc.IsYAML() || doc.ArtifactType == "" {
		return nil, nil
	}

	artifactType := schema.ArtifactType(doc.ArtifactType)
	schemaJSON := GetSchemaForArtifact(s.loader, artifactType)
	if schemaJSON == nil {
		return nil, nil
	}

	content := []byte(doc.Content)
	pos := ResolveYAMLPosition(content, params.Position.Line, params.Position.Character)

	var items []protocol.CompletionItem

	// Determine what kind of completion to provide based on cursor context
	if pos.IsValue {
		// Cursor is on a value — provide value completions
		items = s.completeValue(schemaJSON, pos, doc)
	} else if pos.IsKey {
		// Cursor is on a key — provide sibling key completions
		items = s.completeKeys(schemaJSON, pos, content)
	} else {
		// Cursor is on a blank line or indentation — provide key completions
		items = s.completeKeys(schemaJSON, pos, content)
	}

	if len(items) == 0 {
		return nil, nil
	}

	return items, nil
}

// completeKeys returns completion items for valid YAML keys at the current position.
// It uses GetChildProperties to look up what keys are valid under the current schema path.
func (s *Server) completeKeys(schemaJSON json.RawMessage, pos *YAMLPosition, content []byte) []protocol.CompletionItem {
	// Get valid child properties at the current schema path
	// If we're on a key, use the parent path (strip the last segment)
	schemaPath := pos.SchemaPath
	if pos.IsKey && schemaPath != "" {
		// The SchemaPath includes the key name; go up one level for siblings
		if idx := strings.LastIndex(schemaPath, "."); idx >= 0 {
			schemaPath = schemaPath[:idx]
		} else {
			schemaPath = ""
		}
	}

	children := GetChildProperties(schemaJSON, schemaPath)
	if len(children) == 0 {
		return nil
	}

	// Find which keys already exist at this level in the document
	existingKeys := findExistingKeys(content, pos)

	// Sort children: required first, then alphabetical
	sort.Slice(children, func(i, j int) bool {
		if children[i].Required != children[j].Required {
			return children[i].Required
		}
		return children[i].Name < children[j].Name
	})

	var items []protocol.CompletionItem
	for i, child := range children {
		// Skip keys that already exist
		if existingKeys[child.Name] {
			continue
		}

		kind := protocol.CompletionItemKindProperty
		detail := formatPropertyDetail(child)
		doc := formatPropertyDoc(child)

		// Required fields get higher sort priority
		sortText := fmt.Sprintf("%d_%s", 1, child.Name)
		if child.Required {
			sortText = fmt.Sprintf("%d_%s", 0, child.Name)
		}

		// Insert text includes the colon and a space
		insertText := child.Name + ": "
		insertFormat := protocol.InsertTextFormatPlainText

		item := protocol.CompletionItem{
			Label:            child.Name,
			Kind:             &kind,
			Detail:           &detail,
			SortText:         &sortText,
			InsertText:       &insertText,
			InsertTextFormat: &insertFormat,
		}

		// Add documentation if available
		if doc != "" {
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.MarkupKindMarkdown,
				Value: doc,
			}
		}

		// Set preselect for the first required item
		if i == 0 && child.Required {
			preselect := true
			item.Preselect = &preselect
		}

		items = append(items, item)
	}

	return items
}

// completeValue returns completion items for the value at the current position.
// Handles enum values, contributes_to paths, and pattern hints.
func (s *Server) completeValue(schemaJSON json.RawMessage, pos *YAMLPosition, doc *Document) []protocol.CompletionItem {
	// Check if this is a contributes_to field
	if isContributesToField(pos.SchemaPath) {
		return s.completeContributesToPaths(pos)
	}

	// Look up schema info for the current path
	propInfo := ResolveSchemaPath(schemaJSON, pos.SchemaPath)
	if propInfo == nil {
		return nil
	}

	var items []protocol.CompletionItem

	// Enum completions
	if len(propInfo.Enum) > 0 {
		items = append(items, completeEnum(propInfo)...)
	}

	// Pattern hint completion — show as a snippet hint
	if propInfo.Pattern != "" && len(items) == 0 {
		items = append(items, completePattern(propInfo)...)
	}

	return items
}

// completeEnum returns completion items for enum-constrained values.
func completeEnum(info *SchemaPropertyInfo) []protocol.CompletionItem {
	var items []protocol.CompletionItem

	for i, val := range info.Enum {
		kind := protocol.CompletionItemKindEnum
		sortText := fmt.Sprintf("%02d", i)
		detail := fmt.Sprintf("enum value (%d/%d)", i+1, len(info.Enum))

		item := protocol.CompletionItem{
			Label:    val,
			Kind:     &kind,
			Detail:   &detail,
			SortText: &sortText,
		}
		items = append(items, item)
	}

	return items
}

// completePattern returns a hint completion for pattern-constrained fields.
func completePattern(info *SchemaPropertyInfo) []protocol.CompletionItem {
	kind := protocol.CompletionItemKindSnippet
	detail := fmt.Sprintf("pattern: %s", info.Pattern)

	// Generate an example value from common patterns
	example := exampleFromPattern(info.Pattern, info.Name)

	doc := fmt.Sprintf("Value must match pattern: `%s`", info.Pattern)
	if info.Description != "" {
		doc = info.Description + "\n\n" + doc
	}

	item := protocol.CompletionItem{
		Label:  example,
		Kind:   &kind,
		Detail: &detail,
		Documentation: &protocol.MarkupContent{
			Kind:  protocol.MarkupKindMarkdown,
			Value: doc,
		},
	}

	return []protocol.CompletionItem{item}
}

// completeContributesToPaths returns completion items for contributes_to values.
// It loads the value model from the EPF instance and suggests valid paths.
func (s *Server) completeContributesToPaths(pos *YAMLPosition) []protocol.CompletionItem {
	// Try to load value model paths from the instance
	paths := s.getValueModelPaths()
	if len(paths) == 0 {
		// Provide static track prefixes as a fallback
		return completeTrackPrefixes()
	}

	// Filter paths based on what the user has already typed
	currentValue := ""
	if pos.Node != nil {
		currentValue = pos.Node.Value
	}

	var items []protocol.CompletionItem
	for i, path := range paths {
		// If user has typed something, filter to matching paths
		if currentValue != "" && !strings.HasPrefix(strings.ToLower(path), strings.ToLower(currentValue)) {
			continue
		}

		kind := protocol.CompletionItemKindValue
		sortText := fmt.Sprintf("%04d", i)
		detail := describeValueModelPath(path)

		item := protocol.CompletionItem{
			Label:    path,
			Kind:     &kind,
			Detail:   &detail,
			SortText: &sortText,
		}
		items = append(items, item)
	}

	return items
}

// getValueModelPaths attempts to load all valid value model paths.
// It uses the instance path from any currently open document.
func (s *Server) getValueModelPaths() []string {
	s.vmPathsMu.RLock()
	if s.vmPaths != nil {
		defer s.vmPathsMu.RUnlock()
		return s.vmPaths
	}
	s.vmPathsMu.RUnlock()

	// Try to find the instance path from open documents
	instancePath := s.detectInstancePath()
	if instancePath == "" {
		return nil
	}

	// Load value models
	loader := valuemodel.NewLoader(instancePath)
	models, err := loader.Load()
	if err != nil {
		return nil
	}

	paths := models.GetAllPaths()
	sort.Strings(paths)

	// Cache the result
	s.vmPathsMu.Lock()
	s.vmPaths = paths
	s.vmPathsMu.Unlock()

	return paths
}

// detectInstancePath tries to find the EPF instance path from open documents.
// It looks for common EPF directory patterns in the file paths.
func (s *Server) detectInstancePath() string {
	s.documents.mu.RLock()
	defer s.documents.mu.RUnlock()

	for _, doc := range s.documents.docs {
		filePath := doc.FilePath()
		if filePath == "" {
			continue
		}

		// Look for EPF instance markers in the path:
		// .../READY/... or .../FIRE/... or .../AIM/...
		for _, marker := range []string{"/READY/", "/FIRE/", "/AIM/"} {
			if idx := strings.Index(filePath, marker); idx > 0 {
				return filePath[:idx]
			}
		}
		// Also check if file is directly in a phase dir (e.g., .../READY/00_north_star.yaml)
		for _, marker := range []string{"/READY/", "/FIRE/", "/AIM/"} {
			dir := filePath
			if idx := strings.LastIndex(dir, "/"); idx > 0 {
				dir = dir[:idx+1]
			}
			if strings.HasSuffix(dir, marker) {
				return dir[:len(dir)-len(marker)]
			}
		}
	}

	return ""
}

// completeTrackPrefixes returns static completion items for the four EPF tracks.
// Used as fallback when value model files aren't available.
func completeTrackPrefixes() []protocol.CompletionItem {
	tracks := []struct {
		name string
		desc string
	}{
		{"Product.", "Product track — features, capabilities, user value"},
		{"Strategy.", "Strategy track — growth, positioning, market"},
		{"OrgOps.", "OrgOps track — team, processes, operations"},
		{"Commercial.", "Commercial track — revenue, sales, partnerships"},
	}

	var items []protocol.CompletionItem
	for i, t := range tracks {
		kind := protocol.CompletionItemKindKeyword
		sortText := fmt.Sprintf("%d", i)

		item := protocol.CompletionItem{
			Label:    t.name,
			Kind:     &kind,
			Detail:   &t.desc,
			SortText: &sortText,
		}
		items = append(items, item)
	}

	return items
}

// --- Helpers ---

// isContributesToField checks if the schema path indicates a contributes_to value.
func isContributesToField(schemaPath string) bool {
	return strings.HasSuffix(schemaPath, "contributes_to") ||
		strings.Contains(schemaPath, "contributes_to.")
}

// findExistingKeys scans the document to find which keys already exist at the
// same level as the cursor position.
func findExistingKeys(content []byte, pos *YAMLPosition) map[string]bool {
	existing := make(map[string]bool)

	// If we have a parent mapping node, extract its keys
	parent := pos.ParentNode
	if parent == nil {
		// If the cursor is on a mapping node itself, use that
		if pos.Node != nil && pos.Node.Kind == yaml.MappingNode {
			parent = pos.Node
		}
	}

	// Fallback: if position resolution didn't find a node (e.g., cursor on
	// an empty line at the end of the document), parse the YAML and use the
	// root mapping. This is the common case when a user presses Enter after
	// the last key-value pair and starts typing a new key.
	if parent == nil && content != nil {
		var docNode yaml.Node
		if err := yaml.Unmarshal(content, &docNode); err == nil {
			if docNode.Kind == yaml.DocumentNode && len(docNode.Content) > 0 {
				root := docNode.Content[0]
				if root.Kind == yaml.MappingNode {
					parent = root
				}
			}
		}
	}

	if parent == nil {
		return existing
	}

	// MappingNode.Content alternates [key0, val0, key1, val1, ...]
	for i := 0; i+1 < len(parent.Content); i += 2 {
		keyNode := parent.Content[i]
		if keyNode.Value != "" {
			existing[keyNode.Value] = true
		}
	}

	return existing
}

// formatPropertyDetail creates a short detail string for a property.
func formatPropertyDetail(p SchemaPropertyInfo) string {
	parts := []string{}

	if p.Type != "" {
		parts = append(parts, p.Type)
	}
	if p.Required {
		parts = append(parts, "required")
	}
	if len(p.Enum) > 0 {
		parts = append(parts, fmt.Sprintf("enum(%d)", len(p.Enum)))
	}

	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, ", ")
}

// formatPropertyDoc creates markdown documentation for a property.
func formatPropertyDoc(p SchemaPropertyInfo) string {
	var parts []string

	if p.Description != "" {
		parts = append(parts, p.Description)
	}

	var constraints []string
	if p.Pattern != "" {
		constraints = append(constraints, fmt.Sprintf("Pattern: `%s`", p.Pattern))
	}
	if p.MinLength != nil {
		constraints = append(constraints, fmt.Sprintf("Min length: %d", *p.MinLength))
	}
	if p.MaxLength != nil {
		constraints = append(constraints, fmt.Sprintf("Max length: %d", *p.MaxLength))
	}
	if p.MinItems != nil {
		constraints = append(constraints, fmt.Sprintf("Min items: %d", *p.MinItems))
	}
	if p.MaxItems != nil {
		constraints = append(constraints, fmt.Sprintf("Max items: %d", *p.MaxItems))
	}
	if len(p.Enum) > 0 {
		constraints = append(constraints, fmt.Sprintf("Values: `%s`", strings.Join(p.Enum, "`, `")))
	}

	if len(constraints) > 0 {
		parts = append(parts, "**Constraints:**\n- "+strings.Join(constraints, "\n- "))
	}

	return strings.Join(parts, "\n\n")
}

// exampleFromPattern generates an example value from common EPF patterns.
func exampleFromPattern(pattern, name string) string {
	switch {
	case strings.Contains(pattern, "fd-") || strings.Contains(pattern, "^fd-"):
		return "fd-001"
	case strings.Contains(pattern, "cap-") || strings.Contains(pattern, "^cap-"):
		return "cap-001"
	case strings.Contains(pattern, "ctx-") || strings.Contains(pattern, "^ctx-"):
		return "ctx-001"
	case strings.Contains(pattern, "kr-"):
		return "kr-p-2025-q1-001"
	case strings.Contains(pattern, "^[a-z0-9]+(-[a-z0-9]+)*$"):
		return "my-" + strings.ReplaceAll(name, "_", "-")
	default:
		return pattern
	}
}

// describeValueModelPath provides a brief description based on the track prefix.
func describeValueModelPath(path string) string {
	parts := strings.SplitN(path, ".", 2)
	if len(parts) == 0 {
		return ""
	}

	switch parts[0] {
	case "Product":
		return "Product value model path"
	case "Strategy":
		return "Strategy value model path"
	case "OrgOps":
		return "OrgOps value model path"
	case "Commercial":
		return "Commercial value model path"
	default:
		return "Value model path"
	}
}
