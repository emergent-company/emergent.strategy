package plan

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/openspec"
)

func ch(id string, footprints ...string) openspec.Change {
	return openspec.Change{ID: id, Footprints: footprints, TaskCount: 1, TasksDone: 0}
}

// waveOf returns the wave index containing id, or -1.
func waveOf(p Plan, id string) int {
	for w, wave := range p.Waves {
		for _, c := range wave {
			if c == id {
				return w
			}
		}
	}
	return -1
}

func TestComputeDisjointChangesRunInOneWave(t *testing.T) {
	changes := []openspec.Change{
		ch("a", "spec-x"),
		ch("b", "spec-y"),
		ch("c", "spec-z"),
	}
	p := Compute(changes, Options{})
	if len(p.Waves) != 1 {
		t.Fatalf("expected 1 wave for disjoint changes, got %d: %v", len(p.Waves), p.Waves)
	}
	if len(p.Waves[0]) != 3 {
		t.Fatalf("expected 3 changes in wave 1, got %d", len(p.Waves[0]))
	}
}

func TestComputeCollidingChangesAreSeparated(t *testing.T) {
	changes := []openspec.Change{
		ch("a", "shared"),
		ch("b", "shared"),
	}
	p := Compute(changes, Options{})
	if waveOf(p, "a") == waveOf(p, "b") {
		t.Fatalf("colliding changes a and b must be in different waves; plan=%v", p.Waves)
	}
	if got := p.Collisions["shared"]; len(got) != 2 {
		t.Fatalf("expected 'shared' collision to list 2 changes, got %v", got)
	}
}

func TestComputeFootprintlessChangeNeverCollides(t *testing.T) {
	changes := []openspec.Change{
		ch("a", "shared"),
		ch("b", "shared"),
		ch("c"), // no footprints
	}
	p := Compute(changes, Options{})
	// c must be schedulable in wave 1 alongside whichever of a/b is there.
	if waveOf(p, "c") != 0 {
		t.Fatalf("footprint-less change should land in wave 1, got wave %d", waveOf(p, "c")+1)
	}
}

func TestComputeChainOfCollisionsForcesSerialization(t *testing.T) {
	// a-b collide on x; b-c collide on y. a and c are disjoint.
	changes := []openspec.Change{
		ch("a", "x"),
		ch("b", "x", "y"),
		ch("c", "y"),
	}
	p := Compute(changes, Options{})
	if waveOf(p, "a") == waveOf(p, "b") {
		t.Fatal("a and b share footprint x; must be separated")
	}
	if waveOf(p, "b") == waveOf(p, "c") {
		t.Fatal("b and c share footprint y; must be separated")
	}
	// a and c are disjoint and may share a wave (and should, for efficiency).
	if waveOf(p, "a") != waveOf(p, "c") {
		t.Errorf("disjoint a and c could share a wave; got %d and %d", waveOf(p, "a"), waveOf(p, "c"))
	}
}

func TestComputeSkipsCompletedByDefault(t *testing.T) {
	done := openspec.Change{ID: "done", Footprints: []string{"x"}, TaskCount: 3, TasksDone: 3}
	changes := []openspec.Change{done, ch("a", "x")}

	p := Compute(changes, Options{})
	if _, skipped := p.Skipped["done"]; !skipped {
		t.Fatal("completed change should be skipped by default")
	}
	if waveOf(p, "done") != -1 {
		t.Fatal("skipped change should not appear in any wave")
	}

	p2 := Compute(changes, Options{IncludeCompleted: true})
	if waveOf(p2, "done") == -1 {
		t.Fatal("completed change should be scheduled when IncludeCompleted is set")
	}
}

func TestComputeFlagsReconciliation(t *testing.T) {
	a := ch("a", "x")
	a.CrossRefs = []string{"b"}
	changes := []openspec.Change{a, ch("b", "y")}
	p := Compute(changes, Options{})
	if len(p.NeedsReconciliation) != 1 || p.NeedsReconciliation[0] != "a" {
		t.Fatalf("expected 'a' flagged for reconciliation, got %v", p.NeedsReconciliation)
	}
}

func TestComputeIsDeterministic(t *testing.T) {
	changes := []openspec.Change{
		ch("a", "x", "y"),
		ch("b", "y", "z"),
		ch("c", "z"),
		ch("d", "w"),
	}
	first := Compute(changes, Options{})
	for i := 0; i < 5; i++ {
		got := Compute(changes, Options{})
		if len(got.Waves) != len(first.Waves) {
			t.Fatalf("non-deterministic wave count: %d vs %d", len(got.Waves), len(first.Waves))
		}
		for w := range first.Waves {
			if len(got.Waves[w]) != len(first.Waves[w]) {
				t.Fatalf("non-deterministic wave %d contents", w)
			}
			for j := range first.Waves[w] {
				if got.Waves[w][j] != first.Waves[w][j] {
					t.Fatalf("non-deterministic ordering in wave %d", w)
				}
			}
		}
	}
}
