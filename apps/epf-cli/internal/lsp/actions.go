package lsp

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	"github.com/tliron/glsp"
	protocol "github.com/tliron/glsp/protocol_3_16"
	"gopkg.in/yaml.v3"
)

// handleTextDocumentCodeAction returns quick-fix code actions for diagnostics.
// It matches incoming diagnostics back to cached EnhancedValidationErrors to
// generate rich code actions with workspace edits.
func (s *Server) handleTextDocumentCodeAction(ctx *glsp.Context, params *protocol.CodeActionParams) (any, error) {
	uri := params.TextDocument.URI
	cachedErrors := s.getCachedErrors(uri)
	if len(cachedErrors) == 0 || len(params.Context.Diagnostics) == 0 {
		return nil, nil
	}

	doc := s.documents.Get(uri)
	if doc == nil {
		return nil, nil
	}

	var actions []protocol.CodeAction
	for _, diag := range params.Context.Diagnostics {
		matched := matchDiagnosticToError(diag, cachedErrors)
		if matched == nil {
			continue
		}

		diagActions := s.generateCodeActions(uri, doc, diag, matched)
		actions = append(actions, diagActions...)
	}

	if len(actions) == 0 {
		return nil, nil
	}
	return actions, nil
}

// matchDiagnosticToError finds the cached EnhancedValidationError that corresponds
// to a given diagnostic, using the Code field (error type) and message content.
func matchDiagnosticToError(diag protocol.Diagnostic, errors []*validator.EnhancedValidationError) *validator.EnhancedValidationError {
	// The Code field is set to string(e.ErrorType) in mapEnhancedErrorToDiagnostic
	var diagCode string
	if diag.Code != nil {
		diagCode = diag.Code.Value.(string)
	}

	for _, e := range errors {
		if diagCode != "" && diagCode == string(e.ErrorType) {
			// Also verify the message matches (the diagnostic message may have a fix hint appended)
			if strings.HasPrefix(diag.Message, e.Message) {
				return e
			}
		}
	}
	return nil
}

// generateCodeActions creates CodeAction items for a matched error.
func (s *Server) generateCodeActions(uri string, doc *Document, diag protocol.Diagnostic, err *validator.EnhancedValidationError) []protocol.CodeAction {
	switch err.ErrorType {
	case validator.ErrorInvalidEnum:
		return s.actionsForInvalidEnum(uri, doc, diag, err)
	case validator.ErrorMissingRequired:
		return s.actionsForMissingRequired(uri, doc, diag, err)
	case validator.ErrorUnknownField:
		return s.actionsForUnknownField(uri, doc, diag, err)
	default:
		return nil
	}
}

// actionsForInvalidEnum creates one code action per valid enum value.
// Each action replaces the current (invalid) value with a valid one.
func (s *Server) actionsForInvalidEnum(uri string, doc *Document, diag protocol.Diagnostic, err *validator.EnhancedValidationError) []protocol.CodeAction {
	if len(err.Details.AllowedValues) == 0 {
		return nil
	}

	// Find the value range in the YAML document
	valueRange := findValueRange([]byte(doc.Content), err.Path)
	if valueRange == nil {
		// Fallback: use the diagnostic range (line 0, char 0 usually)
		valueRange = &diag.Range
	}

	kind := protocol.CodeActionKindQuickFix
	var actions []protocol.CodeAction
	for _, val := range err.Details.AllowedValues {
		title := fmt.Sprintf("Change to '%s'", val)
		actions = append(actions, protocol.CodeAction{
			Title:       title,
			Kind:        &kind,
			Diagnostics: []protocol.Diagnostic{diag},
			Edit: &protocol.WorkspaceEdit{
				Changes: map[protocol.DocumentUri][]protocol.TextEdit{
					uri: {{Range: *valueRange, NewText: val}},
				},
			},
		})
	}
	return actions
}

// actionsForMissingRequired creates a code action that inserts YAML template
// stubs for missing required fields.
func (s *Server) actionsForMissingRequired(uri string, doc *Document, diag protocol.Diagnostic, err *validator.EnhancedValidationError) []protocol.CodeAction {
	if len(err.Details.MissingFields) == 0 {
		return nil
	}

	// Determine where to insert the new fields.
	// We insert at the end of the parent object that is missing the fields.
	insertPos := findInsertPositionForMissing([]byte(doc.Content), err.Path, err.Details.MissingFields)

	// Build the YAML text to insert
	newText := buildMissingFieldsYAML(err.Details.MissingFields, insertPos.indent)

	kind := protocol.CodeActionKindQuickFix
	title := "Add missing field"
	if len(err.Details.MissingFields) > 1 {
		title = fmt.Sprintf("Add %d missing fields", len(err.Details.MissingFields))
	}

	return []protocol.CodeAction{{
		Title:       title,
		Kind:        &kind,
		Diagnostics: []protocol.Diagnostic{diag},
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentUri][]protocol.TextEdit{
				uri: {{
					Range:   insertPos.Range,
					NewText: newText,
				}},
			},
		},
	}}
}

