package lsp

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/tliron/glsp"
	protocol "github.com/tliron/glsp/protocol_3_16"
)

// handleTextDocumentHover provides hover information for EPF YAML files.
// It shows:
//   - Schema description, type, and constraints for YAML keys
//   - Enum values for enum-constrained fields
//   - Value model path explanations for contributes_to entries
func (s *Server) handleTextDocumentHover(ctx *glsp.Context, params *protocol.HoverParams) (*protocol.Hover, error) {
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

	// No position or schema path resolved — nothing to hover
	if pos.SchemaPath == "" {
		return nil, nil
	}

	var markdown string

	if pos.IsValue && isContributesToField(pos.SchemaPath) {
		// Hovering on a contributes_to value — explain the value model path
		markdown = s.hoverContributesToPath(pos)
	} else if pos.IsValue {
		// Hovering on a value — show schema info for that field
		markdown = hoverValue(schemaJSON, pos)
	} else {
		// Hovering on a key — show schema property info
		markdown = hoverKey(schemaJSON, pos)
	}

	if markdown == "" {
		return nil, nil
	}

	return &protocol.Hover{
		Contents: protocol.MarkupContent{
			Kind:  protocol.MarkupKindMarkdown,
			Value: markdown,
		},
	}, nil
}

// hoverKey produces hover content for a YAML key, showing its schema
// description, type, whether it's required, and any constraints.
func hoverKey(schemaJSON json.RawMessage, pos *YAMLPosition) string {
	info := ResolveSchemaPath(schemaJSON, pos.SchemaPath)
	if info == nil {
		return ""
	}

	return formatHoverContent(info, pos.SchemaPath)
}

// hoverValue produces hover content when the cursor is on a value.
// For enum fields, it shows the list of valid values and highlights
// the current one. For pattern fields, it shows the pattern.
func hoverValue(schemaJSON json.RawMessage, pos *YAMLPosition) string {
	info := ResolveSchemaPath(schemaJSON, pos.SchemaPath)
	if info == nil {
		return ""
	}

	// For enum values, provide specific value context
	if len(info.Enum) > 0 && pos.Node != nil {
		return formatEnumValueHover(info, pos.Node.Value)
	}

	return formatHoverContent(info, pos.SchemaPath)
}

// hoverContributesToPath produces hover content for value model path values,
// explaining what the path represents in the value model.
func (s *Server) hoverContributesToPath(pos *YAMLPosition) string {
	if pos.Node == nil || pos.Node.Value == "" {
		return ""
	}

	path := pos.Node.Value
	return formatValueModelPathHover(path)
}

// formatHoverContent builds the full markdown hover for a schema property.
func formatHoverContent(info *SchemaPropertyInfo, schemaPath string) string {
	var sections []string

	// Title line: property name with type
	title := fmt.Sprintf("**`%s`**", info.Name)
	if info.Type != "" {
		title += fmt.Sprintf(" — `%s`", info.Type)
	}
	if info.Required {
		title += " *(required)*"
	}
	sections = append(sections, title)

	// Description
	if info.Description != "" {
		sections = append(sections, info.Description)
	}

	// Constraints section
	constraints := formatConstraints(info)
	if constraints != "" {
		sections = append(sections, constraints)
	}

	// Enum values
	if len(info.Enum) > 0 {
		enumSection := formatEnumList(info.Enum)
		sections = append(sections, enumSection)
	}

	// Schema path (subtle reference)
	sections = append(sections, fmt.Sprintf("*Schema path: `%s`*", schemaPath))

	return strings.Join(sections, "\n\n")
}

// formatConstraints builds a markdown constraints block from a SchemaPropertyInfo.
func formatConstraints(info *SchemaPropertyInfo) string {
	var lines []string

	if info.Pattern != "" {
		lines = append(lines, fmt.Sprintf("Pattern: `%s`", info.Pattern))
	}
	if info.MinLength != nil {
		lines = append(lines, fmt.Sprintf("Min length: **%d** characters", *info.MinLength))
	}
	if info.MaxLength != nil {
		lines = append(lines, fmt.Sprintf("Max length: **%d** characters", *info.MaxLength))
	}
	if info.MinItems != nil {
		lines = append(lines, fmt.Sprintf("Min items: **%d**", *info.MinItems))
	}
	if info.MaxItems != nil {
		lines = append(lines, fmt.Sprintf("Max items: **%d**", *info.MaxItems))
	}

	if len(lines) == 0 {
		return ""
	}

	return "**Constraints:**\n- " + strings.Join(lines, "\n- ")
}

// formatEnumList returns a markdown list of valid enum values.
func formatEnumList(values []string) string {
	var items []string
	for _, v := range values {
		items = append(items, fmt.Sprintf("`%s`", v))
	}
	return "**Valid values:** " + strings.Join(items, ", ")
}

// formatEnumValueHover builds hover content for a specific enum value,
// highlighting which value is currently set and showing all alternatives.
func formatEnumValueHover(info *SchemaPropertyInfo, currentValue string) string {
	var sections []string

	// Title with current value status
	isValid := false
	for _, v := range info.Enum {
		if v == currentValue {
			isValid = true
			break
		}
	}

	if isValid {
		sections = append(sections, fmt.Sprintf("**`%s`** — valid enum value for `%s`", currentValue, info.Name))
	} else {
		sections = append(sections, fmt.Sprintf("**`%s`** — ⚠️ invalid value for `%s`", currentValue, info.Name))
	}

	if info.Description != "" {
		sections = append(sections, info.Description)
	}

	// Show all valid values with current highlighted
	var items []string
	for _, v := range info.Enum {
		if v == currentValue {
			items = append(items, fmt.Sprintf("**`%s`** ✓", v))
		} else {
			items = append(items, fmt.Sprintf("`%s`", v))
		}
	}
	sections = append(sections, "**All valid values:** "+strings.Join(items, ", "))

	return strings.Join(sections, "\n\n")
}

// formatValueModelPathHover builds hover content explaining a value model path.
func formatValueModelPathHover(path string) string {
	if path == "" {
		return ""
	}

	parts := strings.Split(path, ".")

	var sections []string

	// Title
	sections = append(sections, fmt.Sprintf("**Value Model Path:** `%s`", path))

	// Track description
	track := parts[0]
	trackDesc := describeTrack(track)
	if trackDesc != "" {
		sections = append(sections, fmt.Sprintf("**Track:** %s — %s", track, trackDesc))
	} else {
		sections = append(sections, fmt.Sprintf("**Track:** %s", track))
	}

	// Layer description (if present)
	if len(parts) >= 2 {
		sections = append(sections, fmt.Sprintf("**Layer:** %s", parts[1]))
	}

	// Component description (if present)
	if len(parts) >= 3 {
		sections = append(sections, fmt.Sprintf("**Component:** %s", parts[2]))
	}

	// Sub-component (if present)
	if len(parts) >= 4 {
		sections = append(sections, fmt.Sprintf("**Sub-component:** %s", parts[3]))
	}

	// Path structure reference
	sections = append(sections, "*Format: `Track.Layer.Component[.SubComponent]`*")

	return strings.Join(sections, "\n\n")
}

// describeTrack returns a human-readable description for an EPF value model track.
func describeTrack(track string) string {
	switch track {
	case "Product":
		return "features, capabilities, and user value delivery"
	case "Strategy":
		return "growth, positioning, and market strategy"
	case "OrgOps":
		return "team, processes, and operational excellence"
	case "Commercial":
		return "revenue, sales, and partnership growth"
	default:
		return ""
	}
}
