package strategy_test

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// schemaNode follows a JSON schema just far enough to ask whether a path of
// property names exists in it.
type schemaNode struct {
	root map[string]any
	node map[string]any
}

func (s schemaNode) resolve() []map[string]any {
	n := s.node
	if ref, ok := n["$ref"].(string); ok {
		name := ref[strings.LastIndex(ref, "/")+1:]
		for _, bucket := range []string{"definitions", "$defs"} {
			if defs, ok := s.root[bucket].(map[string]any); ok {
				if d, ok := defs[name].(map[string]any); ok {
					return schemaNode{s.root, d}.resolve()
				}
			}
		}
		return nil
	}
	out := []map[string]any{n}
	for _, key := range []string{"allOf", "anyOf", "oneOf"} {
		if list, ok := n[key].([]any); ok {
			for _, item := range list {
				if m, ok := item.(map[string]any); ok {
					out = append(out, schemaNode{s.root, m}.resolve()...)
				}
			}
		}
	}
	return out
}

// child returns the schemas a name leads to: "*" any property, "[]" an array item.
func (s schemaNode) child(name string) []schemaNode {
	var out []schemaNode
	for _, n := range s.resolve() {
		if name == "[]" {
			if items, ok := n["items"].(map[string]any); ok {
				out = append(out, schemaNode{s.root, items})
			}
			continue
		}
		props, _ := n["properties"].(map[string]any)
		if name == "*" {
			for _, p := range props {
				if m, ok := p.(map[string]any); ok {
					out = append(out, schemaNode{s.root, m})
				}
			}
			if ap, ok := n["additionalProperties"].(map[string]any); ok {
				out = append(out, schemaNode{s.root, ap})
			}
			continue
		}
		if p, ok := props[name].(map[string]any); ok {
			out = append(out, schemaNode{s.root, p})
		}
	}
	return out
}

var selector = regexp.MustCompile(`\[[^\]]*\]`)

// pathExists reports whether every step of a view path exists in the schema.
// Array selectors collapse to one "[]" step.
func pathExists(root map[string]any, artifactType, path string) bool {
	cur := []schemaNode{{root, root}}
	if w := strategyread.Wrapper(artifactType); w != "" {
		cur = cur[0].child(w)
	}
	for _, seg := range strings.Split(path, ".") {
		steps := []string{selector.ReplaceAllString(seg, "")}
		for range selector.FindAllString(seg, -1) {
			steps = append(steps, "[]")
		}
		for _, st := range steps {
			var next []schemaNode
			for _, n := range cur {
				next = append(next, n.child(st)...)
			}
			cur = next
			if len(cur) == 0 {
				return false
			}
		}
	}
	return true
}

func TestViewPathsMatchSchemas(t *testing.T) {
	reads := strategy.ViewReads()
	if len(reads) < 8 {
		t.Fatalf("ViewReads lists %d paths; the views read at least the landscape, positioning, personas and the roadmap's tracks, objectives, key results, assumptions and dependencies", len(reads))
	}
	for _, r := range reads {
		file, ok := embedded.SchemaForType(r.Artifact)
		if !ok {
			t.Errorf("%s: no schema for artifact type %q", r.Path, r.Artifact)
			continue
		}
		raw, err := embedded.GetSchema(file)
		if err != nil {
			t.Errorf("%s: schema %s: %v", r.Path, file, err)
			continue
		}
		var root map[string]any
		if err := json.Unmarshal(raw, &root); err != nil {
			t.Fatalf("schema %s: %v", file, err)
		}
		if !pathExists(root, r.Artifact, r.Path) {
			t.Errorf("a view reads %s of %s, but the schema %s has no such path: a schema change would silently empty that part of an answer", r.Path, r.Artifact, file)
		}
	}
}

func TestViewPathsCheckerCatchesAMissingPath(t *testing.T) {
	raw, err := embedded.GetSchema("insight_analyses_schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		t.Fatal(err)
	}
	if !pathExists(root, "insight_analyses", "competitive_landscape.direct_competitors") {
		t.Fatal("checker rejects a path that exists")
	}
	if pathExists(root, "insight_analyses", "competitive_landscape.no_such_part") {
		t.Error("checker accepts a path that does not exist, so TestViewPathsMatchSchemas would prove nothing")
	}
	rm, err := embedded.GetSchema("roadmap_recipe_schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var rroot map[string]any
	if err := json.Unmarshal(rm, &rroot); err != nil {
		t.Fatal(err)
	}
	if !pathExists(rroot, "roadmap_recipe", "tracks.*.okrs[*].key_results") {
		t.Error("checker rejects the roadmap key results path through a wildcard and a $ref")
	}
	if pathExists(rroot, "roadmap_recipe", "tracks.*.okrs[*].no_such_part") {
		t.Error("checker accepts a missing path behind a wildcard")
	}
}
