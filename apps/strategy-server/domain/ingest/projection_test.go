package ingest

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/decompose"
)

func contains(from, to string) decompose.RelationshipSpec {
	return decompose.RelationshipSpec{Type: "contains", FromKey: from, ToKey: to}
}

func TestDecomposedSources_FollowContainsEdgesAndTheSourceProperty(t *testing.T) {
	res := &decompose.Result{
		Objects: []decompose.GraphObject{
			{Type: "Artifact", Key: "Artifact:READY/a.yaml"},
			{Type: "Artifact", Key: "Artifact:READY/b.yaml"},
			{Type: "Belief", Key: "Belief:direct", Properties: map[string]any{"source_artifact": "READY/a.yaml"}},
			{Type: "Persona", Key: "Persona:shared"},
			{Type: "PainPoint", Key: "PainPoint:child"},
			{Type: "Orphan", Key: "Orphan:x"},
		},
		Relationships: []decompose.RelationshipSpec{
			contains("Artifact:READY/a.yaml", "Belief:direct"),
			contains("Artifact:READY/a.yaml", "Persona:shared"),
			contains("Artifact:READY/b.yaml", "Persona:shared"),
			contains("Persona:shared", "PainPoint:child"),
		},
	}
	got := decomposedSources(res)
	want := map[string]string{
		"Artifact:READY/a.yaml": "READY/a.yaml",
		"Artifact:READY/b.yaml": "READY/b.yaml",
		"Belief:direct":         "READY/a.yaml",
		"Persona:shared":        "READY/a.yaml,READY/b.yaml",
		"PainPoint:child":       "READY/a.yaml,READY/b.yaml",
		"Orphan:x":              "",
	}
	for key, w := range want {
		if g := strings.Join(got[key], ","); g != w {
			t.Errorf("sources of %s = %q, want %q", key, g, w)
		}
	}
}

func TestDecomposedSources_ContainsCycleTerminates(t *testing.T) {
	res := &decompose.Result{
		Objects:       []decompose.GraphObject{{Key: "A"}, {Key: "B"}},
		Relationships: []decompose.RelationshipSpec{contains("A", "B"), contains("B", "A")},
	}
	if got := decomposedSources(res); len(got["A"]) != 0 || len(got["B"]) != 0 {
		t.Errorf("a cycle with no artifact has sources: %v", got)
	}
}

func class(c, ref string) fileClass { return fileClass{class: c, ref: ref} }

func TestSourceIntegrity_StampsOnlyWhenEverySourceIsFramework(t *testing.T) {
	files := map[string]fileClass{
		"READY/tpl.yaml":  class("unmodified_template", "t@1"),
		"READY/tpl2.yaml": class("unmodified_template", "t@1"),
		"READY/def.yaml":  class("canonical_reference", "d@1"),
		"READY/mine.yaml": {},
	}
	cases := []struct {
		name        string
		sources     []string
		wantClass   string
		wantRef     string
		wantStamped bool
	}{
		{"single template", []string{"READY/tpl.yaml"}, "unmodified_template", "t@1", true},
		{"two templates with the same ref", []string{"READY/tpl.yaml", "READY/tpl2.yaml"}, "unmodified_template", "t@1", true},
		{"template and authored", []string{"READY/tpl.yaml", "READY/mine.yaml"}, "", "", false},
		{"authored only", []string{"READY/mine.yaml"}, "", "", false},
		{"file unknown to the export", []string{"READY/missing.yaml"}, "", "", false},
		{"no source", nil, "", "", false},
		{"different classes: first source decides, no ref", []string{"READY/def.yaml", "READY/tpl.yaml"}, "canonical_reference", "", true},
	}
	for _, c := range cases {
		got, ok := sourceIntegrity(c.sources, files)
		if ok != c.wantStamped || got.class != c.wantClass || got.ref != c.wantRef {
			t.Errorf("%s: got (%+v, %v), want class=%q ref=%q stamped=%v", c.name, got, ok, c.wantClass, c.wantRef, c.wantStamped)
		}
	}
}

// Shortened keys keep the original in source_key; unshortened ones do not.
func TestDecomposedRequests_ShortenedKeysCarrySourceKey(t *testing.T) {
	id := uuid.New()
	long := "Belief:" + strings.Repeat("long_section_path.", 12)
	res := &decompose.Result{Objects: []decompose.GraphObject{
		{Type: "Belief", Key: long, Properties: map[string]any{"name": "L"}},
		{Type: "Belief", Key: "Belief:short", Properties: map[string]any{"name": "S"}},
	}}
	p := decomposedProjection(id, res, nil)
	byKey := map[string]map[string]any{}
	for _, o := range p.objects {
		byKey[o.Key] = o.Properties
	}
	if got := byKey[ScopedKey(id, long)]["source_key"]; got != long {
		t.Errorf("source_key = %v, want the original", got)
	}
	if _, has := byKey[ScopedKey(id, "Belief:short")]["source_key"]; has {
		t.Error("an unshortened key carries source_key")
	}
	for _, o := range p.objects {
		if len(o.Key) > 128 {
			t.Errorf("key of %d bytes written", len(o.Key))
		}
	}
}

func TestDecomposedRequests_DoNotMutateTheDecomposerOutput(t *testing.T) {
	res := &decompose.Result{Objects: []decompose.GraphObject{
		{Type: "Belief", Key: "Belief:x", Labels: []string{"keep"}, Properties: map[string]any{"name": "X"}},
	}}
	_ = decomposedProjection(uuid.New(), res, nil)
	if _, has := res.Objects[0].Properties["instance_id"]; has {
		t.Error("decomposedProjection wrote instance_id into the decomposer's properties")
	}
	if len(res.Objects[0].Labels) != 1 {
		t.Errorf("labels of the decomposer output changed: %v", res.Objects[0].Labels)
	}
}

func TestSplitRelationshipKey_ToleratesSeparatorsInsideKeys(t *testing.T) {
	known := map[string]string{"p/a|b": "1", "p/c": "2", "p/a": "3", "p/b|c": "4"}
	typ, from, to, ok := splitRelationshipKey(RelationshipKey("depends_on", "p/a|b", "p/c"), known)
	if !ok || typ != "depends_on" || from != "p/a|b" || to != "p/c" {
		t.Errorf("got %q %q %q %v", typ, from, to, ok)
	}
	if _, _, _, ok := splitRelationshipKey("depends_on|p/zzz|p/c", known); ok {
		t.Error("a tuple whose endpoints are unknown must not split")
	}
}
