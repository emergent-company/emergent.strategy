// schemaconstraints.go — derives LLM-readable constraint summaries from live
// JSON Schema documents.
//
// Design principles:
//   - Zero hardcoding: all constraint rules are read from the schema.
//   - Schema is the single source of truth: when canonical-epf updates a schema
//     (new field, changed minLength, new enum value), the generated constraints
//     update automatically on next sync + rebuild.
//   - Produces Markdown tables the LLM can parse easily.
//   - Works with draft-07 schemas (the EPF standard).
package skillexec

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// SchemaConstraints holds the extracted constraint groups for one schema.
type SchemaConstraints struct {
	ArtifactType string
	IDPatterns   []FieldConstraint // fields with a "pattern" keyword
	MinLengths   []FieldConstraint // string fields with minLength > 0
	MaxLengths   []FieldConstraint // string fields with maxLength
	MinItems     []FieldConstraint // array fields with minItems > 0
	Enums        []FieldConstraint // fields with an enum keyword
	Required     []FieldConstraint // fields that are required at their level
}

// FieldConstraint is a single extracted constraint.
type FieldConstraint struct {
	// JSONPath is the dot-separated path from the schema root, e.g.
	// "roadmap.tracks.*.okrs[].key_results[].id"
	JSONPath string
	// Constraint is the human-readable rule, e.g. "^kr-[psoc]-\\d{3}$" or "≥ 200 chars"
	Constraint string
	// Example is drawn from the schema's "examples" array (first entry) when present.
	Example string
}

// ExtractSchemaConstraints loads the embedded schema for artifactType and
// returns a structured summary of its constraints. Returns a zero-value
// SchemaConstraints (no constraints) when no schema is registered.
func ExtractSchemaConstraints(artifactType string) (SchemaConstraints, error) {
	schemaFile, ok := embedded.SchemaForType(artifactType)
	if !ok {
		return SchemaConstraints{ArtifactType: artifactType}, nil
	}

	schemaBytes, err := embedded.GetSchema(schemaFile)
	if err != nil {
		return SchemaConstraints{}, fmt.Errorf("schemaconstraints: load schema %q: %w", schemaFile, err)
	}

	var schema map[string]any
	if err := json.Unmarshal(schemaBytes, &schema); err != nil {
		return SchemaConstraints{}, fmt.Errorf("schemaconstraints: parse schema %q: %w", schemaFile, err)
	}

	result := SchemaConstraints{ArtifactType: artifactType}
	walker := &constraintWalker{schema: schema}
	walker.walk(schema, "")

	result.IDPatterns = walker.patterns
	result.MinLengths = walker.minLengths
	result.MaxLengths = walker.maxLengths
	result.MinItems = walker.minItems
	result.Enums = walker.enums
	result.Required = walker.required

	return result, nil
}

