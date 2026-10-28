package strategyread

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// MaxLabels caps the glossary returned with one response.
const MaxLabels = 40

// labelFields are the fields that name an item with an id, in priority order.
var labelFields = []string{"objective", "name", "title", "statement", "description"}

// BuildLabelIndex collects readable names for every identified item (an object
// with a string "id") in the given payloads. Identifiers are only given labels
// that the instance itself provides.
func BuildLabelIndex(payloads ...any) map[string]string {
	idx := map[string]string{}
	for _, p := range payloads {
		collectLabels(p, idx)
	}
	return idx
}

func collectLabels(v any, idx map[string]string) {
	switch val := v.(type) {
	case map[string]any:
		if id, ok := val["id"].(string); ok && id != "" {
			for _, f := range labelFields {
				if s, ok := val[f].(string); ok && strings.TrimSpace(s) != "" {
					if _, exists := idx[id]; !exists {
						idx[id] = clip(s)
					}
					break
				}
			}
		}
		for _, inner := range val {
			collectLabels(inner, idx)
		}
	case []any:
		for _, inner := range val {
			collectLabels(inner, idx)
		}
	}
}

var identifierPattern = regexp.MustCompile(`[a-z][a-z0-9]*(?:-[a-z0-9]+)+`)

// LabelsFor returns the labels of the identifiers that appear in content,
// capped at MaxLabels (the lexically first identifiers win, so the result is
// stable).
func LabelsFor(content any, index map[string]string) map[string]string {
	if len(index) == 0 || content == nil {
		return nil
	}
	raw, err := json.Marshal(content)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	for _, tok := range identifierPattern.FindAllString(string(raw), -1) {
		if _, ok := index[tok]; ok {
			seen[tok] = true
		}
	}
	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) > MaxLabels {
		ids = ids[:MaxLabels]
	}
	out := make(map[string]string, len(ids))
	for _, id := range ids {
		out[id] = index[id]
	}
	return out
}

var artifactTitles = map[string]string{
	"north_star":           "North star",
	"insight_analyses":     "Insight analyses",
	"strategy_foundations": "Strategy foundations",
	"insight_opportunity":  "Insight opportunity",
	"strategy_formula":     "Strategy formula",
	"roadmap_recipe":       "Roadmap recipe",
}

// CiteAs builds the label a reader can use to cite a section, such as
// "Strategy formula › trade offs".
func CiteAs(artifactType, path string) string {
	title, ok := artifactTitles[artifactType]
	if !ok {
		title = strings.ReplaceAll(artifactType, "_", " ")
	}
	steps, err := ParsePath(path)
	if err != nil || len(steps) == 0 {
		return title
	}
	parts := []string{title}
	for _, st := range steps {
		key := strings.ReplaceAll(st.Key, "_", " ")
		var sels []string
		for _, sel := range st.Selectors {
			switch sel.Kind {
			case SelectField:
				sels = append(sels, "["+sel.Value+"]")
			case SelectIndex:
				sels = append(sels, fmt.Sprintf("[item %d]", sel.Index+1))
			case SelectFrom:
				sels = append(sels, fmt.Sprintf("[from item %d]", sel.Index+1))
			}
		}
		switch {
		case key != "" && len(sels) > 0:
			parts = append(parts, key+" "+strings.Join(sels, " "))
		case key != "":
			parts = append(parts, key)
		default:
			parts = append(parts, strings.Join(sels, " "))
		}
	}
	return strings.Join(parts, " › ")
}