// actionsForUnknownField creates a code action that removes the unknown field line(s).
func (s *Server) actionsForUnknownField(uri string, doc *Document, diag protocol.Diagnostic, err *validator.EnhancedValidationError) []protocol.CodeAction {
	if len(err.Details.UnknownFields) == 0 {
		return nil
	}

	lines := strings.Split(doc.Content, "\n")

	kind := protocol.CodeActionKindQuickFix
	var actions []protocol.CodeAction

	for _, fieldName := range err.Details.UnknownFields {
		lineRange := findFieldLineRange(lines, err.Path, fieldName)
		if lineRange == nil {
			continue
		}

		title := fmt.Sprintf("Remove unknown field '%s'", fieldName)
		actions = append(actions, protocol.CodeAction{
			Title:       title,
			Kind:        &kind,
			Diagnostics: []protocol.Diagnostic{diag},
			Edit: &protocol.WorkspaceEdit{
				Changes: map[protocol.DocumentUri][]protocol.TextEdit{
					uri: {{Range: *lineRange, NewText: ""}},
				},
			},
		})
	}

	return actions
}

// insertPosition holds where to insert text and at what indentation.
type insertPosition struct {
	Range  protocol.Range
	indent int // number of spaces for indentation
}

// findValueRange locates the YAML value for a given error path in the document.
// Returns the range of the scalar value, or nil if it can't be found.
func findValueRange(content []byte, path string) *protocol.Range {
	var docNode yaml.Node
	if err := yaml.Unmarshal(content, &docNode); err != nil {
		return nil
	}
	if docNode.Kind != yaml.DocumentNode || len(docNode.Content) == 0 {
		return nil
	}

	node := navigateYAMLPath(docNode.Content[0], path)
	if node == nil || node.Kind != yaml.ScalarNode {
		return nil
	}

	// yaml.v3 lines/columns are 1-indexed; LSP is 0-indexed
	startLine := uint32(node.Line - 1)
	startChar := uint32(node.Column - 1)
	endChar := startChar + uint32(len(node.Value))

	return &protocol.Range{
		Start: protocol.Position{Line: startLine, Character: startChar},
		End:   protocol.Position{Line: startLine, Character: endChar},
	}
}

// findInsertPositionForMissing determines where to insert missing field stubs.
// It navigates to the parent object of the error path and finds the end of it.
func findInsertPositionForMissing(content []byte, errorPath string, missingFields []string) insertPosition {
	var docNode yaml.Node
	if err := yaml.Unmarshal(content, &docNode); err != nil {
		return insertPosition{Range: endOfDocumentRange(content), indent: 0}
	}
	if docNode.Kind != yaml.DocumentNode || len(docNode.Content) == 0 {
		return insertPosition{Range: endOfDocumentRange(content), indent: 0}
	}

	// The errorPath for missing_required is typically the parent object path.
	// Navigate to that mapping node.
	parentNode := navigateYAMLPath(docNode.Content[0], errorPath)
	if parentNode == nil {
		parentNode = docNode.Content[0]
	}

	// If we landed on a scalar (e.g., the error path IS the leaf), go to its parent mapping
	if parentNode.Kind == yaml.MappingNode {
		return insertAtEndOfMapping(parentNode, content)
	}

	// Fallback: insert at end of document
	return insertPosition{Range: endOfDocumentRange(content), indent: 0}
}

// insertAtEndOfMapping returns an insert position after the last key-value pair in a mapping.
func insertAtEndOfMapping(mapping *yaml.Node, content []byte) insertPosition {
	lines := strings.Split(string(content), "\n")

	if len(mapping.Content) >= 2 {
		// Get the last value node
		lastVal := mapping.Content[len(mapping.Content)-1]
		lastLine := estimateEndLine(lastVal)

		// Indentation: same as the first key in this mapping
		firstKey := mapping.Content[0]
		indent := firstKey.Column - 1 // yaml columns are 1-indexed

		// Insert position is at the end of the last value's line
		insertLine := uint32(lastLine - 1) // Convert to 0-indexed
		var insertChar uint32
		if int(insertLine) < len(lines) {
			insertChar = uint32(len(lines[insertLine]))
		}

		return insertPosition{
			Range: protocol.Range{
				Start: protocol.Position{Line: insertLine, Character: insertChar},
				End:   protocol.Position{Line: insertLine, Character: insertChar},
			},
			indent: indent,
		}
	}

	return insertPosition{Range: endOfDocumentRange(content), indent: 2}
}