// RenderConstraintAppendix renders a Markdown appendix from a SchemaConstraints
// value suitable for inclusion in an LLM prompt. Returns an empty string when
// there are no constraints to show.
func RenderConstraintAppendix(sc SchemaConstraints) string {
	if len(sc.IDPatterns) == 0 && len(sc.MinLengths) == 0 &&
		len(sc.MaxLengths) == 0 && len(sc.MinItems) == 0 && len(sc.Enums) == 0 {
		return ""
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "### Schema constraints for `%s` (auto-derived — do not violate)\n\n", sc.ArtifactType)

	if len(sc.IDPatterns) > 0 {
		sb.WriteString("**ID and format patterns** (regex — every value must match exactly):\n\n")
		sb.WriteString("| Field | Pattern | Example |\n|---|---|---|\n")
		for _, c := range sc.IDPatterns {
			fmt.Fprintf(&sb, "| `%s` | `%s` | `%s` |\n", c.JSONPath, c.Constraint, c.Example)
		}
		sb.WriteString("\n")
	}

	if len(sc.MinLengths) > 0 {
		sb.WriteString("**Minimum character lengths** (shorter values will be rejected):\n\n")
		sb.WriteString("| Field | Minimum characters |\n|---|---|\n")
		for _, c := range sc.MinLengths {
			fmt.Fprintf(&sb, "| `%s` | %s |\n", c.JSONPath, c.Constraint)
		}
		sb.WriteString("\n")
	}

	if len(sc.MaxLengths) > 0 {
		sb.WriteString("**Maximum character lengths** (longer values will be rejected — count carefully):\n\n")
		sb.WriteString("| Field | Maximum characters |\n|---|---|\n")
		for _, c := range sc.MaxLengths {
			fmt.Fprintf(&sb, "| `%s` | %s |\n", c.JSONPath, c.Constraint)
		}
		sb.WriteString("\n")
	}

	if len(sc.MinItems) > 0 {
		sb.WriteString("**Minimum array sizes** (fewer items will be rejected):\n\n")
		sb.WriteString("| Field | Minimum items |\n|---|---|\n")
		for _, c := range sc.MinItems {
			fmt.Fprintf(&sb, "| `%s` | %s |\n", c.JSONPath, c.Constraint)
		}
		sb.WriteString("\n")
	}

	if len(sc.Enums) > 0 {
		sb.WriteString("**Enum fields** (only the listed values are valid):\n\n")
		sb.WriteString("| Field | Valid values |\n|---|---|\n")
		for _, c := range sc.Enums {
			fmt.Fprintf(&sb, "| `%s` | %s |\n", c.JSONPath, c.Constraint)
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// ---------------------------------------------------------------------------
// Schema walker — extracts constraints by traversing the schema tree
// ---------------------------------------------------------------------------

type constraintWalker struct {
	schema     map[string]any
	patterns   []FieldConstraint
	minLengths []FieldConstraint
	maxLengths []FieldConstraint
	minItems   []FieldConstraint
	enums      []FieldConstraint
	required   []FieldConstraint
	seen       map[string]bool // prevents infinite loops through $ref cycles
}

func (w *constraintWalker) walk(node map[string]any, path string) {
	if w.seen == nil {
		w.seen = map[string]bool{}
	}

	// Resolve $ref before processing. Only fragment refs are supported.
	if ref, ok := node["$ref"].(string); ok {
		w.walkRef(ref, path)
		return
	}

	typ, _ := node["type"].(string)

	w.extractLeafConstraints(node, typ, path)

	if typ == "array" {
		w.walkArray(node, path)
		return
	}

	w.walkProperties(node, path)
	w.walkCombiners(node, path)
}

// walkRef resolves a $ref and walks it, guarding against cycles.
func (w *constraintWalker) walkRef(ref, path string) {
	resolved := w.resolveRef(ref)
	if resolved == nil || w.seen[ref] {
		return
	}
	w.seen[ref] = true
	w.walk(resolved, path)
	delete(w.seen, ref)
}

// extractLeafConstraints records pattern, minLength, and enum constraints from
// a single schema node.
func (w *constraintWalker) extractLeafConstraints(node map[string]any, typ, path string) {
	if path == "" {
		return
	}

	if pattern, ok := node["pattern"].(string); ok {
		w.patterns = append(w.patterns, FieldConstraint{
			JSONPath:   path,
			Constraint: pattern,
			Example:    firstExample(node),
		})
	}

	if typ == "string" || typ == "" {
		if minLen, ok := numericValue(node["minLength"]); ok && minLen > 0 {
			w.minLengths = append(w.minLengths, FieldConstraint{
				JSONPath:   path,
				Constraint: fmt.Sprintf("%d", int(minLen)),
			})
		}
		if maxLen, ok := numericValue(node["maxLength"]); ok && maxLen > 0 {
			w.maxLengths = append(w.maxLengths, FieldConstraint{
				JSONPath:   path,
				Constraint: fmt.Sprintf("%d", int(maxLen)),
			})
		}
	}

	if rawEnum, ok := node["enum"]; ok {
		if enumSlice, ok := rawEnum.([]any); ok && len(enumSlice) > 0 {
			var vals []string
			for _, v := range enumSlice {
				vals = append(vals, fmt.Sprintf("`%v`", v))
			}
			w.enums = append(w.enums, FieldConstraint{
				JSONPath:   path,
				Constraint: strings.Join(vals, ", "),
			})
		}
	}
}

// walkArray records minItems and recurses into the items sub-schema.
func (w *constraintWalker) walkArray(node map[string]any, path string) {
	if path != "" {
		if minItems, ok := numericValue(node["minItems"]); ok && minItems > 0 {
			w.minItems = append(w.minItems, FieldConstraint{
				JSONPath:   path,
				Constraint: fmt.Sprintf("%d", int(minItems)),
			})
		}
	}
	if items, ok := node["items"].(map[string]any); ok {
		itemPath := path
		if !strings.HasSuffix(itemPath, "[]") {
			itemPath += "[]"
		}
		w.walk(items, itemPath)
	}
}

// walkProperties walks all properties of an object node in sorted order,
// collapsing the four canonical roadmap track names to "tracks.*".
func (w *constraintWalker) walkProperties(node map[string]any, path string) {
	props, ok := node["properties"].(map[string]any)
	if !ok {
		return
	}

	names := make([]string, 0, len(props))
	for k := range props {
		names = append(names, k)
	}
	sort.Strings(names)

	for _, propName := range names {
		propSchema, ok := props[propName].(map[string]any)
		if !ok {
			continue
		}
		childPath := propName
		if path != "" {
			childPath = path + "." + propName
		}

		// Collapse the four canonical track names to "tracks.*" to avoid
		// repeating identical constraints four times.
		if isTrackKey(propName) && strings.HasSuffix(path, ".tracks") {
			childPath = path + ".*"
			if !w.seen["tracks.*"] {
				w.seen["tracks.*"] = true
				w.walk(propSchema, childPath)
			}
			continue
		}

		w.walk(propSchema, childPath)
	}
}

// walkCombiners walks allOf / anyOf / oneOf sub-schemas at the same path level.
func (w *constraintWalker) walkCombiners(node map[string]any, path string) {
	for _, combiner := range []string{"allOf", "anyOf", "oneOf"} {
		if list, ok := node[combiner].([]any); ok {
			for _, sub := range list {
				if subSchema, ok := sub.(map[string]any); ok {
					w.walk(subSchema, path)
				}
			}
		}
	}
}

// resolveRef resolves a JSON Pointer $ref string against the top-level schema.
// Only fragment-only refs (e.g., "#/definitions/track") are supported.
func (w *constraintWalker) resolveRef(ref string) map[string]any {
	if !strings.HasPrefix(ref, "#/") {
		return nil
	}
	parts := strings.Split(strings.TrimPrefix(ref, "#/"), "/")
	node := w.schema
	for _, part := range parts {
		child, ok := node[part].(map[string]any)
		if !ok {
			return nil
		}
		node = child
	}
	return node
}

// isTrackKey returns true for the four canonical roadmap track property names.
func isTrackKey(name string) bool {
	switch name {
	case "product", "strategy", "org_ops", "commercial":
		return true
	}
	return false
}

// firstExample returns the first entry in the schema's "examples" array as a
// string, or "" if none is present.
func firstExample(node map[string]any) string {
	exs, ok := node["examples"].([]any)
	if !ok || len(exs) == 0 {
		return ""
	}
	return fmt.Sprintf("%v", exs[0])
}

// numericValue extracts a numeric value from a JSON-decoded interface (float64
// after json.Unmarshal). Returns (0, false) if not numeric or missing.
func numericValue(v any) (float64, bool) {
	if v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	}
	return 0, false
}
