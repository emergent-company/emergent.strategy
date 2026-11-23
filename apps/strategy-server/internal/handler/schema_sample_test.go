package handler

import (
	"encoding/json"
	"sort"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// schemaSample builds a payload from a JSON schema: every string gets a marker
// that names its path, objects get every property, lists get two items. Strings
// with an enum take the first value and are not markers. A oneOf takes the
// variant that pick selects, and the items of a list shift it by one each, so
// two picks between them cover every variant of every field. The markers it
// returns are what the page must show.
func schemaSample(node map[string]any, path string, markers *[]string, pick int) any {
	if variants, ok := node["oneOf"].([]any); ok && len(variants) > 0 {
		chosen, _ := variants[pick%len(variants)].(map[string]any)
		return schemaSample(chosen, path, markers, pick)
	}
	switch node["type"] {
	case "object":
		out := map[string]any{}
		props, _ := node["properties"].(map[string]any)
		for k, v := range props {
			child, _ := v.(map[string]any)
			next := k
			if path != "" {
				next = path + "." + k
			}
			out[k] = schemaSample(child, next, markers, pick)
		}
		return out
	case "array":
		items, _ := node["items"].(map[string]any)
		var out []any
		for i := 0; i < 2; i++ {
			out = append(out, schemaSample(items, path+"["+string(rune('0'+i))+"]", markers, pick+i))
		}
		return out
	case "string":
		if enum, ok := node["enum"].([]any); ok && len(enum) > 0 {
			return enum[0]
		}
		marker := "mk:" + path
		*markers = append(*markers, marker)
		return marker
	case "integer", "number":
		return float64(7)
	case "boolean":
		return true
	}
	return nil
}

// sampleOfSchema loads an embedded schema and samples it. It fails when fewer
// than minMarkers strings came out, which means the sampler or the schema
// changed shape.
func sampleOfSchema(t *testing.T, file string, pick, minMarkers int) (map[string]any, []string) {
	t.Helper()
	raw, err := embedded.GetSchema(file)
	if err != nil {
		t.Fatal(err)
	}
	var schema map[string]any
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	var markers []string
	payload, _ := schemaSample(schema, "", &markers, pick).(map[string]any)
	sort.Strings(markers)
	if len(markers) < minMarkers {
		t.Fatalf("only %d markers from %s; the sampler or the schema changed shape", len(markers), file)
	}
	return payload, markers
}
