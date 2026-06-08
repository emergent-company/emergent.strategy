package score

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/openspec"
)

// stubCaller implements ToolCaller from a fixed map of tool name -> JSON result.
// A tool absent from results is treated as "not available".
type stubCaller struct {
	results map[string]string // tool name -> JSON text
	errs    map[string]error  // tool name -> error to return
}

func (s stubCaller) Has(name string) bool {
	if _, ok := s.results[name]; ok {
		return true
	}
	_, ok := s.errs[name]
	return ok
}

func (s stubCaller) CallJSON(_ context.Context, name string, _ map[string]any, out any) error {
	if err, ok := s.errs[name]; ok {
		return err
	}
	raw, ok := s.results[name]
	if !ok {
		return fmt.Errorf("tool %q not available", name)
	}
	return json.Unmarshal([]byte(raw), out)
}

// recordingCaller captures the last args map passed to CallJSON, to verify the
// scorer threads instance_id through.
type recordingCaller struct {
	stubCaller
	lastArgs map[string]any
}

func (r *recordingCaller) CallJSON(ctx context.Context, name string, args map[string]any, out any) error {
	r.lastArgs = args
	return r.stubCaller.CallJSON(ctx, name, args, out)
}

func change(id string, footprints ...string) openspec.Change {
	return openspec.Change{ID: id, Footprints: footprints, TaskCount: 1}
}

const testInstance = "00000000-0000-0000-0000-000000000001"

func newScorer(caller ToolCaller) *MCPScorer {
	return NewMCPScorer(context.Background(), caller, testInstance)
}

// traceChange has title/summary so SemanticQuery() is non-empty.
func traceChange(id string, footprints ...string) openspec.Change {
	c := change(id, footprints...)
	c.Title = "Add " + id
	c.Summary = "This change does something meaningful."
	return c
}

func TestTraceabilityStrongWhenConfidentHits(t *testing.T) {
	caller := stubCaller{results: map[string]string{
		toolSearchStrategy: `[{"artifact_key":"fd-001","snippet":"x","score":0.45},{"artifact_key":"okr-p-001","snippet":"y","score":0.38}]`,
	}}
	r := newScorer(caller).Traceability(traceChange("c", "spec-a"))
	if r.Level != Strong {
		t.Fatalf("expected Strong (2 confident hits), got %s (%s)", r.Level, r.Summary)
	}
}

func TestTraceabilityMixedWhenOneHit(t *testing.T) {
	caller := stubCaller{results: map[string]string{
		toolSearchStrategy: `[{"artifact_key":"fd-001","snippet":"x","score":0.41}]`,
	}}
	r := newScorer(caller).Traceability(traceChange("c", "spec-a"))
	if r.Level != Mixed {
		t.Fatalf("expected Mixed (1 confident hit), got %s", r.Level)
	}
}

func TestTraceabilityWeakWhenNoConfidentHits(t *testing.T) {
	// hits exist but all below the confidence threshold.
	caller := stubCaller{results: map[string]string{
		toolSearchStrategy: `[{"artifact_key":"fd-001","snippet":"x","score":0.12}]`,
	}}
	r := newScorer(caller).Traceability(traceChange("c", "spec-a"))
	if r.Level != Weak {
		t.Fatalf("expected Weak (no confident hits), got %s", r.Level)
	}
}

func TestScorerPassesInstanceID(t *testing.T) {
	caller := &recordingCaller{stubCaller: stubCaller{results: map[string]string{toolSearchStrategy: `[]`}}}
	newScorer(caller).Traceability(traceChange("c", "spec-a"))
	if got := caller.lastArgs["instance_id"]; got != testInstance {
		t.Fatalf("expected instance_id %q passed to tool, got %v", testInstance, got)
	}
}

func TestTraceabilityQueriesByContentNotSlug(t *testing.T) {
	caller := &recordingCaller{stubCaller: stubCaller{results: map[string]string{toolSearchStrategy: `[]`}}}
	newScorer(caller).Traceability(traceChange("c", "strategy-web"))
	q, _ := caller.lastArgs["query"].(string)
	if q == "strategy-web" {
		t.Fatal("traceability must query by semantic content, not the footprint slug")
	}
	if q == "" {
		t.Fatal("expected a non-empty semantic query")
	}
}

func TestDimensionUnavailableWhenToolMissing(t *testing.T) {
	caller := stubCaller{results: map[string]string{}} // no tools
	s := newScorer(caller)
	for _, r := range []DimensionResult{
		s.Traceability(change("c", "x")),
		s.Contradiction(change("c", "x")),
		s.Maturity(change("c", "x")),
		s.Scope(change("c", "x")),
		s.Sequencing(change("c", "x")),
	} {
		if r.Level != Unavailable {
			t.Errorf("%s: expected Unavailable when tool missing, got %s", r.Dimension, r.Level)
		}
	}
}

func TestDimensionUnavailableOnToolError(t *testing.T) {
	caller := stubCaller{errs: map[string]error{toolDetectContradictions: fmt.Errorf("boom")}}
	r := newScorer(caller).Contradiction(change("c"))
	if r.Level != Unavailable {
		t.Fatalf("expected Unavailable on tool error, got %s", r.Level)
	}
}

func TestContradictionWeakWhenFound(t *testing.T) {
	caller := stubCaller{results: map[string]string{
		toolDetectContradictions: `[{"description":"Orphaned node: fd-001 has no relationships","fix_with":"add edges"}]`,
	}}
	r := newScorer(caller).Contradiction(change("c"))
	if r.Level != Weak || len(r.Evidence) != 1 {
		t.Fatalf("expected Weak with evidence, got %s ev=%v", r.Level, r.Evidence)
	}
}