// buildMissingFieldsYAML generates YAML text for missing fields.
// Each field gets a placeholder value appropriate for its name.
func buildMissingFieldsYAML(fields []string, indent int) string {
	prefix := strings.Repeat(" ", indent)
	var sb strings.Builder
	for _, field := range fields {
		sb.WriteString("\n")
		sb.WriteString(prefix)
		sb.WriteString(field)
		sb.WriteString(": ")
		sb.WriteString(placeholderForField(field))
	}
	return sb.String()
}

// placeholderForField returns a sensible placeholder value based on the field name.
func placeholderForField(field string) string {
	lower := strings.ToLower(field)

	// Fields that are typically objects (check before plural heuristic)
	switch lower {
	case "meta", "metadata":
		return "{}"
	case "details", "context", "config":
		return "{}"
	}

	// Fields that are typically arrays
	if strings.HasSuffix(lower, "s") && !strings.HasSuffix(lower, "ss") &&
		!strings.HasSuffix(lower, "us") && !strings.HasSuffix(lower, "is") {
		// Likely a plural = array field
		switch {
		case strings.Contains(lower, "value"):
			return "\n  - \"\"" // e.g., values, allowed_values
		case strings.Contains(lower, "item"):
			return "\n  - \"\"" // items
		default:
			return "\n  - \"TODO\"" // generic array
		}
	}

	// Default: string placeholder
	return "\"TODO\""
}

// findFieldLineRange locates the line range of a field in the document for removal.
// It finds the line starting with the field name (with appropriate indentation)
// and extends to cover any sub-lines (for multi-line values).
func findFieldLineRange(lines []string, parentPath string, fieldName string) *protocol.Range {
	// Search for a line matching "  fieldName:" pattern
	for i, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, fieldName+":") || trimmed == fieldName+":" {
			// Found the field. Now determine how many lines it spans.
			startLine := uint32(i)
			endLine := startLine + 1

			// If the value is multi-line (block scalar or nested), extend the range.
			baseIndent := len(line) - len(trimmed)
			for j := i + 1; j < len(lines); j++ {
				nextTrimmed := strings.TrimLeft(lines[j], " \t")
				if nextTrimmed == "" {
					// Blank lines might be part of the block
					endLine = uint32(j) + 1
					continue
				}
				nextIndent := len(lines[j]) - len(nextTrimmed)
				if nextIndent > baseIndent {
					// Indented further — part of this field's value
					endLine = uint32(j) + 1
				} else {
					break
				}
			}

			return &protocol.Range{
				Start: protocol.Position{Line: startLine, Character: 0},
				End:   protocol.Position{Line: endLine, Character: 0},
			}
		}
	}
	return nil
}

// navigateYAMLPath walks a YAML node tree following a dot-separated path
// like "north_star.vision.vision_statement". Handles array indices like "items[0]".
func navigateYAMLPath(root *yaml.Node, path string) *yaml.Node {
	if path == "" || path == "(root)" {
		return root
	}

	parts := splitYAMLPath(path)
	current := root

	for _, part := range parts {
		if current == nil {
			return nil
		}

		switch current.Kind {
		case yaml.MappingNode:
			current = findMappingValue(current, part)
		case yaml.SequenceNode:
			// For sequence items addressed by index, we'd need to parse
			// the index. For now, return the sequence node itself.
			return current
		default:
			return nil
		}
	}

	return current
}

// findMappingValue finds the value node for a given key in a mapping node.
func findMappingValue(mapping *yaml.Node, key string) *yaml.Node {
	if mapping.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

// splitYAMLPath splits a path like "north_star.vision[0].name" into parts:
// ["north_star", "vision", "name"]. Array indices are stripped.
func splitYAMLPath(path string) []string {
	// Remove array index notation
	cleaned := strings.NewReplacer("[", ".", "]", "").Replace(path)
	parts := strings.Split(cleaned, ".")

	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && !isAllDigits(p) {
			result = append(result, p)
		}
	}
	return result
}

// isAllDigits returns true if the string is all digits (array index).
func isAllDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}

// endOfDocumentRange returns a range pointing to the end of the document.
func endOfDocumentRange(content []byte) protocol.Range {
	lines := strings.Split(string(content), "\n")
	lastLine := uint32(0)
	if len(lines) > 0 {
		lastLine = uint32(len(lines) - 1)
	}
	lastChar := uint32(0)
	if len(lines) > 0 {
		lastChar = uint32(len(lines[lastLine]))
	}
	return protocol.Range{
		Start: protocol.Position{Line: lastLine, Character: lastChar},
		End:   protocol.Position{Line: lastLine, Character: lastChar},
	}
}
