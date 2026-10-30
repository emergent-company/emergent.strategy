package mcpserver_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

type lifecycleSemantic struct {
	Lifecycle struct {
		Mode    string `json:"mode"`
		Signals struct {
			SemanticAvailable bool `json:"semantic_available"`
			Semantic          *struct {
				GraphNodeCount  int  `json:"graph_node_count"`
				VisionConnected bool `json:"vision_connected"`
			} `json:"semantic"`
		} `json:"signals"`
	} `json:"lifecycle"`
}

func lifecycleOf(t *testing.T, c *mcpClient, inst uuid.UUID) lifecycleSemantic {
	t.Helper()
	var out lifecycleSemantic
	c.call(1, "health_check", map[string]any{"instance_id": inst.String()}).assertOK().decode(&out)
	return out
}

// graphOfInstance gives an instance a north star and a feature in the fake
// Memory, joined by a relationship, the way an ingest would leave them.
func graphOfInstance(t *testing.T, svc mcpserver.Services, mem *memtest.Server, inst uuid.UUID, northStarKey string) {
	t.Helper()
	markReady(t, svc, inst)
	putObject(t, svc, mem, inst, "north_star", northStarKey, "artifact", map[string]any{"artifact_type": "north_star"})
	putObject(t, svc, mem, inst, "feature", "fd-001_x", "artifact", map[string]any{"artifact_type": "feature"})
	putRelationship(t, svc, mem, inst, "contributes_to", "fd-001_x", northStarKey)
}

// 9.27: vision connected is true for a scaffolded instance (north star keyed
// "north_star") and for an imported one (keyed by path), and false when only
// another instance has a north star. 9.12: one instance's mode does not depend
// on the other's graph.
func TestLifecycle_VisionConnectedIsPerInstanceWhateverTheNorthStarKey(t *testing.T) {
	mem := memtest.New(t)
	svc := fencedSvc(t, mem)
	_, scaffolded := seedInstance(t, svc, "lc-scaffolded", map[string]any{"north_star": map[string]any{"vision": "a"}})
	_, imported := seedInstance(t, svc, "lc-imported", map[string]any{"north_star": map[string]any{"vision": "b"}})
	_, bare := seedInstance(t, svc, "lc-bare", map[string]any{"strategy_formula": map[string]any{"name": "no north star"}})
	graphOfInstance(t, svc, mem, scaffolded, "north_star")
	graphOfInstance(t, svc, mem, imported, "READY/00_north_star")
	markReady(t, svc, bare)
	putObject(t, svc, mem, bare, "feature", "fd-001_x", "artifact", map[string]any{"artifact_type": "feature"})
	c := newMCPClient(t, svc)

	for name, id := range map[string]uuid.UUID{"scaffolded": scaffolded, "imported": imported} {
		got := lifecycleOf(t, c, id)
		if got.Lifecycle.Signals.Semantic == nil || !got.Lifecycle.Signals.Semantic.VisionConnected {
			t.Errorf("%s: vision connected is false, want true: %+v", name, got.Lifecycle.Signals)
		}
	}
	got := lifecycleOf(t, c, bare)
	if got.Lifecycle.Signals.Semantic == nil {
		t.Fatalf("bare: no semantic signals although its graph is built")
	}
	if got.Lifecycle.Signals.Semantic.VisionConnected {
		t.Error("an instance without a north star is vision-connected because other instances have one")
	}
	if got.Lifecycle.Signals.Semantic.GraphNodeCount != 1 {
		t.Errorf("bare graph node count = %d, want its own 1 and none of the other instances' objects", got.Lifecycle.Signals.Semantic.GraphNodeCount)
	}
}

func TestLifecycle_AnInstanceWithoutAGraphGetsNoSemanticSignals(t *testing.T) {
	mem := memtest.New(t)
	svc := fencedSvc(t, mem)
	_, other := seedInstance(t, svc, "lc-other", map[string]any{"north_star": map[string]any{"vision": "x"}})
	_, fresh := seedInstance(t, svc, "lc-fresh", map[string]any{"north_star": map[string]any{"vision": "y"}})
	graphOfInstance(t, svc, mem, other, "north_star")
	c := newMCPClient(t, svc)

	got := lifecycleOf(t, c, fresh)
	if got.Lifecycle.Signals.SemanticAvailable || got.Lifecycle.Signals.Semantic != nil {
		t.Errorf("an instance with no graph reports semantic signals: %+v", got.Lifecycle.Signals)
	}
	if got.Lifecycle.Mode == "" {
		t.Error("the assessment must still work from the stored artifacts")
	}
}