func TestMaturityWeakWhenHypothetical(t *testing.T) {
	caller := stubCaller{results: map[string]string{
		toolListFeatures: `[{"artifact_key":"fd-009","payload":{"feature_maturity":{"overall_stage":"hypothetical"}}}]`,
	}}
	r := newScorer(caller).Maturity(change("c", "x"))
	if r.Level != Weak {
		t.Fatalf("expected Weak maturity, got %s", r.Level)
	}
}

func TestMaturityStrongWhenProven(t *testing.T) {
	caller := stubCaller{results: map[string]string{
		toolListFeatures: `[{"artifact_key":"fd-001","payload":{"feature_maturity":{"overall_stage":"proven"}}}]`,
	}}
	r := newScorer(caller).Maturity(change("c", "x"))
	if r.Level != Strong {
		t.Fatalf("expected Strong maturity, got %s", r.Level)
	}
}

func TestScopeReturnsSignalNotGrade(t *testing.T) {
	// Scope anchors via search_strategy (real keys), then expands neighbors.
	caller := stubCaller{results: map[string]string{
		toolSearchStrategy: `[{"artifact_key":"fd-001","score":0.45}]`,
		toolGetNeighbors:   `[{"node_key":"Product.Core.Y","node_type":"value_model","edge_type":"depends_on","edge_direction":"outbound"}]`,
	}}
	r := newScorer(caller).Scope(traceChange("c", "x"))
	if r.Level != Signal {
		t.Fatalf("scope should return Signal (interpretation is human's), got %s (%s)", r.Level, r.Summary)
	}
}

func TestScopeMixedWhenNoAnchors(t *testing.T) {
	// search returns nothing confident → no anchors → Mixed, not error.
	caller := stubCaller{results: map[string]string{
		toolSearchStrategy: `[]`,
		toolGetNeighbors:   `[]`,
	}}
	r := newScorer(caller).Scope(traceChange("c", "x"))
	if r.Level != Mixed {
		t.Fatalf("expected Mixed when no anchors, got %s", r.Level)
	}
}

func TestSequencingStrongWhenRoadmapHasOKRs(t *testing.T) {
	caller := stubCaller{results: map[string]string{
		toolGetRoadmap: `{"roadmap":{"tracks":{"product":{"okrs":[{"id":"okr-p-001"}]}}}}`,
	}}
	r := newScorer(caller).Sequencing(change("c"))
	if r.Level != Strong {
		t.Fatalf("expected Strong sequencing, got %s (%s)", r.Level, r.Summary)
	}
}

// fullScorer lets a test inject exact per-dimension levels to exercise Build and
// tension detection without crafting MCP payloads.
type fullScorer map[Dimension]Level

func (f fullScorer) result(d Dimension) DimensionResult {
	return DimensionResult{Dimension: d, Level: f[d], Summary: "stub"}
}
func (f fullScorer) Traceability(openspec.Change) DimensionResult  { return f.result(Traceability) }
func (f fullScorer) Contradiction(openspec.Change) DimensionResult { return f.result(Contradiction) }
func (f fullScorer) Maturity(openspec.Change) DimensionResult      { return f.result(Maturity) }
func (f fullScorer) Scope(openspec.Change) DimensionResult         { return f.result(Scope) }
func (f fullScorer) Sequencing(openspec.Change) DimensionResult    { return f.result(Sequencing) }

func TestBuildPreservesAllDimensions(t *testing.T) {
	card := Build(change("c"), fullScorer{
		Traceability: Strong, Contradiction: Strong, Maturity: Strong,
		Scope: Mixed, Sequencing: Strong,
	})
	if len(card.Dimensions) != 5 {
		t.Fatalf("expected 5 dimensions, got %d", len(card.Dimensions))
	}
	// No single verdict field exists — verify the card has no tensions here.
	if len(card.Tensions) != 0 {
		t.Errorf("expected no tensions for aligned card, got %v", card.Tensions)
	}
}

func TestBuildDetectsTraceMaturityTension(t *testing.T) {
	card := Build(change("c"), fullScorer{
		Traceability: Strong, Maturity: Weak,
		Contradiction: Strong, Scope: Mixed, Sequencing: Strong,
	})
	if len(card.Tensions) == 0 {
		t.Fatal("expected a trace/maturity tension")
	}
	found := false
	for _, tn := range card.Tensions {
		if len(tn.Between) == 2 && tn.Between[0] == Traceability && tn.Between[1] == Maturity {
			found = true
		}
	}
	if !found {
		t.Errorf("expected Traceability×Maturity tension, got %v", card.Tensions)
	}
}

func TestBuildDetectsScopeTension(t *testing.T) {
	card := Build(change("c"), fullScorer{
		Traceability: Strong, Scope: Signal,
		Contradiction: Strong, Maturity: Strong, Sequencing: Strong,
	})
	hasScope := false
	for _, tn := range card.Tensions {
		for _, d := range tn.Between {
			if d == Scope {
				hasScope = true
			}
		}
	}
	if !hasScope {
		t.Errorf("expected a scope tension, got %v", card.Tensions)
	}
}

func TestMeasuredCount(t *testing.T) {
	card := Build(change("c"), fullScorer{
		Traceability: Strong, Contradiction: Unavailable, Maturity: Weak,
		Scope: Unavailable, Sequencing: Strong,
	})
	if got := card.MeasuredCount(); got != 3 {
		t.Fatalf("expected 3 measured dimensions, got %d", got)
	}
}
