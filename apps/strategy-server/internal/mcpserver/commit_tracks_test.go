package mcpserver_test

import (
	"context"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
)

// An agent that stages a roadmap without the product track and commits it would
// silently drop that track. commit_batch refuses and says how to confirm; with
// confirm_missing_tracks the same batch commits.
func TestMCP_CommitBatch_RefusesARoadmapMissingATrackUnlessConfirmed(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "tracks-gate", nil)
	c := newMCPClient(t, svc)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceMCP)
	batchID, err := svc.Strategy.Stage(ctx, strategy.StageParams{
		InstanceID: instID, ArtifactType: "roadmap_recipe", ArtifactKey: "roadmap_recipe", Action: "create",
		Payload: map[string]any{"roadmap": map[string]any{"id": "r", "tracks": map[string]any{
			"strategy": map[string]any{}, "org_ops": map[string]any{}, "commercial": map[string]any{},
		}}},
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}

	refused := c.call(1, "commit_batch", map[string]any{"batch_id": batchID.String()}).assertError()
	refused.contains("product").contains("confirm_missing_tracks")

	var done struct {
		Committed bool `json:"committed"`
		Count     int  `json:"count"`
	}
	c.call(2, "commit_batch", map[string]any{"batch_id": batchID.String(), "confirm_missing_tracks": true}).
		assertOK().decode(&done)
	if !done.Committed || done.Count != 1 {
		t.Errorf("confirmed commit = %+v, want committed with 1 mutation: the refusal must leave the batch staged", done)
	}
}
