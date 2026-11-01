package semantic_test

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
)

// frameworkWorld is an instance with authored artifacts and framework content
// (an unmodified template and a canonical definition) wired into the same graph:
// the shape of an instance scaffolded from the framework and then authored.
//
//	fd-001_a --depends_on--> fd-002_b          authored
//	assessment_report --depends_on--> fd-001_a  unmodified template, linked to authored
//	fd-003_orphan                               authored, no relationships
//	fd-004_template_only                        authored, linked only to the template
//	sd-001_definition                           canonical reference, no relationships
func frameworkWorld(t *testing.T) (*world, uuid.UUID) {
	t.Helper()
	w := newWorld(t)
	inst := w.instance(t, "pilot")
	for _, k := range []string{"fd-001_a", "fd-002_b", "fd-003_orphan", "fd-004_template_only"} {
		w.artifact(t, inst, "feature", k, map[string]any{"name": k})
	}
	w.artifact(t, inst, "assessment_report", "assessment_report", map[string]any{"name": "template outcome met"})
	w.artifact(t, inst, "definition", "sd-001_definition", map[string]any{"name": "framework definition"})
	w.classify(t, inst, "assessment_report", "unmodified_template")
	w.classify(t, inst, "sd-001_definition", "canonical_reference")
	w.relate(t, inst, "fd-001_a", "fd-002_b")
	w.relate(t, inst, "assessment_report", "fd-001_a")
	w.relate(t, inst, "assessment_report", "fd-004_template_only")
	w.ingestInstance(t, inst)
	return w, inst
}

func neighbourKeys(ns []*semantic.Neighbor) []string {
	var out []string
	for _, n := range ns {
		out = append(out, n.NodeKey)
	}
	sort.Strings(out)
	return out
}

// A relationship to framework content is not a fact about the company. Search
// already drops framework hits; the neighbourhood must too, or an agent that
// walks the graph from an authored node arrives at a template and reports it.
func TestGetNeighbors_DoesNotReturnFrameworkContent(t *testing.T) {
	w, inst := frameworkWorld(t)

	ns, err := w.sem.GetNeighbors(context.Background(), inst.String(), "fd-001_a")
	if err != nil {
		t.Fatal(err)
	}
	got := neighbourKeys(ns)
	if strings.Join(got, ",") != "fd-002_b" {
		t.Errorf("neighbours of fd-001_a = %v, want only the authored fd-002_b", got)
	}
}

// Asking for a framework node directly reads like asking for a node that does
// not exist, as get_section does for "not defined by this company".
func TestGetNeighbors_ARootThatIsFrameworkContentHasNone(t *testing.T) {
	w, inst := frameworkWorld(t)

	ns, err := w.sem.GetNeighbors(context.Background(), inst.String(), "assessment_report")
	if err != nil {
		t.Fatal(err)
	}
	if len(ns) != 0 {
		t.Errorf("a template's neighbourhood = %v, want none", neighbourKeys(ns))
	}
}

// The scan reported every canonical definition of an instance as an orphan of
// the company's strategy ("add relationships connecting cd-033 ..."): 136 of 136
// findings on a real scaffolded instance, none about anything authored.
func TestDetectContradictions_IgnoresFrameworkContent(t *testing.T) {
	w, inst := frameworkWorld(t)

	cs, err := w.sem.DetectContradictions(context.Background(), inst.String())
	if err != nil {
		t.Fatal(err)
	}
	var text []string
	for _, c := range cs {
		text = append(text, c.Description)
	}
	all := strings.Join(text, "\n")
	for _, framework := range []string{"sd-001_definition", "assessment_report"} {
		if strings.Contains(all, framework) {
			t.Errorf("a finding is about framework content %q:\n%s", framework, all)
		}
	}
	if !strings.Contains(all, "fd-003_orphan") {
		t.Errorf("the authored orphan is missing:\n%s", all)
	}
}

// Linked only to a template means connected to nothing the company wrote.
func TestDetectContradictions_AnEdgeToFrameworkContentDoesNotConnect(t *testing.T) {
	w, inst := frameworkWorld(t)

	cs, err := w.sem.DetectContradictions(context.Background(), inst.String())
	if err != nil {
		t.Fatal(err)
	}
	var text []string
	for _, c := range cs {
		text = append(text, c.Description)
	}
	if all := strings.Join(text, "\n"); !strings.Contains(all, "fd-004_template_only") {
		t.Errorf("fd-004_template_only is connected only to a template and should be reported:\n%s", all)
	}
}

// The authored part of the graph is unchanged by all of this.
func TestAuthoredNeighbourhoodAndOrphansAreUnaffectedByFrameworkContent(t *testing.T) {
	w, inst := frameworkWorld(t)

	ns, err := w.sem.GetNeighbors(context.Background(), inst.String(), "fd-002_b")
	if err != nil {
		t.Fatal(err)
	}
	if got := neighbourKeys(ns); strings.Join(got, ",") != "fd-001_a" {
		t.Errorf("neighbours of fd-002_b = %v, want fd-001_a", got)
	}
}

// "Nothing found" must be an empty list. A nil slice reaches the client as the
// JSON literal null, which reads as a failure or as "unknown".
func TestDetectContradictions_NothingFoundIsAnEmptyListNotNil(t *testing.T) {
	w := newWorld(t)
	inst := w.instance(t, "clean")
	w.artifact(t, inst, "feature", "fd-001_a", map[string]any{"name": "a"})
	w.artifact(t, inst, "feature", "fd-002_b", map[string]any{"name": "b"})
	w.relate(t, inst, "fd-001_a", "fd-002_b")
	w.ingestInstance(t, inst)

	cs, err := w.sem.DetectContradictions(context.Background(), inst.String())
	if err != nil {
		t.Fatal(err)
	}
	if cs == nil {
		t.Error("DetectContradictions returned nil; want an empty list")
	}
	if len(cs) != 0 {
		t.Errorf("findings on a connected instance: %d", len(cs))
	}
}

func TestDetectContradictions_AnInstanceOfOnlyFrameworkContentHasAnEmptyListToo(t *testing.T) {
	w := newWorld(t)
	inst := w.instance(t, "scaffold-only")
	w.artifact(t, inst, "definition", "sd-001_definition", map[string]any{"name": "framework"})
	w.classify(t, inst, "sd-001_definition", "canonical_reference")
	w.ingestInstance(t, inst)

	cs, err := w.sem.DetectContradictions(context.Background(), inst.String())
	if err != nil {
		t.Fatal(err)
	}
	if cs == nil || len(cs) != 0 {
		t.Errorf("findings = %v (nil=%v), want an empty, non-nil list", cs, cs == nil)
	}
}
